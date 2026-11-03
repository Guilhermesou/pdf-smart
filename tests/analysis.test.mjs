import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
// Match the bundler's extensionless local TypeScript imports in Node tests.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/.test(specifier)) {
      try {
        return next(specifier + '.ts', context);
      } catch {}
    }
    return next(specifier, context);
  },
});
const { analyzePages } = await import('../lib/pdf/analysis.ts');
const { AnalysisCache } = await import('../lib/pdf/analysis-cache.ts');
const analysisCache = new AnalysisCache();
const page = {
  id: 'p',
  source: 'fixture',
  index: 0,
  rotation: 0,
  text: '',
  thumb: '',
  ink: 0.002,
};
const visual = {
  ink: 0.002,
  paleInk: 0.04,
  boxArea: 0.02,
  box: null,
  outsideInk: 0,
  axis: 0,
};

test('progress stays live during a pending render and its timer stops at completion', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const details = [];
  let release, rendering;
  const startedRendering = new Promise((resolve) => {
    rendering = resolve;
  });
  const result = analyzePages(
    [page],
    { ocr: false, scanMode: true, tolerance: 0.003, bypassCache: true },
    () => {},
    { current: false },
    undefined,
    (detail) => details.push(detail),
    async () => {
      rendering();
      return new Promise((resolve) => {
        release = resolve;
      });
    },
  );
  await startedRendering;
  const before = details.length;
  t.mock.timers.tick(1000);
  assert.equal(details.length, before + 1);
  assert.equal(details.at(-1).current, 1);
  assert.equal(details.at(-1).completed, 0);
  const { createCanvas } = await import('@napi-rs/canvas');
  release(createCanvas(100, 140));
  await result;
  const completed = details.length;
  t.mock.timers.tick(5000);
  assert.equal(details.length, completed);
});

test('cached OCR avoids rendering and worker setup; current settings still determine verdict', async () => {
  analysisCache.retainSources(new Set());
  analysisCache.set('fixture:0', {
    visual,
    scanOcr: {
      data: { text: 'EM BRANCO', confidence: 95 },
      review: true,
      scan: visual,
    },
  });
  const details = [];
  const result = await analyzePages(
    [page],
    { ocr: true, scanMode: true, tolerance: 0.003 },
    () => {},
    { current: false },
    undefined,
    (d) => details.push(d),
    async () => {
      throw Error('Cache should avoid rendering');
    },
    analysisCache,
  );
  assert.equal(result.pages[0].verdict.kind, 'stamp');
  assert.equal(details.at(-1).completed, 1);
  assert.equal(details.at(-1).cachedPages, 1);
  assert.equal(details.at(-1).page.verdict.kind, 'stamp');
  assert.ok(details.at(-1).elapsedSeconds >= 0);
  const normal = await analyzePages(
    [page],
    { ocr: false, scanMode: false, tolerance: 0.001 },
    () => {},
    { current: false },
    undefined,
    undefined,
    async () => {
      throw Error('Not needed');
    },
  );
  assert.equal(normal.pages[0].verdict.kind, 'content');
  assert.equal(normal.pages[0].verdict.ocrStatus, 'disabled');
});

test('cancelled analysis preserves completed results and does not start another page', async () => {
  const cancel = { current: false };
  const result = await analyzePages(
    [page, { ...page, id: 'p2' }],
    { ocr: false, tolerance: 0.003 },
    () => {},
    cancel,
    () => {
      cancel.current = true;
    },
    undefined,
    async () => {
      throw Error('Not needed');
    },
  );
  assert.equal(result.pages.length, 1);
});

test('evidence cache is bounded, discards large OCR internals, and releases removed sources', () => {
  const cache = new AnalysisCache(2);
  cache.set('a:0', {
    scanOcr: {
      data: {
        text: 'EM BRANCO',
        confidence: 90,
        hugeBuffer: new Uint8Array(1000),
      },
      review: true,
    },
  });
  assert.deepEqual(Object.keys(cache.get('a:0').scanOcr.data), [
    'text',
    'confidence',
  ]);
  cache.set('a:1', { visual });
  cache.set('b:0', { visual });
  assert.equal(cache.get('a:0'), undefined);
  cache.retainSources(new Set(['b']));
  assert.equal(cache.get('a:1'), undefined);
  cache.set('b:1', {
    plainOcr: {
      data: { text: 'x'.repeat(4001), confidence: 90 },
      review: false,
    },
    visual,
  });
  assert.equal(cache.get('b:1').plainOcr, undefined);
  assert.deepEqual(cache.get('b:1').visual, visual);
});

test('bypass cache forces fresh visual measurement and reports rendering separately', async () => {
  const { createCanvas } = await import('@napi-rs/canvas');
  let renders = 0,
    last;
  analysisCache.set('fixture:0', { visual });
  await analyzePages(
    [page],
    { ocr: false, scanMode: true, tolerance: 0.003, bypassCache: true },
    () => {},
    { current: false },
    undefined,
    (detail) => {
      last = detail;
    },
    async () => {
      renders++;
      const canvas = createCanvas(100, 140);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, 100, 140);
      return canvas;
    },
    analysisCache,
  );
  assert.equal(renders, 1);
  assert.equal(last.cachedPages, 0);
  assert.ok(last.timings.renderMs >= 0);
  assert.equal(last.timings.ocrMs, 0);
  assert.equal(last.ocrDiagnostics, undefined);
});
