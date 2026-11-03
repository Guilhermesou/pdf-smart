'use client';
import {
  FileStack,
  Settings2,
  Combine,
  Scissors,
  Minimize2,
  Upload,
  ShieldCheck,
  ScanLine,
  Plus,
  Download,
  Trash2,
  RotateCw,
  Undo2,
  Redo2,
  Copy,
  ArrowLeft,
  ArrowRight,
  Eye,
  GripVertical,
  Check,
  FilePlus2,
  X,
  LoaderCircle,
} from 'lucide-react';
import { version } from '@/package.json';
import { VirtualPageGrid } from '@/components/virtual-page-grid';

import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { formatPageSelection } from '@/lib/pdf/selection';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { labels } from './labels';
import type { EditorViewModel } from '../view-model/use-editor-view-model';
import { AnalysisProgressPanel } from './analysis-progress-panel';
import { AnalysisSettings } from './analysis-settings';
import { ExportDialog } from './export-dialog';
import { PagePreviewDialog } from './page-preview-dialog';
export function EditorView({ model }: { model: EditorViewModel }) {
  const {
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
    message,
    setMessage,
    setSettingsOpen,
    clearOpen,
    setClearOpen,
    setToolDialog,
    setRasterAccepted,
    range,
    setRange,
    rangeError,
    setRangeError,
    filter,
    setFilter,
    searchTerm,
    setSearchTerm,
    searchInPages,
    dragOver,
    setDragOver,
    name,
    previewBusy,
    inspect,
    input,
    drag,
    requestCancel,
    pageIndices,
    candidates,
    shown,
    analyzedCount,
    selectedNumbers,
    selectParity,
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
  } = model;
  return (
    <main>
      <header className="topbar">
        <div className="brand">
          <span className="brand-icon">
            <FileStack size={23} />
          </span>
          pdf<span className="brand-light">smart</span>
          <span className="app-version" aria-label={`Versão ${version}`}>
            v{version}
          </span>
        </div>
        <span className="privacy">
          <ShieldCheck size={16} /> Seus arquivos ficam com você
        </span>
      </header>
      {pages.length > 0 && (
        <div className="workspace-heading">
          <h1>Organizar páginas</h1>
          <button className="primary" disabled={!!busy} onClick={download}>
            <Download size={17} /> Exportar PDF{' '}
            <span className="button-count">{pages.length}</span>
          </button>
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept=".pdf,application/pdf"
        multiple
        hidden
        onChange={(e) => void openFiles(e.target.files)}
      />
      <div className="workspace-tools" aria-label="Ferramentas de PDF">
        <span className="tool-current">
          <FileStack size={18} /> Organizar
        </span>
        <button disabled={!!busy} onClick={() => input.current?.click()}>
          <Combine size={18} /> Juntar PDFs
        </button>
        <button
          disabled={!pages.length || !!busy}
          onClick={() => setToolDialog('split')}
        >
          <Scissors size={18} /> Dividir
        </button>
        <button
          disabled={!pages.length || !!busy}
          onClick={() => {
            setRasterAccepted(false);
            setToolDialog('compress');
          }}
        >
          <Minimize2 size={18} /> Comprimir
        </button>
        <div className="tool-spacer" />
        <button
          disabled={
            (!pages.length && !history.length && !future.length) ||
            !!busy ||
            previewBusy
          }
          onClick={() => setClearOpen(true)}
        >
          <X size={18} /> Limpar documento
        </button>
        <button disabled={!pages.length || !!busy} onClick={runAnalysis}>
          <ScanLine size={18} /> Detectar folhas em branco
        </button>
        <button onClick={() => setSettingsOpen(true)}>
          <Settings2 size={18} /> Configurações
        </button>
      </div>
      <AnalysisProgressPanel model={model} />
      <div className="editor-layout">
        <section
          className="document-area"
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('Files')) {
              e.preventDefault();
              setDragOver(true);
            }
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            if (e.dataTransfer.files.length) {
              e.preventDefault();
              setDragOver(false);
              void openFiles(e.dataTransfer.files);
            }
          }}
        >
          {!pages.length ? (
            <div className={`empty-editor ${dragOver ? 'drag-over' : ''}`}>
              <div className="upload-symbol">
                <FileStack size={38} />
              </div>
              {(history.length > 0 || future.length > 0) && (
                <div className="review-controls">
                  <button
                    className="secondary"
                    disabled={!!busy || !history.length}
                    onClick={undo}
                    aria-label="Desfazer última alteração"
                  >
                    <Undo2 size={17} /> Desfazer
                  </button>
                  <button
                    className="secondary"
                    disabled={!!busy || !future.length}
                    onClick={redo}
                    aria-label="Refazer última alteração"
                  >
                    <Redo2 size={17} /> Refazer
                  </button>
                </div>
              )}
              <h2>Seu próximo PDF começa aqui</h2>
              <p>Arraste um ou mais PDFs para organizar suas páginas.</p>
              <button
                className="primary"
                disabled={!!busy}
                onClick={() => input.current?.click()}
              >
                <Upload size={17} /> Abrir arquivos PDF
              </button>
              <small>
                Processamento local · Sem cadastro · Sem enviar seus PDFs
              </small>
              <button
                className="text-button blank-start"
                disabled={!!busy}
                onClick={addBlank}
              >
                ou comece com uma página vazia
              </button>
            </div>
          ) : (
            <>
              <div className="document-bar">
                <div className="document-name">
                  <FileStack size={18} />
                  <span>
                    {name}.pdf
                    <small>
                      {pages.length} páginas ·{' '}
                      {new Set(pages.map((p) => p.source).filter(Boolean)).size}{' '}
                      arquivos de origem
                    </small>
                  </span>
                </div>
                <button
                  className="secondary"
                  disabled={!!busy}
                  onClick={() => input.current?.click()}
                >
                  <Plus size={16} /> Adicionar PDF
                </button>
              </div>
              <div className="toolbar">
                <label className="check-label">
                  <Checkbox
                    disabled={!!busy || !shown.length}
                    checked={
                      !!shown.length && shown.every((p) => selected.has(p.id))
                    }
                    onCheckedChange={(value) => selectVisible(!!value)}
                  />
                  <span>
                    {selected.size
                      ? `${selected.size} selecionadas`
                      : filter
                        ? 'Selecionar sugestões visíveis'
                        : 'Selecionar todas'}
                  </span>
                </label>
                <div className="tool-actions">
                  <button
                    title="Girar páginas selecionadas"
                    aria-label="Girar páginas selecionadas"
                    disabled={!selected.size || !!busy}
                    onClick={rotateSelected}
                  >
                    <RotateCw size={17} />
                  </button>
                  <button
                    title="Excluir páginas selecionadas"
                    aria-label="Excluir páginas selecionadas"
                    disabled={!selected.size || !!busy}
                    onClick={remove}
                  >
                    <Trash2 size={17} />
                    <span>
                      Excluir{selected.size ? ` (${selected.size})` : ''}
                    </span>
                  </button>
                  <span className="separator" />
                  <button
                    title="Desfazer última alteração"
                    aria-label="Desfazer última alteração"
                    disabled={!history.length || !!busy}
                    onClick={undo}
                  >
                    <Undo2 size={17} />
                  </button>
                  <button
                    title="Refazer última alteração"
                    aria-label="Refazer última alteração"
                    disabled={!future.length || !!busy}
                    onClick={redo}
                  >
                    <Redo2 size={17} />
                  </button>
                  <button
                    title="Duplicar páginas selecionadas"
                    disabled={!selected.size || !!busy}
                    onClick={duplicateSelected}
                  >
                    <Copy size={17} /> Duplicar
                  </button>
                  <button
                    disabled={pages.length < 2 || !!busy}
                    onClick={reversePages}
                  >
                    Inverter ordem
                  </button>
                  <button
                    className="with-text"
                    disabled={!!busy}
                    onClick={addBlank}
                  >
                    <FilePlus2 size={17} />
                    <span>Página vazia</span>
                  </button>
                </div>
              </div>
              <div className="selection-panel compact-selection">
                <div className="selection-row">
                  <div className="quick-selection">
                    <span>Seleção rápida</span>
                    <button
                      disabled={!!busy || !pages.length}
                      onClick={invertSelection}
                    >
                      Inverter seleção
                    </button>
                    <button
                      className="secondary"
                      disabled={!!busy}
                      onClick={() => selectParity('odd')}
                    >
                      Ímpares
                    </button>
                    <button
                      className="secondary"
                      disabled={!!busy}
                      onClick={() => selectParity('even')}
                    >
                      Pares
                    </button>
                    <button
                      className="secondary"
                      disabled={!!busy || !candidates.length}
                      onClick={selectSuggestions}
                    >
                      Sugestões ({candidates.length})
                    </button>
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      applyRange();
                    }}
                  >
                    <label className="sr-only" htmlFor="page-ranges">
                      Selecionar por número
                    </label>
                    <div className="range-controls">
                      <Input
                        id="page-ranges"
                        placeholder="Ex.: 1, 3, 5–10"
                        value={range}
                        disabled={!!busy}
                        onChange={(e) => {
                          setRange(e.target.value);
                          setRangeError('');
                        }}
                        aria-invalid={!!rangeError}
                        aria-describedby="selection-help"
                      />
                      <button
                        className="secondary"
                        disabled={!!busy}
                        type="submit"
                      >
                        Selecionar
                      </button>
                    </div>
                  </form>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      searchInPages(searchTerm);
                    }}
                  >
                    <label className="sr-only" htmlFor="page-search">
                      Buscar texto no documento
                    </label>
                    <div className="range-controls">
                      <Input
                        id="page-search"
                        placeholder="Buscar texto…"
                        value={searchTerm}
                        disabled={!!busy || !pages.length}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                      <button
                        className="secondary"
                        disabled={!!busy || !pages.length || !searchTerm.trim()}
                        type="submit"
                        title="Buscar páginas com este texto"
                      >
                        Buscar
                      </button>
                    </div>
                  </form>
                </div>
                <p id="selection-help" className="sr-only">
                  Use os números na ordem atual. A seleção informada substitui a
                  anterior.
                </p>
                {rangeError && (
                  <p role="alert" className="range-error">
                    {rangeError}
                  </p>
                )}
                {!!selected.size && (
                  <div className="selection-readout">
                    <details>
                      <summary>
                        {selected.size} de {pages.length} selecionadas · ver
                        números
                      </summary>
                      <p>{formatPageSelection(selectedNumbers)}</p>
                    </details>
                    <button
                      className="text-button"
                      disabled={!!busy}
                      onClick={() => setSelected(new Set())}
                    >
                      Limpar seleção
                    </button>
                  </div>
                )}
              </div>
              <div className="analysis-overview" role="status">
                <ScanLine size={22} />
                <div>
                  <strong>
                    {analyzedCount
                      ? `${candidates.length} sugestões · ${analyzedCount}/${pages.length} páginas analisadas`
                      : 'Páginas ainda não analisadas'}
                  </strong>
                  <p>
                    {!analyzedCount
                      ? 'Clique em Analisar páginas para procurar páginas vazias e carimbos.'
                      : !candidates.length
                        ? 'Nenhuma sugestão encontrada. Experimente incluir pequenos detalhes e confira os motivos ao ampliar uma página.'
                        : 'As sugestões estão marcadas nas miniaturas. Revise antes de excluir.'}
                  </p>
                </div>
                <button
                  className="secondary"
                  disabled={!!busy}
                  onClick={runAnalysis}
                >
                  {analyzedCount ? 'Analisar novamente' : 'Analisar páginas'}
                </button>
              </div>
              <div className="grid-caption">
                <div
                  className="page-views"
                  role="group"
                  aria-label="Páginas exibidas"
                >
                  <button
                    aria-pressed={!filter}
                    onClick={() => setFilter(false)}
                  >
                    Todas ({pages.length})
                  </button>
                  <button aria-pressed={filter} onClick={() => setFilter(true)}>
                    Sugestões ({candidates.length})
                  </button>
                </div>
                <span>
                  {filter
                    ? 'Revise antes de excluir'
                    : 'Arraste para reorganizar'}
                </span>
              </div>
              <VirtualPageGrid
                items={shown}
                className={dragOver ? 'drag-over' : ''}
                empty={
                  <div className="no-results">
                    <Check size={28} />
                    <h3>Nenhuma página suspeita</h3>
                    <p>Não há sugestões nesta visualização.</p>
                    <button
                      className="secondary"
                      onClick={() => setFilter(false)}
                    >
                      Ver páginas restantes ({pages.length})
                    </button>
                  </div>
                }
                renderItem={(p) => {
                  const i = pageIndices.get(p.id)!;
                  return (
                    // Dragging supplements the accessible move buttons below.
                    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
                    <article
                      key={p.id}
                      className={`page-card ${selected.has(p.id) ? 'selected' : ''}`}
                      draggable={!busy && !filter}
                      onDragStart={(e) => {
                        drag.current = p.id;
                        e.dataTransfer.setData('text/plain', p.id);
                      }}
                      onDragOver={(e) => {
                        if (drag.current) e.preventDefault();
                      }}
                      onDrop={(e) => {
                        if (drag.current) {
                          e.preventDefault();
                          drop(p.id);
                        }
                      }}
                      onDragEnd={() => {
                        drag.current = null;
                      }}
                    >
                      <div className="page-top">
                        <Checkbox
                          disabled={!!busy}
                          aria-label={`Selecionar página ${i + 1}`}
                          checked={selected.has(p.id)}
                          onCheckedChange={() => toggle(p.id)}
                        />
                        <GripVertical size={15} />
                      </div>
                      <button
                        className="page-image"
                        aria-label={`Ampliar página ${i + 1}`}
                        disabled={operation === 'import'}
                        onClick={() => void inspect(p, i)}
                      >
                        {p.thumb ? (
                          <img
                            src={p.thumb}
                            alt={`Miniatura da página ${i + 1}`}
                            loading="lazy"
                            style={{
                              transform: `rotate(${p.rotation}deg)`,
                              maxWidth: p.rotation % 180 ? '70%' : undefined,
                            }}
                          />
                        ) : (
                          <span className="blank-paper" />
                        )}
                        <span className="zoom-hint">
                          <Eye size={18} /> Ampliar
                        </span>
                      </button>
                      <div className="page-bottom">
                        <strong>{String(i + 1).padStart(2, '0')}</strong>
                        <span>
                          {p.source ? `Original ${p.index + 1}` : 'Nova página'}
                        </span>
                        <div className="move-controls">
                          <button
                            disabled={i === 0 || !!busy}
                            aria-label={`Mover página ${i + 1} para antes`}
                            onClick={() => move(p.id, -1)}
                          >
                            <ArrowLeft size={13} />
                          </button>
                          <button
                            disabled={i === pages.length - 1 || !!busy}
                            aria-label={`Mover página ${i + 1} para depois`}
                            onClick={() => move(p.id, 1)}
                          >
                            <ArrowRight size={13} />
                          </button>
                        </div>
                      </div>
                      {p.verdict && (
                        <div
                          title={p.verdict.reason}
                          className={`verdict ${p.verdict.kind}`}
                        >
                          <span className="dot" />
                          {labels[p.verdict.kind]}
                        </div>
                      )}
                    </article>
                  );
                }}
              />
              <div className="document-foot">
                <ShieldCheck size={14} /> O original permanece intacto. As
                mudanças são aplicadas na exportação.
              </div>
            </>
          )}
          {(busy || message) && (
            <div className={`status ${busy ? 'working' : ''}`} role="status">
              {busy ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <Check size={16} />
              )}
              <span>{busy || message}</span>
              {operation === 'analysis' && (
                <button className="text-button" onClick={requestCancel}>
                  Parar
                </button>
              )}
              {!busy && (
                <button
                  aria-label="Fechar aviso"
                  onClick={() => setMessage('')}
                >
                  <X size={15} />
                </button>
              )}
            </div>
          )}
        </section>
        <Dialog open={clearOpen} onOpenChange={setClearOpen}>
          <DialogContent>
            <div>
              <DialogTitle>Limpar documento?</DialogTitle>
              <DialogDescription>
                Isso fecha o PDF e descarta as alterações e o histórico desta
                sessão. Exporte antes se quiser guardar suas edições. Os
                arquivos originais permanecem intactos.
              </DialogDescription>
            </div>
            <button className="secondary" onClick={() => setClearOpen(false)}>
              Continuar editando
            </button>
            <button
              className="primary"
              disabled={!!busy || previewBusy}
              onClick={clearDocument}
            >
              Limpar e começar outro
            </button>
          </DialogContent>
        </Dialog>
        <AnalysisSettings model={model} />
      </div>
      <ExportDialog model={model} />
      <footer>
        FEITO PARA DOCUMENTOS REAIS.<span>Organizar. Revisar. Resolver.</span>
      </footer>
      <PagePreviewDialog model={model} />
    </main>
  );
}
