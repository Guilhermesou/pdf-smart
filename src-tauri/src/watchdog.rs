use std::{
    process::Child,
    sync::{mpsc, Arc, Mutex},
    thread,
    time::Duration,
};

/// Watches both pipe writes and reads; killing the child unblocks either operation.
pub struct Deadline {
    done: mpsc::Sender<()>,
    watcher: thread::JoinHandle<bool>,
}

impl Deadline {
    pub fn start(child: Arc<Mutex<Child>>, timeout: Duration) -> Self {
        let (done, receiver) = mpsc::channel();
        let watcher = thread::spawn(move || {
            if receiver.recv_timeout(timeout) == Err(mpsc::RecvTimeoutError::Timeout) {
                if let Ok(mut child) = child.lock() {
                    let _ = child.kill();
                }
                return true;
            }
            false
        });
        Self { done, watcher }
    }

    pub fn finish(self) -> bool {
        let _ = self.done.send(());
        self.watcher.join().unwrap_or(true)
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::{
        io::{BufRead, BufReader},
        process::{Command, Stdio},
    };

    #[test]
    fn timeout_unblocks_a_stalled_response() {
        let mut child = Command::new("sleep")
            .arg("10")
            .stdout(Stdio::piped())
            .spawn()
            .unwrap();
        let mut output = BufReader::new(child.stdout.take().unwrap());
        let child = Arc::new(Mutex::new(child));
        let deadline = Deadline::start(child.clone(), Duration::from_millis(30));
        assert_eq!(output.read_line(&mut String::new()).unwrap(), 0);
        assert!(deadline.finish());
        assert!(!child.lock().unwrap().wait().unwrap().success());
    }

    #[test]
    fn completed_request_keeps_the_process_alive() {
        let child = Arc::new(Mutex::new(Command::new("sleep").arg("10").spawn().unwrap()));
        assert!(!Deadline::start(child.clone(), Duration::from_secs(1)).finish());
        let mut child = child.lock().unwrap();
        assert!(child.try_wait().unwrap().is_none());
        child.kill().unwrap();
        child.wait().unwrap();
    }
}
