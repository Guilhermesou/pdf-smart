#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::{io::{BufRead, BufReader, Write}, process::{Child, ChildStdin, ChildStdout, Command, Stdio}, sync::{Arc, Mutex}};
struct Session { child: Child, input: ChildStdin, output: BufReader<ChildStdout> }
impl Drop for Session { fn drop(&mut self) { let _ = self.child.kill(); let _ = self.child.wait(); } }
#[derive(Default, Clone)]
struct OcrState(Arc<Mutex<Option<Session>>>);
fn exchange(state: &OcrState, image: Option<String>) -> Result<serde_json::Value, String> {
    if !cfg!(target_os = "macos") { return Err("Motor nativo indisponível nesta plataforma.".into()); }
    if image.as_ref().is_some_and(|s| s.len() > 24_000_000) { return Err("Imagem muito grande.".into()); }
    let mut guard = state.0.lock().map_err(|_| "Motor OCR indisponível.")?;
    if guard.is_none() {
        let path = if cfg!(debug_assertions) {
            let target = if cfg!(target_arch = "aarch64") { "aarch64" } else { "x86_64" };
            std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(format!("binaries/pdf-smart-ocr-{target}-apple-darwin"))
        } else { std::env::current_exe().map_err(|e| e.to_string())?.with_file_name("pdf-smart-ocr") };
        let mut child = Command::new(path).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null()).spawn().map_err(|e| e.to_string())?;
        let input = child.stdin.take().ok_or("Canal de entrada indisponível")?;
        let output = BufReader::new(child.stdout.take().ok_or("Canal de saída indisponível")?);
        *guard = Some(Session { child, input, output });
    }
    let session = guard.as_mut().unwrap();
    let payload = serde_json::json!({"probe": image.is_none(), "image": image});
    let result = (|| {
        writeln!(session.input, "{}", payload).map_err(|e| e.to_string())?;
        session.input.flush().map_err(|e| e.to_string())?;
        let mut line = String::new();
        session.output.read_line(&mut line).map_err(|e| e.to_string())?;
        serde_json::from_str(&line).map_err(|e| e.to_string())
    })();
    if result.is_err() { *guard = None; }
    result
}
#[tauri::command]
async fn native_ocr(state: tauri::State<'_, OcrState>, image: Option<String>) -> Result<serde_json::Value, String> {
    let owned = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || exchange(&owned, image)).await.map_err(|e| e.to_string())?
}
fn main() {
    tauri::Builder::default().manage(OcrState::default())
        .invoke_handler(tauri::generate_handler![native_ocr])
        .run(tauri::generate_context!()).expect("Falha ao iniciar PDF Smart");
}
