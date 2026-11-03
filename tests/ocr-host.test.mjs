import './register-types.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { createWorker } from 'tesseract.js';
const { createOcrWorkerHost } = await import('../lib/pdf/ocr-worker-host.ts');

test(
  'OCR host recognizes a stamp with the bundled model and releases its Tesseract worker',
  { timeout: 30000 },
  async () => {
    const messages = [],
      host = createOcrWorkerHost(
        (message) => messages.push(message),
        (languages, oem, options) =>
          createWorker(languages, oem, { ...options, cacheMethod: 'none' }),
      );
    try {
      await host.handle({
        type: 'ocr-start',
        assets: {
          workerPath: path.resolve(
            'node_modules/tesseract.js/src/worker-script/node/index.js',
          ),
          corePath: path.resolve('public/ocr/core'),
          langPath: path.resolve('public/ocr/lang'),
        },
      });
      assert.equal(messages.at(-1).type, 'ready', messages.at(-1).error);
      const canvas = createCanvas(900, 500),
        context = canvas.getContext('2d');
      context.fillStyle = 'white';
      context.fillRect(0, 0, 900, 500);
      context.fillStyle = 'black';
      context.font = '60px Arial';
      context.fillText('EM BRANCO', 200, 260);
      await host.handle({
        type: 'ocr-recognize',
        image: canvas.toDataURL('image/png'),
      });
      assert.equal(messages.at(-1).type, 'ocr-result', messages.at(-1).error);
      assert.match(messages.at(-1).data.text, /EM BRANCO/i);
      assert.ok(messages.at(-1).data.confidence >= 65);
      await host.dispose();
      await host.handle({
        type: 'ocr-recognize',
        image: canvas.toDataURL('image/png'),
      });
      assert.equal(messages.at(-1).type, 'error');
    } finally {
      await host.dispose();
    }
  },
);

test('OCR host clears a failed engine and can start again', async () => {
  const messages = [];
  let started = 0,
    terminated = 0;
  const host = createOcrWorkerHost(
    (message) => messages.push(message),
    async () => {
      started++;
      return {
        setParameters: async () => {},
        recognize: async () => {
          if (started === 1) throw Error('bad image');
          return { data: { text: 'EM BRANCO', confidence: 90 } };
        },
        terminate: async () => {
          terminated++;
        },
      };
    },
  );
  const start = {
    type: 'ocr-start',
    assets: { workerPath: '/worker', corePath: '/core', langPath: '/lang' },
  };
  await host.handle(start);
  await host.handle({
    type: 'ocr-recognize',
    image: 'data:image/png;base64,eA==',
  });
  assert.equal(messages.at(-1).type, 'error');
  assert.equal(terminated, 1);
  await host.handle(start);
  await host.handle({
    type: 'ocr-recognize',
    image: 'data:image/png;base64,eA==',
  });
  assert.equal(messages.at(-1).data.text, 'EM BRANCO');
  await host.dispose();
  assert.equal(terminated, 2);
});
