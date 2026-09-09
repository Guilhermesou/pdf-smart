import { execFileSync } from 'node:child_process';
if (process.platform === 'darwin') {
  const app = 'src-tauri/target/release/bundle/macos/PDF Smart.app';
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', app], { stdio: 'inherit' });
}
