'use client';
import { useState } from 'react';
import { paintBeforeWork, exportMessage } from '@/lib/pdf/runtime';
import type { PageItem } from '@/lib/pdf/types';
import type { EditorServices } from '../model/editor-services';

export type DocumentExportProps = {
  pages: PageItem[];
  selected: Set<string>;
  name: string;
  exportPdf: EditorServices['exportPdf'];
  exportPdfParts: EditorServices['exportPdfParts'];
  compressPages: EditorServices['compressPages'];
  saveBytes: EditorServices['saveBytes'];
  locked: React.RefObject<boolean>;
  cancel: React.RefObject<boolean>;
  beginOperation: (kind: 'export' | 'compress', message: string) => boolean;
  finishOperation: () => void;
  setBusy: (msg: string) => void;
  setMessage: (msg: string) => void;
  setAnalysisProgress: (val: null) => void;
};

export function useDocumentExport({
  pages,
  selected,
  name,
  exportPdf,
  exportPdfParts,
  compressPages,
  saveBytes,
  locked,
  cancel,
  beginOperation,
  finishOperation,
  setBusy,
  setMessage,
  setAnalysisProgress,
}: DocumentExportProps) {
  const [toolDialog, setToolDialog] = useState<'split' | 'compress' | null>(null);
  const [splitEvery, setSplitEvery] = useState('');
  const [rasterAccepted, setRasterAccepted] = useState(false);
  const [numberingEnabled, setNumberingEnabled] = useState(false);
  const [numberingFormat, setNumberingFormat] = useState<'fls' | 'page_of_total' | 'simple'>('fls');
  const [numberingStart, setNumberingStart] = useState('1');

  async function splitPdf(rest: boolean) {
    if (locked.current) return;
    if (!beginOperation('export', 'Separando páginas…')) return;
    setAnalysisProgress(null);
    try {
      await paintBeforeWork();
      const subset = pages.filter((p) =>
        rest ? !selected.has(p.id) : selected.has(p.id),
      );
      if (!subset.length)
        throw new Error('Selecione um grupo de páginas primeiro.');
      const saved = await saveBytes(
        await exportPdf(subset, (p) => setBusy(exportMessage(p))),
        `${name}-${rest ? 'restantes' : 'selecionadas'}.pdf`,
      );
      setMessage(
        typeof saved === 'string'
          ? `Páginas salvas em: ${saved}.`
          : `${subset.length} páginas exportadas em arquivo separado.`,
      );
    } catch (e) {
      setMessage(String(e));
    } finally {
      finishOperation();
    }
  }

  async function splitPdfEvery() {
    const every = Number(splitEvery);
    if (!Number.isSafeInteger(every) || every < 1) {
      setMessage('Informe uma quantidade de páginas válida para cada parte.');
      return;
    }
    if (locked.current) return;
    if (!beginOperation('export', 'Separando páginas…')) return;
    setAnalysisProgress(null);
    try {
      await paintBeforeWork();
      const partCount = Math.ceil(pages.length / every);
      await exportPdfParts(
        pages,
        every,
        (bytes, part) =>
          void saveBytes(
            bytes,
            `${name}-parte-${String(part).padStart(3, '0')}.pdf`,
          ),
        (progress, part) =>
          setBusy(`Parte ${part}/${partCount} · ${exportMessage(progress)}`),
      );
      setMessage(
        `${pages.length} páginas divididas em ${partCount} ${partCount === 1 ? 'arquivo' : 'arquivos'}.`,
      );
    } catch (e) {
      setMessage(String(e));
    } finally {
      finishOperation();
    }
  }

  async function splitByBlankSeparators() {
    if (locked.current) return;
    const blankIndices = new Set<number>();
    pages.forEach((p, idx) => {
      if (
        p.verdict?.kind === 'blank' ||
        (p.ink === 0 && !p.text && p.source !== null)
      ) {
        blankIndices.add(idx);
      }
    });

    if (!blankIndices.size) {
      setMessage(
        'Nenhuma folha em branco detectada. Execute a detecção antes de dividir.',
      );
      return;
    }

    if (!beginOperation('export', 'Separando por páginas em branco…')) return;
    setAnalysisProgress(null);

    try {
      await paintBeforeWork();
      const parts: PageItem[][] = [];
      let currentPart: PageItem[] = [];

      for (let i = 0; i < pages.length; i++) {
        if (blankIndices.has(i)) {
          if (currentPart.length > 0) {
            parts.push(currentPart);
            currentPart = [];
          }
        } else {
          currentPart.push(pages[i]);
        }
      }
      if (currentPart.length > 0) {
        parts.push(currentPart);
      }

      if (!parts.length) {
        throw new Error(
          'Todas as páginas do documento foram identificadas como em branco.',
        );
      }

      for (let i = 0; i < parts.length; i++) {
        const partNum = i + 1;
        setBusy(`Exportando documento ${partNum}/${parts.length}…`);
        const bytes = await exportPdf(parts[i]);
        await saveBytes(
          bytes,
          `${name}-documento-${String(partNum).padStart(2, '0')}.pdf`,
        );
      }

      setMessage(
        `${pages.length} páginas divididas em ${parts.length} documentos (removidas ${blankIndices.size} folhas em branco).`,
      );
      setToolDialog(null);
    } catch (e) {
      setMessage(String(e));
    } finally {
      finishOperation();
    }
  }

  async function compressPdf() {
    if (locked.current || !rasterAccepted) return;
    if (!beginOperation('compress', 'Comprimindo…')) return;
    setAnalysisProgress(null);
    try {
      await paintBeforeWork();
      const bytes = await compressPages(pages, setBusy, () => cancel.current);
      const baseline = await exportPdf(pages, (p) => setBusy(exportMessage(p)));
      if (cancel.current) throw new Error('Compressão cancelada.');
      const smaller = bytes.length < baseline.length;
      await saveBytes(
        smaller ? bytes : baseline,
        `${name}-${smaller ? 'comprimido' : 'otimizado'}.pdf`,
      );
      setMessage(
        smaller
          ? `PDF reduzido em ${Math.round((1 - bytes.length / baseline.length) * 100)}% (${(baseline.length / 1048576).toFixed(1)} → ${(bytes.length / 1048576).toFixed(1)} MB).`
          : 'A compressão não reduziu o tamanho. Foi exportada a versão que preserva o conteúdo.',
      );
      setToolDialog(null);
    } catch (e) {
      setMessage(String(e));
    } finally {
      finishOperation();
    }
  }

  async function download() {
    if (locked.current || !pages.length) return;
    if (!beginOperation('export', 'Gerando seu PDF…')) return;
    setAnalysisProgress(null);
    try {
      await paintBeforeWork();
      const numbering = numberingEnabled
        ? {
            enabled: true,
            format: numberingFormat,
            startAt: Math.max(1, parseInt(numberingStart, 10) || 1),
          }
        : undefined;
      const bytes = await exportPdf(
        pages,
        (p) => setBusy(exportMessage(p)),
        undefined,
        numbering,
      );
      const saved = await saveBytes(bytes, `${name}-editado.pdf`);
      setMessage(
        typeof saved === 'string'
          ? `PDF salvo em: ${saved}. O arquivo original permanece intacto.`
          : 'PDF exportado. O arquivo original permanece intacto.',
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Falha na exportação.');
    } finally {
      finishOperation();
    }
  }

  return {
    toolDialog,
    setToolDialog,
    splitEvery,
    setSplitEvery,
    rasterAccepted,
    setRasterAccepted,
    numberingEnabled,
    setNumberingEnabled,
    numberingFormat,
    setNumberingFormat,
    numberingStart,
    setNumberingStart,
    splitPdf,
    splitPdfEvery,
    splitByBlankSeparators,
    compressPdf,
    download,
  };
}
