import { PDFDocument, degrees, StandardFonts, rgb, type PDFPage } from 'pdf-lib';
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
          { ignoreEncryption: true },
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
    if (e.data.numbering?.enabled) {
      const {
        format = 'fls',
        prefix = 'Fls. ',
        startAt = 1,
        position = 'top-right',
        fontSize = 10,
      } = e.data.numbering;
      const font = await output.embedFont(StandardFonts.Helvetica);
      const total = ordered.length;
      for (let i = 0; i < ordered.length; i++) {
        const page = ordered[i];
        const n = startAt + i;
        const text =
          format === 'fls'
            ? `${prefix}${n}`
            : format === 'page_of_total'
              ? `Pág. ${n} de ${total}`
              : `${n}`;
        const textWidth = font.widthOfTextAtSize(text, fontSize);
        const { width, height } = page.getSize();
        let x = width - textWidth - 28;
        let y = height - 28;
        if (position === 'bottom-right') {
          y = 20;
        } else if (position === 'bottom-center') {
          x = (width - textWidth) / 2;
          y = 20;
        }
        page.drawText(text, {
          x,
          y,
          size: fontSize,
          font,
          color: rgb(0.2, 0.2, 0.2),
        });
      }
    }
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
