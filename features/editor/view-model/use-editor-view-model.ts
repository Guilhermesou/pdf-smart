'use client';
import { useEffect, useRef, useState, useMemo } from 'react';
import { usePagePreview } from '@/hooks/use-page-preview';
import { useDocumentBridge } from './use-document-bridge';
import { useDocumentModel } from './use-document-model';
import { useEditorOperation } from './use-editor-operation';
import { movePage, rotatePages, duplicatePages } from '../model/document';
import { paintBeforeWork, exportMessage } from '@/lib/pdf/runtime';
import {
  paritySelection,
  parsePageSelection,
  formatPageSelection,
} from '@/lib/pdf/selection';
import type { EditorServices } from '../model/editor-services';
import type { PageItem, AnalysisProgress } from '@/lib/pdf/types';

export function useEditorViewModel(services: EditorServices) {
  const {
    importPdf,
    analyze,
    exportPdf,
    exportPdfParts,
    compressPages,
    saveBytes,
    releaseUnusedResources,
  } = services;
  const documentModel = useDocumentModel();
  const { pages, selected, history, future, setPages, setSelected } =
    documentModel;
  const {
    operation,
    busy,
    setBusy,
    locked,
    cancel,
    beginOperation,
    finishOperation,
    requestCancel,
    resetCancel,
  } = useEditorOperation();
  const [analysisProgress, setAnalysisProgress] =
      useState<AnalysisProgress | null>(null),
    [message, setMessage] = useState(''),
    [ocr, setOcr] = useState(true),
    [sensitive, setSensitive] = useState(false),
    [ignoreBorders, setIgnoreBorders] = useState(true),
    [scanMode, setScanMode] = useState(true),
    [ocrEngine, setOcrEngine] = useState<'auto' | 'tesseract'>('auto'),
    [bypassCache, setBypassCache] = useState(false),
    [settingsOpen, setSettingsOpen] = useState(false),
    [clearOpen, setClearOpen] = useState(false),
    [toolDialog, setToolDialog] = useState<'split' | 'compress' | null>(null),
    [splitEvery, setSplitEvery] = useState(''),
    [rasterAccepted, setRasterAccepted] = useState(false),
    [range, setRange] = useState(''),
    [rangeError, setRangeError] = useState(''),
    [filter, setFilter] = useState(false),
    [dragOver, setDragOver] = useState(false),
    [name, setName] = useState('documento');
  const {
    previewPageId,
    preview,
    previewInfo,
    previewTitle,
    previewBusy,
    inspect,
    closePreview,
  } = usePagePreview(setMessage, services.renderPage, services.signal);
  const input = useRef<HTMLInputElement>(null),
    drag = useRef<string | null>(null);
  useEffect(() => {
    if (!operation) releaseUnusedResources(pages, [...history, ...future]);
  }, [pages, history, future, operation, releaseUnusedResources]);
  const pageIndices = useMemo(
    () => new Map(pages.map((p, i) => [p.id, i])),
    [pages],
  );
  const candidates = pages.filter(
      (p) => p.verdict && p.verdict.kind !== 'content',
    ),
    shown = filter ? candidates : pages;
  const analyzedCount = pages.filter((p) => p.verdict).length;
  const selectedNumbers = pages.flatMap((p, i) =>
    selected.has(p.id) ? [i + 1] : [],
  );
  const selectParity = (parity: 'odd' | 'even') => {
    const nums = paritySelection(pages.length, parity);
    setSelected(new Set(nums.map((n) => pages[n - 1].id)));
    setRangeError('');
    setMessage(
      `${nums.length} páginas ${parity === 'odd' ? 'ímpares' : 'pares'} selecionadas na ordem atual.`,
    );
  };
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
      saveBytes(
        await exportPdf(subset, (p) => setBusy(exportMessage(p))),
        `${name}-${rest ? 'restantes' : 'selecionadas'}.pdf`,
      );
      setMessage(`${subset.length} páginas exportadas em arquivo separado.`);
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
          saveBytes(
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
      saveBytes(
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
  const applyRange = () => {
    try {
      const positions = parsePageSelection(range, pages.length);
      setSelected(new Set(positions.map((n) => pages[n - 1].id)));
      setRangeError('');
      setMessage(
        `${positions.length} páginas selecionadas: ${formatPageSelection(positions)}.`,
      );
    } catch (e) {
      setRangeError(e instanceof Error ? e.message : 'Seleção inválida.');
    }
  };
  const update = (next: PageItem[], previous?: PageItem[]) => {
    if (locked.current) return;
    setAnalysisProgress(null);
    documentModel.commit(next, previous);
  };
  function undo() {
    if (locked.current) return;
    documentModel.undo();
    setAnalysisProgress(null);
    setFilter(false);
  }
  function redo() {
    if (locked.current) return;
    documentModel.redo();
    setAnalysisProgress(null);
    setFilter(false);
  }
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  async function openFiles(files: FileList | File[] | null) {
    if (!files?.length || locked.current) return;
    if (!beginOperation('import', 'Abrindo documentos…')) return;
    setAnalysisProgress(null);
    setMessage('');
    const added: PageItem[] = [];
    setFilter(false);
    const errors: string[] = [];
    try {
      await paintBeforeWork();
      for (const file of Array.from(files)) {
        if (!file.name.toLowerCase().endsWith('.pdf')) {
          errors.push(`${file.name}: selecione um PDF.`);
          continue;
        }
        try {
          added.push(
            ...(await importPdf(file, setBusy, (partial) => {
              setPages([...pages, ...added, ...partial]);
            })),
          );
        } catch (e) {
          errors.push(
            e instanceof Error ? e.message : 'Falha ao abrir arquivo.',
          );
        }
      }
      setPages([...pages, ...added]);
      if (added.length) {
        if (!pages.length)
          setName(Array.from(files)[0].name.replace(/\.pdf$/i, ''));
        documentModel.commit([...pages, ...added], pages);
        setFilter(false);
      }
      setMessage(
        errors.join(' ') ||
          (added.length ? `${added.length} páginas adicionadas.` : ''),
      );
    } finally {
      finishOperation();
      if (input.current) input.current.value = '';
    }
  }
  function addBlank() {
    update([
      ...pages,
      {
        id: crypto.randomUUID(),
        source: null,
        index: 0,
        rotation: 0,
        thumb: '',
        text: '',
        ink: 0,
      },
    ]);
    setFilter(false);
  }
  function clearDocument() {
    if (locked.current || previewBusy) return;
    closePreview();
    documentModel.clear();
    setFilter(false);
    setRange('');
    setRangeError('');
    setAnalysisProgress(null);
    setName('documento');
    setDragOver(false);
    setToolDialog(null);
    setRasterAccepted(false);
    setClearOpen(false);
    resetCancel();
    drag.current = null;
    if (input.current) input.current.value = '';
    setMessage('Documento limpo. Abra outro PDF para continuar.');
  }
  function remove() {
    const remaining = pages.filter((p) => !selected.has(p.id));
    update(remaining);
    if (
      filter &&
      !remaining.some((p) => p.verdict && p.verdict.kind !== 'content')
    )
      setFilter(false);
    setMessage(`${selected.size} páginas removidas. Você pode desfazer.`);
    setSelected(new Set());
  }
  function move(id: string, offset: number) {
    update(
      movePage(pages, id, pages.findIndex((page) => page.id === id) + offset),
    );
  }
  function drop(id: string) {
    if (drag.current)
      update(
        movePage(
          pages,
          drag.current,
          pages.findIndex((page) => page.id === id),
        ),
      );
    drag.current = null;
  }
  const rotateSelected = () => update(rotatePages(pages, selected));
  const duplicateSelected = () =>
    update(duplicatePages(pages, selected, () => crypto.randomUUID()));
  const reversePages = () => update([...pages].reverse());
  const invertSelection = () =>
    setSelected(
      new Set(
        pages.filter((page) => !selected.has(page.id)).map((page) => page.id),
      ),
    );
  function selectSuggestions() {
    setSelected(new Set(candidates.map((page) => page.id)));
    setFilter(true);
  }
  const selectVisible = (checked: boolean) =>
    setSelected(checked ? new Set(shown.map((page) => page.id)) : new Set());
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
  async function download() {
    if (locked.current || !pages.length) return;
    if (!beginOperation('export', 'Gerando seu PDF…')) return;
    setAnalysisProgress(null);
    try {
      await paintBeforeWork();
      const bytes = await exportPdf(pages, (p) => setBusy(exportMessage(p)));
      saveBytes(bytes, `${name}-editado.pdf`);
      setMessage('PDF exportado. O arquivo original permanece intacto.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Falha na exportação.');
    } finally {
      finishOperation();
    }
  }
  const reviewPages = filter ? candidates : pages;
  const reviewIndex = reviewPages.findIndex((p) => p.id === previewPageId);
  function navigatePreview(offset: number) {
    const page = reviewPages[reviewIndex + offset];
    if (page) void inspect(page, pageIndices.get(page.id)!);
  }
  function reviewPage(exclude: boolean) {
    if (!previewPageId || locked.current) return;
    setSelected((current) => {
      const next = new Set(current);
      if (exclude) next.add(previewPageId);
      else next.delete(previewPageId);
      return next;
    });
    if (reviewIndex < reviewPages.length - 1) navigatePreview(1);
    else {
      closePreview();
      setMessage(
        'Revisão concluída. Confira a seleção e use Excluir para remover as páginas marcadas.',
      );
    }
  }
  useDocumentBridge(pages, busy);
  return {
    rotateSelected,
    duplicateSelected,
    reversePages,
    invertSelection,
    selectSuggestions,
    selectVisible,
    pages,
    selected,
    setSelected,
    history,
    future,
    operation,
    busy,
    analysisProgress,
    setAnalysisProgress,
    message,
    setMessage,
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
    clearOpen,
    setClearOpen,
    toolDialog,
    setToolDialog,
    splitEvery,
    setSplitEvery,
    rasterAccepted,
    setRasterAccepted,
    range,
    setRange,
    rangeError,
    setRangeError,
    filter,
    setFilter,
    dragOver,
    setDragOver,
    name,
    previewPageId,
    preview,
    previewInfo,
    previewTitle,
    previewBusy,
    inspect,
    closePreview,
    input,
    drag,
    requestCancel,
    pageIndices,
    candidates,
    shown,
    analyzedCount,
    selectedNumbers,
    selectParity,
    splitPdf,
    splitPdfEvery,
    compressPdf,
    applyRange,
    undo,
    redo,
    toggle,
    openFiles,
    addBlank,
    clearDocument,
    remove,
    move,
    drop,
    runAnalysis,
    download,
    reviewPages,
    reviewIndex,
    navigatePreview,
    reviewPage,
  };
}

export type EditorViewModel = ReturnType<typeof useEditorViewModel>;
