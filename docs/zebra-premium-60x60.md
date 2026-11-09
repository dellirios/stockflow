# Layout Zebra aprovado — StockFlow Pro

Status: **PADRÃO APROVADO PARA USO** pelo usuário em 09/11/2026, após testes físicos e aprovação de uma etiqueta real com o QR ampliado. Preservar este desenho nas próximas alterações, salvo nova solicitação explícita.

## Ambiente e escopo

- Agente de impressão: /home/stockflow/stockflow na instalação piloto.
- Serviço: stockflow.service.
- Impressora física validada: Zebra ZD220, 203 dpi, transferência térmica, escuridão 15.
- Formato nominal: 60 × 60 mm; ZPL nativo ^PW480 e ^LL480.
- Compatibilidade de geração também para GC420t; não houve teste físico nesse modelo.
- Referência visual original: etiqueta.png fornecida pelo usuário.
- Dados reais, datas, peso, código de retirada, consultas, confirmações e transmissão CUPS/RAW continuam no fluxo existente. Os exemplos abaixo são apenas testes.

## Desenho final aprovado

- Fundo branco, **sem moldura externa**.
- Fonte 0 nativa (^A0), com ^CI28 e escape ^FH_ para os dados.
- Produto em destaque, centralizado, com quebra e altura adaptativas.
- Grade em duas colunas: Grupo / Conservação; Peso / SIF-Lote; Data de entrada / Validade; Local armazenado / Responsável.
- Os oito cards principais usam contorno ^GB de **3 dots**, com arredondamento existente. As faixas pretas superiores e os textos brancos ^FR mantêm as dimensões anteriores.
- Fornecedor em largura completa: contorno **1 dot**, inalterado.
- Datas Val/Fab do fornecedor: fonte 16, posição 4 dots abaixo do fim do card; deslocamento final de +2 dots em relação à revisão anterior.
- Divisória acima da empresa: x=18, y=327, largura 279, espessura **3 dots**.
- Nome do estabelecimento: x=18, y=333, deslocamento final de +3 dots; fonte adaptativa até 26, mínimo 16, até três linhas.
- CNPJ: fonte 20, posição vertical min(330 + alturaEmpresa + 5, inicioCodigo - 24), para acompanhar a empresa sem cruzar a divisória.
- Divisória abaixo do CNPJ: x=18, y=inicioCodigo-4, largura 279, espessura **3 dots**.
- Divisória vertical do rodapé: x=305, y=308, largura/espessura **3 dots**, altura 154.
- Código de retirada à esquerda, com faixa preta própria e contorno **1 dot**, sem alteração.

## QR final aprovado

- Conteúdo continua sendo o id_produto dinâmico, sem substituições.
- Model 2, ECC L, modo byte manual; ZPL ^BQN,2,6,L,7 para o QR usual de versão 1.
- Revisão final: módulos de **5 para 6 dots**, símbolo de **105 para 126 dots**, aumento de **20%** em cada dimensão.
- Centro preservado com arredondamento máximo de meio dot: origem ZPL final x=323, y=316 para versão 1.
- Essa saída é exatamente a do teste físico aprovado, trabalho CUPS 20. Nenhum elemento ao redor foi deslocado para essa ampliação.
- Para conteúdos mais longos que exigem versões superiores, permanece o dimensionamento anterior do gerador compartilhado; não se força módulo 6 em todos os códigos.

**Limitação conhecida:** a margem teórica de quatro módulos da versão 1 ampliada é de 24 dots por lado (área total de 174 × 174). Essa área branca ideal alcança a divisória do rodapé e ultrapassa a margem interna conservadora do desenho. Não se afirma que há quatro módulos brancos livres em todos os lados. O desenho impresso foi aprovado pelo operador; a validação geométrica do gerador verifica o símbolo, não toda essa margem teórica. Se houver dificuldade de leitura em outra câmera, mídia ou impressora, voltar ao módulo 5 ou revisar o espaço do rodapé. Não ampliar novamente sem novo teste físico.

## Adaptação dos textos

1. O produto tenta uma linha, fonte 36 até 28 dots; depois até três linhas, fonte 28 até 20 dots.
2. A grade começa após a altura efetivamente usada pelo produto.
3. A altura de cada linha considera o maior texto entre as duas colunas.
4. Perfis compactam primeiro espaços e elementos decorativos e depois os tetos das fontes secundárias.
5. Os conteúdos são preservados, sem truncamento silencioso. Casos impossíveis de acomodar falham explicitamente.
6. Limites e colisões dos textos e do símbolo QR continuam validados; a exceção da margem branca ampliada está descrita acima.

## Validações e aprovação

- Testes de nomes curtos, médios, longos, campos extensos, caracteres portugueses, escape ZPL, limites e preservação dos dados passaram.
- Conferida a integração existente com ZD220/GC420t e intensidade 15.
- Conferido que fontes, conteúdo, dimensões e posições não solicitadas permaneceram iguais entre revisões.
- A prévia final foi renderizada em 8 dpmm, 480 × 480 pixels; ZXing-C++ decodificou EXEMPLO-38805.
- O ZPL final foi comparado byte a byte com o teste físico aprovado com QR +20%.
- O operador aprovou o resultado no papel e, após anunciar o teste de uma etiqueta real, confirmou “perfeito” e pediu este registro como padrão.
- Não há registro separado do conteúdo retornado pela câmera no teste real; não se presume validação de todos os leitores.
- A conclusão do CUPS isoladamente não é prova de impressão ou leitura física.

Textos usados nos últimos testes:
- Produto curto: Arroz Branco.
- Produto maior: Peito de frango desfiado ao molho.
- Grupo extenso: Alimentos Preparados e Proteínas de Origem Animal.
- Empresa: CONFEITARIA CARAMELO INDUSTRIA E COMERCIO LTDA, sem prefixo “Restaurante”.

Esses textos não são valores fixos da produção. Cada etiqueta continua usando os dados recebidos do sistema.

## Arquivos e prévia

- src/services/zebraLabelLayout.js: gerador aprovado.
- src/services/printerService.js: seleção do renderizador existente.
- src/services/printerGeometry.js: aplicação das configurações físicas existentes.
- scripts/preview-elgin.js: prévia existente reutiliza o gerador Zebra.
- tests/zebraLabelLayout.test.js: regressão do layout.
- tests/fixtures/zebra-preview.json e tests/fixtures/zebra-premium-cases.json: dados fictícios.
- Esta documentação: docs/zebra-premium-60x60.md.

Prévia: http://HOST_DO_AGENTE:2508/previa-etiqueta/etiqueta-layout.png.
Regenerar: node scripts/preview-elgin.js.
Verificações: node tests/zebraLabelLayout.test.js; node tests/printerGeometry.test.js; git diff --check.

## Versão e retorno

SHA-256 do gerador aprovado:
3e0bf49dbbb54790a0715227dd281a87d49fd5f71d31e7744f8ae70fc8fbc4e3

O código foi validado na máquina de impressão e integra a versão 2.1.0 do agente.
Backups .backup-<data-hora> estão ao lado dos arquivos. Antes de novas alterações, preservar o gerador atual e os testes. Para restaurar uma revisão, usar o conjunto correspondente, regenerar a prévia, verificar e reiniciar somente stockflow.service. Não restaurar configurações de outra máquina nem alterar banco/estoque para testar o layout.

Para desfazer apenas o último aumento do QR, retornar à revisão anterior ao módulo 6. O restante das decisões aprovadas deve ser preservado.
