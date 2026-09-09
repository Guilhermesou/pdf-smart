export type Verdict = {
  kind: 'blank' | 'stamp' | 'sparse' | 'bleed' | 'content';
  reason: string;
  ink: number;
  ocrStatus?: 'not-needed' | 'done' | 'failed' | 'disabled';
  recognizedText?: string;
  darkInk?: number;
  paleInk?: number;
};
export function normalize(text: string) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
// Remove only isolated page-number lines, not numbers embedded in real content.
export function withoutPageNumbers(text: string) {
  return text
    .split(/\r?\n/)
    .filter(
      (line) =>
        !/^\s*(?:(?:P[ÁA]G(?:INA)?|FL(?:S)?|FOLHA)[.\s:]*)?\d{1,5}(?:\s*(?:DE|\/)\s*\d{1,5})?\s*$/i.test(
          line,
        ),
    )
    .join(' ')
    .trim();
}
export function shouldRunOcr(text: string, ink: number) {
  return (
    normalize(withoutPageNumbers(text)).length < 180 &&
    ink >= 0.00005 &&
    ink < 0.18
  );
}
export function classify(
  text: string,
  ink: number,
  tolerance: number,
  ocrConfidence = 100,
): Verdict {
  const t = normalize(withoutPageNumbers(text)).replace(
      /\bE\s*M\s*B\s*R\s*A\s*N\s*C\s*[O0]\b/g,
      'EM BRANCO',
    ),
    residual = t.replace(/\bEM\s+BRANCO\b/g, '').trim();
  if (t.includes('EM BRANCO') && !residual && ink < 0.05 && ocrConfidence >= 65)
    return {
      kind: 'stamp',
      reason: 'Somente “EM BRANCO” reconhecido. Confira a imagem.',
      ink,
    };
  if (
    t.includes('EM BRANCO') &&
    residual.length <= 12 &&
    ink < 0.025 &&
    ocrConfidence >= 65
  )
    return {
      kind: 'sparse',
      reason:
        'Carimbo EM BRANCO com outros detalhes. Revise o texto e a imagem.',
      ink,
    };
  if (t)
    return {
      kind: 'content',
      reason: 'Texto reconhecido além de uma numeração isolada.',
      ink,
    };
  if (text.trim() && ink < tolerance)
    return {
      kind: 'sparse',
      reason:
        'Somente numeração isolada reconhecida. Confira se a página pode ser removida.',
      ink,
    };
  if (ink < 0.00005)
    return {
      kind: 'blank',
      reason: 'Nenhum conteúdo visual significativo detectado.',
      ink,
    };
  if (ink < tolerance)
    return {
      kind: 'sparse',
      reason: 'Poucas marcas visuais. Pode conter detalhes importantes.',
      ink,
    };
  return { kind: 'content', reason: 'Conteúdo visual presente.', ink };
}
export function measureInk(
  data: Uint8ClampedArray,
  width = data.length / 4,
  height = 1,
  border = 0,
) {
  const histogram = new Uint32Array(256);
  let count = 0;
  const bx = Math.floor(width * border),
    by = Math.floor(height * border);
  for (let y = by; y < height - by; y++)
    for (let x = bx; x < width - bx; x++) {
      const i = (y * width + x) * 4;
      const a = data[i + 3] / 255;
      const gray = Math.round(
        (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) * a +
          255 * (1 - a),
      );
      histogram[gray]++;
      count++;
    }
  let sum = 0,
    bg = 255;
  for (let i = 255; i >= 0; i--) {
    sum += histogram[i];
    if (sum >= count * 0.5) {
      bg = i;
      break;
    }
  }
  if (bg < 180) return 1; // Dark scans must never be treated as an empty sheet.
  const threshold = Math.min(235, bg - 22);
  let ink = 0;
  for (let i = 0; i < threshold; i++) ink += histogram[i];
  return ink / Math.max(1, count);
}

/** Ignore only the outer 3% scan border; interior content remains included. */
export function measureInteriorInk(
  data: Uint8ClampedArray,
  width: number,
  height: number,
) {
  return measureInk(data, width, height, 0.03);
}
