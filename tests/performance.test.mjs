import './register-types.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  exportPayload,
  pruneResources,
  virtualWindow,
  paintBeforeWork,
  canvasBlob,
} from '../lib/pdf/runtime.ts';
import { PDFDocument, PDFName, StandardFonts } from 'pdf-lib';
test('export transports Blob handles and page references, never thumbnails or OCR text', async () => {
  const file = new Blob(['pdf-bytes']),
    pages = [
      {
        source: 'a',
        index: 0,
        rotation: 90,
        thumb: 'data:'.repeat(1000),
        text: 'private OCR',
      },
      { source: 'a', index: 2, rotation: 0 },
    ];
  const payload = exportPayload(pages, new Map([['a', { file }]]));
  assert.equal(payload.sources.a, file);
  assert.deepEqual(Object.keys(payload.pages[0]), [
    'source',
    'index',
    'rotation',
  ]);
  assert.equal(await structuredClone(payload).sources.a.text(), 'pdf-bytes');
  assert.throws(() => exportPayload(pages, new Map()));
});
test('virtual gallery keeps bounded cards for a 600-page document and handles filter shrink', () => {
  for (let top = 0; top < 35000; top += 1000) {
    const w = virtualWindow(600, 6, 350, top, 700);
    assert.ok(w.end - w.start <= 36);
    assert.ok(w.end <= 600);
    assert.ok(w.start >= 0);
  }
  const last = virtualWindow(600, 6, 350, 34300, 700);
  assert.equal(last.end, 600);
  const shrink = virtualWindow(3, 6, 350, 34300, 700);
  assert.equal(shrink.start, 0);
  assert.equal(shrink.end, 3);
});
test('resources referenced by undo survive; orphan sources and URLs are released once', async () => {
  let destroyed = 0;
  const sources = new Map([
      [
        'a',
        {
          destroy: async () => {
            destroyed++;
          },
        },
      ],
      [
        'b',
        {
          destroy: async () => {
            destroyed++;
          },
        },
      ],
    ]),
    urls = new Set(['blob:a', 'blob:b']),
    revoked = [];
  const history = [[{ source: 'a', thumb: 'blob:a' }]];
  pruneResources(sources, urls, [], history, (u) => revoked.push(u));
  assert.deepEqual([...sources.keys()], ['a']);
  assert.deepEqual(revoked, ['blob:b']);
  assert.equal(destroyed, 1);
  pruneResources(sources, urls, [], [], (u) => revoked.push(u));
  pruneResources(sources, urls, [], [], (u) => revoked.push(u));
  assert.equal(destroyed, 2);
  assert.deepEqual(revoked, ['blob:b', 'blob:a']);
});
test('paint barrier yields before work and asynchronous image encoding handles errors', async () => {
  let complete = false;
  const pending = paintBeforeWork().then(() => {
    complete = true;
  });
  assert.equal(complete, false);
  await pending;
  assert.equal(complete, true);
  assert.equal(
    (await canvasBlob({ toBlob: (cb) => cb(new Blob(['x'])) })).size,
    1,
  );
  await assert.rejects(canvasBlob({ toBlob: (cb) => cb(null) }));
});
test('batch export preserves shared font resources and reports progress separately from completion', async () => {
  const doc = await PDFDocument.create(),
    font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 64; i++)
    doc.addPage().drawText(`Page ${i + 1}`, { font });
  let result;
  const progress = [];
  globalThis.self = {
    postMessage: (value) => {
      if (value.progress) progress.push(value.progress);
      else result = value;
    },
  };
  await import('../lib/pdf/export.worker.ts?performance');
  await self.onmessage({
    data: {
      type: 'export',
      sources: { a: new Blob([await doc.save()]) },
      pages: Array.from({ length: 64 }, (_, index) => ({
        source: 'a',
        index,
        rotation: 0,
      })),
    },
  });
  assert.ok(result.bytes, result.error);
  assert.equal(progress.at(-1).phase, 'saving');
  assert.equal(progress.at(-1).completed, 64);
  const out = await PDFDocument.load(result.bytes);
  assert.equal(out.getPageCount(), 64);
  const refs = out
    .getPages()
    .map((p) =>
      p.node.Resources().lookup(PDFName.of('Font')).values()[0].toString(),
    );
  assert.equal(new Set(refs).size, 1);
});

test('split worker reuses one source and recovers after a failed part', async () => {
  const fixture = await PDFDocument.create();
  fixture.addPage([200, 300]);
  fixture.addPage([400, 500]);
  const file = new Blob([await fixture.save()]);
  // Preserve the exact method for restoration; calls below explicitly bind PDFDocument.
  // oxlint-disable-next-line typescript/unbound-method
  const originalLoad = PDFDocument.load;
  let reads = 0;
  PDFDocument.load = async (...args) => {
    reads++;
    return originalLoad.apply(PDFDocument, args);
  };
  let response;
  globalThis.self = {
    postMessage: (value) => {
      if (!value.progress) response = value;
    },
  };
  try {
    await import('../lib/pdf/export.worker.ts?split-cache');
    for (const index of [0, 1]) {
      await self.onmessage({
        data: {
          type: 'export',
          sources: { a: file },
          reuseSource: true,
          pages: [{ source: 'a', index, rotation: 0 }],
        },
      });
      assert.ok(response.bytes, response.error);
      const output = await originalLoad.call(PDFDocument, response.bytes);
      assert.equal(output.getPageCount(), 1);
      assert.equal(output.getPage(0).getWidth(), index === 0 ? 200 : 400);
    }
    assert.equal(reads, 1, 'consecutive parts parse the source only once');
    await self.onmessage({
      data: { type: 'export', sources: {}, pages: [], reuseSource: true },
    });
    assert.ok(response.error);
    await self.onmessage({
      data: {
        type: 'export',
        sources: { a: file },
        reuseSource: true,
        pages: [{ source: 'a', index: 0, rotation: 0 }],
      },
    });
    assert.ok(response.bytes, response.error);
    assert.equal(reads, 2, 'an error clears retained state');
  } finally {
    PDFDocument.load = originalLoad;
  }
});
