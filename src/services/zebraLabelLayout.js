'use strict';

const {
  fitText, estimateWidth, escapeData, qrGeometry, validateElements,
} = require('./elginLabelLayout');

const BOUNDS = { width: 480, height: 480, left: 18, right: 462 };
const FOOTER_TOP = 330;
const BOTTOM = 462;
const FULL_WIDTH = BOUNDS.right - BOUNDS.left;
const COLUMN_WIDTH = (FULL_WIDTH - 8) / 2;

// Remove decorative spacing first, then reduce only secondary text ceilings.
const PROFILES = [
  { gap: 5, pad: 4, bar: 20, font: 26, valueHeight: 54, supplierFont: 24, supplierHeight: 50 },
  { gap: 3, pad: 2, bar: 18, font: 26, valueHeight: 42, supplierFont: 24, supplierHeight: 42 },
  { gap: 1, pad: 1, bar: 18, font: 26, valueHeight: 32, supplierFont: 24, supplierHeight: 32 },
  { gap: 1, pad: 1, bar: 18, font: 24, valueHeight: 32, supplierFont: 22, supplierHeight: 32 },
  { gap: 1, pad: 1, bar: 18, font: 22, valueHeight: 32, supplierFont: 20, supplierHeight: 32 },
  { gap: 1, pad: 1, bar: 18, font: 20, valueHeight: 32, supplierFont: 20, supplierHeight: 32 },
  { gap: 1, pad: 1, bar: 18, font: 18, valueHeight: 32, supplierFont: 18, supplierHeight: 32 },
];

function content(input) {
  return String(input ?? '').normalize('NFC').replace(/\s+/gu, ' ').trim() || 'Não Informado';
}

function measure(name, input, width, height, options = {}) {
  const text = content(input);
  return { name, content: text, ...fitText(text, { width, height },
    { widthRatio: 1, lineGap: 1, ...options, name }) };
}

function measureName(input) {
  try {
    return measure('produto', input, FULL_WIDTH - 8, 36,
      { font: 36, minFont: 28, maxLines: 1 });
  } catch {
    return measure('produto', input, FULL_WIDTH - 8, 74,
      { font: 28, minFont: 20, maxLines: 3 });
  }
}

function buildZebraLabel(data) {
  const commands = ['^XA', '^MTT', '^MMT', '^PW480', '^LL480', '^LS0', '^LRN', '^CI28'];
  const elements = [];
  const cards = [];
  const bars = [];

  function box(x, y, width, height, thickness = 1, rounding = 2) {
    commands.push(`^FO${x},${y}^GB${width},${height},${thickness},B,${rounding}^FS`);
  }

  function text(field, x, y, width, { align = 'L', reverse = false } = {}) {
    elements.push({ ...field, x, y, width, height: field.usedHeight, reverse });
    field.lines.forEach((line, index) => {
      const measured = estimateWidth(line, field.fontWidth);
      const origin = x + (align === 'C' ? Math.floor((width - measured) / 2) : 0);
      commands.push(`^FO${origin},${y + index * (field.fontHeight + field.lineGap)}^A0N,${field.fontHeight},${field.fontWidth}${reverse ? '^FR' : ''}^FH_^FD${escapeData(line)}^FS`);
    });
  }

  function header(name, title, x, y, width, height, capsule = false) {
    box(x, y, width, height, height, capsule ? 8 : 4);
    const field = measure(name + ':titulo', title, width - 12, height - 2,
      { font: 16, minFont: 16, maxLines: 1 });
    bars.push({ name, x, y, width, height });
    text(field, x + 6, y + Math.floor((height - field.usedHeight) / 2), width - 12, { reverse: true });
  }

  const name = measureName(data.nome);
  const nameTop = 18;
  const dividerY = nameTop + name.usedHeight + 4;
  const gridTop = dividerY + 5;
  const budget = FOOTER_TOP - 6 - gridTop;
  const rowData = [
    ['GRUPO', data.grupo, 'CONSERVAÇÃO', data.conservacao],
    ['PESO', data.peso_formatado, 'SIF / LOTE', data.sif_lote],
    ['DATA DE ENTRADA', data.data_entrada, 'VALIDADE', data.validade],
    ['LOCAL ARMAZENADO', data.armazenado, 'RESPONSÁVEL', data.responsavel_entrada],
  ];
  const dates = [
    data.val_fornecedor ? `Val: ${data.val_fornecedor}` : '',
    data.fab_fornecedor ? `Fab: ${data.fab_fornecedor}` : '',
  ].filter(Boolean);
  const supplierDates = dates.length ? measure('fornecedor:datas', dates.join('   '), 275, 16,
    { font: 16, minFont: 16, maxLines: 1 }) : null;

  let plan;
  for (const profile of PROFILES) {
    try {
      const rows = rowData.map(([leftTitle, leftValue, rightTitle, rightValue]) => {
        const fields = [[leftTitle, leftValue], [rightTitle, rightValue]].map(([title, input]) =>
          ({ title, value: measure(title + ':valor', input, COLUMN_WIDTH - 12, profile.valueHeight,
            { font: profile.font, minFont: 16, maxLines: 3, lineGap: 0 }) }));
        return { fields, height: profile.bar + profile.pad * 2 + Math.max(...fields.map(f => f.value.usedHeight)) };
      });
      const supplier = measure('fornecedor:valor', data.fornecedor, FULL_WIDTH - 12, profile.supplierHeight,
        { font: profile.supplierFont, minFont: 16, maxLines: 3, lineGap: 0 });
      const supplierHeight = profile.bar + profile.pad * 2 + supplier.usedHeight;
      const height = rows.reduce((sum, row) => sum + row.height, 0) + profile.gap * 4 + supplierHeight +
        18; // Keep the full-width supplier card clear of the enlarged QR.
      if (height <= budget) {
        plan = { profile, rows, supplier, supplierHeight, height };
        break;
      }
    } catch (error) {
      if (!error.message.includes('excede a area')) throw error;
    }
  }
  if (!plan) {
    throw new Error('Nome e campos excedem a area legivel da etiqueta 60x60 mm; conteudo preservado, impressao nao enviada');
  }

  const qr = qrGeometry(data.id_produto, { x: 313, y: FOOTER_TOP - 24, width: 145, height: 145 }, 5);
  if (qr.version === 1 && qr.magnification === 5) {
    // Physical test approved at this center; retain the original sizing for longer payloads.
    const size = 126;
    qr.symbolX = Math.round(qr.symbolX + (qr.symbolSize - size) / 2);
    qr.symbolY = Math.round(qr.symbolY + (qr.symbolSize - size) / 2);
    qr.magnification = 6;
    qr.symbolSize = size;
    qr.quiet = 24;
    qr.x = qr.symbolX - qr.quiet;
    qr.y = qr.symbolY - qr.quiet;
    qr.width = qr.height = size + 2 * qr.quiet;
  }
  const code = measure('codigo:valor', qr.data, 267, 52,
    { font: 34, minFont: 18, maxLines: 3 });
  const codeHeight = 18 + code.usedHeight + 4;
  const codeTop = BOTTOM - codeHeight;
  const companyHeight = codeTop - 5 - FOOTER_TOP - 22;
  const company = measure('empresa', data.nm_empresa, 279, companyHeight,
    { font: 26, minFont: 16, maxLines: 3, lineGap: 0 });
  const cnpj = measure('cnpj', `CNPJ: ${data.cnpj || 'Não Informado'}`, 279, 20,
    { font: 20, minFont: 20, maxLines: 1 });

  text(name, 22, nameTop, FULL_WIDTH - 8, { align: 'C' });
  box(BOUNDS.left, dividerY, FULL_WIDTH, 1, 1, 0);

  let y = gridTop;
  const rowExtra = Math.min(6, Math.floor((budget - plan.height) / 4));
  for (const row of plan.rows) {
    const height = row.height + rowExtra;
    row.fields.forEach(({ title, value }, index) => {
      const x = BOUNDS.left + index * (COLUMN_WIDTH + 8);
      cards.push({ name: title, x, y, width: COLUMN_WIDTH, height });
      box(x, y, COLUMN_WIDTH, height, 3);
      header(title, title, x, y, COLUMN_WIDTH, plan.profile.bar);
      const valueY = y + plan.profile.bar + Math.floor((height - plan.profile.bar - value.usedHeight) / 2);
      text(value, x + 6, valueY, COLUMN_WIDTH - 12);
    });
    y += height + plan.profile.gap;
  }

  cards.push({ name: 'fornecedor', x: 18, y, width: FULL_WIDTH, height: plan.supplierHeight });
  box(18, y, FULL_WIDTH, plan.supplierHeight);
  header('fornecedor', 'FORNECEDOR', 18, y, FULL_WIDTH, plan.profile.bar);
  text(plan.supplier, 24, y + plan.profile.bar + plan.profile.pad, FULL_WIDTH - 12);
  y += plan.supplierHeight;
  if (supplierDates) text(supplierDates, 20, y + 4, 275);

  box(18, FOOTER_TOP - 3, 279, 3, 3, 0);
  text(company, 18, FOOTER_TOP + 3, 279);
  text(cnpj, 18, Math.min(FOOTER_TOP + company.usedHeight + 5, codeTop - 24), 279);
  box(18, codeTop - 4, 279, 3, 3, 0);
  box(305, FOOTER_TOP - 22, 3, BOTTOM - FOOTER_TOP + 22, 3, 0);
  cards.push({ name: 'codigo', x: 18, y: codeTop, width: 279, height: codeHeight });
  box(18, codeTop + 6, 279, codeHeight - 6, 1, 3);
  const codeHeaderWidth = Math.min(279, estimateWidth('CÓDIGO RETIRADA', 16) + 18);
  header('codigo', 'CÓDIGO RETIRADA', 18, codeTop, codeHeaderWidth, 18, true);
  text(code, 24, codeTop + 20, 267);
  // Validate printed ink separately: the enlarged quiet zone reaches beyond the footer divider.
  elements.push({ ...qr, x: qr.symbolX, y: qr.symbolY,
    width: qr.symbolSize, height: qr.symbolSize, name: 'qr:simbolo' });
  commands.push(`^FO${qr.symbolX},${qr.symbolY}^BQN,2,${qr.magnification},L,7^FH_^FDLM,B${String(qr.bytes).padStart(4, '0')}${escapeData(qr.data)}^FS`);
  commands.push('^PQ1,0,1,Y', '^XZ');

  validateElements(elements, BOUNDS);
  for (const card of cards) {
    if (card.x < 18 || card.x + card.width > 462 || card.y < gridTop || card.y + card.height > BOTTOM) {
      throw new Error(`Bloco fora da area imprimivel: ${card.name}`);
    }
  }
  return { zpl: commands.join('\n') + '\n', elements, qr, cards, bars,
    layout: { nameHeight: name.usedHeight, gridTop, footerTop: FOOTER_TOP, profile: PROFILES.indexOf(plan.profile) } };
}

module.exports = { buildZebraLabel };
