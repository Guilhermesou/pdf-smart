import './register-types.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { createOcrWorker } = await import('../lib/pdf/ocr.ts');
const originals = { window: globalThis.window, Worker: globalThis.Worker };
function mockHost() {
  const hosts = [];
  globalThis.window = { location: { origin: 'http://localhost' } };
  globalThis.Worker = class {
    constructor() {
      this.messages = [];
      this.terminated = false;
      hosts.push(this);
    }
    postMessage(message) {
      this.messages.push(message);
    }
    terminate() {
      this.terminated = true;
    }
  };
  return hosts;
}
function restore() {
  globalThis.window = originals.window;
  globalThis.Worker = originals.Worker;
}

test('closing a session during Tesseract initialization rejects and terminates its host', async () => {
  const hosts = mockHost(),
    controller = new AbortController();
  try {
    const pending = createOcrWorker(() => {}, 'tesseract', controller.signal);
    const rejected = assert.rejects(pending, /encerrada/);
    assert.equal(hosts[0].messages[0].type, 'ocr-start');
    assert.equal(
      hosts[0].messages[0].assets.langPath,
      'http://localhost/ocr/lang',
    );
    controller.abort();
    await rejected;
    assert.equal(hosts[0].terminated, true);
    assert.equal(hosts[0].onmessage, null);
  } finally {
    restore();
  }
});

test('stalled Tesseract initialization has a deadline even if progress keeps arriving', async (t) => {
  const hosts = mockHost();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const pending = createOcrWorker(() => {}, 'tesseract');
    const rejected = assert.rejects(pending, /prazo/);
    for (let i = 0; i < 3; i++) {
      hosts[0].onmessage({
        data: { type: 'ocr-progress', stage: 'Initializing', percent: 1 },
      });
      t.mock.timers.tick(10000);
    }
    await rejected;
    assert.equal(hosts[0].terminated, true);
  } finally {
    restore();
  }
});

test('session close during recognition rejects promptly and ignores late OCR output', async () => {
  const hosts = mockHost(),
    controller = new AbortController();
  try {
    const creating = createOcrWorker(() => {}, 'tesseract', controller.signal);
    const host = hosts[0];
    host.onmessage({ data: { type: 'ready', ready: true } });
    const engine = await creating;
    const pending = engine.recognize({
      toDataURL: () => 'data:image/png;base64,eA==',
    });
    const rejected = assert.rejects(pending, /encerrada/),
      late = host.onmessage;
    controller.abort();
    await rejected;
    late({
      data: { type: 'ocr-result', data: { text: 'late', confidence: 90 } },
    });
    await engine.terminate();
    assert.equal(host.terminated, true);
    assert.equal(engine.diagnostics().tesseractCalls, 1);
  } finally {
    restore();
  }
});

test('a failed OCR host is not reused for another page or parameters', async () => {
  const hosts = mockHost();
  try {
    const creating = createOcrWorker(() => {}, 'tesseract');
    const host = hosts[0];
    host.onmessage({ data: { type: 'ready', ready: true } });
    const engine = await creating;
    const canvas = { toDataURL: () => 'data:image/png;base64,eA==' };
    const pending = engine.recognize(canvas);
    const rejected = assert.rejects(pending, /failed reading/);
    host.onmessage({ data: { type: 'error', error: 'failed reading' } });
    await rejected;
    const dispatched = host.messages.length;
    await assert.rejects(engine.recognize(canvas), /encerrado/);
    await assert.rejects(
      engine.setParameters({ tessedit_pageseg_mode: '7' }),
      /encerrado/,
    );
    assert.equal(host.messages.length, dispatched);
    assert.equal(engine.diagnostics().tesseractCalls, 1);
    await engine.terminate();
  } finally {
    restore();
  }
});
