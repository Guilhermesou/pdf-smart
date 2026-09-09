import test from 'node:test';
import assert from 'node:assert/strict';
import { scanRegion, scanNeedsReview } from '../lib/pdf/scan.ts';
test('binding and faint reverse-side text do not dominate isolated dark stamp', () => {
  const w = 200,
    h = 300,
    p = new Uint8ClampedArray(w * h * 4).fill(255);
  const paint = (x, y, c) => p.set([c, c, c, 255], (y * w + x) * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < 20; x++) paint(x, y, 80);
  for (let y = 50; y < 250; y += 10)
    for (let x = 30; x < 180; x++) paint(x, y, 230);
  for (let y = 135; y < 165; y++)
    for (let x = 100; x < 105; x++) paint(x, y, 80);
  const s = scanRegion(p, w, h);
  assert.ok(s.ink < 0.012);
  assert.ok(s.boxArea < 0.2);
  assert.equal(scanNeedsReview('', s.ink, s.boxArea), true);
  assert.equal(scanNeedsReview('Assinatura', s.ink, s.boxArea), false);
});
test('distributed or dense marks are not considered an isolated stamp', () => {
  assert.equal(scanNeedsReview('', 0.05, 0.1), false);
  assert.equal(scanNeedsReview('', 0.003, 0.7), false);
});

test('distant specks do not expand the stamp region but additional writing is retained', () => {
  const w = 400,
    h = 600,
    p = new Uint8ClampedArray(w * h * 4).fill(255);
  const paint = (x, y) => p.set([60, 60, 60, 255], (y * w + x) * 4);
  for (let y = 250; y < 310; y++) for (let x = 200; x < 207; x++) paint(x, y);
  paint(330, 530);
  paint(340, 510);
  const isolated = scanRegion(p, w, h);
  assert.ok(isolated.boxArea < 0.2);
  assert.ok(isolated.outsideInk > 0);
  for (let y = 80; y < 120; y++) for (let x = 80; x < 110; x++) paint(x, y);
  const writing = scanRegion(p, w, h);
  assert.equal(scanNeedsReview('', writing.ink, writing.boxArea), false);
});
test('possible bleed-through is a review signal, not a parity assumption', async () => {
  const { looksLikeBleedThrough } = await import('../lib/pdf/scan.ts');
  assert.equal(looksLikeBleedThrough(true, 0.002, 0.04), true);
  assert.equal(looksLikeBleedThrough(true, 0.002, 0.001), false);
  assert.equal(looksLikeBleedThrough(false, 0.002, 0.04), false);
});

test('scan review inspects searchable scans without treating extracted text as proof of visible content', async () => {
  const { createCanvas } = await import('@napi-rs/canvas');
  const { recognizeScanStamp } = await import('../lib/pdf/scan.ts');
  const c = createCanvas(400, 600), ctx = c.getContext('2d');
  ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 400, 600);
  ctx.fillStyle = '#aaa'; ctx.fillRect(200, 260, 6, 50);
  const extracted = 'Texto da frente reconhecido na camada OCR. '.repeat(30);
  const worker = { recognize: async () => ({ data: { text: 'EM BRANCO', confidence: 95 } }) };
  const result = await recognizeScanStamp(worker, c, createCanvas, extracted, () => false, true);
  assert.equal(result.review, true);
  assert.equal(scanNeedsReview(extracted, .003, .6, true), false);
  assert.equal(scanNeedsReview(extracted, .03, .1, true), false);
  assert.equal(scanNeedsReview(extracted, .003, .1), false);
});

test('wide colored binding is ignored but a dark writing block is retained', async () => {
  const { createCanvas } = await import('@napi-rs/canvas');
  const c = createCanvas(400, 600), ctx = c.getContext('2d');
  ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 400, 600);
  ctx.fillStyle = '#a95228'; ctx.fillRect(0, 0, 80, 600);
  ctx.fillStyle = '#333'; ctx.fillRect(200, 260, 6, 50);
  let s = scanRegion(ctx.getImageData(0, 0, 400, 600).data, 400, 600);
  assert.equal(scanNeedsReview('OCR', s.ink, s.boxArea, true), true);
  ctx.fillRect(100, 80, 200, 180);
  s = scanRegion(ctx.getImageData(0, 0, 400, 600).data, 400, 600);
  assert.equal(scanNeedsReview('OCR', s.ink, s.boxArea, true), false);
});

test('partial binding and paired right punch holes do not obscure a sparse verso', async () => {
  const { createCanvas } = await import('@napi-rs/canvas');
  const c = createCanvas(700, 940), ctx = c.getContext('2d');
  ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 700, 940);
  ctx.fillStyle = '#a95228'; ctx.fillRect(0, 200, 125, 440);
  ctx.fillStyle = '#444'; ctx.fillRect(350, 440, 7, 65);
  for (const y of [300, 570]) { ctx.beginPath(); ctx.arc(635, y, 8, 0, Math.PI * 2); ctx.fill(); }
  const metrics = () => scanRegion(ctx.getImageData(0, 0, 700, 940).data, 700, 940);
  let s = metrics();
  assert.equal(scanNeedsReview('OCR', s.ink, s.boxArea, true), true);
  ctx.fillRect(230, 160, 300, 35);
  ctx.fillRect(230, 780, 300, 35);
  s = metrics();
  assert.equal(scanNeedsReview('OCR', s.ink, s.boxArea, true), false);
});
