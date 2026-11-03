import { PDFDocument, degrees, type PDFPage } from 'pdf-lib';
import { isExportRequest, type WorkerResponse } from './worker-protocol';
const scope = self as unknown as {
  onmessage: (event: MessageEvent<unknown>) => void;
  postMessage: (data: WorkerResponse, transfer?: Transferable[]) => void;
};
type PageRef = { source: string | null; index: number; rotation: number };
let retained: { id: string; doc: PDFDocument } | undefined;
scope.onmessage = async (e) => {
  try {
    if (!isExportRequest(e.data))
      throw new Error('Pedido de exportação inválido.');
    const { sources, pages, reuseSource } = e.data;
    if (!pages.length) throw new Error('Nenhuma página para exportar.');
    const output = await PDFDocument.create(),
      ordered: PDFPage[] = [];
    const groups = new Map<string, { position: number; page: PageRef }[]>();
    let completed = 0;
    for (const [position, page] of pages.entries()) {
      if (page.source) {
        const group = groups.get(page.source) || [];
        group.push({ position, page });
        groups.set(page.source, group);
      } else {
        const blank = output.addPage([595.28, 841.89]);
        blank.setRotation(degrees(page.rotation));
        ordered[position] = blank;
        output.removePage(output.getPageCount() - 1);
        completed++;
      }
    }
    for (const [id, group] of groups) {
      scope.postMessage({
        type: 'progress',
        progress: { phase: 'loading', completed, total: pages.length },
      });
      const source = sources[id];
      if (!source) throw new Error('Arquivo de origem indisponível.');
      // Blob bytes are read here, away from the UI. Only one source is parsed at a time.
      const previous =
        reuseSource && retained?.id === id ? retained.doc : undefined;
      retained = undefined;
      const doc =
        previous ??
        (await PDFDocument.load(
          source instanceof Uint8Array ? source : await source.arrayBuffer(),
        ));
      if (reuseSource) retained = { id, doc };
      // One copier per source preserves shared fonts/images instead of duplicating them per page.
      const copied = await output.copyPages(
        doc,
        group.map((x) => x.page.index),
      );
      for (let i = 0; i < group.length; i++) {
        const { position, page } = group[i],
          copy = copied[i];
        copy.setRotation(degrees(copy.getRotation().angle + page.rotation));
        ordered[position] = copy;
        completed++;
        if (completed % 16 === 0)
          scope.postMessage({
            type: 'progress',
            progress: { phase: 'copying', completed, total: pages.length },
          });
      }
      delete sources[id];
    }
    for (const page of ordered) output.addPage(page);
    scope.postMessage({
      type: 'progress',
      progress: {
        phase: 'saving',
        completed: pages.length,
        total: pages.length,
      },
    });
    const bytes = await output.save();
    scope.postMessage({ type: 'result', bytes }, [bytes.buffer as ArrayBuffer]);
  } catch (e) {
    retained = undefined;
    scope.postMessage({
      type: 'error',
      error: e instanceof Error ? e.message : 'Falha na exportação',
    });
  }
};
