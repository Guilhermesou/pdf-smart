import './register-types.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, degrees } from 'pdf-lib';
import {
  classify,
  measureInk,
  measureInteriorInk,
  shouldRunOcr,
} from '../lib/pdf/detection.ts';

test('blank, sparse, stamp and real text remain distinct', () => {
  assert.equal(classify('', 0, 0.0015).kind, 'blank');
  assert.equal(classify('', 0.001, 0.0015).kind, 'sparse');
  assert.equal(classify('EM BRANCO', 0.01, 0.0015).kind, 'stamp');
  assert.equal(
    classify('EM BRANCO\nAssinatura: Maria', 0.01, 0.0015).kind,
    'content',
  );
  assert.equal(classify('12345', 0.00001, 0.0015).kind, 'sparse');
  assert.equal(classify('EM BRANCO', 0.3, 0.0015).kind, 'content');
  assert.equal(classify('EM BRANCO', 0.01, 0.0015, 20).kind, 'content');
  assert.equal(classify('', 0.004, 0.0015).kind, 'content');
  assert.equal(classify('', 0.004, 0.007).kind, 'sparse');
});
test('visual density accounts for scan background and dark scans', () => {
  const pixels = (n, v) =>
    new Uint8ClampedArray(
      Array.from({ length: n }, () => [v, v, v, 255]).flat(),
    );
  assert.equal(measureInk(pixels(100, 255)), 0);
  assert.equal(measureInk(pixels(100, 218)), 0);
  assert.equal(measureInk(pixels(100, 20)), 1);
  const data = pixels(100, 255);
  data.set([0, 0, 0, 255], 0);
  assert.equal(measureInk(data), 0.01);
});
test('export worker merges, reorders, deletes, inserts and rotates without rasterizing', async () => {
  const a = await PDFDocument.create();
  a.addPage([300, 400]);
  a.addPage([500, 600]);
  a.getPage(1).setRotation(degrees(90));
  const b = await PDFDocument.create();
  b.addPage([200, 250]);
  let result;
  globalThis.self = {
    postMessage: (value) => {
      result = value;
    },
  };
  await import('../lib/pdf/export.worker.ts');
  await self.onmessage({
    data: {
      type: 'export',
      sources: { a: await a.save(), b: await b.save() },
      pages: [
        { source: 'b', index: 0, rotation: 0 },
        { source: 'a', index: 1, rotation: 90 },
        { source: null, index: 0, rotation: 0 },
      ],
    },
  });
  assert.ok(!result.error, result.error);
  const out = await PDFDocument.load(result.bytes);
  assert.equal(out.getPageCount(), 3);
  assert.equal(out.getPage(0).getWidth(), 200);
  assert.equal(out.getPage(1).getWidth(), 500);
  assert.equal(out.getPage(1).getRotation().angle, 180);
  assert.ok(Math.abs(out.getPage(2).getWidth() - 595.28) < 0.01);
  await self.onmessage({
    data: {
      type: 'export',
      sources: { a: await a.save(), b: await b.save() },
      pages: [
        { source: 'b', index: 0, rotation: 0 },
        { source: 'a', index: 1, rotation: 0 },
      ],
      numbering: {
        enabled: true,
        format: 'fls',
        startAt: 42,
      },
    },
  });
  assert.ok(!result.error, result.error);
  const numbered = await PDFDocument.load(result.bytes);
  assert.equal(numbered.getPageCount(), 2);
  await self.onmessage({
    data: {
      type: 'export',
      sources: { a: await a.save() },
      pages: [{ source: 'a', index: 0, rotation: 0 }],
      watermark: {
        enabled: true,
        text: 'CONFIDENCIAL',
        color: 'red',
        opacity: 0.2,
      },
      normalizeA4: true,
    },
  });
  assert.ok(!result.error, result.error);
  const a4Watermarked = await PDFDocument.load(result.bytes);
  assert.equal(a4Watermarked.getPageCount(), 1);
  const p = a4Watermarked.getPage(0);
  assert.ok(Math.abs(p.getWidth() - 595.28) < 1);
  assert.ok(Math.abs(p.getHeight() - 841.89) < 1);
  await self.onmessage({
    data: {
      type: 'export',
      sources: {},
      pages: [{ source: 'missing', index: 0, rotation: 0 }],
    },
  });
  assert.ok(result.error);
});

test('stamps with numbering and mixed native text still receive OCR', () => {
  assert.equal(shouldRunOcr('42', 0.01), true);
  assert.equal(shouldRunOcr('Pág. 42\n', 0.01), true);
  assert.equal(shouldRunOcr('A'.repeat(300), 0.01), false);
  assert.equal(classify('EM BRANCO\nPág. 42', 0.01, 0.003).kind, 'stamp');
  assert.equal(classify('EM BRANC0\n42', 0.01, 0.003).kind, 'stamp');
  assert.equal(classify('EM BRANCO 42', 0.01, 0.003).kind, 'sparse');
  assert.equal(classify('Valor total 12345', 0.00001, 0.003).kind, 'content');
});
test('scan-border exclusion retains central content and handles blank images', () => {
  const w = 100,
    h = 100,
    data = new Uint8ClampedArray(w * h * 4).fill(255);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < 2; x++) data.set([0, 0, 0, 255], (y * w + x) * 4);
  assert.ok(measureInk(data) > 0);
  assert.equal(measureInteriorInk(data, w, h), 0);
  data.set([0, 0, 0, 255], (50 * w + 50) * 4);
  assert.ok(measureInteriorInk(data, w, h) > 0);
});

test('OCR spacing inside EM BRANCO is normalized without dropping other text', () => {
  assert.equal(classify('EM BR ANCO', 0.01, 0.003, 90).kind, 'stamp');
  assert.equal(
    classify('EM BR ANCO\nAssinatura: Maria', 0.01, 0.003, 90).kind,
    'content',
  );
});
