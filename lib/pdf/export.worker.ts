import { PDFDocument, degrees, type PDFPage } from 'pdf-lib';
const scope = self as unknown as {
  onmessage: (event: MessageEvent) => void;
  postMessage: (data: unknown, transfer?: Transferable[]) => void;
};
type PageRef = { source: string | null; index: number; rotation: number };
scope.onmessage = async (e) => {
  try {
    const {
      sources,
      pages,
    }: { sources: Record<string, Blob | Uint8Array>; pages: PageRef[] } =
      e.data;
    if (!pages.length) throw new Error('Nenhuma página para exportar.');
    const output = await PDFDocument.create(),
      ordered = new Array<PDFPage>(pages.length);
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
        progress: { phase: 'loading', completed, total: pages.length },
      });
      const source = sources[id];
      if (!source) throw new Error('Arquivo de origem indisponível.');
      // Blob bytes are read here, away from the UI. Only one source is parsed at a time.
      const doc = await PDFDocument.load(
        source instanceof Uint8Array ? source : await source.arrayBuffer(),
      );
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
            progress: { phase: 'copying', completed, total: pages.length },
          });
      }
      delete sources[id];
    }
    for (const page of ordered) output.addPage(page);
    scope.postMessage({
      progress: {
        phase: 'saving',
        completed: pages.length,
        total: pages.length,
      },
    });
    const bytes = await output.save();
    scope.postMessage({ bytes }, [bytes.buffer as ArrayBuffer]);
  } catch (e) {
    scope.postMessage({
      error: e instanceof Error ? e.message : 'Falha na exportação',
    });
  }
};
