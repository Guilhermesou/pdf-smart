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
