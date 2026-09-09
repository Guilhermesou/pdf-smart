import { classify, withoutPageNumbers, type Verdict } from './detection';
import { looksLikeBleedThrough } from './scan';
import type { PageItem } from './types';
export function evaluatePage(
  page: PageItem,
  evidence: {
    text: string;
    ink: number;
    tolerance: number;
    confidence: number;
    ocrStatus: Verdict['ocrStatus'];
    scanReview: boolean;
    scanMetrics?: { ink: number; paleInk: number };
  },
): Verdict {
  const {
    text,
    ink,
    tolerance,
    confidence,
    ocrStatus,
    scanReview,
    scanMetrics,
  } = evidence;
  const verdict: Verdict = {
    ...classify(text, ink, tolerance, confidence),
    ocrStatus,
    recognizedText: text.slice(0, 500),
    darkInk: scanMetrics?.ink,
    paleInk: scanMetrics?.paleInk,
  };
  if (scanReview && verdict?.kind === 'content') {
    verdict.kind = 'sparse';
    verdict.reason =
      'Poucas marcas escuras concentradas, compatíveis com carimbo ou assinatura. OCR inconclusivo; revise a página inteira.';
  }
  if (
    verdict &&
    verdict.kind !== 'stamp' &&
    scanMetrics &&
    looksLikeBleedThrough(scanReview, scanMetrics.ink, scanMetrics.paleInk)
  ) {
    verdict.kind = 'bleed';
    verdict.reason =
      'Predominam marcas claras com poucos traços escuros concentrados. Pode ser transparência da frente, mas também conteúdo desbotado: confira a página inteira antes de excluir.';
  }
  if (
    scanReview &&
    withoutPageNumbers(page.text).trim() &&
    verdict &&
    verdict.kind !== 'content'
  ) {
    verdict.kind = 'bleed';
    verdict.reason =
      'Imagem com poucas marcas escuras, mas o PDF contém texto extraído. Pode ser OCR da transparência da frente ou conteúdo claro: revise a página inteira.';
  }
  if (verdict?.kind === 'blank' && page.ink - ink > 0.001) {
    verdict.kind = 'sparse';
    verdict.reason =
      'Interior vazio; marcas nas bordas foram desconsideradas. Revise a página inteira.';
  }
  return verdict;
}
