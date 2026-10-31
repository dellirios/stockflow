'use strict';

// Logical coordinates BEFORE the existing +32-dot printer compensation.
// Right edge 436 + compensation 32 = 468: 12 dots of physical clearance.
const LAYOUT = Object.freeze({
  width: 480, height: 480, left: 12, right: 436, gap: 16,
  header: { y: 6, height: 40 },
  rows: [48, 104, 160, 216].map(y => ({ y, height: 56 })),
  supplier: { y: 272, height: 52 },
  company: { y: 324, height: 56 },
  footer: { y: 380, height: 88 },
  minFont: 18, quietModules: 4,
});

const SECONDARY_TYPE = Object.freeze({
  title: { font: 15, minFont: 15, maxLines: 1, widthRatio: 1 },
  complementary: { font: 15, minFont: 15, maxLines: 1, widthRatio: 1 },
  company: { font: 19, minFont: 16, widthRatio: 1, lineGap: 0, align: 'C' },
  cnpj: { font: 18, minFont: 18, maxLines: 1, widthRatio: 1, align: 'C' },
});

function value(input, fallback = 'Não Informado') {
  const text = String(input ?? '').normalize('NFC').replace(/\s+/gu, ' ').trim();
  return text || fallback;
}

// Font 0 advance ratios measured from a synthetic Labelary character grid,
// at width=100. They are reference metrics, not a measurement of Elgin firmware.
const FONT0_UPPER = [0.55,0.55,0.53,0.59,0.5,0.5,0.59,0.61,0.28,0.44,0.55,0.48,0.76,0.61,0.57,0.55,0.57,0.59,0.53,0.5,0.61,0.53,0.81,0.55,0.55,0.5];
const FONT0_LOWER = [0.46,0.5,0.44,0.5,0.48,0.28,0.5,0.5,0.26,0.26,0.44,0.26,0.76,0.5,0.48,0.5,0.5,0.33,0.42,0.28,0.5,0.44,0.66,0.44,0.44,0.39];
function measureWidth(text, fontWidth) {
  return Array.from(text).reduce((total, glyph) => {
    const char = glyph.normalize('NFD').replace(/\p{M}/gu, '');
    const code = char.charCodeAt(0);
    const factor = /^[A-Z]$/.test(char) ? FONT0_UPPER[code - 65] :
      /^[a-z]$/.test(char) ? FONT0_LOWER[code - 97] :
      /^[0-9]$/.test(char) ? 0.48 :
      ' !\'(),./:;[]`'.includes(char) ? 0.29 :
      '#$*'.includes(char) ? 0.48 : '&'.includes(char) ? 0.61 :
      '%+\u002d=@'.includes(char) ? 0.9 : 1;
    return total + Math.round(fontWidth * factor);
  }, 0);
}

// Reserve a small guard for font rounding and glyph overhang.
function estimateWidth(text, fontWidth) {
  return measureWidth(text, fontWidth) + Math.max(2, Math.ceil(fontWidth * 0.15));
}

function wrap(text, width, fontWidth) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (estimateWidth(line ? `${line} ${word}` : word, fontWidth) <= width) {
      line = line ? `${line} ${word}` : word;
      continue;
    }
    if (line) { lines.push(line); line = ''; }
    // Long identifiers are broken, never shortened or silently discarded.
    for (const char of word) {
      if (estimateWidth(line + char, fontWidth) > width) {
        lines.push(line); line = '';
      }
      line += char;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function fitText(text, box, options = {}) {
  const maximum = options.font ?? 20;
  const minimum = options.minFont ?? LAYOUT.minFont;
  const gap = options.lineGap ?? 1;
  const maxLines = options.maxLines ?? 2;
  for (let height = maximum; height >= minimum; height--) {
    const width = Math.max(7, Math.round(height * (options.widthRatio ?? 0.85)));
    const lines = wrap(text, box.width, width);
    const usedHeight = lines.length * height + Math.max(0, lines.length - 1) * gap;
    if (lines.length <= maxLines && usedHeight <= box.height) {
      return { lines, fontHeight: height, fontWidth: width, lineGap: gap, usedHeight };
    }
  }
  throw new Error(`Campo ${options.name || 'texto'} excede a area da etiqueta 60x60 mm; conteudo preservado, impressao nao enviada`);
}

function escapeData(text) {
  // ^FH uses underscore as the hex indicator; protect ZPL control characters
  // and encode UTF-8 explicitly, including accented company/product names.
  return Array.from(Buffer.from(text, 'utf8'), byte =>
    byte >= 32 && byte <= 126 && ![92, 94, 95, 126].includes(byte)
      ? String.fromCharCode(byte) : `_${byte.toString(16).toUpperCase().padStart(2, '0')}`
  ).join('');
}

// Exact byte-mode capacities, Model 2 / ECC L, versions 1..5 (DENSO).
// Manual byte mode prevents automatic numeric/alphanumeric mode selection
// from changing the symbol dimensions calculated here.
function qrGeometry(input, box) {
  const data = String(input ?? '').normalize('NFC').trim();
  if (!data) throw new Error('Codigo de retirada ausente; QR Code nao pode ser gerado');
  const bytes = Buffer.byteLength(data, 'utf8');
  const version = [17, 32, 53, 78, 106].findIndex(capacity => bytes <= capacity) + 1;
  if (!version) throw new Error('Conteudo do QR Code excede a area disponivel na etiqueta 60x60 mm');
  const modules = 17 + 4 * version;
  const magnification = Math.min(3, Math.floor(Math.min(box.width, box.height) / (modules + 8)));
  if (magnification < 2) throw new Error('QR Code ficaria pequeno demais para leitura');
  const size = (modules + 8) * magnification;
  const x = box.x + Math.floor((box.width - size) / 2);
  const y = box.y + Math.floor((box.height - size) / 2);
  const quiet = LAYOUT.quietModules * magnification;
  return { x, y, width: size, height: size, symbolX: x + quiet,
    symbolY: y + quiet, symbolSize: modules * magnification,
    quiet, version, magnification, bytes, data };
}

function overlaps(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x &&
    a.y < b.y + b.height && a.y + a.height > b.y;
}

function validateElements(elements) {
  for (const element of elements) {
    if (element.x < LAYOUT.left || element.y < 0 ||
        element.x + element.width > LAYOUT.right ||
        element.y + element.height > LAYOUT.height - 12) {
      throw new Error(`Elemento fora dos limites: ${element.name}`);
    }
  }
  for (let i = 0; i < elements.length; i++) {
    for (let j = i + 1; j < elements.length; j++) {
      if (overlaps(elements[i], elements[j])) {
        throw new Error(`Colisao de layout: ${elements[i].name} / ${elements[j].name}`);
      }
    }
  }
}

function buildElginLabel(data) {
  // This installation uses ribbon; reapply the method after printer power cycles.
  const commands = ['^XA', '^MTT', '^MMT', '^PW480', '^LL480', '^LS0', '^CI28'];
  const elements = [];
  const fullWidth = LAYOUT.right - LAYOUT.left;
  const columnWidth = (fullWidth - LAYOUT.gap) / 2;
  const rightX = LAYOUT.left + columnWidth + LAYOUT.gap;

  function text(name, input, box, options = {}) {
    const content = value(input, options.fallback ?? 'Não Informado');
    const fitted = fitText(content, box, { ...options, name });
    elements.push({ ...box, name, content, ...fitted });
    fitted.lines.forEach((line, index) => {
      const width = estimateWidth(line, fitted.fontWidth);
      const alignment = options.align || 'L';
      const x = box.x + (alignment === 'R' ? box.width - width :
        alignment === 'C' ? Math.floor((box.width - width) / 2) : 0);
      const y = box.y + index * (fitted.fontHeight + fitted.lineGap);
      commands.push(`^FO${x},${y}^A0N,${fitted.fontHeight},${fitted.fontWidth}` +
        `^FH_^FD${escapeData(line)}^FS`);
    });
  }
  function rule(name, y) {
    elements.push({ name, x: LAYOUT.left, y, width: fullWidth, height: 1 });
    commands.push(`^FO${LAYOUT.left},${y}^GB${fullWidth},1,1^FS`);
  }
  function pair(section, leftTitle, leftValue, rightTitle, rightValue) {
    for (const [x, title, input] of [[LAYOUT.left, leftTitle, leftValue], [rightX, rightTitle, rightValue]]) {
      const align = x === rightX ? 'R' : 'L';
      text(`${title}:titulo`, title, { x, y: section.y + 2, width: columnWidth, height: 15 },
        { ...SECONDARY_TYPE.title, align });
      text(`${title}:valor`, input, { x, y: section.y + 18, width: columnWidth, height: 36 },
        { font: 26, lineGap: 0, align });
    }
    rule(`divisoria:${leftTitle}`, section.y + section.height - 1);
  }

  text('produto', data.nome, { x: LAYOUT.left, y: LAYOUT.header.y, width: fullWidth, height: LAYOUT.header.height },
    { font: 32, minFont: 19, align: 'C' });
  rule('divisoria:cabecalho', 47);
  pair(LAYOUT.rows[0], 'GRUPO', data.grupo, 'CONSERVAÇÃO', data.conservacao);
  pair(LAYOUT.rows[1], 'PESO', data.peso_formatado, 'NIF/LOTE', data.sif_lote);
  pair(LAYOUT.rows[2], 'DATA DE ENTRADA', data.data_entrada, 'VALIDADE', data.validade);
  pair(LAYOUT.rows[3], 'LOCAL ARMAZENADO', data.armazenado, 'RESPONSÁVEL', data.responsavel_entrada);

  const supplier = LAYOUT.supplier;
  text('fornecedor:titulo', 'FORNECEDOR', { x: LAYOUT.left, y: supplier.y, width: fullWidth, height: 15 },
    SECONDARY_TYPE.title);
  const complementary = [];
  if (data.val_fornecedor) complementary.push(`Val: ${data.val_fornecedor}`);
  if (data.fab_fornecedor) complementary.push(`Fab: ${data.fab_fornecedor}`);
  text('fornecedor:valor', data.fornecedor, { x: LAYOUT.left, y: supplier.y + 16,
    width: fullWidth, height: complementary.length ? 18 : 33 },
    { font: 26, minFont: 16, maxLines: 1, widthRatio: 1 });
  if (complementary.length) text('fornecedor:datas', complementary.join('   '),
    { x: LAYOUT.left, y: supplier.y + 35, width: fullWidth, height: 15 },
    SECONDARY_TYPE.complementary);
  rule('divisoria:fornecedor', supplier.y + supplier.height - 1);

  const company = LAYOUT.company;
  text('empresa', data.nm_empresa, { x: LAYOUT.left, y: company.y + 3, width: fullWidth, height: 32 },
    SECONDARY_TYPE.company);
  text('cnpj', `CNPJ: ${value(data.cnpj)}`, { x: LAYOUT.left, y: company.y + 36, width: fullWidth, height: 18 },
    SECONDARY_TYPE.cnpj);
  rule('divisoria:empresa', company.y + company.height - 1);

  const footer = LAYOUT.footer;
  const qrBox = { x: LAYOUT.right - footer.height, y: footer.y, width: footer.height, height: footer.height };
  const qr = qrGeometry(data.id_produto, qrBox);
  const codeWidth = qrBox.x - LAYOUT.left - LAYOUT.gap;
  text('codigo:titulo', 'CÓDIGO RETIRADA', { x: LAYOUT.left, y: footer.y + 12, width: codeWidth, height: 15 },
    SECONDARY_TYPE.title);
  text('codigo:valor', qr.data, { x: LAYOUT.left, y: footer.y + 30, width: codeWidth, height: 56 },
    { font: 32, maxLines: 3 });
  elements.push({ ...qr, name: 'qr:incluindo-margem-de-silencio' });
  commands.push(`^FO${qr.symbolX},${qr.symbolY}^BQN,2,${qr.magnification},L,7` +
    `^FH_^FDLM,B${String(qr.bytes).padStart(4, '0')}${escapeData(qr.data)}^FS`);
  commands.push('^PQ1,0,1,Y', '^XZ');
  validateElements(elements);
  return { zpl: commands.join('\n') + '\n', elements, qr };
}

module.exports = { LAYOUT, buildElginLabel, fitText, estimateWidth, qrGeometry, validateElements, overlaps, escapeData };
