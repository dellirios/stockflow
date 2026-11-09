'use strict';
const assert = require('node:assert/strict');
const { buildZebraLabel } = require('../src/services/zebraLabelLayout');
const { estimateWidth, overlaps } = require('../src/services/elginLabelLayout');
const { applyPrinterSettings } = require('../src/services/printerGeometry');
const fixture = require('./fixtures/zebra-preview.json');
const cases = require('./fixtures/zebra-premium-cases.json');

const layouts = new Map();
for (const sample of cases) {
  const data = { ...fixture, ...sample };
  const before = JSON.stringify(data);
  const label = buildZebraLabel(data);
  assert.equal(JSON.stringify(data), before, 'Rendering must not mutate business data');
  layouts.set(sample.id, label);
  assert.equal(label.bars.length, 10);
  const infoCards = label.cards.filter(card => card.name !== 'fornecedor' && card.name !== 'codigo');
  assert.equal(infoCards.length, 8);
  for (const card of infoCards) {
    assert.ok(label.zpl.includes(`^FO${card.x},${card.y}^GB${card.width},${card.height},3,B,2^FS`));
  }
  const supplier = label.cards.find(card => card.name === 'fornecedor');
  assert.ok(label.zpl.includes(`^FO${supplier.x},${supplier.y}^GB${supplier.width},${supplier.height},1,B,2^FS`));
  const codeCard = label.cards.find(card => card.name === 'codigo');
  assert.ok(label.zpl.includes(`^FO${codeCard.x},${codeCard.y + 6}^GB${codeCard.width},${codeCard.height - 6},1,B,3^FS`));
  assert.equal((label.zpl.match(/\^FR/g) || []).length, 10);
  assert.ok(!label.zpl.includes('^FO10,10^GB460,460'), 'No outer frame');
  assert.ok(label.zpl.includes('^FO18,327^GB279,3,3,B,0^FS'));
  const codeTop = label.cards.find(card => card.name === 'codigo').y;
  assert.ok(label.zpl.includes(`^FO18,${codeTop - 4}^GB279,3,3,B,0^FS`));
  assert.ok(label.zpl.includes('^FO305,308^GB3,154,3,B,0^FS'));
  const company = label.elements.find(e => e.name === 'empresa');
  const cnpj = label.elements.find(e => e.name === 'cnpj');
  const dates = label.elements.find(e => e.name === 'fornecedor:datas');
  assert.equal(company.y, 333);
  assert.ok(company.y + company.height <= cnpj.y);
  assert.ok(cnpj.y + cnpj.height <= codeTop - 4);
  assert.equal(dates.y, supplier.y + supplier.height + 4);
  assert.ok(dates.y + dates.height <= 327);

  assert.ok(!/\^GF|~DG|\^XG/.test(label.zpl), 'Native ZPL only');
  assert.ok(label.zpl.includes('^MTT'));
  assert.ok(label.zpl.includes('^CI28'));
  assert.ok(label.zpl.endsWith('^PQ1,0,1,Y\n^XZ\n'));
  for (const field of label.elements.filter(e => e.lines)) {
    assert.ok(field.x >= 18 && field.x + field.width <= 462, field.name);
    assert.ok(field.y >= 18 && field.y + field.height <= 462, field.name);
    assert.ok(field.usedHeight <= field.height, field.name);
    assert.equal(field.lines.join('').replace(/\s/gu, ''), field.content.replace(/\s/gu, ''), field.name);
    for (const line of field.lines) assert.ok(estimateWidth(line, field.fontWidth) <= field.width, field.name);
  }
  for (let i = 0; i < label.elements.length; i++) {
    for (let j = i + 1; j < label.elements.length; j++) {
      assert.ok(!overlaps(label.elements[i], label.elements[j]), label.elements[i].name + '/' + label.elements[j].name);
    }
  }
  for (const bar of label.bars) {
    const title = label.elements.find(e => e.name === bar.name + ':titulo');
    assert.equal(title.reverse, true);
    assert.ok(title.x >= bar.x && title.x + title.width <= bar.x + bar.width);
    assert.ok(title.y >= bar.y && title.y + title.height <= bar.y + bar.height);
  }
  assert.ok(label.bars.reduce((sum, bar) => sum + bar.width * bar.height, 0) < 480 * 480 * 0.25);
  assert.equal(label.qr.data, data.id_produto);
  assert.equal(label.qr.quiet, 4 * label.qr.magnification);
  assert.equal(label.qr.symbolSize + 2 * label.qr.quiet, label.qr.width);
  console.log('PASS:', sample.id, label.layout, 'no collisions, all fields preserved');
}
const reference = layouts.get('curto');
assert.equal(reference.qr.magnification, 6);
assert.equal(reference.qr.symbolSize, 126);
assert.equal(reference.qr.quiet, 24);
assert.equal(reference.qr.symbolX, 323);
assert.equal(reference.qr.symbolY, 316);
assert.ok(reference.zpl.includes('^FO323,316^BQN,2,6,L,7'));
const longerQr = buildZebraLabel({ ...fixture, id_produto: 'A'.repeat(45) }).qr;
assert.equal(longerQr.magnification, 3);

assert.equal(reference.elements.find(e => e.name === 'cnpj').fontHeight, 20);
assert.ok(reference.elements.find(e => e.name === 'empresa').fontHeight >= 22);
const product = label => label.elements.find(e => e.name === 'produto');
assert.equal(product(layouts.get('curto')).lines.length, 1);
assert.equal(product(layouts.get('longo')).lines.length, 3);
assert.ok(layouts.get('curto').layout.nameHeight < layouts.get('longo').layout.nameHeight);
assert.ok(layouts.get('curto').layout.gridTop < layouts.get('longo').layout.gridTop);
assert.ok(product(layouts.get('longo')).fontHeight >= 20);
for (const [name, key] of [['fornecedor:valor','fornecedor'],['RESPONSÁVEL:valor','responsavel_entrada'],
  ['LOCAL ARMAZENADO:valor','armazenado'],['empresa','nm_empresa']]) {
  const field = layouts.get('extensos').elements.find(e => e.name === name);
  assert.equal(field.content, cases[3][key]);
  assert.ok(field.lines.length > 1, name);
}
for (const id_produto of ['0', 'B000538805', 'EXEMPLO-38805', 'A'.repeat(45), 'Lote-ação_Ç']) {
  const label = buildZebraLabel({ ...fixture, nome: 'Arroz Branco', id_produto });
  assert.equal(label.qr.data, id_produto.normalize('NFC'));
}
const zero = buildZebraLabel({ nome: 'Produto', id_produto: '0', peso_formatado: '0kg' });
assert.equal(zero.elements.find(e => e.name === 'PESO:valor').content, '0kg');
assert.ok(!zero.elements.some(e => e.name === 'fornecedor:datas'));
const escaped = buildZebraLabel({ ...fixture, nome: 'Salmão ^FS~JA_' }).zpl;
assert.ok(escaped.includes('_5EFS_7EJA_5F'));
for (const field of ['nome', 'grupo', 'armazenado', 'responsavel_entrada', 'fornecedor', 'nm_empresa', 'cnpj']) {
  assert.throws(() => buildZebraLabel({ ...fixture, [field]: 'A'.repeat(500) }), /excede/);
}
assert.throws(() => buildZebraLabel({ ...fixture, id_produto: '' }), /ausente/);
assert.throws(() => buildZebraLabel({ ...fixture, id_produto: 'a'.repeat(107) }), /excede/);

const { preencherZPL } = require('../src/services/printerService');
for (const nome of ['Zebra_Technologies_ZTC_ZD220-203dpi_ZPL', 'Zebra_GC420t']) {
  const printer = { nome, intensidade: 15 };
  const actual = preencherZPL({ ...fixture }, printer);
  assert.equal(actual, buildZebraLabel(fixture).zpl);
  assert.ok(applyPrinterSettings(actual, printer).startsWith('~SD15\n'));
}
console.log('PASS: ZD220/GC420t caller, UTF-8, zero, QR payloads and explicit oversize errors');
process.exit(0);
