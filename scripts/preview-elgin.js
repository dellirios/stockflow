'use strict';
// Render synthetic fixtures only. Never imports printerService, polls orders
// or submits CUPS jobs. --watch refreshes on layout/settings/fixture edits.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'logs', 'previa-elgin');
const layoutPath = path.join(root, 'src/services/elginLabelLayout.js');
const settingsPath = path.join(root, 'src/services/printerGeometry.js');
const configPath = path.join(root, 'config/printers.json');
const fixturePath = path.join(root, 'tests/fixtures/elgin-preview.json');
const watched = [layoutPath, settingsPath, configPath, fixturePath];
const endpoint = 'https://api.labelary.com/v1/printers/8dpmm/labels/2.3622047244x2.3622047244/0/';
let running = false;
let pending = false;

function reload(file) {
  delete require.cache[require.resolve(file)];
  return require(file);
}
async function render(zpl, accept) {
  let response;
  for (let attempt = 0; attempt < 3; attempt++) {
    // Keep sequential refreshes below the service's 3 requests/second limit.
    await delay(450);
    response = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: accept },
      body: zpl, signal: AbortSignal.timeout(30000),
    });
    if (response.status !== 429 || attempt === 2) break;
    const retrySeconds = Number(response.headers.get('Retry-After')) || 2;
    await response.text();
    await delay(Math.min(10000, Math.max(2000, retrySeconds * 1000)));
  }
  if (!response.ok) throw new Error(`Labelary ${response.status}: ${(await response.text()).slice(0,300)}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (accept === 'image/png' && data.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new Error('Resposta PNG invalida');
  }
  if (accept === 'application/pdf' && data.subarray(0, 5).toString() !== '%PDF-') {
    throw new Error('Resposta PDF invalida');
  }
  return data;
}
function atomicWrite(name, content) {
  const target = path.join(output, name);
  fs.writeFileSync(`${target}.tmp`, content);
  fs.renameSync(`${target}.tmp`, target);
}
async function refresh() {
  if (running) { pending = true; return; }
  running = true;
  try {
    const { buildElginLabel } = reload(layoutPath);
    const { applyPrinterSettings } = reload(settingsPath);
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const printer = config.impressoras.find(p => p.nome === 'ELGIN_L42PRO');
    if (!printer || printer.geometria.resolucao_dpi !== 203) throw new Error('Previa requer Elgin configurada em 203 dpi');
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const label = buildElginLabel(fixture);
    const actual = applyPrinterSettings(label.zpl, printer);
    const hash = createHash('sha256').update(actual).digest('hex');
    fs.mkdirSync(output, { recursive: true });
    // Three requests are sequential to respect Labelary's free API limits.
    const image = await render(label.zpl, 'image/png');
    const actualImage = await render(actual, 'image/png');
    const pdf = await render(label.zpl, 'application/pdf');
    atomicWrite('etiqueta-layout.png', image);
    atomicWrite('etiqueta-com-offset.png', actualImage);
    atomicWrite('etiqueta-layout.pdf', pdf);
    atomicWrite('etiqueta-enviada.zpl', actual);
    atomicWrite('status.json', JSON.stringify({
      status: 'ok', updated_at: new Date().toISOString(), hash,
      dados: 'exemplo de teste; CNPJ ficticio',
      renderer: 'Labelary; nao simula mecanica, ribbon ou temperatura',
      offset_horizontal_mm: printer.geometria.offset_horizontal_mm,
      intensidade: printer.intensidade,
      layout_image: 'layout antes da compensacao mecanica',
      command_image: 'comandos com offset; referencia digital da origem',
    }, null, 2));
    console.log(`${new Date().toISOString()} Previa atualizada (${hash.slice(0,12)})`);
  } catch (error) {
    fs.mkdirSync(output, { recursive: true });
    atomicWrite('status.json', JSON.stringify({ status: 'error', checked_at: new Date().toISOString(),
      error: error.message, note: 'Imagens anteriores podem estar desatualizadas' }, null, 2));
    console.error(`Previa: ${error.message}`);
    if (!process.argv.includes('--watch')) process.exitCode = 1;
  } finally {
    running = false;
    if (pending) { pending = false; await refresh(); }
  }
}

if (process.argv.includes('--watch')) {
  let timer;
  for (const file of watched) fs.watchFile(file, { interval: 2000 }, () => {
    clearTimeout(timer); timer = setTimeout(refresh, 1000);
  });
  // Retry failures without overwriting good images, with no continuous API
  // traffic while unchanged and healthy.
  setInterval(() => {
    try { if (JSON.parse(fs.readFileSync(path.join(output, 'status.json'))).status !== 'ok') refresh(); }
    catch { refresh(); }
  }, 60000);
}
refresh();
