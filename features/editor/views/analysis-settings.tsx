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
    | 'numberingEnabled'
    | 'setNumberingEnabled'
    | 'numberingFormat'
    | 'setNumberingFormat'
    | 'numberingStart'
    | 'setNumberingStart'
    | 'watermarkEnabled'
    | 'setWatermarkEnabled'
    | 'watermarkText'
    | 'setWatermarkText'
    | 'watermarkColor'
    | 'setWatermarkColor'
    | 'watermarkOpacity'
    | 'setWatermarkOpacity'
    | 'normalizeA4Enabled'
    | 'setNormalizeA4Enabled'
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
    numberingEnabled,
    setNumberingEnabled,
    numberingFormat,
    setNumberingFormat,
    numberingStart,
    setNumberingStart,
    watermarkEnabled,
    setWatermarkEnabled,
    watermarkText,
    setWatermarkText,
    watermarkColor,
    setWatermarkColor,
    watermarkOpacity: _watermarkOpacity,
    setWatermarkOpacity: _setWatermarkOpacity,
    normalizeA4Enabled,
    setNormalizeA4Enabled,
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
          <div className="setting">
            <div>
              <strong>Numerar folhas ao exportar</strong>
              <span>Aplica chancelaria numerada (Fls. X) no topo direito.</span>
            </div>
            <Switch
              aria-label="Numerar folhas ao exportar"
              disabled={!!busy}
              checked={numberingEnabled}
              onCheckedChange={setNumberingEnabled}
            />
          </div>
          {numberingEnabled && (
            <div className="setting">
              <label htmlFor="numbering-format">Formato da numeração</label>
              <select
                id="numbering-format"
                disabled={!!busy}
                value={numberingFormat}
                onChange={(e) =>
                  setNumberingFormat(
                    e.target.value as 'fls' | 'page_of_total' | 'simple',
                  )
                }
              >
                <option value="fls">Fls. 1, Fls. 2… (Processos)</option>
                <option value="page_of_total">Pág. 1 de N</option>
                <option value="simple">1, 2, 3… (Apenas número)</option>
              </select>
            </div>
          )}
          {numberingEnabled && (
            <div className="setting">
              <label htmlFor="numbering-start">Começar no número</label>
              <input
                id="numbering-start"
                type="number"
                min="1"
                disabled={!!busy}
                value={numberingStart}
                onChange={(e) => setNumberingStart(e.target.value)}
                style={{ width: '80px', padding: '4px 8px' }}
              />
            </div>
          )}
          <div className="setting">
            <div>
              <strong>Marca d’água ao exportar</strong>
              <span>Estampa texto diagonal translúcido nas páginas.</span>
            </div>
            <Switch
              aria-label="Marca d'água ao exportar"
              disabled={!!busy}
              checked={watermarkEnabled}
              onCheckedChange={setWatermarkEnabled}
            />
          </div>
          {watermarkEnabled && (
            <div className="setting">
              <label htmlFor="watermark-text">Texto da marca d’água</label>
              <input
                id="watermark-text"
                type="text"
                disabled={!!busy}
                value={watermarkText}
                onChange={(e) => setWatermarkText(e.target.value)}
                placeholder="Ex.: CONFIDENCIAL"
                style={{ width: '160px', padding: '4px 8px' }}
              />
            </div>
          )}
          {watermarkEnabled && (
            <div className="setting">
              <label htmlFor="watermark-color">Cor da marca</label>
              <select
                id="watermark-color"
                disabled={!!busy}
                value={watermarkColor}
                onChange={(e) =>
                  setWatermarkColor(e.target.value as 'gray' | 'red')
                }
              >
                <option value="gray">Cinza discreto</option>
                <option value="red">Vermelho de alerta</option>
              </select>
            </div>
          )}
          <div className="setting">
            <div>
              <strong>Padronizar páginas em A4</strong>
              <span>Ajusta páginas de tamanhos variados ao padrão A4.</span>
            </div>
            <Switch
              aria-label="Padronizar páginas em A4"
              disabled={!!busy}
              checked={normalizeA4Enabled}
              onCheckedChange={setNormalizeA4Enabled}
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
