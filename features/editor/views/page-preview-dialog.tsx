'use client';
import { ArrowLeft, ArrowRight, LoaderCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { labels } from './labels';
import type { EditorViewModel } from '../view-model/use-editor-view-model';
type Props = {
  model: Pick<
    EditorViewModel,
    | 'selected'
    | 'busy'
    | 'filter'
    | 'previewPageId'
    | 'preview'
    | 'previewInfo'
    | 'previewTitle'
    | 'previewBusy'
    | 'closePreview'
    | 'reviewPages'
    | 'reviewIndex'
    | 'navigatePreview'
    | 'reviewPage'
  >;
};
export function PagePreviewDialog({ model }: Props) {
  const {
    selected,
    busy,
    filter,
    previewPageId,
    preview,
    previewInfo,
    previewTitle,
    previewBusy,
    closePreview,
    reviewPages,
    reviewIndex,
    navigatePreview,
    reviewPage,
  } = model;
  return (
    <>
      {' '}
      <Dialog
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open) closePreview();
        }}
      >
        <DialogContent className="preview-dialog">
          <DialogTitle>{previewTitle}</DialogTitle>
          <DialogDescription>
            Confira o conteúdo antes de remover a página.
          </DialogDescription>
          <div className="review-controls">
            <button
              className="secondary"
              disabled={reviewIndex <= 0}
              onClick={() => navigatePreview(-1)}
            >
              <ArrowLeft size={16} /> Anterior
            </button>
            <span>
              {reviewIndex + 1} de {reviewPages.length}
              {filter ? ' sugestões' : ' páginas'}
            </span>
            <button
              className="secondary"
              disabled={
                reviewIndex < 0 || reviewIndex >= reviewPages.length - 1
              }
              onClick={() => navigatePreview(1)}
            >
              Próxima <ArrowRight size={16} />
            </button>
          </div>
          <div className="review-controls">
            <button
              className="secondary"
              disabled={!!busy || previewBusy}
              onClick={() => reviewPage(false)}
            >
              Manter e avançar
            </button>
            <button
              className="secondary"
              disabled={!!busy || previewBusy}
              onClick={() => reviewPage(true)}
            >
              Marcar para exclusão e avançar
            </button>
            {previewPageId && selected.has(previewPageId) && (
              <span>Selecionada para exclusão</span>
            )}
          </div>
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
              {previewInfo.paleInk !== undefined && (
                <p>
                  Marcas claras: {(previewInfo.paleInk * 100).toFixed(2)}% ·
                  Traços escuros:{' '}
                  {((previewInfo.darkInk ?? 0) * 100).toFixed(2)}%. A
                  classificação não depende de ser página par ou ímpar.
                </p>
              )}
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
    </>
  );
}
