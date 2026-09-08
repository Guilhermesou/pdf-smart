'use client';
import { useEffect, useRef, useState } from 'react';
import {
  FileStack,
  Upload,
  ShieldCheck,
  ScanLine,
  ArrowUpRight,
  Plus,
  Download,
  Trash2,
  RotateCw,
  Undo2,
  ArrowLeft,
  ArrowRight,
  Eye,
  GripVertical,
  Check,
  FilePlus2,
  X,
  LoaderCircle,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { parsePageSelection, formatPageSelection } from '@/lib/pdf/selection';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  importPdf,
  analyze,
  exportPdf,
  renderPage,
  type PageItem,
} from '@/lib/pdf/engine';
const labels = {
  blank: 'Em branco',
  stamp: 'Carimbo EM BRANCO',
  sparse: 'Poucos detalhes',
  content: 'Com conteúdo',
};
export default function Home() {
  const [pages, setPages] = useState<PageItem[]>([]),
    [selected, setSelected] = useState<Set<string>>(new Set()),
    [history, setHistory] = useState<PageItem[][]>([]),
    [busy, setBusy] = useState(''),
    [message, setMessage] = useState(''),
    [ocr, setOcr] = useState(true),
    [sensitive, setSensitive] = useState(false),
    [ignoreBorders, setIgnoreBorders] = useState(true),
    [range, setRange] = useState(''),
    [rangeError, setRangeError] = useState(''),
    [previewInfo, setPreviewInfo] = useState<PageItem['verdict']>(),
    [filter, setFilter] = useState(false),
    [dragOver, setDragOver] = useState(false),
    [preview, setPreview] = useState<string | null>(null),
    [previewTitle, setPreviewTitle] = useState(''),
    [name, setName] = useState('documento'),
    [previewBusy, setPreviewBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null),
    drag = useRef<string | null>(null),
    cancel = useRef(false),
    locked = useRef(false);
  const candidates = pages.filter(
      (p) => p.verdict && p.verdict.kind !== 'content',
    ),
    shown = filter ? candidates : pages;
  const analyzedCount = pages.filter((p) => p.verdict).length;
  const selectedNumbers = pages.flatMap((p, i) =>
    selected.has(p.id) ? [i + 1] : [],
  );
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
  const update = (next: PageItem[]) => {
    setHistory((h) => [...h.slice(-19), pages]);
    setPages(next);
  };
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  async function openFiles(files: FileList | File[] | null) {
    if (!files?.length || locked.current) return;
    locked.current = true;
    setBusy('Abrindo documentos…');
    setMessage('');
    let added: PageItem[] = [];
    const errors: string[] = [];
    try {
      for (const file of Array.from(files)) {
        if (!file.name.toLowerCase().endsWith('.pdf')) {
          errors.push(`${file.name}: selecione um PDF.`);
          continue;
        }
        try {
          added.push(...(await importPdf(file, setBusy)));
        } catch (e) {
          errors.push(
            e instanceof Error ? e.message : 'Falha ao abrir arquivo.',
          );
        }
      }
      if (added.length) {
        if (!pages.length)
          setName(Array.from(files)[0].name.replace(/\.pdf$/i, ''));
        update([...pages, ...added]);
        setFilter(false);
      }
      setMessage(
        errors.join(' ') ||
          (added.length ? `${added.length} páginas adicionadas.` : ''),
      );
    } finally {
      locked.current = false;
      setBusy('');
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
  function remove() {
    update(pages.filter((p) => !selected.has(p.id)));
    setMessage(`${selected.size} páginas removidas. Você pode desfazer.`);
    setSelected(new Set());
  }
  function move(id: string, offset: number) {
    const from = pages.findIndex((p) => p.id === id),
      to = from + offset;
    if (to < 0 || to >= pages.length) return;
    const next = [...pages];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    update(next);
  }
  function drop(id: string) {
    const from = pages.findIndex((p) => p.id === drag.current),
      to = pages.findIndex((p) => p.id === id);
    if (from < 0 || to < 0 || from === to) return;
    const next = [...pages];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    update(next);
    drag.current = null;
  }
  async function runAnalysis() {
    if (locked.current || !pages.length) return;
    locked.current = true;
    cancel.current = false;
    setBusy('Preparando análise…');
    setMessage('');
    try {
      const result = await analyze(
        pages,
        { ocr, tolerance: sensitive ? 0.012 : 0.003, ignoreBorders },
        setBusy,
        cancel,
      );
      const indexed = new Map(result.pages.map((p) => [p.id, p]));
      setPages(pages.map((p) => indexed.get(p.id) || p));
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
      setBusy('');
      locked.current = false;
    }
  }
  async function download() {
    if (locked.current || !pages.length) return;
    locked.current = true;
    setBusy('Gerando seu PDF…');
    try {
      const bytes = await exportPdf(pages);
      const url = URL.createObjectURL(
        new Blob([bytes as BlobPart], { type: 'application/pdf' }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name}-editado.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      setMessage('PDF exportado. O arquivo original permanece intacto.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Falha na exportação.');
    } finally {
      setBusy('');
      locked.current = false;
    }
  }
  async function inspect(p: PageItem, i: number) {
    setPreviewInfo(p.verdict);
    setPreviewTitle(`Página ${i + 1}`);
    setPreviewBusy(true);
    setPreview('');
    try {
      const canvas = await renderPage(p);
      setPreview(canvas.toDataURL('image/webp', 0.95));
      canvas.width = 0;
    } catch {
      setMessage('Não foi possível ampliar esta página.');
      setPreview(null);
    } finally {
      setPreviewBusy(false);
    }
  }
  const state = useRef({ pages, busy });
  state.current = { pages, busy };
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (tool: unknown, options: unknown) => void;
        };
      }
    ).modelContext;
    if (!context) return;
    const lifecycle = new AbortController();
    try {
      context.registerTool(
        {
          name: 'read_pdf_pages',
          description: 'Lista páginas e resultados da análise do PDF aberto.',
          inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true, untrustedContentHint: true },
          execute: (input: unknown) => {
            if (
              !input ||
              typeof input !== 'object' ||
              Object.keys(input).length
            )
              throw new Error('Informe um objeto vazio.');
            return {
              busy: state.current.busy,
              pages: state.current.pages.map((p, i) => ({
                position: i + 1,
                rotation: p.rotation,
                verdict: p.verdict?.kind ?? 'not_analyzed',
              })),
            };
          },
        },
        { signal: lifecycle.signal },
      );
    } catch {}
    return () => lifecycle.abort();
  }, []);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (state.current.pages.length) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  return (
    <main>
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-icon">
            <FileStack size={23} />
          </span>
          pdf<span className="brand-light">smart</span>
          <span className="beta">BETA</span>
        </a>
        <span className="privacy">
          <ShieldCheck size={16} /> Seus arquivos ficam com você
        </span>
      </header>
      <div className="workspace-heading">
        <div>
          <div className="eyebrow">SEU ESPAÇO DE DOCUMENTOS</div>
          <h1>
            {pages.length
              ? 'Tudo na página certa.'
              : 'Menos páginas. Mais clareza.'}
          </h1>
          <p>
            {pages.length
              ? 'Reorganize, revise e dê uma nova ordem ao seu documento.'
              : 'Organize seu PDF e deixe apenas o que importa.'}
          </p>
        </div>
        {pages.length ? (
          <button className="primary" disabled={!!busy} onClick={download}>
            <Download size={17} /> Exportar PDF{' '}
            <span className="button-count">{pages.length}</span>
          </button>
        ) : (
          <span className="workspace-label">
            Editor de páginas <ArrowUpRight size={16} />
          </span>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept=".pdf,application/pdf"
        multiple
        hidden
        onChange={(e) => void openFiles(e.target.files)}
      />
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
                    onCheckedChange={(value) =>
                      setSelected(
                        value ? new Set(shown.map((p) => p.id)) : new Set(),
                      )
                    }
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
                    onClick={() =>
                      update(
                        pages.map((p) =>
                          selected.has(p.id)
                            ? { ...p, rotation: (p.rotation + 90) % 360 }
                            : p,
                        ),
                      )
                    }
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
                    onClick={() => {
                      setPages(history[history.length - 1]);
                      setHistory((h) => h.slice(0, -1));
                      setSelected(new Set());
                    }}
                  >
                    <Undo2 size={17} />
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
              <div className="selection-panel">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    applyRange();
                  }}
                >
                  <label htmlFor="page-ranges">Selecionar por número</label>
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
                      Aplicar seleção
                    </button>
                  </div>
                </form>
                <p id="selection-help">
                  Use os números na ordem atual. A seleção informada substitui a
                  anterior.
                </p>
                {rangeError && (
                  <p role="alert" className="range-error">
                    {rangeError}
                  </p>
                )}
                <div className="selection-readout">
                  <span>
                    {selected.size
                      ? `${selected.size} de ${pages.length} páginas selecionadas: ${formatPageSelection(selectedNumbers)}`
                      : 'Nenhuma página selecionada.'}
                  </span>
                  <button
                    className="text-button"
                    disabled={!selected.size || !!busy}
                    onClick={() => setSelected(new Set())}
                  >
                    Limpar seleção
                  </button>
                </div>
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
                  onClick={() =>
                    analyzedCount && candidates.length
                      ? setFilter(!filter)
                      : void runAnalysis()
                  }
                >
                  {analyzedCount && candidates.length
                    ? filter
                      ? 'Ver todas'
                      : 'Ver sugestões'
                    : analyzedCount
                      ? 'Analisar novamente'
                      : 'Analisar páginas'}
                </button>
              </div>
              <div className="grid-caption">
                <span>
                  {filter ? 'Sugestões para revisão' : 'Todas as páginas'}{' '}
                  <b>{shown.length}</b>
                </span>
                <span>Arraste para reorganizar</span>
              </div>
              <div className={`page-grid ${dragOver ? 'drag-over' : ''}`}>
                {shown.map((p) => {
                  const i = pages.findIndex((x) => x.id === p.id);
                  return (
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
                })}
                {!shown.length && (
                  <div className="no-results">
                    <Check size={28} />
                    <h3>Nenhuma página suspeita</h3>
                    <p>Execute a análise ou volte para todas as páginas.</p>
                  </div>
                )}
              </div>
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
              {busy &&
                (busy.includes('Analisando') ||
                  busy.includes('reconhecimento') ||
                  busy.startsWith('OCR')) && (
                  <button
                    className="text-button"
                    onClick={() => {
                      cancel.current = true;
                    }}
                  >
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
        <aside className="inspector">
          <span className="feature-label">
            <ScanLine size={18} /> DETECÇÃO INTELIGENTE
          </span>
          <h2>
            O branco tem
            <br />
            muitas formas.
          </h2>
          <p>
            Páginas vazias, pequenos detalhes ou um carimbo “EM BRANCO”.
            Encontre o que pode sair.
          </p>
          <div className="setting">
            <div>
              <strong>Reconhecer carimbos</strong>
              <span>Procura “EM BRANCO” em imagens.</span>
            </div>
            <Switch
              aria-label="Reconhecer carimbos com OCR"
              disabled={!!busy}
              checked={ocr}
              onCheckedChange={setOcr}
            />
          </div>
          <div className="setting">
            <div>
              <strong>Incluir pequenos detalhes</strong>
              <span>Mais sugestões para revisar.</span>
            </div>
            <Switch
              aria-label="Incluir páginas com pequenos detalhes"
              disabled={!!busy}
              checked={sensitive}
              onCheckedChange={setSensitive}
            />
          </div>
          <div className="setting">
            <div>
              <strong>Ignorar bordas de digitalização</strong>
              <span>Desconsidera os 3% externos da imagem.</span>
            </div>
            <Switch
              aria-label="Ignorar bordas de digitalização"
              disabled={!!busy}
              checked={ignoreBorders}
              onCheckedChange={setIgnoreBorders}
            />
          </div>
          <button
            className="primary analyze-button"
            disabled={!pages.length || !!busy}
            onClick={runAnalysis}
          >
            <ScanLine size={17} /> Analisar páginas
          </button>
          <p className="ocr-note">
            {ocr
              ? 'O OCR é baixado no primeiro uso. Seus PDFs continuam no dispositivo.'
              : 'Analisa imagem e texto do PDF. Ative o OCR para ler carimbos digitalizados.'}
          </p>
          {pages.some((p) => p.verdict) ? (
            <div className="results">
              <div className="results-heading">
                <span>SUGESTÕES</span>
                <strong>{candidates.length}</strong>
              </div>
              {(['blank', 'stamp', 'sparse'] as const).map((kind) => (
                <div className="result-row" key={kind}>
                  <span>{labels[kind]}</span>
                  <b>{pages.filter((p) => p.verdict?.kind === kind).length}</b>
                </div>
              ))}
              <button
                className="secondary full"
                onClick={() => setFilter(!filter)}
              >
                {filter ? 'Ver todas as páginas' : 'Revisar sugestões'}
              </button>
              <button
                className="text-button full"
                disabled={!candidates.length || !!busy}
                onClick={() => {
                  setSelected(new Set(candidates.map((p) => p.id)));
                  setFilter(true);
                }}
              >
                Selecionar sugestões
              </button>
              <p className="review-note">
                Confira cada página. Assinaturas, marcas leves e textos pequenos
                podem parecer vazios.
              </p>
            </div>
          ) : (
            <div className="analysis-step">
              <b>01—03</b>
              <div>
                <strong>Abra. Analise. Revise.</strong>
                <span>Você decide o que remover.</span>
              </div>
            </div>
          )}
          <div className="local-note">
            <ShieldCheck size={20} />
            <span>Seu documento é processado no seu dispositivo.</span>
          </div>
        </aside>
      </div>
      <footer>
        FEITO PARA DOCUMENTOS REAIS.<span>Organizar. Revisar. Resolver.</span>
      </footer>
      <Dialog
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
      >
        <DialogContent className="preview-dialog">
          <DialogTitle>{previewTitle}</DialogTitle>
          <DialogDescription>
            Confira o conteúdo antes de remover a página.
          </DialogDescription>
          {previewInfo && (
            <div className="preview-diagnostics">
              <strong>{labels[previewInfo.kind]}</strong>
              <p>{previewInfo.reason}</p>
              <p>
                Marcas visuais: {(previewInfo.ink * 100).toFixed(3)}% · OCR:{' '}
                {previewInfo.ocrStatus === 'done'
                  ? 'concluído'
                  : previewInfo.ocrStatus === 'failed'
                    ? 'falhou — confira manualmente'
                    : previewInfo.ocrStatus === 'disabled'
                      ? 'desativado'
                      : 'não necessário'}
              </p>
              {previewInfo.recognizedText && (
                <details>
                  <summary>Texto usado na análise</summary>
                  <pre>{previewInfo.recognizedText}</pre>
                </details>
              )}
            </div>
          )}
          <div className="preview-scroll">
            {previewBusy ? (
              <LoaderCircle className="spin" />
            ) : preview ? (
              <img src={preview} alt={previewTitle} />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
