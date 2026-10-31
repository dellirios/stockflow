'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { LAYOUT, buildElginLabel, qrGeometry, fitText, validateElements, estimateWidth } = require('../src/services/elginLabelLayout');
const { applyPrinterSettings } = require('../src/services/printerGeometry');
const printer = require('./fixtures/elgin-printer.json');
const fixture = {
  nome: 'Etiqueta Teste', grupo: 'Chocolates', conservacao: 'Congelados',
  peso_formatado: '1.00kg', sif_lote: 'Não Informado',
  data_entrada: '13/10/2026 16:40', validade: '12/11/2026',
  armazenado: 'Estoque Central', responsavel_entrada: 'Pedro Frade',
  fornecedor: 'Não Informado', val_fornecedor: '12/11/2026', fab_fornecedor: '13/10/2026',
  nm_empresa: 'CONFEITARIA CARAMELO INDÚSTRIA E COMÉRCIO LTDA',
  cnpj: '12.345.678/0001-90', id_produto: '38805',
};
let checks = 0;
function check(name, callback) { callback(); checks++; console.log(`OK: ${name}`); }

check('Dados reais em regioes independentes e dentro dos limites', () => {
  const result = buildElginLabel(fixture);
  validateElements(result.elements);
  for (const field of result.elements.filter(e => e.lines)) {
    assert.ok(field.usedHeight <= field.height);
    for (const line of field.lines) assert.ok(estimateWidth(line, field.fontWidth) <= field.width);
    assert.ok(field.x + field.width + 32 <= 480);
  }
  assert.equal(result.elements.find(e => e.name === 'cnpj').content, `CNPJ: ${fixture.cnpj}`);
  assert.equal(result.elements.find(e => e.name === 'DATA DE ENTRADA:valor').content, fixture.data_entrada);
  assert.equal(result.qr.data, fixture.id_produto);
  assert.match(result.zpl, /\^FDLM,B000538805\^FS/);
});

check('Offset, tamanho e intensidade permanecem identicos', () => {
  assert.equal(printer.geometria.offset_horizontal_mm, 4);
  assert.equal(printer.geometria.resolucao_dpi, 203);
  assert.equal(printer.intensidade, 15);
  const output = applyPrinterSettings(buildElginLabel(fixture).zpl, printer);
  assert.match(output, /^~SD15/);
  assert.match(output, /\^PW480\n\^LL480\n\^LH32,0\n\^LS0/);
});

check('Cada trabalho Elgin restaura o metodo com ribbon e termina a ultima linha', () => {
  const output = applyPrinterSettings(buildElginLabel(fixture).zpl, printer);
  assert.ok(output.indexOf('^MTT') > output.indexOf('^XA'));
  assert.ok(output.indexOf('^MTT') < output.indexOf('^FO'));
  assert.ok(output.endsWith('^XZ\n'));
});

check('Textos longos quebram sem invadir empresa, CNPJ ou QR', () => {
  const result = buildElginLabel({ ...fixture,
    nome: 'Chocolate artesanal com castanhas e recheio de caramelo',
    grupo: 'Chocolates artesanais', conservacao: 'Manter sob refrigeração',
    responsavel_entrada: 'Pedro Henrique Frade Silva de Albuquerque',
    nm_empresa: 'CONFEITARIA CARAMELO INDÚSTRIA E COMÉRCIO DE PRODUTOS ALIMENTÍCIOS LTDA',
    fornecedor: 'Fornecedor de produtos alimentícios artesanais',
  });
  validateElements(result.elements);
  assert.ok(result.elements.find(e => e.name === 'empresa').lines.length > 1);
  assert.ok(result.elements.find(e => e.name === 'RESPONSÁVEL:valor').lines.length > 1);
});

check('Campos ausentes e peso zero nao desaparecem', () => {
  const result = buildElginLabel({ nome: 'Produto', id_produto: '0', peso_formatado: '0kg' });
  assert.equal(result.elements.find(e => e.name === 'PESO:valor').content, '0kg');
  assert.equal(result.elements.find(e => e.name === 'GRUPO:valor').content, 'Não Informado');
  assert.equal(result.qr.data, '0');
  assert.ok(!result.elements.some(e => e.name === 'fornecedor:datas'));
});

check('QR calcula versoes, byte UTF-8, ampliacao e margem de 4 modulos', () => {
  const box = { x: LAYOUT.right - 92, y: LAYOUT.footer.y, width: 92, height: 92 };
  for (const [length, version] of [[1, 1], [17, 1], [18, 2], [32, 2], [33, 3], [53, 3], [54, 4], [78, 4], [79, 5], [106, 5]]) {
    const qr = qrGeometry('a'.repeat(length), box);
    assert.equal(qr.version, version);
    assert.equal(qr.symbolSize, (17 + 4 * version) * qr.magnification);
    assert.equal(qr.quiet, qr.magnification * 4);
    assert.equal(qr.width, qr.symbolSize + 2 * qr.quiet);
    assert.ok(qr.x >= box.x && qr.x + qr.width <= box.x + box.width);
    assert.ok(qr.y >= box.y && qr.y + qr.height <= box.y + box.height);
  }
  assert.equal(qrGeometry('é'.repeat(9), box).version, 2);
  assert.throws(() => qrGeometry('a'.repeat(107), box), /QR Code excede/);
  assert.throws(() => qrGeometry('', box), /ausente/);
});

check('Identificadores de comprimentos diferentes conservam o conteudo', () => {
  for (const id_produto of ['38805', 'ABCDEFGHIJKLMN12345678', 'a'.repeat(45), 'a'.repeat(70)]) {
    const result = buildElginLabel({ ...fixture, id_produto });
    validateElements(result.elements);
    const code = result.elements.find(e => e.name === 'codigo:valor');
    assert.equal(code.lines.join(''), id_produto);
    assert.equal(result.qr.data, id_produto);
  }
});

check('Dados excessivos geram erro explicito, nao truncamento', () => {
  for (const field of ['nome', 'nm_empresa', 'responsavel_entrada', 'cnpj', 'data_entrada', 'id_produto']) {
    assert.throws(() => buildElginLabel({ ...fixture, [field]: 'A'.repeat(500) }), /excede/);
  }
  assert.throws(() => fitText('nome excessivamente longo', { width: 20, height: 14 }), /excede/);
});

check('Detector identifica colisoes e estouro da area fisica', () => {
  assert.throws(() => validateElements([
    { name: 'a', x: 12, y: 20, width: 30, height: 20 },
    { name: 'b', x: 20, y: 25, width: 30, height: 20 },
  ]), /Colisao/);
  assert.throws(() => validateElements([{ name: 'a', x: 436, y: 0, width: 1, height: 10 }]), /limites/);
});

check('Caracteres de controle ZPL nao injetam comandos e UTF-8 e preservado', () => {
  const result = buildElginLabel({ ...fixture, nome: 'A^XZ~JA_\\ç' });
  assert.equal((result.zpl.match(/\^XZ/g) || []).length, 1);
  assert.ok(!result.zpl.includes('~JA'));
  assert.match(result.zpl, /_5E/);
  assert.match(result.zpl, /_C3_A7/);
});

check('Linhas posicionadas diretamente sem depender de alinhamento FB', () => {
  const result = buildElginLabel(fixture);
  const fields = [...result.zpl.matchAll(/\^FO(\d+),(\d+)\^A0N,(\d+),(\d+)\^FH_\^FD([\s\S]*?)\^FS/g)];
  assert.equal(fields.length, result.elements.filter(e => e.lines).reduce((n, e) => n + e.lines.length, 0));
  assert.ok(!result.zpl.includes('^FB'));
  const slash = String.fromCharCode(92);
  assert.ok(!result.zpl.includes(slash.repeat(2) + '&'), 'Quebra ZPL deve conter uma unica barra antes de &');
  assert.ok(!result.zpl.includes(slash + '&'));
  for (const field of fields) {
    const [, x, y, height, width, escaped] = field;
    const content = Buffer.from(escaped.replace(/_([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))), 'latin1').toString('utf8');
    assert.ok(Number(x) + estimateWidth(content, Number(width)) + 32 <= 480);
    assert.ok(Number(y) + Number(height) <= 468);
  }
});

check('Valores maiores e mais largos que os titulos', () => {
  const result = buildElginLabel(fixture);
  for (const field of result.elements.filter(e => e.name.endsWith(':valor'))) {
    const title = result.elements.find(e => e.name === field.name.replace(':valor', ':titulo'));
    assert.ok(field.fontHeight >= 18 && field.fontHeight > title.fontHeight);
    assert.ok(field.fontWidth > title.fontWidth);
  }
});

check('Ajuste fino preserva regioes, divisorias e QR aprovados', () => {
  const approved = require('./fixtures/elgin-approved-geometry.json');
  assert.deepEqual(LAYOUT, approved);
  const result = buildElginLabel(fixture);
  const separators = [...result.zpl.matchAll(/\^FO12,(\d+)\^GB424,1,1\^FS/g)].map(m => Number(m[1]));
  assert.deepEqual(separators, [47, 103, 159, 215, 271, 323, 379]);
  assert.equal(result.qr.symbolX, 360);
  assert.equal(result.qr.symbolY, 392);
  assert.equal(result.qr.magnification, 3);
  assert.match(result.zpl, /\^CI28/);
  assert.ok(!result.zpl.includes('^PR'), 'Ajuste de fontes nao deve alterar velocidade');
});

check('Fontes secundarias maiores e sem compressao horizontal', () => {
  const result = buildElginLabel(fixture);
  for (const field of result.elements.filter(e => e.name.endsWith(':titulo'))) {
    assert.equal(field.fontHeight, 15);
    assert.equal(field.fontWidth, 15);
  }
  for (const name of ['fornecedor:datas', 'empresa', 'cnpj']) {
    const field = result.elements.find(e => e.name === name);
    assert.ok(field.fontHeight >= 15);
    assert.equal(field.fontWidth, field.fontHeight);
  }
  assert.equal(result.elements.find(e => e.name === 'fornecedor:datas').fontHeight, 15);
  assert.equal(result.elements.find(e => e.name === 'cnpj').fontHeight, 18);
});

console.log(`${checks} verificacoes de layout Elgin passaram. Nenhuma impressao enviada.`);
