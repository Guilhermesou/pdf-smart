import { PDFDocument } from 'pdf-lib';

const IMAGE_EXTENSIONS = /\.(png|jpe?g|webp|bmp|gif)$/i;
const IMAGE_MIMES = /^image\/(png|jpeg|webp|bmp|gif)$/i;

export function isImageFile(file: File): boolean {
  return IMAGE_EXTENSIONS.test(file.name) || IMAGE_MIMES.test(file.type);
}

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

/**
 * Encapsulates an image into a single-page standard PDF document preserving original quality.
 */
export async function convertImageToPdf(file: File): Promise<File> {
  const pdfDoc = await PDFDocument.create();
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  let embeddedImage;
  const isPng = file.type === 'image/png' || /\.png$/i.test(file.name);
  const isJpg = file.type === 'image/jpeg' || /\.(jpe?g)$/i.test(file.name);

  if (isPng) {
    try {
      embeddedImage = await pdfDoc.embedPng(bytes);
    } catch {
      // Fallback via canvas if PNG has non-standard chunks
    }
  } else if (isJpg) {
    try {
      embeddedImage = await pdfDoc.embedJpg(bytes);
    } catch {
      // Fallback via canvas if JPEG lacks standard SOI
    }
  }

  // If not yet embedded (e.g. webp, bmp, gif, or non-standard format), use Canvas to normalize to PNG
  if (!embeddedImage) {
    const pngBytes = await rasterizeToPngBytes(file);
    embeddedImage = await pdfDoc.embedPng(pngBytes);
  }

  const { width: imgWidth, height: imgHeight } = embeddedImage;
  const isLandscape = imgWidth > imgHeight;

  // Use A4 dimensions oriented appropriately
  const pageWidth = isLandscape ? A4_HEIGHT : A4_WIDTH;
  const pageHeight = isLandscape ? A4_WIDTH : A4_HEIGHT;

  // Fit image within page preserving aspect ratio
  const margin = 20;
  const maxWidth = pageWidth - margin * 2;
  const maxHeight = pageHeight - margin * 2;
  const scale = Math.min(maxWidth / imgWidth, maxHeight / imgHeight, 1);

  const drawWidth = imgWidth * scale;
  const drawHeight = imgHeight * scale;
  const x = (pageWidth - drawWidth) / 2;
  const y = (pageHeight - drawHeight) / 2;

  const page = pdfDoc.addPage([pageWidth, pageHeight]);
  page.drawImage(embeddedImage, {
    x,
    y,
    width: drawWidth,
    height: drawHeight,
  });

  const pdfBytes = await pdfDoc.save();
  const pdfName = file.name.replace(/\.[^.]+$/i, '') + '.pdf';
  return new File([pdfBytes.buffer as ArrayBuffer], pdfName, {
    type: 'application/pdf',
  });
}

async function rasterizeToPngBytes(file: File): Promise<Uint8Array> {
  if (typeof window === 'undefined') {
    throw new Error('Conversão de imagem requer ambiente com suporte a Canvas.');
  }

  let imgWidth = 0;
  let imgHeight = 0;
  let drawSource: CanvasImageSource;

  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    imgWidth = bitmap.width;
    imgHeight = bitmap.height;
    drawSource = bitmap;
  } else {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () =>
          reject(new Error(`Não foi possível carregar imagem ${file.name}.`));
        img.src = url;
      });
      imgWidth = img.naturalWidth || img.width;
      imgHeight = img.naturalHeight || img.height;
      drawSource = img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, imgWidth);
  canvas.height = Math.max(1, imgHeight);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(drawSource, 0, 0);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Falha ao exportar imagem.'))),
      'image/png',
    );
  });
  canvas.width = 0;
  return new Uint8Array(await blob.arrayBuffer());
}
