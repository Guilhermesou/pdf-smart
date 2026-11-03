import type { EditorServices } from '@/features/editor/model/editor-services';
import { createPdfSession } from '@/lib/pdf/engine';
import { compressPages } from '@/lib/pdf/compression';
import { saveBytes } from './download';

/** One instance per mounted editor; no shared documents, cache or workers. */
export function createBrowserEditorServices(): EditorServices {
  const session = createPdfSession();
  return {
    ...session,
    compressPages: (pages, progress, cancelled) =>
      session.run(() =>
        compressPages(
          pages,
          (message) => {
            if (!session.signal.aborted) progress(message);
          },
          cancelled,
          session,
        ),
      ),
    saveBytes: (bytes, filename) => {
      session.assertOpen();
      return saveBytes(bytes, filename);
    },
  };
}
