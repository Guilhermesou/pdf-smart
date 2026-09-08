/** Scan review excludes binding edges and pale bleed-through, never alters the exported page. */
export function scanRegion(
  data: Uint8ClampedArray,
  width: number,
  height: number,
) {
  const left = Math.floor(width * 0.12),
    right = Math.ceil(width * 0.94),
    top = Math.floor(height * 0.04),
    bottom = Math.ceil(height * 0.96);
  let x0 = right,
    y0 = bottom,
    x1 = left,
    y1 = top,
    count = 0;
  for (let y = top; y < bottom; y++)
    for (let x = left; x < right; x++) {
      const i = (y * width + x) * 4,
        gray =
          (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) *
            (data[i + 3] / 255) +
          255 * (1 - data[i + 3] / 255);
      if (gray < 175) {
        count++;
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
    }
  const area = (right - left) * (bottom - top),
    ink = count / area;
  return {
    ink,
    box: count
      ? { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 }
      : null,
    boxArea: count ? ((x1 - x0 + 1) * (y1 - y0 + 1)) / area : 0,
  };
}
export function scanNeedsReview(
  nativeText: string,
  ink: number,
  boxArea: number,
) {
  return !nativeText.trim() && ink < 0.012 && boxArea < 0.2;
}

export async function recognizeScanStamp(
  worker: {
    recognize: (
      canvas: HTMLCanvasElement,
    ) => Promise<{ data: { text: string; confidence: number } }>;
  },
  canvas: HTMLCanvasElement,
  create: (width: number, height: number) => HTMLCanvasElement,
  nativeText: string,
  cancelled: () => boolean,
) {
  const ctx = canvas.getContext('2d')!;
  const scan = scanRegion(
    ctx.getImageData(0, 0, canvas.width, canvas.height).data,
    canvas.width,
    canvas.height,
  );
  const review = scanNeedsReview(nativeText, scan.ink, scan.boxArea);
  let target = canvas;
  if (review && scan.box) {
    const b = scan.box;
    target = create(b.width + 60, b.height + 60);
    const out = target.getContext('2d')!;
    out.fillStyle = 'white';
    out.fillRect(0, 0, target.width, target.height);
    out.drawImage(
      canvas,
      b.x,
      b.y,
      b.width,
      b.height,
      30,
      30,
      b.width,
      b.height,
    );
    const pixels = out.getImageData(0, 0, target.width, target.height);
    for (let k = 0; k < pixels.data.length; k += 4) {
      const v =
        pixels.data[k] * 0.299 +
          pixels.data[k + 1] * 0.587 +
          pixels.data[k + 2] * 0.114 <
        175
          ? 0
          : 255;
      pixels.data[k] = pixels.data[k + 1] = pixels.data[k + 2] = v;
    }
    out.putImageData(pixels, 0, 0);
  }
  try {
    let { data } = await worker.recognize(target);
    if (review && !/EM\s+BRANC[O0]/i.test(data.text))
      for (const angle of [-60, 60, -90, 90, -120, 120, 180]) {
        if (cancelled()) break;
        const r = (angle * Math.PI) / 180,
          rotated = create(
            Math.ceil(
              Math.abs(target.width * Math.cos(r)) +
                Math.abs(target.height * Math.sin(r)),
            ) + 40,
            Math.ceil(
              Math.abs(target.width * Math.sin(r)) +
                Math.abs(target.height * Math.cos(r)),
            ) + 40,
          );
        const out = rotated.getContext('2d')!;
        out.fillStyle = 'white';
        out.fillRect(0, 0, rotated.width, rotated.height);
        out.translate(rotated.width / 2, rotated.height / 2);
        out.rotate(r);
        out.drawImage(target, -target.width / 2, -target.height / 2);
        let attempt;
        try {
          attempt = await worker.recognize(rotated);
        } finally {
          rotated.width = 0;
        }
        if (/EM\s+BRANC[O0]/i.test(attempt.data.text)) {
          data = attempt.data;
          break;
        }
      }
    return { data, review };
  } finally {
    if (target !== canvas) target.width = 0;
  }
}
