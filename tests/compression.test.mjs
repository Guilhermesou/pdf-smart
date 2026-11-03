import './register-types.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
const jpeg = Uint8Array.from(
  Buffer.from(
    '/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKpgA//Z',
    'base64',
  ),
);

test('compression worker preserves page sizes, resets after invalid input and finishes a reusable session', async () => {
  let result;
  globalThis.self = {
    postMessage: (value) => {
      result = value;
    },
  };
  await import('../lib/pdf/compress.worker.ts');
  const send = async (data) => {
    await self.onmessage({ data });
    return result;
  };
  assert.ok((await send({ type: 'save' })).error);
  assert.ok((await send({ type: 'start' })).ready);
  assert.ok((await send({ type: 'page', jpeg, width: -1, height: 300 })).error);
  assert.ok(
    (await send({ type: 'page', jpeg, width: 200, height: 300 })).error,
  );
  await send({ type: 'start' });
  for (const [width, height] of [
    [200, 300],
    [600, 400],
  ])
    assert.ok(
      (await send({ type: 'page', jpeg: jpeg.buffer.slice(0), width, height }))
        .ready,
    );
  const { bytes, error } = await send({ type: 'save' });
  assert.ok(bytes, error);
  const doc = await PDFDocument.load(bytes);
  assert.deepEqual(
    doc.getPages().map((p) => [p.getWidth(), p.getHeight()]),
    [
      [200, 300],
      [600, 400],
    ],
  );
  assert.ok(
    (await send({ type: 'save' })).error,
    'completed output is released',
  );
});
