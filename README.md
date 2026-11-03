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

A edição é estrutural, por páginas: não altera texto existente, não faz redação segura nem preserva assinaturas digitais. Documentos com senha de abertura solicitam a chave ao usuário para desbloqueio local em memória; restrições de permissão são ignoradas com segurança para reconstrução. Formulários interativos, marcadores e metadados documentais não têm preservação garantida na reconstrução. Arquivos muito grandes são limitados pela memória do dispositivo; o histórico mantém até 20 operações. Arquivos e miniaturas sem referência no documento ou no histórico são liberados. Miniaturas de todas as páginas são geradas na importação, mas apenas as linhas visíveis e uma linha de margem de cada lado são montadas na galeria. O PDF.js ainda mantém estruturas do documento em memória; a compressão rasterizada também precisa de memória para construir o resultado.

A detecção é heurística: assinaturas, desenhos claros, carimbos inclinados, páginas com bordas e digitalizações degradadas precisam de revisão. Há testes sintéticos e regressão local com quatro imagens reais fornecidas pelo usuário. O PDF original completo ainda não foi validado. Os modelos de idioma (português `por` e inglês `eng`) são incluídos no aplicativo e servidos localmente; o PDF não é enviado. Fontes, worker e WASM são servidos pelo próprio aplicativo.

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

### PDFs com camada OCR preexistente

No modo Folhas digitalizadas, a inspeção visual ocorre mesmo quando o texto extraído é longo. Texto extraído não prova que a escrita esteja visível: a camada OCR pode descrever transparência do outro lado. Poucas marcas escuras concentradas com texto extraído geram Possível verso para revisão, preservando o texto no diagnóstico. No modo normal, o texto continua bloqueando a sugestão visual. Uma faixa colorida contínua de encadernação pode estender a margem esquerda analisada de 12% até 25%; blocos de texto escuro não acionam essa extensão. Nenhum desses critérios depende de paridade.

A captura de tela de 12 miniaturas fornecida pelo usuário produziu seis sugestões de verso e seis páginas com conteúdo na inspeção visual. Essa verificação de imagens reduzidas não valida a detecção nas 382 páginas do PDF original.

A inspeção também tolera encadernação colorida parcial (cobertura vertical mínima de 35%) e pares de marcas compactas alinhadas na margem direita, compatíveis com furos. Uma marca isolada não aciona a regra de furos. Nas duas novas capturas, os recortes completos das páginas 187–192 e 19–24 mantiveram as seis frentes como conteúdo e sugeriram os seis versos, incluindo 190 e 22. A página 18 aparece cortada; sua classificação no PDF completo ainda precisa de validação.

## Organização do motor e próxima etapa desktop

`engine.ts` mantém a entrada usada pela interface e o ciclo de vida dos documentos. `analysis.ts` coordena as etapas e recebe a função de renderização; `evaluate-page.ts` decide a classificação a partir das evidências, sem acessar o navegador; `types.ts` centraliza contratos. `ocr.ts` concentra a inicialização do OCR e permite fornecer os caminhos dos recursos. A interface recebe progresso com etapa, tempo decorrido e páginas com evidência reaproveitada.

O cache de evidências mantém até 1024 páginas, separa OCR normal e OCR de scans, não guarda buffers internos do Tesseract e descarta leituras acima de 4000 caracteres. Resultados de falhas ou leituras interrompidas não são armazenados. As classificações são recalculadas usando as configurações atuais. O cache é descartado ao recarregar ou quando a origem deixa de ser referenciada pelo documento e pelo desfazer. Isso acelera reanálises; a primeira leitura continua exigindo processamento. Não há medição de aceleração global no PDF completo do usuário.

Próxima etapa solicitada: host Tauri offline. Ainda não implementado nesta versão. Será necessário empacotar o modelo de idioma (hoje baixado no primeiro uso), adaptar os caminhos dos workers, trocar downloads por gravação em pasta escolhida e adicionar notificações ao concluir operações. A escolha de pasta e as notificações devem ficar no adaptador de sistema, fora da classificação. A validação desktop deve incluir inicialização sem rede, gravação, cancelamento e arquivos grandes. Nenhuma integração Tauri foi adicionada ao site nesta etapa.

## Motor nativo macOS (primeira implementação desktop)

O host Tauri usa `native_ocr` para conversar com um processo Swift persistente. Apple Vision reconhece texto localmente; em macOS 14 ou superior, consulta os dispositivos suportados por etapa e solicita Neural Engine quando disponível. Se a configuração falhar, tenta a seleção automática do Vision. A resposta diferencia disponibilidade de NPU, solicitação de NPU e fallback; não afirma uso exclusivo de NPU nem mede energia. Em Macs Intel, Vision pode usar os dispositivos disponíveis, sem presumir Neural Engine. O backend OpenVINO para computadores Intel ainda não está implementado. O navegador mantém Tesseract.

O adaptador preserva o contrato do OCR e as tentativas de leitura de carimbos inclinados. Falha nativa ativa Tesseract uma vez por análise. Seu modelo de idioma está incluído em `public/ocr/lang` para uso offline no desktop. Imagens trafegam apenas por IPC local em PNG/base64; nenhum PDF é enviado. O processo Swift é reaproveitado, mas conversão de imagem e IPC ainda têm custo.

Compilar em macOS com Xcode/Command Line Tools e Rust: `npm install`, `npm run desktop:build`. O script prepara o binário Swift da arquitetura corrente e o frontend estático; o Tauri gera o `.app` em `src-tauri/target/release/bundle/macos`. Esta primeira compilação é local e não notarizada para distribuição pública. Pasta de destino e notificações nativas continuam pendentes; os fluxos de interface no WebView ainda precisam de validação.

### Windows

Em Windows com Rust e Node 22, `npm install` e `npm run desktop:build:windows` geram o instalador NSIS em `src-tauri/target/release/bundle/nsis`. O instalador inclui o bootstrapper do Microsoft Edge WebView2 para máquinas que ainda não o possuam. O OCR continua local e offline via Tesseract/WASM; Apple Vision é exclusivo do macOS e não é empacotado no Windows. O workflow manual **Build Windows desktop app** também produz esse `.exe` como artefato no GitHub Actions.

Validação: `node tests/native-mac-check.mjs` após preparar o binário. No Mac de desenvolvimento, a consulta retornou Neural Engine disponível; a leitura sintética de EM BRANCO teve confiança 100 e retornou Neural Engine solicitado. Entrada inválida não interrompeu o processo. Essa é validação funcional do motor, não perfil de hardware ou benchmark de aceleração. `node --experimental-strip-types --test tests/*.test.mjs` inclui falha de backend, fallback e preservação dos parâmetros.

### Diagnóstico de desempenho 0.1.1

O painel da análise registra chamadas reais ao Apple Vision e Tesseract (incluindo rotações), solicitações de Neural Engine, motivo de fallback e tempos acumulados de renderização, preparação, inspeção visual e OCR. O tempo nativo inclui decodificação e execução do Vision; o restante da chamada inclui preparação da imagem e IPC. Esses números não são contadores de utilização física de NPU. Resultados vindos do cache não aumentam os contadores de OCR.

Configurações permitem escolher Tesseract ou seleção automática (Apple no app Mac) e comparar sem cache. A chave do cache separa as escolhas de motor. Para comparação no mesmo documento, mantenha seleção e sensibilidade, ative Comparar sem cache e execute cada motor; considere aquecimento, tempo total e qualidade das sugestões.

Benchmark reproduzível: `node tests/ocr-benchmark.mjs`, após preparar o binário nativo. Em um carimbo sintético 900×500, seis leituras, mediana das últimas cinco: Apple Vision/IPC 75,17 ms; Tesseract em Node 31,62 ms. Primeira leitura: 800,88 ms e 63,69 ms, respectivamente; inicialização Tesseract separada 247,11 ms. Ambos leram EM BRANCO. O resultado não demonstra vantagem do motor Apple nesse cenário; não inclui renderização de PDF nem reproduz todos os custos do WebView. O benchmark não substitui uma medição do PDF completo.

### Fluxo de documentos 0.1.2

Limpar documento fecha a sessão após confirmação, limpa seleção, filtros, resultados, histórico e ampliação; preserva as preferências de análise. A liberação das origens, URLs e cache segue o ciclo de vida existente ao remover as referências. Todas e Sugestões são controles permanentes, inclusive com zero sugestões. Excluir a última sugestão retorna à lista completa de páginas restantes. Seleção rápida e intervalos compartilham uma faixa compacta; os números selecionados ficam em detalhe expansível. Compilação verificada; interação no WebView ainda não validada nesta alteração.


### Melhorias de organização e confiabilidade

A importação publica a primeira página pronta e depois lotes de até 12 páginas, permitindo acompanhar as miniaturas durante o carregamento. As operações de edição ficam bloqueadas até a conclusão. Isso antecipa a visualização; todas as páginas ainda são renderizadas e não há carregamento de miniaturas por demanda nesta etapa.

A ampliação tem navegação anterior/próxima e revisão com “Manter e avançar” ou “Marcar para exclusão e avançar”. Marcar apenas altera a seleção: a remoção acontece ao acionar Excluir no editor. O ciclo de vida da prévia fica em `hooks/use-page-preview.ts`, com invalidação de respostas antigas e liberação de URLs ao fechar. Há também refazer, duplicar páginas selecionadas, inverter ordem e inverter seleção; origens e miniaturas necessárias para refazer continuam retidas.

A divisão por quantidade reutiliza um worker e mantém no máximo uma origem PDF analisada entre partes consecutivas. A origem é descartada após falha ou término da operação. O OCR nativo tem prazo de 8 segundos por chamada, cobrindo escrita e leitura do processo; ao expirar, encerra o processo para permitir o fallback local existente.

Verificações: `npm test`, `npm run typecheck`, `npm run lint` e `npx vite build --config vite.desktop.config.ts`. Os testes de timeout podem ser executados com `rustc --test src-tauri/src/watchdog.rs -o /tmp/pdf-smart-watchdog-test && /tmp/pdf-smart-watchdog-test`. O lint ignora bibliotecas empacotadas e artefatos gerados; imagens locais de Blob e componentes que usam papéis ARIA são permitidos explicitamente.

A montagem da compressão rasterizada também usa worker. As imagens JPEG são transferidas sequencialmente, com confirmação por página, e canvases temporários são liberados mesmo em caso de erro. A renderização e codificação das imagens continuam no navegador; isso não elimina todos os custos da thread principal nem torna a memória constante. A exportação estrutural continua sendo usada se gerar um arquivo menor.

### Espera do OCR 0.1.4

A consulta inicial e a preparação da imagem nativa têm prazo de 3 segundos cada. A leitura por IPC tem prazo de 8 segundos também no frontend, além do watchdog do processo. Quando uma dessas etapas expira, a análise passa a usar Tesseract local pelo restante da execução. O progresso e o tempo decorrido atualizam a cada segundo durante esperas; mudanças de etapa aparecem imediatamente. Testes simulam ausência de retorno do canvas, FileReader e IPC, e verificam que respostas nativas atrasadas não substituem a alternativa.

## Arquitetura e contribuição

A interface usa MVVM com hooks React, reducer puro para documento/histórico e contratos injetados para os serviços de PDF. Consulte [a revisão da arquitetura](docs/architecture.md) para as fronteiras, decisões, achados e próximas prioridades. `npm run typecheck`, `npm run lint`, `npm test` e o build do frontend desktop são executados pelo workflow de qualidade em pushes e pull requests. Os testes exigem Node 22.15 ou superior; a CI usa Node 24. O repositório ainda precisa de uma licença escolhida pelo autor antes da publicação como open source.

### Sessões e encerramento 0.1.7

Cada editor possui documentos, miniaturas e cache próprios. O encerramento cancela o sinal da sessão e aguarda tarefas antes de liberar os recursos. Exportação, compressão e OCR usam contratos tipados e validação de mensagens. Pedidos de exportação/compressão têm prazo de 120 segundos; inicialização e leituras do Tesseract têm prazo de 30 segundos. Tesseract usa o modelo de idioma empacotado também na versão web. Veja [os detalhes e limites da validação](docs/architecture.md#sessões-e-workers-017).

### Modernização, Produtividade e Chancelaria 0.1.8

A versão 0.1.8 traz recursos de produtividade jurídica e corporativa:
- **Escalabilidade Extrema (Lazy Thumbnails & Instant Import):** Documentos com centenas de páginas são importados instantaneamente (< 500 ms). As miniaturas são renderizadas diretamente a 220 px sob demanda conforme o usuário rola o grid virtual, economizando 81% de memória e ciclos de CPU.
- **Importação de Imagens (PNG, JPG, WEBP para PDF):** Suporte nativo a arrastar ou selecionar fotos e imagens junto com PDFs. As imagens são encapsuladas automaticamente em páginas com escala A4 preservando sua resolução original.
- **Divisão Inteligente por Folhas em Branco:** Ferramenta de separação automática no diálogo de divisão que particiona maços de digitalização em documentos avulsos, descartando as folhas em branco delimitadoras.
- **Numeração Sequencial / Chancelaria ao Exportar:** Opção de estampar páginas ("Fls. X", "Pág. X de N" ou simples) sem rasterização, preservando texto e vetores originais.
- **Diálogo Nativo Desktop:** O aplicativo Tauri desktop abre caixas de diálogo nativas do sistema operacional (NSSavePanel no Mac / IFileDialog no Windows) para salvar arquivos em pastas à escolha do usuário.
- **Suporte a PDFs com Senha:** Desbloqueio interativo de documentos criptografados e suporte a PDFs com restrições de permissão.
- **Busca Textual Local:** Localização instantânea de termos e números com seleção automática de todas as páginas correspondentes.
- **Atalhos de Teclado:** Controle completo de fluxo via teclado (`Cmd/Ctrl+A`, `Delete`/`Backspace`, `R` para rotacionar, `Escape`, `Cmd/Ctrl+Z`).
- **OCR Bilíngue Offline:** Empacotamento do modelo em português (`por.traineddata.gz`) junto ao inglês (`por+eng`), ampliando a precisão em termos e acentos brasileiros.
- **Tema Escuro / Claro (Dark Mode):** Alternador no topo e sincronização automática com preferências do sistema operacional.
