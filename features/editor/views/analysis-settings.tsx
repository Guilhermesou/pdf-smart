'use client';
import { ShieldCheck, ScanLine } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import type { EditorViewModel } from '../view-model/use-editor-view-model';
type Props = {
  model: Pick<
    EditorViewModel,
    | 'pages'
    | 'busy'
    | 'ocr'
    | 'setOcr'
    | 'sensitive'
    | 'setSensitive'
    | 'ignoreBorders'
    | 'setIgnoreBorders'
    | 'scanMode'
    | 'setScanMode'
    | 'ocrEngine'
    | 'setOcrEngine'
    | 'bypassCache'
    | 'setBypassCache'
    | 'settingsOpen'
    | 'setSettingsOpen'
    | 'runAnalysis'
  >;
};
export function AnalysisSettings({ model }: Props) {
  const {
    pages,
    busy,
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
  } = model;
  return (
    <>
      {' '}
      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent className="settings-sheet">
          <SheetTitle>Configurações de análise</SheetTitle>
          <SheetDescription>
            Ajuste a detecção. Nenhuma página é removida automaticamente.
          </SheetDescription>
          <div className="setting">
            <label htmlFor="ocr-engine">Motor de OCR</label>
            <select
              id="ocr-engine"
              disabled={!!busy}
              value={ocrEngine}
              onChange={(e) =>
                setOcrEngine(e.target.value as 'auto' | 'tesseract')
              }
            >
              <option value="auto">Automático (Apple Vision no app Mac)</option>
              <option value="tesseract">Tesseract — comparação</option>
            </select>
          </div>
          <div className="setting">
            <div>
              <strong>Comparar sem cache</strong>
              <span>
                Refaz as leituras. Use a mesma seleção e configurações nos dois
                motores; compare também as sugestões.
              </span>
            </div>
            <Switch
              checked={bypassCache}
              onCheckedChange={setBypassCache}
              disabled={!!busy}
              aria-label="Comparar sem cache"
            />
          </div>
          <div className="setting">
            <div>
              <strong>Folhas digitalizadas</strong>
              <span>
                Confere a imagem mesmo quando o PDF já tem texto de OCR.
                Carimbos, furos e transparência da frente geram sugestões para
                revisão.
              </span>
            </div>
            <Switch
              checked={scanMode}
              onCheckedChange={setScanMode}
              disabled={!!busy}
              aria-label="Analisar folhas digitalizadas"
            />
          </div>
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
              ? 'O modelo de OCR está incluído no aplicativo. Seus PDFs continuam no dispositivo.'
              : 'Analisa imagem e texto do PDF. Ative o OCR para ler carimbos digitalizados.'}
          </p>
          <div className="local-note">
            <ShieldCheck size={20} />
            <span>Seu documento é processado no seu dispositivo.</span>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
