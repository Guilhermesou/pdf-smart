import { PDFDocument } from 'pdf-lib';
import { isCompressionRequest, type WorkerResponse } from './worker-protocol';

const scope = self as unknown as {
  onmessage: (event: MessageEvent<unknown>) => void;
  postMessage: (data: WorkerResponse, transfer?: Transferable[]) => void;
};

let output: PDFDocument | undefined;
scope.onmessage = async ({ data }) => {
  try {
    if (!isCompressionRequest(data))
      throw new Error('Pedido de compressão inválido.');
    if (data.type === 'start') {
      output = await PDFDocument.create();
    } else if (data.type === 'page') {
      if (!output) throw new Error('Compressão não iniciada.');
      const { width, height, jpeg } = data;
      if (
        !(
          width > 0 &&
          height > 0 &&
          Number.isFinite(width) &&
          Number.isFinite(height)
        )
      )
        throw new Error('Dimensões inválidas.');
      const image = await output.embedJpg(jpeg);
      output
        .addPage([width, height])
        .drawImage(image, { x: 0, y: 0, width, height });
    } else if (data.type === 'save') {
      if (!output?.getPageCount())
        throw new Error('Nenhuma página para comprimir.');
      const bytes = await output.save();
      output = undefined;
      scope.postMessage({ type: 'result', bytes }, [
        bytes.buffer as ArrayBuffer,
      ]);
      return;
    } else {
      throw new Error('Operação de compressão inválida.');
    }
    scope.postMessage({ type: 'ready', ready: true });
  } catch (error) {
    output = undefined;
    scope.postMessage({
      type: 'error',
      error: error instanceof Error ? error.message : 'Falha na compressão.',
    });
  }
};
