export type Verdict = {
  kind: 'blank' | 'stamp' | 'sparse' | 'content';
  reason: string;
  ink: number;
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
export function classify(
  text: string,
  ink: number,
  tolerance: number,
  ocrConfidence = 100,
): Verdict {
  const t = normalize(text),
    residual = t.replace(/\bEM\s+BRANCO\b/g, '').trim();
  if (t.includes('EM BRANCO') && !residual && ink < 0.05 && ocrConfidence >= 65)
    return {
      kind: 'stamp',
      reason: 'Somente “EM BRANCO” reconhecido. Confira a imagem.',
      ink,
    };
  if (t)
    return { kind: 'content', reason: 'Texto ou conteúdo reconhecido.', ink };
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
export function measureInk(data: Uint8ClampedArray) {
  const histogram = new Uint32Array(256);
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
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
