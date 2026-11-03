import { createOcrWorkerHost } from './ocr-worker-host';
import type { WorkerResponse } from './worker-protocol';
const scope = self as unknown as {
  onmessage: (event: MessageEvent<unknown>) => void;
  postMessage: (response: WorkerResponse) => void;
};
const host = createOcrWorkerHost((response) => scope.postMessage(response));
// Terminating this host also ends its dedicated Tesseract worker.
scope.onmessage = ({ data }) => {
  void host.handle(data);
};
