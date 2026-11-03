'use client';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ScanLine } from 'lucide-react';
import type { EditorViewModel } from '../view-model/use-editor-view-model';
type Props = {
  model: Pick<
    EditorViewModel,
    | 'pages'
    | 'selected'
    | 'operation'
    | 'busy'
    | 'toolDialog'
    | 'setToolDialog'
    | 'splitEvery'
    | 'setSplitEvery'
    | 'rasterAccepted'
    | 'setRasterAccepted'
    | 'requestCancel'
    | 'splitPdf'
    | 'splitPdfEvery'
    | 'splitByBlankSeparators'
    | 'compressPdf'
  >;
};
export function ExportDialog({ model }: Props) {
  const {
    pages,
    selected,
    operation,
    busy,
    toolDialog,
    setToolDialog,
    splitEvery,
    setSplitEvery,
    rasterAccepted,
    setRasterAccepted,
    requestCancel,
    splitPdf,
    splitPdfEvery,
    splitByBlankSeparators,
    compressPdf,
  } = model;

  const detectedBlanksCount = pages.filter(
    (p) =>
      p.verdict?.kind === 'blank' ||
      (p.ink === 0 && !p.text && p.source !== null),
  ).length;
  return (
    <>
      {' '}
      <Dialog
        open={toolDialog !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setToolDialog(null);
        }}
      >
        <DialogContent className="tool-dialog">
          <DialogTitle>
            {toolDialog === 'split'
              ? 'Dividir PDF'
              : 'Comprimir PDF digitalizado'}
          </DialogTitle>
          <DialogDescription>
            {toolDialog === 'split'
              ? 'Exporte a seleção e o restante em arquivos separados. O documento aberto permanece intacto.'
              : 'Reduz imagens para 1200 px de largura com JPEG. O tamanho final depende do documento.'}
          </DialogDescription>
          {toolDialog === 'split' ? (
            <>
              <p>
                {selected.size} páginas selecionadas ·{' '}
                {pages.length - selected.size} restantes
              </p>
              <button
                className="primary"
                disabled={!!busy || !selected.size}
                onClick={() => void splitPdf(false)}
              >
                Baixar selecionadas
              </button>
              <button
                className="secondary"
                disabled={!!busy || pages.length === selected.size}
                onClick={() => void splitPdf(true)}
              >
                Baixar restantes
              </button>
              <div className="split-every">
                <label htmlFor="split-every-pages">
                  Dividir a cada
                  <Input
                    id="split-every-pages"
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    value={splitEvery}
                    disabled={!!busy || !pages.length}
                    onChange={(event) => setSplitEvery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void splitPdfEvery();
                    }}
                    aria-label="Quantidade de páginas por arquivo"
                  />
                  páginas
                </label>
                <button
                  className="secondary"
                  disabled={!!busy || !pages.length || !splitEvery}
                  onClick={() => void splitPdfEvery()}
                >
                  Baixar partes
                </button>
              </div>
              <div className="split-every">
                <button
                  className="secondary"
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
                  disabled={!!busy || !pages.length}
                  onClick={() => void splitByBlankSeparators()}
                  title="Detecta e separa blocos de documentos divididos por páginas em branco"
                >
                  <ScanLine size={16} /> Separar por folhas em branco ({detectedBlanksCount})
                </button>
              </div>
              <p className="tool-hint">
                Use os botões de pares/ímpares ou informe um intervalo no editor
                antes de dividir. Para partes iguais, escolha quantas páginas
                cada arquivo deve ter.
              </p>
            </>
          ) : (
            <>
              <p>
                Esta opção transforma as páginas em imagens: textos deixam de
                ser pesquisáveis ou selecionáveis, e links e formulários são
                removidos. É indicada para digitalizações.
              </p>
              <label className="check-label">
                <Checkbox
                  checked={rasterAccepted}
                  disabled={!!busy}
                  onCheckedChange={(v) => setRasterAccepted(!!v)}
                />{' '}
                Aceito gerar uma cópia em imagens com menor qualidade.
              </label>
              <button
                className="primary"
                disabled={!!busy || !rasterAccepted}
                onClick={() => void compressPdf()}
              >
                Comprimir e baixar
              </button>
            </>
          )}
          {busy && <p role="status">{busy}</p>}
          {operation === 'compress' && (
            <button className="secondary" onClick={requestCancel}>
              Cancelar após a página atual
            </button>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
