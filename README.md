# StockFlow — agente de impressão
Cópia do código instalado, atualizada em 2026-10-29. Configurações reais,
senhas, dumps SQL, logs, histórico de trabalhos e backups não estão nesta cópia.

## Preparação
Instale Node.js compatível com as dependências (Node.js 20+ recomendado), CUPS e
configure a fila da impressora. Depois:
```sh
npm ci
cp config/printers.json.example config/printers.json
cp .env.example .env
```
Preencha a chave real da loja, nome da fila CUPS e densidade do equipamento nos
arquivos locais. As chaves de loja reais e senhas não devem ser versionadas.
Perfis suportados: 8, 12, 24 dpmm; família 203, 300, 600 dpi.
Execute `npm start`; health em `http://127.0.0.1:2508/health`.

## Etiquetas
Layout antigo preservado, com ajustes pontuais nas fontes e peso.
60 x 60 mm, intensidade 20, QR/identificador e quantidade de cópias preservados.
Peso vem exclusivamente de `peso` e `unidade_medida`.
Exemplos: `400.00000000 g` -> `400 g`; `2.65000000 kg` -> `2,65 kg`.
Nenhum arredondamento, conversão de unidades ou alteração do payload/banco.
Cada loja é selecionada por `store_key`, com perfil da própria impressora.
Textos que não cabem em tamanho legível falham explicitamente antes do envio.

## Testes
`npm run test:labels` roda as regressões puras/fluxo, sem impressora real.
`TEST_BASE_URL=http://127.0.0.1:2508 npm test` roda a suíte completa com serviço ativo.
69 testes passaram na instância isolada: 59 unitários/fluxo, 7 integração,
3 performance. Prévia QR validada em três densidades; amostra física aprovada.
O teste de integração consulta diagnóstico sem consumir a fila real.

## Segurança
Use somente arquivos *.example versionados como referência.
O .gitignore impede inclusão acidental de configurações locais, .env, logs,
backups e dumps. Este snapshot não remove informações já existentes no histórico
do repositório ou em outras branches.

## Limitações
Validar margens, avanço entre etiquetas consecutivas e leitura do QR em cada
modelo/mídia. Conteúdo além dos limites físicos é rejeitado, não cortado.
Código e documentação de leitor estão incluídos sem credenciais de banco.
