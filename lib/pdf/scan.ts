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
  const cell = Math.max(8, Math.round(width / 40));
  const cols = Math.ceil(width / cell),
    rows = Math.ceil(height / cell);
  const tiles = new Uint32Array(cols * rows);
  const minX = new Float64Array(tiles.length).fill(right),
    minY = new Float64Array(tiles.length).fill(bottom),
    maxX = new Float64Array(tiles.length).fill(left),
    maxY = new Float64Array(tiles.length).fill(top);
  const sumX = new Float64Array(tiles.length),
    sumY = new Float64Array(tiles.length),
    sumXX = new Float64Array(tiles.length),
    sumYY = new Float64Array(tiles.length),
    sumXY = new Float64Array(tiles.length);
  let count = 0;
  let paleCount = 0;
  for (let y = top; y < bottom; y++)
    for (let x = left; x < right; x++) {
      const i = (y * width + x) * 4,
        alpha = data[i + 3] / 255;
      const gray =
        (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) * alpha +
        255 * (1 - alpha);
      if (gray < 175) {
        const tile = Math.floor(y / cell) * cols + Math.floor(x / cell);
        tiles[tile]++;
        count++;
        minX[tile] = Math.min(minX[tile], x);
        minY[tile] = Math.min(minY[tile], y);
        maxX[tile] = Math.max(maxX[tile], x);
        maxY[tile] = Math.max(maxY[tile], y);
        sumX[tile] += x;
        sumY[tile] += y;
        sumXX[tile] += x * x;
        sumYY[tile] += y * y;
        sumXY[tile] += x * y;
      } else if (gray < 247) paleCount++;
    }
  const area = (right - left) * (bottom - top),
    ink = count / area;
  // Group nearby strokes; small, distant specks must not enlarge the stamp crop.
  const visited = new Uint8Array(tiles.length),
    groups: { tiles: Set<number>; count: number }[] = [];
  for (let start = 0; start < tiles.length; start++) {
    if (!tiles[start] || visited[start]) continue;
    const group = { tiles: new Set<number>(), count: 0 },
      queue = [start];
    visited[start] = 1;
    for (let q = 0; q < queue.length; q++) {
      const index = queue[q],
        cx = index % cols,
        cy = Math.floor(index / cols);
      group.tiles.add(index);
      group.count += tiles[index];
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const x = cx + dx,
            y = cy + dy;
          if (x < 0 || x >= cols || y < 0 || y >= rows) continue;
          const next = y * cols + x;
          if (tiles[next] && !visited[next]) {
            visited[next] = 1;
            queue.push(next);
          }
        }
    }
    groups.push(group);
  }
  groups.sort((a, b) => b.count - a.count);
  const dominant = groups[0],
    outsideInk = dominant ? (count - dominant.count) / area : 0;
  // Only isolated specks may be discarded. Additional dark writing blocks this shortcut.
  const useDominant =
    dominant &&
    dominant.count / Math.max(1, count) >= 0.9 &&
    outsideInk < 0.00025;
  let x0 = right,
    y0 = bottom,
    x1 = left,
    y1 = top;
  for (let tile = 0; tile < tiles.length; tile++) {
    if (!tiles[tile] || (useDominant && !dominant.tiles.has(tile))) continue;
    x0 = Math.min(x0, minX[tile]);
    x1 = Math.max(x1, maxX[tile]);
    y0 = Math.min(y0, minY[tile]);
    y1 = Math.max(y1, maxY[tile]);
  }
  const box = count
    ? { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 }
    : null;
  const boxArea = box ? (box.width * box.height) / area : 0;
  let sx = 0,
    sy = 0,
    sxx = 0,
    syy = 0,
    sxy = 0,
    n = 0;
  for (let tile = 0; tile < tiles.length; tile++) {
    if (!tiles[tile] || (useDominant && !dominant.tiles.has(tile))) continue;
    n += tiles[tile];
    sx += sumX[tile];
    sy += sumY[tile];
    sxx += sumXX[tile];
    syy += sumYY[tile];
    sxy += sumXY[tile];
  }
  const axis = n
    ? (0.5 *
        Math.atan2(
          2 * (sxy - (sx * sy) / n),
          sxx - (sx * sx) / n - (syy - (sy * sy) / n),
        ) *
        180) /
      Math.PI
    : 0;
  return { ink, box, boxArea, paleInk: paleCount / area, outsideInk, axis };
}
export function scanNeedsReview(
  nativeText: string,
  ink: number,
  boxArea: number,
) {
  return !nativeText.trim() && ink < 0.012 && boxArea < 0.2;
}

export function hasBlankStamp(text: string) {
  return /\bE\s*M\s*B\s*R\s*A\s*N\s*C\s*[O0]\b/i.test(text);
}
export function looksLikeBleedThrough(
  review: boolean,
  ink: number,
  paleInk: number,
) {
  return review && paleInk > Math.max(0.004, ink * 2.5);
}

export async function recognizeScanStamp(
  worker: {
    setParameters?: (parameters: {
      tessedit_pageseg_mode: import('tesseract.js').PSM;
    }) => Promise<unknown>;
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
      const gray =
        pixels.data[k] * 0.299 +
        pixels.data[k + 1] * 0.587 +
        pixels.data[k + 2] * 0.114;
      const v = gray < 220 ? gray : 255;
      pixels.data[k] = pixels.data[k + 1] = pixels.data[k + 2] = v;
    }
    out.putImageData(pixels, 0, 0);
  }
  try {
    if (review && target !== canvas)
      await worker.setParameters?.({
        tessedit_pageseg_mode: '7' as import('tesseract.js').PSM,
      });
    let { data } = await worker.recognize(target);
    if (review && !hasBlankStamp(data.text))
      for (const angle of [
        -scan.axis,
        180 - scan.axis,
        -60,
        60,
        -90,
        90,
        180,
      ]) {
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
        if (
          attempt.data.confidence > data.confidence &&
          attempt.data.text.trim()
        )
          data = attempt.data;
        if (hasBlankStamp(attempt.data.text)) {
          data = attempt.data;
          break;
        }
      }
    return { data, review, scan };
  } finally {
    if (target !== canvas) {
      target.width = 0;
      await worker.setParameters?.({
        tessedit_pageseg_mode: '11' as import('tesseract.js').PSM,
      });
    }
  }
}
