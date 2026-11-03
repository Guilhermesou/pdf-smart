import './register-types.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { requestWorker } = await import('../lib/pdf/worker-client.ts');
const { withAbort } = await import('../lib/pdf/runtime.ts');
const { isExportRequest, isCompressionRequest, isWorkerResponse } =
  await import('../lib/pdf/worker-protocol.ts');
const fakeWorker = () => ({
  terminated: 0,
  messages: [],
  postMessage(value) {
    this.messages.push(value);
  },
  terminate() {
    this.terminated++;
  },
});

test('progress never resolves a result request; success detaches handlers and allows reuse', async () => {
  const worker = fakeWorker(),
    signal = new AbortController().signal,
    progress = [];
  let completed = false;
  const pending = requestWorker(
    worker,
    { type: 'save' },
    { expected: 'result', signal, progress: (value) => progress.push(value) },
  );
  void pending.then(() => {
    completed = true;
  });
  worker.onmessage({
    data: {
      type: 'progress',
      progress: { phase: 'saving', completed: 1, total: 1 },
    },
  });
  await Promise.resolve();
  assert.equal(completed, false);
  worker.onmessage({ data: { type: 'result', bytes: new Uint8Array([1]) } });
  assert.equal((await pending).bytes[0], 1);
  assert.equal(progress.length, 1);
  assert.equal(worker.terminated, 0);
  assert.equal(worker.onmessage, null);
  assert.equal(worker.onmessageerror, null);
  const next = requestWorker(
    worker,
    { type: 'start' },
    { expected: 'ready', signal },
  );
  worker.onmessage({ data: { type: 'ready', ready: true } });
  assert.equal((await next).type, 'ready');
});

for (const response of [
  { bytes: new Uint8Array([1]) },
  { type: 'ready', ready: true },
  { type: 'result', bytes: 'invalid' },
  { type: 'progress', progress: { phase: 'saving', completed: 10, total: 1 } },
]) {
  test(`invalid or unexpected ${response.type ?? 'untyped'} response terminates the worker`, async () => {
    const worker = fakeWorker();
    const pending = requestWorker(
      worker,
      { type: 'save' },
      { expected: 'result', signal: new AbortController().signal },
    );
    const rejected = assert.rejects(pending, /inválida|inesperada/);
    worker.onmessage({ data: response });
    await rejected;
    assert.equal(worker.terminated, 1);
    assert.equal(worker.onmessage, null);
  });
}

test('timeout rejects even when the worker keeps reporting progress; late output is ignored', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const worker = fakeWorker();
  const pending = requestWorker(
    worker,
    { type: 'save' },
    { expected: 'result', signal: new AbortController().signal, timeoutMs: 50 },
  );
  const rejected = assert.rejects(pending, /prazo/),
    lateHandler = worker.onmessage;
  for (let i = 0; i < 4; i++) {
    worker.onmessage({
      data: {
        type: 'progress',
        progress: { phase: 'saving', completed: 1, total: 1 },
      },
    });
    t.mock.timers.tick(10);
  }
  t.mock.timers.tick(10);
  await rejected;
  lateHandler({ data: { type: 'result', bytes: new Uint8Array([1]) } });
  assert.equal(worker.terminated, 1);
  assert.equal(worker.onmessage, null);
});

test('aborting before dispatch sends no message and rejects immediately', async () => {
  const worker = fakeWorker(),
    controller = new AbortController();
  controller.abort();
  await assert.rejects(
    requestWorker(
      worker,
      { type: 'save' },
      { expected: 'result', signal: controller.signal },
    ),
    /encerrada/,
  );
  assert.equal(worker.messages.length, 0);
});

for (const failure of ['onerror', 'onmessageerror', 'postMessage']) {
  test(`${failure} failure rejects and cleans up`, async () => {
    const worker = fakeWorker();
    if (failure === 'postMessage')
      worker.postMessage = () => {
        throw Error('write failed');
      };
    const pending = requestWorker(
      worker,
      { type: 'save' },
      { expected: 'result', signal: new AbortController().signal },
    );
    const rejected = assert.rejects(pending);
    if (failure !== 'postMessage') worker[failure]({});
    await rejected;
    assert.equal(worker.terminated, 1);
    assert.equal(worker.onmessage, null);
  });
}

test('an aborted asynchronous image preparation rejects and safely ignores a late failure', async () => {
  const controller = new AbortController();
  let fail;
  const encoding = new Promise((_, reject) => {
    fail = reject;
  });
  const pending = withAbort(encoding, controller.signal);
  const rejected = assert.rejects(pending, /encerrada/);
  controller.abort();
  await rejected;
  fail(Error('late failure'));
  await Promise.resolve();
});

test('worker request contracts reject missing discriminators and malformed dimensions/pages', () => {
  const valid = {
    type: 'export',
    sources: {},
    pages: [{ source: null, index: 0, rotation: 0 }],
  };
  assert.equal(isExportRequest(valid), true);
  for (const pages of [
    [{ source: null, index: -1, rotation: 0 }],
    [{ source: null, index: 0, rotation: NaN }],
  ])
    assert.equal(isExportRequest({ ...valid, pages }), false);
  assert.equal(isExportRequest({ ...valid, type: undefined }), false);
  assert.equal(
    isCompressionRequest({
      type: 'page',
      jpeg: new ArrayBuffer(1),
      width: Infinity,
      height: 1,
    }),
    false,
  );
  assert.equal(
    isCompressionRequest({
      type: 'page',
      jpeg: 'invalid',
      width: 1,
      height: 1,
    }),
    false,
  );
  assert.equal(
    isWorkerResponse({ type: 'result', bytes: new Uint8Array() }),
    false,
  );
});
