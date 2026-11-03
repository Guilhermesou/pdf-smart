'use client';
import { useState } from 'react';
import { paintBeforeWork } from '@/lib/pdf/runtime';
import type { PageItem, AnalysisProgress } from '@/lib/pdf/types';
import type { EditorServices } from '../model/editor-services';

export type DocumentAnalysisProps = {
  pages: PageItem[];
  setPages: React.Dispatch<React.SetStateAction<PageItem[]>>;
  analyze: EditorServices['analyze'];
  locked: React.RefObject<boolean>;
  cancel: React.RefObject<boolean>;
  beginOperation: (kind: 'analysis', message: string) => boolean;
  finishOperation: () => void;
  setBusy: (msg: string) => void;
  setMessage: (msg: string) => void;
};

export function useDocumentAnalysis({
  pages,
  setPages,
  analyze,
  locked,
  cancel,
  beginOperation,
  finishOperation,
  setBusy,
  setMessage,
}: DocumentAnalysisProps) {
  const [analysisProgress, setAnalysisProgress] =
    useState<AnalysisProgress | null>(null);
  const [ocr, setOcr] = useState(true);
  const [sensitive, setSensitive] = useState(false);
  const [ignoreBorders, setIgnoreBorders] = useState(true);
  const [scanMode, setScanMode] = useState(true);
  const [ocrEngine, setOcrEngine] = useState<'auto' | 'tesseract'>('auto');
  const [bypassCache, setBypassCache] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  async function runAnalysis() {
    if (locked.current || !pages.length) return;
    if (!beginOperation('analysis', 'Preparando análise…')) return;
    const inputPages = pages.map((p) => ({ ...p, verdict: undefined }));
    setPages(inputPages);
    setAnalysisProgress({
      current: 1,
      completed: 0,
      total: pages.length,
      page: inputPages[0],
      stage: 'Preparando análise',
    });
    setMessage('');
    try {
      await paintBeforeWork();
      const result = await analyze(
        inputPages,
        {
          ocr,
          tolerance: sensitive ? 0.012 : 0.003,
          ignoreBorders,
          scanMode,
          ocrEngine,
          bypassCache,
        },
        setBusy,
        cancel,
        (page, index) =>
          setPages((current) => {
            const next = [...current];
            next[index] = page;
            return next;
          }),
        setAnalysisProgress,
      );
      const indexed = new Map(result.pages.map((p) => [p.id, p]));
      setPages(inputPages.map((p) => indexed.get(p.id) || p));
      setMessage(
        cancel.current
          ? 'Análise interrompida. Os resultados já obtidos foram mantidos.'
          : result.failed
            ? `Análise visual concluída. O OCR falhou em ${result.failed} páginas; revise-as manualmente.`
            : `Análise concluída: ${result.pages.filter((p) => p.verdict?.kind !== 'content').length} sugestões em ${result.pages.length} páginas.`,
      );
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : 'Não foi possível concluir a análise.',
      );
    } finally {
      finishOperation();
    }
  }

  return {
    analysisProgress,
    setAnalysisProgress,
    ocr,
    setOcr,
    sensitive,
    setSensitive,
    ignoreBorders,
    setIgnoreBorders,
    scanMode,
    setScanMode,
    ocrEngine,
    setOcrEngine,
    bypassCache,
    setBypassCache,
    settingsOpen,
    setSettingsOpen,
    runAnalysis,
  };
}
