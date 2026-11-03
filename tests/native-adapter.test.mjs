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
const flushPromises = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

test('native probe cannot indefinitely block platform fallback', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = nativeOcrEngine(
    () => new Promise(() => {}),
    () => {},
    async () => {},
  );
  const rejected = assert.rejects(pending, /inicialização em 3 segundos/);
  t.mock.timers.tick(3000);
  await rejected;
});

for (const stalledStage of ['canvas', 'reader', 'invoke']) {
  test(`stalled ${stalledStage} switches to fallback once and ignores late native output`, async (t) => {
    const original = globalThis.FileReader;
    globalThis.FileReader = class {
      readAsDataURL() {
        if (stalledStage === 'reader') return;
        this.result = 'data:image/png;base64,eA==';
        this.onload();
      }
    };
    let calls = 0,
      fallbacks = 0,
      reads = 0,
      completeNative;
    try {
      const engine = await nativeOcrEngine(
        async () => {
          calls++;
          if (calls === 1)
            return { engine: 'apple-vision', acceleration: 'system' };
          return new Promise((resolve) => {
            completeNative = resolve;
          });
        },
        () => {},
        async () => {
          fallbacks++;
          return {
            recognize: async () => {
              reads++;
              return { data: { text: 'EM BRANCO', confidence: 90 } };
            },
            setParameters: async () => {},
            terminate: async () => {},
          };
        },
      );
      t.mock.timers.enable({ apis: ['setTimeout'] });
      const canvas = {
        toBlob: (done) => {
          if (stalledStage !== 'canvas') done(new Blob(['x']));
        },
      };
      const pending = engine.recognize(canvas);
      await flushPromises();
      t.mock.timers.tick(stalledStage === 'invoke' ? 8000 : 3000);
      assert.equal((await pending).data.text, 'EM BRANCO');
      completeNative?.({
        text: 'late',
        confidence: 100,
        acceleration: 'system',
      });
      await flushPromises();
      assert.equal((await engine.recognize(canvas)).data.text, 'EM BRANCO');
      assert.equal(fallbacks, 1);
      assert.equal(reads, 2);
      assert.equal(calls, stalledStage === 'invoke' ? 2 : 1);
      assert.equal(
        engine.diagnostics().appleCalls,
        stalledStage === 'invoke' ? 1 : 0,
      );
      assert.match(engine.diagnostics().fallbackReason, /excedeu/);
    } finally {
      globalThis.FileReader = original;
    }
  });
}
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
