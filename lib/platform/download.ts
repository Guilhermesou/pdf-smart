import { isTauri, invoke } from '@tauri-apps/api/core';

/** Browser and native desktop download adapter; callers provide bytes and a filename. */
export async function saveBytes(
  bytes: Uint8Array,
  filename: string,
): Promise<string | null> {
  if (isTauri()) {
    try {
      const savedPath = await invoke<string | null>('save_pdf', {
        filename,
        bytes: Array.from(bytes),
      });
      return savedPath;
    } catch {
      // Fallback to browser download if native invoke fails
    }
  }
  const url = URL.createObjectURL(
    new Blob([bytes as BlobPart], { type: 'application/pdf' }),
  );
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    return null;
  } finally {
    // Allow WebViews to consume the URL before releasing it, even if clicking fails.
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
}
