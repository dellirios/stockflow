# Alterações nas etiquetas
Arquivos principais: src/services/labelPresentation.js, src/services/printerService.js,
src/templates/default.zpl, testes em tests/labelPresentation.test.js e tests/labelFlow.test.js.
Mantidas as divisórias e a organização anterior após teste físico aprovado.
Peso decimal textual formatado no padrão brasileiro, sem perda de precisão.
Campos de saldo e quantidade de embalagens não substituem peso.
QR tem área livre de quatro módulos; escala por densidade real.
Revisão independente identificou um caso de identificadores ASCII a 300 dpi,
corrigido com regressão de 20/29 bytes nas três densidades.
69 testes passaram após correção.
Dados da fixture: produto/peso do exemplo; empresa, CNPJ, pessoas, datas,
fornecedor e identificador são fictícios.
Prévia: renderização ZPL com Labelary; canvas completado com branco, sem escala.
Referências: https://labelary.com/service.html e
https://cpws.zebra.com/cpws/docs/zpl/zpl-zbi2-pm-en.pdf
