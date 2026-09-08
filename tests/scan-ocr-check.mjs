import { createCanvas } from '@napi-rs/canvas';
import { createWorker, PSM } from 'tesseract.js';
import assert from 'node:assert/strict';
import { recognizeScanStamp } from '../lib/pdf/scan.ts';
const c = createCanvas(1200, 1600),
  ctx = c.getContext('2d');
ctx.fillStyle = 'white';
ctx.fillRect(0, 0, 1200, 1600);
ctx.fillStyle = '#925027';
ctx.fillRect(0, 0, 110, 1600);
ctx.fillStyle = '#454545';
for (const y of [400, 1000]) {
  ctx.beginPath();
  ctx.arc(85, y, 20, 0, Math.PI * 2);
  ctx.fill();
}
ctx.fillStyle = '#ededed';
ctx.font = '20px Arial';
for (let y = 200; y < 1500; y += 100)
  ctx.fillText('Texto do verso visível pela folha', 250, y);
ctx.save();
ctx.translate(650, 800);
ctx.rotate(-Math.PI / 3);
ctx.fillStyle = '#424952';
ctx.font = 'bold 44px Arial';
ctx.fillText('EM BRANCO', -130, 0);
ctx.restore();
const worker = await createWorker('eng', 1, {
  cachePath: '/private/tmp',
  langPath: 'https://tessdata.projectnaptha.com/4.0.0',
});
try {
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
  const r = await recognizeScanStamp(
    { recognize: (canvas) => worker.recognize(canvas.toBuffer('image/png')) },
    c,
    createCanvas,
    '',
    () => false,
  );
  assert.equal(r.review, true);
  assert.match(r.data.text, /EM\s+BRANCO/);
  console.log({
    text: r.data.text.trim(),
    confidence: r.data.confidence,
    result: 'passed',
  });
} finally {
  await worker.terminate();
}
