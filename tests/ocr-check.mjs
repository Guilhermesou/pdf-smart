import { createCanvas } from '@napi-rs/canvas';
import { createWorker, PSM } from 'tesseract.js';
import assert from 'node:assert/strict';
import { classify, measureInk } from '../lib/pdf/detection.ts';
const canvas = createCanvas(1200, 1600),
  ctx = canvas.getContext('2d');
ctx.fillStyle = 'white';
ctx.fillRect(0, 0, 1200, 1600);
ctx.fillStyle = '#424b98';
ctx.font = 'bold 46px Arial';
ctx.fillText('EM BRANCO', 410, 790);
ctx.font = '28px Arial';
ctx.fillText('42', 590, 1540);
ctx.fillStyle = 'black';
ctx.fillRect(0, 0, 12, 1600);
const worker = await createWorker('eng', 1, {
  cachePath: '/private/tmp',
  langPath: 'https://tessdata.projectnaptha.com/4.0.0',
});
try {
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
  const { data } = await worker.recognize(canvas.toBuffer('image/png'));
  const ink = measureInk(ctx.getImageData(0, 0, 1200, 1600).data);
  assert.equal(classify(data.text, ink, 0.0015, data.confidence).kind, 'stamp');
  console.log(
    JSON.stringify({
      recognized: data.text.trim(),
      confidence: data.confidence,
      ink,
      result: 'passed',
    }),
  );
} finally {
  await worker.terminate();
}
