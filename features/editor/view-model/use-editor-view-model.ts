'use client';
import { useEffect, useRef, useState, useMemo } from 'react';
import { usePagePreview } from '@/hooks/use-page-preview';
import { useDocumentBridge } from './use-document-bridge';
import { useDocumentModel } from './use-document-model';
import { useEditorOperation } from './use-editor-operation';
import { useDocumentAnalysis } from './use-document-analysis';
import { usePageSelection } from './use-page-selection';
import { useDocumentExport } from './use-document-export';
import { useEditorKeyboard } from './use-editor-keyboard';
import { movePage, rotatePages, duplicatePages } from '../model/document';
import { paintBeforeWork } from '@/lib/pdf/runtime';
import type { EditorServices } from '../model/editor-services';
import type { PageItem } from '@/lib/pdf/types';

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

  const [message, setMessage] = useState('');
  const [clearOpen, setClearOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [name, setName] = useState('documento');

  const {
    previewPageId,
    preview,
    previewInfo,
    previewTitle,
    previewBusy,
    inspect,
    closePreview,
  } = usePagePreview(setMessage, services.renderPage, services.signal);

  const input = useRef<HTMLInputElement>(null);
  const drag = useRef<string | null>(null);

  useEffect(() => {
    if (!operation) releaseUnusedResources(pages, [...history, ...future]);
  }, [pages, history, future, operation, releaseUnusedResources]);

  const pageIndices = useMemo(
    () => new Map(pages.map((p, i) => [p.id, i])),
    [pages],
  );

  const candidates = pages.filter(
    (p) => p.verdict && p.verdict.kind !== 'content',
  );

  const analysis = useDocumentAnalysis({
    pages,
    setPages,
    analyze,
    locked,
    cancel,
    beginOperation,
    finishOperation,
    setBusy,
    setMessage,
  });

  const { setAnalysisProgress } = analysis;

  const selection = usePageSelection({
    pages,
    selected,
    setSelected,
    candidates,
    shown: pages, // updated dynamically below
    setMessage,
  });

  const { filter, setFilter, setRange, setRangeError } = selection;
  const shown = filter ? candidates : pages;

  const exportActions = useDocumentExport({
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
  });

  const { setToolDialog, setRasterAccepted } = exportActions;

  const analyzedCount = pages.filter((p) => p.verdict).length;
  const selectedNumbers = pages.flatMap((p, i) =>
    selected.has(p.id) ? [i + 1] : [],
  );

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

  useEditorKeyboard({
    busy,
    selectedSize: selected.size,
    shownSize: shown.length,
    undo,
    redo,
    remove,
    rotateSelected,
    selectVisible: selection.selectVisible,
    clearSelection: () => setSelected(new Set()),
    previewOpen: preview !== null,
    closePreview,
  });

  return {
    rotateSelected,
    duplicateSelected,
    reversePages,
    invertSelection: selection.invertSelection,
    selectSuggestions: selection.selectSuggestions,
    selectVisible: selection.selectVisible,
    pages,
    selected,
    setSelected,
    history,
    future,
    operation,
    busy,
    analysisProgress: analysis.analysisProgress,
    setAnalysisProgress: analysis.setAnalysisProgress,
    message,
    setMessage,
    ocr: analysis.ocr,
    setOcr: analysis.setOcr,
    sensitive: analysis.sensitive,
    setSensitive: analysis.setSensitive,
    ignoreBorders: analysis.ignoreBorders,
    setIgnoreBorders: analysis.setIgnoreBorders,
    scanMode: analysis.scanMode,
    setScanMode: analysis.setScanMode,
    ocrEngine: analysis.ocrEngine,
    setOcrEngine: analysis.setOcrEngine,
    bypassCache: analysis.bypassCache,
    setBypassCache: analysis.setBypassCache,
    settingsOpen: analysis.settingsOpen,
    setSettingsOpen: analysis.setSettingsOpen,
    clearOpen,
    setClearOpen,
    toolDialog: exportActions.toolDialog,
    setToolDialog: exportActions.setToolDialog,
    splitEvery: exportActions.splitEvery,
    setSplitEvery: exportActions.setSplitEvery,
    rasterAccepted: exportActions.rasterAccepted,
    setRasterAccepted: exportActions.setRasterAccepted,
    range: selection.range,
    setRange: selection.setRange,
    rangeError: selection.rangeError,
    setRangeError: selection.setRangeError,
    filter: selection.filter,
    setFilter: selection.setFilter,
    searchTerm: selection.searchTerm,
    setSearchTerm: selection.setSearchTerm,
    searchInPages: selection.searchInPages,
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
    selectParity: selection.selectParity,
    splitPdf: exportActions.splitPdf,
    splitPdfEvery: exportActions.splitPdfEvery,
    compressPdf: exportActions.compressPdf,
    applyRange: selection.applyRange,
    undo,
    redo,
    toggle,
    openFiles,
    addBlank,
    clearDocument,
    remove,
    move,
    drop,
    runAnalysis: analysis.runAnalysis,
    download: exportActions.download,
    reviewPages,
    reviewIndex,
    navigatePreview,
    reviewPage,
  };
}

export type EditorViewModel = ReturnType<typeof useEditorViewModel>;
