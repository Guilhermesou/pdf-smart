import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({
  resolve(s, c, next) {
    if (s.startsWith('.') && !/\.[a-z]+$/.test(s)) return next(s + '.ts', c);
    return next(s, c);
  },
});
const { nativeOcrEngine } = await import('../lib/pdf/native-ocr.ts');
test('unavailable native backend is rejected for platform fallback', async () => {
  await assert.rejects(
    nativeOcrEngine(
      async () => ({ engine: 'unsupported', error: 'unavailable' }),
      () => {},
      async () => {},
    ),
  );
});
test('native failure switches once and preserves OCR parameters', async () => {
  const original = globalThis.FileReader;
  globalThis.FileReader = class {
    readAsDataURL() {
      this.result = 'data:image/png;base64,eA==';
      this.onload();
    }
  };
  let calls = 0,
    fallbacks = 0,
    reads = 0,
    mode;
  try {
    const engine = await nativeOcrEngine(
      async () => {
        calls++;
        return calls === 1
          ? { engine: 'apple-vision', acceleration: 'system' }
          : { error: 'failed' };
      },
      () => {},
      async () => {
        fallbacks++;
        return {
          recognize: async () => {
            reads++;
            return { data: { text: 'EM BRANCO', confidence: 90 } };
          },
          setParameters: async (p) => {
            mode = p;
          },
          terminate: async () => {},
        };
      },
    );
    await engine.setParameters({ tessedit_pageseg_mode: '7' });
    const c = { toBlob: (callback) => callback(new Blob(['x'])) };
    await engine.recognize(c);
    await engine.recognize(c);
    await engine.terminate();
    assert.equal(calls, 2);
    assert.equal(fallbacks, 1);
    assert.equal(reads, 2);
    assert.equal(mode.tessedit_pageseg_mode, '7');
  } finally {
    globalThis.FileReader = original;
  }
});

test('diagnostics count native readings, not capability probes, and preserve device selection', async () => {
  const original = globalThis.FileReader;
  globalThis.FileReader = class {
    readAsDataURL() {
      this.result = 'data:image/png;base64,eA==';
      this.onload();
    }
  };
  let calls = 0;
  try {
    const engine = await nativeOcrEngine(
      async () => {
        calls++;
        return {
          engine: 'apple-vision',
          acceleration:
            calls === 1 ? 'neural-engine-available' : 'neural-engine-requested',
          text: 'EM BRANCO',
          confidence: 100,
          elapsedMs: 4,
        };
      },
      () => {},
      async () => {
        throw Error('Unexpected fallback');
      },
    );
    assert.equal(engine.diagnostics().appleCalls, 0);
    await engine.recognize({ toBlob: (done) => done(new Blob(['x'])) });
    assert.equal(engine.diagnostics().appleCalls, 1);
    assert.equal(engine.diagnostics().neuralRequests, 1);
    assert.equal(engine.diagnostics().appleMs, 4);
    assert.equal(engine.diagnostics().tesseractCalls, 0);
  } finally {
    globalThis.FileReader = original;
  }
});
