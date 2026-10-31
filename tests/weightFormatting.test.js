'use strict';
const assert = require('node:assert/strict');
const { preencherZPL } = require('../src/services/printerService');
try {
  for (const [peso, expected] of [
    ['1.000000000000', '1kg'],
    ['0.250000000000', '0.25kg'],
    ['1.234567890123', '1.234567890123kg'],
    ['1000', '1000kg'],
    ['1,500000', '1,5kg'],
    [0, '0kg'],
    ['0.000000000000', '0kg'],
    [null, 'kg'],
  ]) {
    const zpl = preencherZPL({ nome: 'Teste peso', peso, unidade_medida: 'kg' });
    assert.ok(zpl.includes(`^FD${expected}^FS`), `Peso ${peso}: esperado ${expected}`);
  }
  console.log('PASS: peso sem zeros decimais excedentes; precisao, unidade e zero preservados');
  process.exit(0);
} catch (error) {
  console.error(error);
  process.exit(1);
}
