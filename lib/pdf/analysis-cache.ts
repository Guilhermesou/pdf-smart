import type { scanRegion } from './scan';
type ScanMetrics = ReturnType<typeof scanRegion>;
type Recognition = {
  data: { text: string; confidence: number };
  review: boolean;
  scan?: ScanMetrics;
};
export type AnalysisEvidence = {
  visual?: ScanMetrics;
  scanOcr?: Recognition;
  plainOcr?: Recognition;
};
/** Bounded evidence cache. Verdicts are always recalculated with current settings. */
export class AnalysisCache {
  private entries = new Map<string, AnalysisEvidence>();
  private readonly capacity: number;
  constructor(capacity = 1024) {
    this.capacity = Math.max(1, capacity);
  }
  get(key: string) {
    return this.entries.get(key);
  }
  set(key: string, value: AnalysisEvidence) {
    // Long OCR results remain usable for this run but do not grow the retained cache.
    const bounded = { ...value };
    for (const field of ['scanOcr', 'plainOcr'] as const) {
      const reading = bounded[field];
      if (!reading) continue;
      if (reading.data.text.length > 4000) delete bounded[field];
      else
        bounded[field] = {
          data: {
            text: reading.data.text,
            confidence: reading.data.confidence,
          },
          review: reading.review,
          scan: reading.scan,
        };
    }
    this.entries.delete(key);
    this.entries.set(key, bounded);
    if (this.entries.size > this.capacity)
      this.entries.delete(this.entries.keys().next().value!);
  }
  retainSources(ids: Set<string>) {
    for (const key of this.entries.keys())
      if (!ids.has(key.slice(0, key.indexOf(':')))) this.entries.delete(key);
  }
}
export const analysisCache = new AnalysisCache();
