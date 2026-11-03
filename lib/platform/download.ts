/** Browser download adapter; callers provide bytes and a filename. */
export function saveBytes(bytes: Uint8Array, filename: string) {
  const url = URL.createObjectURL(
    new Blob([bytes as BlobPart], { type: 'application/pdf' }),
  );
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
  } finally {
    // Allow WebViews to consume the URL before releasing it, even if clicking fails.
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
}
