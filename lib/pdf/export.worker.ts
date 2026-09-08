import { PDFDocument, degrees } from 'pdf-lib';
const scope = self as unknown as {
  onmessage: (event: MessageEvent) => void;
  postMessage: (data: unknown, transfer?: Transferable[]) => void;
};
scope.onmessage = async (e) => {
  try {
    const { sources, pages } = e.data;
    const output = await PDFDocument.create();
    const docs = new Map<string, PDFDocument>();
    for (const p of pages) {
      if (!p.source) {
        const page = output.addPage([595.28, 841.89]);
        page.setRotation(degrees(p.rotation));
        continue;
      }
      let doc = docs.get(p.source);
      if (!doc) {
        doc = await PDFDocument.load(sources[p.source]);
        docs.set(p.source, doc);
      }
      const [page] = await output.copyPages(doc, [p.index]);
      page.setRotation(degrees(page.getRotation().angle + p.rotation));
      output.addPage(page);
    }
    const bytes = await output.save();
    scope.postMessage({ bytes }, [bytes.buffer as ArrayBuffer]);
  } catch (e) {
    scope.postMessage({
      error: e instanceof Error ? e.message : 'Falha na exportação',
    });
  }
};
