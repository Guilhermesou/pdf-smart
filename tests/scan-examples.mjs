// Accepts a local manifest. No user document is stored in source control.
import { readFile } from 'node:fs/promises';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { createWorker, PSM } from 'tesseract.js';
import {
  scanRegion,
  recognizeScanStamp,
  hasBlankStamp,
  looksLikeBleedThrough,
} from '../lib/pdf/scan.ts';
import { classify, measureInteriorInk } from '../lib/pdf/detection.ts';
const examples = JSON.parse(await readFile(process.argv[2], 'utf8'));
const worker = await createWorker('eng', 1, {
  cachePath: '/private/tmp',
  langPath: 'https://tessdata.projectnaptha.com/4.0.0',
});
try {
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
  for (const [i, e] of examples.entries()) {
    const img = await loadImage(await readFile(e.path));
    const [x, y, w, h] = e.crop;
    const c = createCanvas(1500, Math.round((h / w) * 1500));
    c.getContext('2d').drawImage(img, x, y, w, h, 0, 0, c.width, c.height);
    const pixels = c
      .getContext('2d')
      .getImageData(0, 0, c.width, c.height).data;
    const stats = scanRegion(pixels, c.width, c.height);
    const result = await recognizeScanStamp(
      {
        setParameters: (parameters) => worker.setParameters(parameters),
        recognize: (canvas) => worker.recognize(canvas.toBuffer('image/png')),
      },
      c,
      createCanvas,
      '',
      () => false,
    );
    const verdict = classify(
      result.data.text,
      measureInteriorInk(pixels, c.width, c.height),
      0.003,
      result.data.confidence,
    );
    const candidate = verdict.kind !== 'content' || result.review;
    console.log(
      JSON.stringify({
        example: i + 1,
        ink: stats.ink,
        boxArea: stats.boxArea,
        paleInk: stats.paleInk,
        possibleBleed: looksLikeBleedThrough(
          result.review,
          stats.ink,
          stats.paleInk,
        ),
        review: result.review,
        stamp: hasBlankStamp(result.data.text),
        confidence: result.data.confidence,
        candidate,
      }),
    );
    if (process.argv.includes('--assert') && !candidate) process.exitCode = 1;
  }
} finally {
  await worker.terminate();
}
