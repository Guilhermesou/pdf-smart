# PDF Smart

Editor de páginas de PDF em português. Importa e mescla arquivos, insere páginas vazias, reorganiza por arraste ou botões, gira, remove, desfaz e exporta. O processamento dos documentos é local, em memória do navegador.

## Stack e desempenho

React + TypeScript/Vinext para interface, PDF.js para leitura/renderização (parser em worker), pdf-lib em Web Worker para exportação sem rasterização, Tesseract.js/WASM para OCR sob demanda. Os módulos pesados são carregados sob demanda. Números e intervalos (por exemplo 1, 3, 5–10) selecionam páginas pela ordem atual, com validação integral e lista visível. Um único worker OCR é reaproveitado durante cada análise. A renderização é sequencial e limitada a 500 px para métricas visuais; miniaturas são reduzidas para 220 px e armazenadas como URLs de Blob; OCR usa 1500 px em páginas esparsas com pouco texto extraível, incluindo numeração. Não existe benchmark comparativo que prove ser a stack mais rápida em todos os cenários.

A heurística estima o fundo do scan, mede proporção de pixels escuros e cruza com texto extraído. Carimbo isolado EM BRANCO com baixa cobertura é uma sugestão separada; numeração isolada é separada do conteúdo. Carimbos com resíduo curto são sugestões de revisão, não páginas certamente vazias. A opção de desconsiderar os 3% externos evita bordas de scanner; páginas com marcas nas bordas sempre exigem revisão. O motivo, o texto reconhecido e a situação do OCR ficam disponíveis na ampliação. A sensibilidade amplia o limiar de marcas esparsas. Nenhuma página é removida automaticamente. OCR falho é informado.

## Desenvolvimento

- `npm install`
- `npm run dev`
- `npm run build`
- `npx tsc --noEmit`
- `node --experimental-strip-types --test tests/*.test.mjs`
- `node --experimental-strip-types tests/ocr-check.mjs` (requer download do modelo OCR e o pacote opcional @napi-rs/canvas)

## Limites desta versão

A edição é estrutural, por páginas: não altera texto existente, não faz redação segura nem preserva assinaturas digitais. Documentos criptografados não são aceitos. Formulários interativos, marcadores e metadados documentais não têm preservação garantida na reconstrução. Arquivos muito grandes são limitados pela memória do dispositivo; o histórico mantém até 20 operações. Arquivos e miniaturas sem referência no documento ou no histórico são liberados. Miniaturas de todas as páginas são geradas na importação, mas apenas as linhas visíveis e uma linha de margem de cada lado são montadas na galeria. O PDF.js ainda mantém estruturas do documento em memória; a compressão rasterizada também precisa de memória para construir o resultado.

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

## Progresso e uso de memória

A análise mostra a miniatura atual, a etapa, o progresso do OCR e o total concluído, aplicando cada resultado assim que fica pronto. A exportação permite que o navegador pinte o estado ocupado antes de preparar a operação, bloqueia cliques repetidos e informa leitura, montagem e finalização. O worker recebe referências mínimas das páginas e handles de File/Blob, sem copiar miniaturas, texto OCR ou todo o buffer do PDF na thread da interface. Páginas de cada origem são copiadas em lote para compartilhar fontes e imagens.

A análise de scans acumula momentos e limites em buffers por região, sem criar um par de coordenadas JavaScript para cada pixel escuro. Canvas temporários e URLs de ampliação são liberados após o uso. Isso reduz alocações, mas não garante memória constante nem ausência de pausas em qualquer dispositivo.

Validação: 18 testes automatizados incluem transporte, janela virtual, retenção do desfazer, descarte de recursos e compartilhamento de fontes na exportação. As quatro imagens reais mantiveram a classificação anterior após a otimização. O benchmark `node --expose-gc --experimental-strip-types tests/transport-benchmark.mjs`, com fixture sintética de 64 MiB e 600 registros, mediu mediana de structuredClone de 20,06 ms para o payload antigo e 0,35 ms para o novo. Isso mede apenas transporte no Node, não tempo total de exportação ou memória no navegador. A redução de dimensões da miniatura corresponde a cerca de 81% menos pixels por imagem, sem representar uma medição da memória total da aplicação.
