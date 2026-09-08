# PDF Smart

Editor de páginas de PDF em português. Importa e mescla arquivos, insere páginas vazias, reorganiza por arraste ou botões, gira, remove, desfaz e exporta. O processamento dos documentos é local, em memória do navegador.

## Stack e desempenho

React + TypeScript/Vinext para interface, PDF.js para leitura/renderização (parser em worker), pdf-lib em Web Worker para exportação sem rasterização, Tesseract.js/WASM para OCR sob demanda. Os módulos pesados são carregados sob demanda. Números e intervalos (por exemplo 1, 3, 5–10) selecionam páginas pela ordem atual, com validação integral e lista visível. Um único worker OCR é reaproveitado durante cada análise. A renderização é sequencial e limitada a 500 px para miniaturas; OCR usa 1500 px em páginas esparsas com pouco texto extraível, incluindo numeração. Não existe benchmark comparativo que prove ser a stack mais rápida em todos os cenários.

A heurística estima o fundo do scan, mede proporção de pixels escuros e cruza com texto extraído. Carimbo isolado EM BRANCO com baixa cobertura é uma sugestão separada; numeração isolada é separada do conteúdo. Carimbos com resíduo curto são sugestões de revisão, não páginas certamente vazias. A opção de desconsiderar os 3% externos evita bordas de scanner; páginas com marcas nas bordas sempre exigem revisão. O motivo, o texto reconhecido e a situação do OCR ficam disponíveis na ampliação. A sensibilidade amplia o limiar de marcas esparsas. Nenhuma página é removida automaticamente. OCR falho é informado.

## Desenvolvimento

- `npm install`
- `npm run dev`
- `npm run build`
- `npx tsc --noEmit`
- `node --experimental-strip-types --test tests/*.test.mjs`
- `node --experimental-strip-types tests/ocr-check.mjs` (requer download do modelo OCR e o pacote opcional @napi-rs/canvas)

## Limites desta versão

A edição é estrutural, por páginas: não altera texto existente, não faz redação segura nem preserva assinaturas digitais. Documentos criptografados não são aceitos. Formulários interativos, marcadores e metadados documentais não têm preservação garantida na reconstrução. Arquivos muito grandes são limitados pela memória do dispositivo; fontes e histórico (20 operações) permanecem em memória até fechar/recarregar a aba. Miniaturas de todas as páginas são geradas na importação.

A detecção é heurística: assinaturas, desenhos claros, carimbos inclinados, páginas com bordas e digitalizações degradadas precisam de revisão. Há testes sintéticos e regressão local com quatro imagens reais fornecidas pelo usuário. O PDF original completo ainda não foi validado. O modelo de idioma é baixado de tessdata.projectnaptha.com no primeiro uso; o PDF não é enviado. Fontes, worker e WASM são servidos pelo próprio aplicativo.

A aplicação expõe a ferramenta WebMCP somente de leitura `read_pdf_pages` quando o navegador suporta document.modelContext. Esse contrato não foi validado em um navegador com WebMCP disponível. A compilação, os testes automatizados de classificação/exportação e o teste OCR são separados de testes de interação do navegador, que não foram executados.

## Ferramentas e digitalizações

A área do editor usa toda a largura, com detecção em um painel fechado de Configurações. Seleção rápida de pares/ímpares usa índices atuais começando em 1. Juntar adiciona PDFs ao documento; Dividir exporta a seleção e as páginas restantes em downloads separados. Comprimir gera, com confirmação explícita, uma cópia rasterizada a 1200 px com JPEG 65%, removendo camadas de texto, links e formulários. Se a cópia ficar maior, a exportação estrutural é mantida.

O modo Folhas digitalizadas procura uma região escura isolada após desconsiderar faixa lateral de encadernação e marcas muito claras do verso. Tenta ler essa região em até oito orientações, reaproveitando o worker. Uma leitura inconclusiva de poucas marcas gera apenas sugestão para revisão. Isso pode incluir assinaturas e não é uma garantia de ausência de conteúdo.

Validação adicional: `node --experimental-strip-types tests/scan-ocr-check.mjs` reproduz carimbo inclinado, encadernação e texto do verso com uma imagem sintética. A regressão com quatro novas imagens reais reconheceu todas como sugestões: duas com leitura de EM BRANCO e duas por indícios de transparência. Isso não mede a taxa de falsos positivos em documentos desconhecidos; o PDF original completo não foi validado.

### Transparência da frente

Pequenos pontos afastados do carimbo não devem aumentar artificialmente a área de conteúdo: a análise agrupa traços próximos, tolerando manchas isoladas apenas quando representam menos de 10% dos pixels escuros e menos de 0,025% da área examinada. Outros blocos relevantes de escrita continuam participando da classificação. A direção predominante do carimbo orienta as tentativas de OCR; tons intermediários são preservados na leitura para não apagar letras falhadas.

A categoria Possível verso indica predominância de marcas claras com poucos traços escuros concentrados. É uma sugestão para revisão, não confirmação de que a folha esteja vazia ou prova de espelhamento. Não depende de posição par/ímpar. Conteúdo realmente desbotado pode ter aparência semelhante.

Regressão privada: `node --experimental-strip-types tests/scan-examples.mjs /caminho/manifest.json --assert`. O manifesto é uma lista de objetos com `path` (imagem local) e `crop` ([x, y, largura, altura] da folha, sem a interface do visualizador). As imagens e manifestos do usuário permanecem fora do repositório.
