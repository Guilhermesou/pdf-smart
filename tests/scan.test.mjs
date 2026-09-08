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
