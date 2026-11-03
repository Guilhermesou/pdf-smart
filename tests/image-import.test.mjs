import './register-types.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { isImageFile, convertImageToPdf } from '../lib/pdf/image-import.ts';
import { PDFDocument } from 'pdf-lib';

test('isImageFile recognizes supported image extensions and MIME types', () => {
  const dummyFile = (name, type = '') => ({ name, type });
  assert.equal(isImageFile(dummyFile('scan.png')), true);
  assert.equal(isImageFile(dummyFile('photo.JPG')), true);
  assert.equal(isImageFile(dummyFile('document.jpeg')), true);
  assert.equal(isImageFile(dummyFile('capture.webp')), true);
  assert.equal(isImageFile(dummyFile('receipt.bmp')), true);
  assert.equal(isImageFile(dummyFile('unnamed', 'image/png')), true);

  assert.equal(isImageFile(dummyFile('doc.pdf')), false);
  assert.equal(isImageFile(dummyFile('notes.txt')), false);
  assert.equal(isImageFile(dummyFile('contract.docx')), false);
});

test('convertImageToPdf converts a valid PNG into a 1-page A4 PDF document', async () => {
  // 1x1 transparent PNG in base64
  const pngB64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const pngBytes = Buffer.from(pngB64, 'base64');
  const file = new File([pngBytes], 'documento.png', { type: 'image/png' });

  const pdfFile = await convertImageToPdf(file);
  assert.equal(pdfFile.name, 'documento.pdf');
  assert.equal(pdfFile.type, 'application/pdf');
  assert.ok(pdfFile.size > 0);

  const arrayBuffer = await pdfFile.arrayBuffer();
  const loadedPdf = await PDFDocument.load(arrayBuffer);
  assert.equal(loadedPdf.getPageCount(), 1);
  const page = loadedPdf.getPage(0);
  const { width, height } = page.getSize();
  assert.equal(Math.round(width), 595);
  assert.equal(Math.round(height), 842);
});
