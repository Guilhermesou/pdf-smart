import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
// Apple Vision is an optional macOS acceleration. Other desktop targets use
// the bundled Tesseract/WASM OCR path and must not require a Swift toolchain.
const targetPlatform = process.env.TAURI_ENV_PLATFORM ?? process.platform;
if (targetPlatform !== 'darwin') process.exit(0);
const arch = process.arch === 'arm64' ? 'arm64' : 'x86_64';
const triple = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
mkdirSync('src-tauri/binaries', { recursive: true });
execFileSync(
  'swiftc',
  [
    '-O',
    '-target',
    `${arch}-apple-macos13.0`,
    '-module-cache-path',
    '/private/tmp/pdf-smart-swift-cache',
    'src-tauri/native/Ocr.swift',
    '-o',
    `src-tauri/binaries/pdf-smart-ocr-${triple}-apple-darwin`,
  ],
  { stdio: 'inherit' },
);
