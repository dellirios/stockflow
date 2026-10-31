'use strict';

// Geometry belongs to the physical printer, not the label's field layout.
function applyPrinterGeometry(zpl, printer) {
  const geometry = printer.geometria;
  if (!geometry) return zpl;

  const { largura_mm, altura_mm, resolucao_dpi, offset_horizontal_mm } = geometry;
  for (const value of [largura_mm, altura_mm, resolucao_dpi]) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error('Dimensoes/resolucao da impressora invalidas');
    }
  }
  if (!Number.isFinite(offset_horizontal_mm) || Math.abs(offset_horizontal_mm) >= largura_mm) {
    throw new Error('Offset horizontal da impressora invalido');
  }

  const dots = mm => Math.round(mm * resolucao_dpi / 25.4);
  const width = dots(largura_mm);
  const height = dots(altura_mm);
  const offset = dots(offset_horizontal_mm);

  return zpl.replace(/\^XA([\s\S]*?)\^XZ/g, (_, body) => {
    // Keep the existing vertical origin. Replace geometry only; never move
    // individual fields, resize fonts, rules or QR codes.
    const home = body.match(/\^LH\s*\d+\s*,\s*(\d+)/);
    const y = home ? Number(home[1]) : 0;
    const fields = body
      .replace(/\^PW\s*\d+/g, '')
      .replace(/\^LL\s*\d+/g, '')
      .replace(/\^LS\s*-?\d+/g, '')
      .replace(/\^LH\s*\d+\s*,\s*\d+/g, '');

    // ^LH supports positive origins; negative horizontal compensation uses
    // ^LS, whose positive values move fields left.
    const origin = Math.max(0, offset);
    const shift = Math.max(0, -offset);
    return `^XA\n^PW${width}\n^LL${height}\n^LH${origin},${y}\n^LS${shift}\n${fields.trimStart()}^XZ`;
  });
}

function applyPrinterSettings(zpl, printer) {
  const output = applyPrinterGeometry(zpl, printer);
  if (printer.intensidade === undefined) return output;
  if (!Number.isInteger(printer.intensidade) || printer.intensidade < 0 || printer.intensidade > 30) {
    throw new Error('Intensidade da impressora deve estar entre 0 e 30');
  }
  // Set absolute darkness and clear any retained relative darkness on each
  // job. This changes heat only, without changing the label layout.
  return `~SD${String(printer.intensidade).padStart(2, '0')}\n` + output.replace(/\^XA/g, '^XA\n^MD0');
}

module.exports = { applyPrinterGeometry, applyPrinterSettings };
