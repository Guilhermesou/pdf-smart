'use client';
import { Progress } from '@/components/ui/progress';
import { FileStack } from 'lucide-react';
import { labels } from './labels';
import type { EditorViewModel } from '../view-model/use-editor-view-model';
type Props = {
  model: Pick<
    EditorViewModel,
    'analysisProgress' | 'busy' | 'requestCancel' | 'setAnalysisProgress'
  >;
};
export function AnalysisProgressPanel({ model }: Props) {
  const { analysisProgress, busy, requestCancel, setAnalysisProgress } = model;
  return (
    <>
      {' '}
      {analysisProgress && (
        <section className="analysis-live" aria-label="Progresso da análise">
          <div className="live-thumb">
            {analysisProgress.page.thumb ? (
              <img
                src={analysisProgress.page.thumb}
                alt={`Página ${analysisProgress.current} em análise`}
              />
            ) : (
              <FileStack size={30} />
            )}
          </div>
          <div className="live-detail">
            <div className="live-heading">
              <strong>
                {busy
                  ? `Analisando imagem ${analysisProgress.current} de ${analysisProgress.total}`
                  : analysisProgress.completed === analysisProgress.total
                    ? 'Análise concluída'
                    : 'Análise interrompida'}
              </strong>
              <span>
                {analysisProgress.completed}/{analysisProgress.total} concluídas
                {analysisProgress.elapsedSeconds !== undefined &&
                  ` · ${Math.floor(analysisProgress.elapsedSeconds / 60)}min ${analysisProgress.elapsedSeconds % 60}s`}
                {!!analysisProgress.cachedPages &&
                  ` · ${analysisProgress.cachedPages} com leitura reaproveitada`}
              </span>
            </div>
            <Progress
              aria-label="Páginas concluídas"
              value={
                (analysisProgress.completed / analysisProgress.total) * 100
              }
            />
            <p>
              {analysisProgress.stage}
              {analysisProgress.pageProgress !== undefined &&
              analysisProgress.stage !== 'Concluída'
                ? ` · ${analysisProgress.pageProgress}% nesta etapa`
                : ''}
            </p>
            <details>
              <summary>
                Motor utilizado:{' '}
                {analysisProgress.ocrDiagnostics?.appleCalls
                  ? 'Apple Vision'
                  : analysisProgress.ocrDiagnostics?.tesseractCalls
                    ? 'Tesseract'
                    : 'nenhuma leitura OCR nova'}
                {!!analysisProgress.ocrDiagnostics?.appleCalls &&
                  !!analysisProgress.ocrDiagnostics?.tesseractCalls &&
                  ' + Tesseract (fallback)'}
              </summary>
              <p>
                Leituras, incluindo tentativas de rotação: Apple{' '}
                {analysisProgress.ocrDiagnostics?.appleCalls ?? 0} · Tesseract{' '}
                {analysisProgress.ocrDiagnostics?.tesseractCalls ?? 0}.
              </p>
              <p>
                Neural Engine solicitado em{' '}
                {analysisProgress.ocrDiagnostics?.neuralRequests ?? 0} leituras.
                Isso não mede o uso físico da NPU.
              </p>
              {analysisProgress.timings && (
                <p>
                  Renderização:{' '}
                  {(analysisProgress.timings.renderMs / 1000).toFixed(1)}s ·
                  Preparação do motor:{' '}
                  {(analysisProgress.timings.setupMs / 1000).toFixed(1)}s ·
                  Inspeção visual:{' '}
                  {(analysisProgress.timings.visualMs / 1000).toFixed(1)}s · OCR
                  e recortes:{' '}
                  {(analysisProgress.timings.ocrMs / 1000).toFixed(1)}s.
                </p>
              )}
              {!!analysisProgress.ocrDiagnostics?.appleCalls && (
                <p>
                  Dentro do tempo de OCR: processamento nativo{' '}
                  {(analysisProgress.ocrDiagnostics.appleMs / 1000).toFixed(1)}s
                  · preparação e comunicação{' '}
                  {(analysisProgress.ocrDiagnostics.transferMs / 1000).toFixed(
                    1,
                  )}
                  s.
                </p>
              )}
              {analysisProgress.ocrDiagnostics?.fallbackReason && (
                <p>
                  Motivo do fallback:{' '}
                  {analysisProgress.ocrDiagnostics.fallbackReason}
                </p>
              )}
            </details>
            <span className="live-result">
              {analysisProgress.page.verdict
                ? labels[analysisProgress.page.verdict.kind]
                : 'Os resultados aparecem nas miniaturas a cada página concluída.'}
            </span>
          </div>
          {busy ? (
            <button className="secondary" onClick={requestCancel}>
              Parar após esta imagem
            </button>
          ) : (
            <button
              className="text-button"
              onClick={() => setAnalysisProgress(null)}
            >
              Fechar
            </button>
          )}
        </section>
      )}
    </>
  );
}
