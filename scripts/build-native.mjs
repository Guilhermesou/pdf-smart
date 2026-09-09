import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
if (process.platform !== 'darwin')
  throw new Error('Este pacote desktop inicial é para macOS.');
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
