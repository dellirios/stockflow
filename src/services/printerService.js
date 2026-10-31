/**
 * @fileoverview Versão ultra-otimizada com canais CUPS priorizados, 
 * batching e circuit breaker para impressão.
 * © 2025 StockFlow
 */

const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const axios = require('axios');
const net = require('net');
const crypto = require('crypto');
const { logger } = require('../utils/logger');
const { applyPrinterSettings } = require('./printerGeometry');
const { buildElginLabel } = require('./elginLabelLayout');
require('dotenv').config();

// ---------- Paths & Constantes ---------- //
const PRINTERS_CONFIG_PATH = path.resolve(__dirname, '../../config/printers.json');
const TEMPLATE_DIR = path.join(__dirname, '../templates');
const LOG_DIR = path.resolve(__dirname, '../../logs');

// ---------- Cache e Estado Global ---------- //
const DEDUP_CACHE = new Map(); // TTL cache para deduplicação
const CIRCUIT_BREAKER = {
  state: 'CLOSED', // CLOSED, OPEN, HALF_OPEN
  failures: 0,
  lastFailure: 0,
  timeout: 30000 // 30s
};

let printersConfigCache = null;
let configWatcher = null;
let RUNNING = false;
const throttledLogState = new Map();
const WARN_LOG_THROTTLE_MS = parseInt(process.env.WARN_LOG_THROTTLE_MS || '60000', 10);
const STATS_LOG_INTERVAL_MS = parseInt(process.env.STATS_LOG_INTERVAL_MS || '30000', 10);
const CONFIRM_CONCURRENCY = Math.max(1, parseInt(process.env.CONFIRM_CONCURRENCY || '4', 10));
const LOG_BATCH_SIZE = Math.max(1, parseInt(process.env.LOG_BATCH_SIZE || '50', 10));
const LOG_FLUSH_INTERVAL_MS = Math.max(1000, parseInt(process.env.LOG_FLUSH_INTERVAL_MS || '1000', 10));
const ZEBRA_AUTO_CALIBRATE_ENABLED = process.env.ZEBRA_AUTO_CALIBRATE_ENABLED === 'true'; // desabilitado por padrão para evitar etiquetas em branco
const ZEBRA_AUTO_CALIBRATE_MODE = (process.env.ZEBRA_AUTO_CALIBRATE_MODE || 'zd220').toLowerCase();
const ZEBRA_CALIBRATE_INTERVAL_MS = Math.max(0, parseInt(process.env.ZEBRA_CALIBRATE_INTERVAL_MS || '300000', 10));
const ZEBRA_CALIBRATE_PREAMBLE = process.env.ZEBRA_CALIBRATE_PREAMBLE || '~JC\n';
const ZEBRA_CALIBRATE_SETTLE_MS = Math.max(0, parseInt(process.env.ZEBRA_CALIBRATE_SETTLE_MS || '1500', 10));
const ZEBRA_PRECALIBRATE_BEFORE_PRINT = process.env.ZEBRA_PRECALIBRATE_BEFORE_PRINT === 'true'; // desabilitado por padrão para evitar etiquetas em branco
const ZEBRA_CALIBRATE_ON_FAILURE = process.env.ZEBRA_CALIBRATE_ON_FAILURE !== 'false';
const ZEBRA_RESUME_BEFORE_PRINT = process.env.ZEBRA_RESUME_BEFORE_PRINT === 'true'; // desabilitado por padrão para evitar etiquetas em branco
const ZEBRA_RESUME_INTERVAL_MS = Math.max(0, parseInt(process.env.ZEBRA_RESUME_INTERVAL_MS || '3000', 10));
const ZEBRA_RESUME_SETTLE_MS = Math.max(0, parseInt(process.env.ZEBRA_RESUME_SETTLE_MS || '300', 10));
const ZEBRA_RESUME_COMMAND = process.env.ZEBRA_RESUME_COMMAND || '~PS\n! U1 DO "device.unpause" ""\n';
const ALLOWED_STORE_KEYS = new Set(
  (process.env.ALLOWED_STORE_KEYS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
);
let lastStatsLogAt = 0;
const logBuffer = [];
let logFlushInFlight = null;
let logFlushTimerStarted = false;
const zebraCalibrateState = new Map();
const zebraResumeState = new Map();
let stats = {
  uptime: Date.now(),
  processed: 0,
  duplicates: 0,
  failures: 0,
  p95_tti: []
};

// ---------- Template Hardcoded (Policy de Negócio) ---------- //
const DEFAULT_TEMPLATE = `^XA
^MMT
^PW480
^LL480
^LS0
^CI28

^FT16,34^A0N,29,27^FH\^FD{nome}^FS
^FT16,57^A0N,21,21^FH\^FD{nome_2}^FS

^FO0,67^GB480,0,3^FS

^FT16,85^A0N,13,13^FH\^FDGRUPO^FS
^FT16,103^A0N,18,18^FH\^FD{grupo}^FS
^FT0,85^A0N,13,13^FB464,1,0,R^FH\^FDCONSERVACAO^FS
^FT0,103^A0N,18,18^FB464,1,0,R^FH\^FD{conservacao}^FS

^FO0,113^GB480,0,1^FS

^FT16,129^A0N,13,13^FH\^FDPESO^FS
^FT16,148^A0N,18,18^FH\^FD{peso_formatado}^FS
^FT0,129^A0N,13,13^FB464,1,0,R^FH\^FDSIF / LOTE^FS
^FT0,148^A0N,18,18^FB464,1,0,R^FH\^FD{sif_lote}^FS

^FO0,158^GB480,0,3^FS

^FT16,175^A0N,14,14^FH\^FDDATA DE ENTRADA^FS
^FT16,204^A0N,27,27^FH\^FD{data_entrada}^FS
^FT0,175^A0N,14,14^FB464,1,0,R^FH\^FDVALIDADE^FS
^FT0,204^A0N,27,27^FB464,1,0,R^FH\^FD{validade}^FS

^FO0,215^GB480,0,3^FS

^FT16,232^A0N,13,13^FH\^FDLOCAL ARMAZENADO^FS
^FT16,251^A0N,18,18^FH\^FD{armazenado}^FS
^FT0,232^A0N,13,13^FB464,1,0,R^FH\^FDRESPONSAVEL^FS
^FT0,251^A0N,17,17^FB464,1,0,R^FH\^FD{responsavel_entrada}^FS

^FO0,261^GB480,0,1^FS

^FT16,277^A0N,13,13^FH\^FDFORNECEDOR^FS
^FT16,295^A0N,17,17^FH\^FD{fornecedor}^FS
^FT16,311^A0N,13,13^FH\^FDVal: {val_fornecedor}  Fab: {fab_fornecedor}^FS

^FO0,321^GB480,0,1^FS

^FT16,338^A0N,16,16^FH\^FD{nm_empresa}^FS
^FT0,338^A0N,13,13^FB464,1,0,R^FH\^FDCNPJ: {cnpj}^FS

^FO0,352^GB480,0,2^FS

^FT16,370^A0N,13,13^FH\^FDCÓDIGO RETIRADA^FS
^FT16,396^A0N,24,24^FH\^FD{id_produto}^FS

^FT316,480^BQN,2,4
^FH\^FDLA,{id_produto}^FS

^PQ1,0,1,Y
^XZ`;

// ---------- Utilidades ---------- //
function jitter(base, variance = 0.3) {
  return base + (Math.random() - 0.5) * 2 * variance * base;
}

function logThrottled(key, message, intervalMs = WARN_LOG_THROTTLE_MS) {
  const now = Date.now();
  const state = throttledLogState.get(key) || { lastLogAt: 0, suppressed: 0 };

  if (now - state.lastLogAt >= intervalMs) {
    const suffix = state.suppressed > 0 ? ` (suprimidos ${state.suppressed} repetidos)` : '';
    console.log(`${message}${suffix}`);
    throttledLogState.set(key, { lastLogAt: now, suppressed: 0 });
    return;
  }

  state.suppressed++;
  throttledLogState.set(key, state);
}

function mapWithConcurrency(items, limit, worker) {
  return new Promise((resolve, reject) => {
    if (!Array.isArray(items) || items.length === 0) {
      resolve([]);
      return;
    }

    const results = new Array(items.length);
    let nextIndex = 0;
    let active = 0;
    let settled = 0;
    let failed = false;

    function launch() {
      while (!failed && active < limit && nextIndex < items.length) {
        const current = nextIndex++;
        active++;

        Promise.resolve(worker(items[current], current))
          .then(result => {
            results[current] = result;
          })
          .catch(err => {
            failed = true;
            reject(err);
          })
          .finally(() => {
            active--;
            settled++;
            if (failed) return;
            if (settled === items.length) {
              resolve(results);
              return;
            }
            launch();
          });
      }
    }

    launch();
  });
}

function canAutoCalibrateNow(printerName = '') {
  if (!ZEBRA_AUTO_CALIBRATE_ENABLED) return false;

  const normalized = String(printerName || '');
  const isZd220 = /ZD220/i.test(normalized);
  if (ZEBRA_AUTO_CALIBRATE_MODE === 'zd220' && !isZd220) return false;

  const now = Date.now();
  const key = normalized || 'default';
  const last = zebraCalibrateState.get(key) || 0;
  if (now - last < ZEBRA_CALIBRATE_INTERVAL_MS) return false;

  zebraCalibrateState.set(key, now);
  return true;
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runCalibration(printer) {
  const printerName = printer.nome || printer.impressora;
  const calibrationPayload = ZEBRA_CALIBRATE_PREAMBLE;

  try {
    await sendToPrinterCUPS(printerName, calibrationPayload, 1);
    await sleep(ZEBRA_CALIBRATE_SETTLE_MS);
    return;
  } catch (_) { }

  try {
    if (printer.ip && printer.porta && printer.ip !== 'localhost') {
      await sendToPrinterRaw(printer.ip, printer.porta, calibrationPayload);
      await sleep(ZEBRA_CALIBRATE_SETTLE_MS);
      return;
    }
    if (printer.host && printer.host !== 'localhost') {
      await sendToPrinterRaw(printer.host, 9100, calibrationPayload);
      await sleep(ZEBRA_CALIBRATE_SETTLE_MS);
      return;
    }
  } catch (_) { }

  await sendToPrinterCUPS('', calibrationPayload, 1);
  await sleep(ZEBRA_CALIBRATE_SETTLE_MS);
}

function shouldSendResume(printerName = '') {
  if (!ZEBRA_RESUME_BEFORE_PRINT) return false;
  if (ZEBRA_AUTO_CALIBRATE_MODE === 'zd220' && !/ZD220/i.test(String(printerName || ''))) return false;

  const key = String(printerName || 'default');
  const now = Date.now();
  const last = zebraResumeState.get(key) || 0;
  if (now - last < ZEBRA_RESUME_INTERVAL_MS) return false;

  zebraResumeState.set(key, now);
  return true;
}

async function runResume(printer) {
  const printerName = printer.nome || printer.impressora;
  if (!shouldSendResume(printerName)) return;

  logThrottled(
    `zebra:auto-resume:${printerName || 'default'}`,
    `[Info] Comando de resume automático enviado para ${printerName || 'impressora padrão'}`,
    60000
  );

  try {
    await sendToPrinterCUPS(printerName, ZEBRA_RESUME_COMMAND, 1);
    await sleep(ZEBRA_RESUME_SETTLE_MS);
    return;
  } catch (_) { }

  try {
    if (printer.ip && printer.porta && printer.ip !== 'localhost') {
      await sendToPrinterRaw(printer.ip, printer.porta, ZEBRA_RESUME_COMMAND);
      await sleep(ZEBRA_RESUME_SETTLE_MS);
      return;
    }
    if (printer.host && printer.host !== 'localhost') {
      await sendToPrinterRaw(printer.host, 9100, ZEBRA_RESUME_COMMAND);
      await sleep(ZEBRA_RESUME_SETTLE_MS);
      return;
    }
  } catch (_) { }

  await sendToPrinterCUPS('', ZEBRA_RESUME_COMMAND, 1);
  await sleep(ZEBRA_RESUME_SETTLE_MS);
}

function generateJobKey(etiqueta) {
  const critical = `${etiqueta.store_key}|${etiqueta.id_produto}|${etiqueta.etiquetas || 1}|${etiqueta.nome}`;
  return crypto.createHash('sha1').update(critical).digest('hex');
}

function isDuplicate(jobKey) {
  const now = Date.now();
  const TTL = 15 * 60 * 1000; // 15 min

  // Limpa entradas expiradas
  for (const [key, timestamp] of DEDUP_CACHE.entries()) {
    if (now - timestamp > TTL) {
      DEDUP_CACHE.delete(key);
    }
  }

  if (DEDUP_CACHE.has(jobKey)) {
    stats.duplicates++;
    return true;
  }

  DEDUP_CACHE.set(jobKey, now);
  return false;
}

function updateCircuitBreaker(success) {
  const now = Date.now();

  if (success) {
    CIRCUIT_BREAKER.failures = 0;
    if (CIRCUIT_BREAKER.state === 'HALF_OPEN') {
      CIRCUIT_BREAKER.state = 'CLOSED';
    }
  } else {
    CIRCUIT_BREAKER.failures++;
    CIRCUIT_BREAKER.lastFailure = now;

    if (CIRCUIT_BREAKER.failures >= 3 && CIRCUIT_BREAKER.state === 'CLOSED') {
      CIRCUIT_BREAKER.state = 'OPEN';
    }
  }
}

function isCircuitBreakerOpen() {
  const now = Date.now();

  if (CIRCUIT_BREAKER.state === 'OPEN') {
    if (now - CIRCUIT_BREAKER.lastFailure > CIRCUIT_BREAKER.timeout) {
      CIRCUIT_BREAKER.state = 'HALF_OPEN';
      return false;
    }
    return true;
  }

  return false;
}

async function loadPrintersConfig() {
  if (printersConfigCache) {
    return printersConfigCache;
  }

  try {
    const raw = await fs.readFile(PRINTERS_CONFIG_PATH, 'utf8');
    const config = JSON.parse(raw);

    // Suporte para formato antigo (store_key) e novo (array)
    if (config.impressoras && Array.isArray(config.impressoras)) {
      // Novo formato com array - converter para formato store_key
      const storeKeyConfig = {};
      for (const printer of config.impressoras) {
        if (printer.id) {
          storeKeyConfig[printer.id] = {
            nome: printer.nome,
            ip: printer.ip,
            porta: printer.porta || 9100,
            ativo: printer.ativo,
            anydesk_id: printer.anydesk_id || '',
            geometria: printer.geometria,
            intensidade: printer.intensidade
          };
        }
      }
      printersConfigCache = storeKeyConfig;
    } else {
      // Formato store_key (atual) - usar diretamente
      printersConfigCache = config;
    }

    // Validação básica
    for (const [storeKey, printer] of Object.entries(printersConfigCache)) {
      if (typeof printer.ativo !== 'boolean' || (!printer.nome && !printer.impressora)) {
        throw new Error(`Configuração inválida para store_key ${storeKey}`);
      }
    }

    return printersConfigCache;
  } catch (err) {
    // Use enhanced error logging for critical printer config failures
    logger.logCritical(err, {
      context: 'printer_config_load_failure',
      config_path: PRINTERS_CONFIG_PATH,
      cache_available: !!printersConfigCache
    });
    return printersConfigCache || {};
  }
}

function setupConfigWatcher() {
  if (configWatcher) return;

  try {
    configWatcher = fsSync.watchFile(PRINTERS_CONFIG_PATH, { interval: 5000 }, async () => {
      try {
        console.log('[Config] Recarregando printers.json...');
        printersConfigCache = null;
        await loadPrintersConfig();
      } catch (err) {
        console.error('[Config] Erro no hot-reload:', err.message);
      }
    });
  } catch (err) {
    console.error('[Config] Erro ao configurar watcher:', err.message);
  }
}

function formatarDataBrasileira(iso) {
  if (/^\d{2}\/\d{2}\/\d{4}(?: \d{2}:\d{2})?$/.test(String(iso))) return String(iso);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = n => String(n).padStart(2, '0');
  // Retorna data + hora (usado para data_entrada)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatarDataSemHora(iso) {
  const localDate = String(iso).match(/^(\d{2}\/\d{2}\/\d{4})(?: \d{2}:\d{2})?$/);
  if (localDate) return localDate[1];
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = n => String(n).padStart(2, '0');
  // Retorna apenas a data (usado para validade, val_fornecedor, fab_fornecedor)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function dividirNomeProduto(nome = '') {
  const palavras = nome.split(' ');
  if (palavras.length <= 7 && nome.length <= 36) return { nome, nome_2: '' };
  let n1 = '', n2 = '';
  for (const p of palavras) {
    if ((n1 + ' ' + p).trim().length <= 36 && n1.split(' ').length < 7) { n1 += ' ' + p; }
    else { n2 += p + ' '; }
  }
  return { nome: n1.trim(), nome_2: n2.trim() };
}

function formatarPeso(peso, unidade = '') {
  let valor = String(peso ?? '').trim();
  if (/^[+-]?\d+(?:[.,]\d+)?$/.test(valor)) {
    valor = valor.replace(/([.,]\d*?[1-9])0+$/, '$1').replace(/[.,]0+$/, '');
  }
  return `${valor}${unidade || ''}`.trim();
}

function preencherZPL(etiqueta, printer = {}) {
  if (printer.nome === 'ELGIN_L42PRO') {
    const fields = { ...etiqueta };
    if (fields.data_entrada) fields.data_entrada = formatarDataBrasileira(fields.data_entrada);
    for (const field of ['validade', 'val_fornecedor', 'fab_fornecedor']) {
      if (fields[field]) fields[field] = formatarDataSemHora(fields[field]);
    }
    fields.peso_formatado = fields.peso_formatado || formatarPeso(fields.peso, fields.unidade_medida);
    return buildElginLabel(fields).zpl;
  }
  // Usa template hardcoded (policy de negócio)
  let zpl = DEFAULT_TEMPLATE;

  // Formatações: data_entrada mantém hora, demais campos exibem só a data
  if (etiqueta.data_entrada) etiqueta.data_entrada = formatarDataBrasileira(etiqueta.data_entrada);
  for (const campo of ['validade', 'val_fornecedor', 'fab_fornecedor']) {
    if (etiqueta[campo]) etiqueta[campo] = formatarDataSemHora(etiqueta[campo]);
  }
  etiqueta.peso_formatado = formatarPeso(etiqueta.peso, etiqueta.unidade_medida);
  const nomes = dividirNomeProduto(etiqueta.nome);
  etiqueta.nome = nomes.nome;
  etiqueta.nome_2 = nomes.nome_2;

  // Substituição simples {campo}
  return zpl.replace(/\{([^}]+)\}/g, (_, k) => etiqueta[k] ?? '');
}

// ---------- Impressão Otimizada ---------- //

// Canal RAW 9100 com timeout agressivo
async function sendToPrinterRaw(host, port, zpl, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(port, host);

    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Timeout TCP 9100 para ${host}`));
    }, timeout);

    socket.on('connect', () => {
      socket.write(zpl);
      socket.end();
    });

    socket.on('close', () => {
      clearTimeout(timer);
      resolve(`TCP 9100 enviado para ${host}`);
    });

    socket.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// Fallback CUPS com configuração otimizada
function sendToPrinterCUPS(printerName, zpl, copies = 1) {
  return new Promise((resolve, reject) => {
    // Determina os argumentos. Se printerName for vazio, não usa -d, forçando o padrão do CUPS.
    const args = ['-n', String(copies), '-o', 'raw'];
    let logName = 'Padrão do Sistema';
    if (printerName) {
      args.unshift('-d', printerName);
      logName = printerName;
    }

    const lp = spawn('lp', args);
    let stderr = '';

    const timer = setTimeout(() => {
      lp.kill('SIGKILL');
      reject(new Error(`Timeout CUPS para ${logName}`));
    }, 3000);

    lp.stderr.on('data', d => stderr += d.toString());

    lp.on('close', code => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(`CUPS enviado para ${logName} (${copies} cópia[s])`);
      } else {
        // Loga o erro exato do comando lp (que causava o status Retido)
        reject(new Error(`lp falhou com código ${code}. Erro: ${stderr.trim() || 'Nenhum erro de stdout/stderr.'}`));
      }
    });

    lp.stdin.write(zpl);
    lp.stdin.end();
  });
}

// Função unificada de impressão com fail-safe
async function sendToPrinter(printer, zpl, copies = 1, retryAfterCalibration = true) {
  const startTime = Date.now();

  const printerName = printer.nome || printer.impressora;
  const payload = applyPrinterSettings(zpl, printer);

  // Mitigação prática para ZD220 pós abertura/fechamento de tampa:
  // realiza pré-calibração automática em janela controlada.
  if (ZEBRA_PRECALIBRATE_BEFORE_PRINT && canAutoCalibrateNow(printerName)) {
    try {
      logThrottled(
        `zebra:auto-precalibrate:${printerName || 'default'}`,
        `[Info] Pré-calibração automática Zebra para ${printerName || 'impressora padrão'} antes do job.`,
        60000
      );
      await runCalibration(printer);
    } catch (calErr) {
      logger.warn(`Pré-calibração Zebra falhou: ${calErr.message}`);
    }
  }

  try {
    await runResume(printer);
  } catch (resumeErr) {
    logger.warn(`Resume automático Zebra falhou: ${resumeErr.message}`);
  }

  try {
    // 1. Tenta CUPS usando o NOME da impressora configurada (Melhor caminho para USB/Linux)
    const result = await sendToPrinterCUPS(printerName, payload, copies);
    stats.p95_tti.push(Date.now() - startTime);
    if (stats.p95_tti.length > 100) stats.p95_tti.shift();
    logger.debug(`Impressão bem-sucedida via CUPS: ${printerName}`);
    return result;
  } catch (err) {
    console.log(`[Fallback-1] CUPS (Nome Específico) falhou: ${err.message}`);
    // Continua para o segundo fallback: TCP/RAW
  }

  try {
    // 2. Fallback para canal RAW 9100 (Somente se IP/Porta forem definidos E não for localhost)
    if (printer.ip && printer.porta && printer.ip !== 'localhost') {
      const result = await sendToPrinterRaw(printer.ip, printer.porta, payload);
      stats.p95_tti.push(Date.now() - startTime);
      if (stats.p95_tti.length > 100) stats.p95_tti.shift();
      logger.warn(`Impressão realizada via Fallback TCP/RAW para ${printer.ip}`);
      return result;
    }
    // Suporte para formato antigo (host)
    if (printer.host && printer.host !== 'localhost') {
      const result = await sendToPrinterRaw(printer.host, 9100, payload);
      stats.p95_tti.push(Date.now() - startTime);
      if (stats.p95_tti.length > 100) stats.p95_tti.shift();
      return result;
    }
  } catch (err) {
    console.log(`[Fallback-2] RAW TCP/IP falhou: ${err.message}`);
    // Continua para o terceiro fallback
  }

  // 3. Fallback Final: Impressora Padrão do Sistema (Resiliência Máxima)
  try {
    // Envia para a impressora padrão do CUPS (passando string vazia para sendToPrinterCUPS)
    const result = await sendToPrinterCUPS('', payload, copies);
    stats.p95_tti.push(Date.now() - startTime);
    if (stats.p95_tti.length > 100) stats.p95_tti.shift();
    logger.warn(`Impressão realizada via Fallback: Impressora Padrão do Sistema.`);
    return result;
  } catch (err) {
    if (retryAfterCalibration && ZEBRA_CALIBRATE_ON_FAILURE && canAutoCalibrateNow(printerName)) {
      try {
        logThrottled(
          `zebra:auto-calibrate:${printerName || 'default'}`,
          `[Info] Falha de impressão detectada. Executando auto-calibração para ${printerName || 'impressora padrão'} e repetindo job.`,
          60000
        );
        await runCalibration(printer);
        return sendToPrinter(printer, zpl, copies, false);
      } catch (calErr) {
        stats.failures++;
        throw new Error(`Falha de impressão e falha de auto-calibração. Erro calibração: ${calErr.message}. Erro original: ${err.message}`);
      }
    }

    stats.failures++;
    // Se o fallback final falhar, registra a falha crítica.
    throw new Error(`Todos os canais falharam (RAW, Nome Específico, Padrão do Sistema). Último erro: ${err.message}`);
  }
}

// Confirmação assíncrona com retry exponencial
async function confirmarImpressao(id_produto, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const { data } = await axios.post('https://stockflow.pro/status.php', {
        status: 'concluido',
        id_produto
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 3000
      });
      return { success: true, data };
    } catch (err) {
      if (attempt === maxRetries) {
        return { success: false, error: err.message, impresso_sem_confirmacao: true };
      }

      // Backoff exponencial com jitter
      const delay = jitter(Math.pow(2, attempt - 1) * 500);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

function startLogFlushTimer() {
  if (logFlushTimerStarted) return;
  logFlushTimerStarted = true;
  const timer = setInterval(() => {
    void flushLogBuffer();
  }, LOG_FLUSH_INTERVAL_MS);
  if (typeof timer.unref === 'function') timer.unref();
}

async function flushLogBuffer() {
  if (logFlushInFlight) return logFlushInFlight;
  if (logBuffer.length === 0) return;

  const entries = logBuffer.splice(0, logBuffer.length);

  logFlushInFlight = (async () => {
    try {
      const grouped = new Map();
      for (const entry of entries) {
        const list = grouped.get(entry.logFile) || [];
        list.push(entry.line);
        grouped.set(entry.logFile, list);
      }

      for (const [logFile, lines] of grouped.entries()) {
        try {
          const stats = await fs.stat(logFile).catch(() => null);
          if (stats && stats.size > 10 * 1024 * 1024) {
            // Se o arquivo passou de 10MB, rotacionamos removendo o antigo
            // ou simplesmente paramos de escrever para este arquivo específico hoje.
            // Aqui optamos por truncar para manter apenas as novas mensagens se o usuário pediu para "reduzir".
            await fs.writeFile(logFile, lines.join(''), 'utf8');
          } else {
            await fs.appendFile(logFile, lines.join(''), 'utf8');
          }
        } catch (err) {
          await fs.appendFile(logFile, lines.join(''), 'utf8');
        }
      }
    } catch (err) {
      console.error('Falha ao gravar log em lote:', err.message);
    } finally {
      logFlushInFlight = null;
    }
  })();

  return logFlushInFlight;
}

// Log de impressão unificado em formato texto (legível)
function logImpressao(obj) {
  const now = new Date();
  const timestamp = now.toISOString().replace('T', ' ').split('.')[0];
  const logFile = path.join(LOG_DIR, 'impressao.log');

  // Formato: [DATA HORA] LOJA: store_key | PRODUTO: nome | QTD: n | STATUS: status | MSG: mensagem
  const line = `[${timestamp}] LOJA: ${obj.store_key || 'N/A'} | PRODUTO: ${obj.nome_produto || obj.id_produto} | QTD: ${obj.quantidade || 1} | STATUS: ${obj.status} | MSG: ${obj.mensagem || 'OK'}\n`;

  logBuffer.push({
    logFile,
    line
  });

  if (logBuffer.length >= LOG_BATCH_SIZE) {
    void flushLogBuffer();
  }
}

// Batching por impressora
function groupByPrinter(etiquetas, printersConfig) {
  const groups = new Map();
  const missingStoreKeyCount = { total: 0 };
  const blockedByAllowlistCount = { total: 0 };
  const unknownStoreCounts = new Map();
  const inactiveStoreCounts = new Map();

  for (const etiqueta of etiquetas) {
    const storeKey = etiqueta.store_key;

    if (!storeKey) {
      missingStoreKeyCount.total++;
      continue;
    }

    if (ALLOWED_STORE_KEYS.size > 0 && !ALLOWED_STORE_KEYS.has(storeKey)) {
      blockedByAllowlistCount.total++;
      continue;
    }

    // Buscar configuração da impressora para esta empresa
    const printerConfig = printersConfig[storeKey];

    if (!printerConfig) {
      unknownStoreCounts.set(storeKey, (unknownStoreCounts.get(storeKey) || 0) + 1);
      continue;
    }

    if (!printerConfig.ativo) {
      inactiveStoreCounts.set(storeKey, (inactiveStoreCounts.get(storeKey) || 0) + 1);
      continue;
    }

    const jobKey = generateJobKey(etiqueta);
    if (isDuplicate(jobKey)) {
      logThrottled('dedup:ignored', `[Dedup] Etiqueta duplicada ignorada: ${etiqueta.id_produto || etiqueta.id}`, 15000);
      continue;
    }

    // Criar objeto printer compatível com o formato antigo
    const printer = {
      nome: printerConfig.nome || printerConfig.impressora,
      ip: printerConfig.ip,
      porta: printerConfig.porta,
      anydesk_id: printerConfig.anydesk_id,
      ativo: printerConfig.ativo,
      geometria: printerConfig.geometria,
      intensidade: printerConfig.intensidade
    };

    const printerKey = `${storeKey}-${printer.nome}`;
    if (!groups.has(printerKey)) {
      groups.set(printerKey, { printer, etiquetas: [] });
    }
    groups.get(printerKey).etiquetas.push(etiqueta);
  }

  if (missingStoreKeyCount.total > 0) {
    logThrottled(
      'warn:no-store-key:summary',
      `[Warn] ${missingStoreKeyCount.total} etiqueta(s) ignorada(s) sem store_key`,
      120000
    );
  }

  if (unknownStoreCounts.size > 0) {
    const total = [...unknownStoreCounts.values()].reduce((acc, n) => acc + n, 0);
    const stores = [...unknownStoreCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([key, count]) => `${key}(${count})`)
      .join(', ');
    logThrottled(
      'warn:no-printer-config:summary',
      `[Warn] ${total} etiqueta(s) ignorada(s) sem configuração de impressora. Stores: ${stores}`,
      300000
    );
  }

  if (blockedByAllowlistCount.total > 0) {
    logThrottled(
      'warn:allowlist:summary',
      `[Warn] ${blockedByAllowlistCount.total} etiqueta(s) ignorada(s) pelo filtro de lojas autorizadas`,
      300000
    );
  }

  if (inactiveStoreCounts.size > 0) {
    const total = [...inactiveStoreCounts.values()].reduce((acc, n) => acc + n, 0);
    const stores = [...inactiveStoreCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([key, count]) => `${key}(${count})`)
      .join(', ');
    logThrottled(
      'warn:inactive-printer:summary',
      `[Warn] ${total} etiqueta(s) ignorada(s) por impressora inativa. Stores: ${stores}`,
      300000
    );
  }

  return groups;
}

// ---------- Serviço Principal ---------- //
async function imprimirEtiquetas(payload) {
  if (RUNNING) return { status: 'busy', message: 'Processamento em andamento' };
  RUNNING = true;

  const resultados = [];
  const startTime = Date.now();

  try {
    if (!payload?.data || !Array.isArray(payload.data)) {
      throw new Error('JSON malformado');
    }

    // Circuit breaker check
    if (isCircuitBreakerOpen()) {
      throw new Error('Circuit breaker aberto - aguardando recuperação');
    }

    const printersConfig = await loadPrintersConfig();
    const groups = groupByPrinter(payload.data, printersConfig);

    // Processa cada grupo de impressora
    for (const [printerName, group] of groups) {
      try {
        // Concatena ZPLs para batching (quando aplicável)
        const batchZpl = group.etiquetas.map(etiqueta => {
          const qtdEtiquetas = parseInt(etiqueta.etiquetas) || 1;
          let zpl = preencherZPL(etiqueta, group.printer);

          // Multiplica etiquetas se necessário
          if (qtdEtiquetas > 1) {
            zpl = zpl.replace(/\^PQ1,0,1,Y/, `^PQ${qtdEtiquetas},0,1,Y`);
          }

          return zpl;
        }).join('\n');

        // Envia batch para impressora
        const mensagem = await sendToPrinter(group.printer, batchZpl);
        updateCircuitBreaker(true);

        // Processa confirmações com concorrência limitada
        const confirmResults = await mapWithConcurrency(
          group.etiquetas,
          CONFIRM_CONCURRENCY,
          async (etiqueta) => {
            const confirmacao = await confirmarImpressao(etiqueta.id_produto);

            logImpressao({
              data: new Date().toISOString().split('T')[0],
              hora: new Date().toTimeString().split(' ')[0],
              store_key: etiqueta.store_key,
              nm_empresa: etiqueta.nm_empresa,
              id_produto: etiqueta.id_produto,
              nome_produto: etiqueta.nome,
              quantidade: parseInt(etiqueta.etiquetas) || 1,
              impressora: group.printer.nome,
              status: 'impresso',
              mensagem,
              confirmacao_api: confirmacao,
              anydesk_id: group.printer.anydesk_id || process.env.ANYDESK_ID || 'N/A',
              batch_size: group.etiquetas.length
            });

            return {
              id: etiqueta.id_produto,
              store_key: etiqueta.store_key,
              status: 'impresso',
              mensagem,
              confirmacao_api: confirmacao
            };
          }
        );

        resultados.push(...confirmResults);

        stats.processed += group.etiquetas.length;

      } catch (err) {
        updateCircuitBreaker(false);

        // Log de erro para o grupo
        for (const etiqueta of group.etiquetas) {
          const logObj = {
            data: new Date().toISOString().split('T')[0],
            hora: new Date().toTimeString().split(' ')[0],
            store_key: etiqueta.store_key,
            nm_empresa: etiqueta.nm_empresa,
            id_produto: etiqueta.id_produto,
            nome_produto: etiqueta.nome,
            quantidade: parseInt(etiqueta.etiquetas) || 1,
            impressora: group.printer.impressora,
            status: 'erro',
            mensagem: err.message,
            anydesk_id: group.printer.anydesk_id || process.env.ANYDESK_ID || 'N/A'
          };

          logImpressao(logObj);

          resultados.push({
            id: etiqueta.id_produto,
            store_key: etiqueta.store_key,
            status: 'erro',
            mensagem: err.message
          });
        }
      }
    }

  } catch (err) {
    // Use enhanced error logging for critical printing failures
    logger.logCritical(err, {
      context: 'printing_service_failure',
      payload_size: payload?.data?.length || 0,
      circuit_breaker_state: CIRCUIT_BREAKER.state,
      running_state: RUNNING,
      stats
    });
    updateCircuitBreaker(false);
  } finally {
    RUNNING = false;

    // Atualiza estatísticas
    const processingTime = Date.now() - startTime;
    const now = Date.now();
    if (resultados.length > 0 || now - lastStatsLogAt >= STATS_LOG_INTERVAL_MS) {
      console.log(`[Stats] Processados: ${resultados.length}, Tempo: ${processingTime}ms, Duplicatas: ${stats.duplicates}`);
      lastStatsLogAt = now;
    }
  }

  return resultados;
}

// Endpoint de health com métricas
function getHealthStats() {
  const now = Date.now();
  const uptimeSeconds = Math.floor((now - stats.uptime) / 1000);

  // Calcula P95 TTI
  const sortedTti = [...stats.p95_tti].sort((a, b) => a - b);
  const p95Index = Math.floor(sortedTti.length * 0.95);
  const p95_tti = sortedTti[p95Index] || 0;

  return {
    status: 'ok',
    uptime: uptimeSeconds,
    cpu_rss: Math.round(process.memoryUsage().rss / 1024 / 1024), // MB
    breaker_state: CIRCUIT_BREAKER.state,
    queue_size: RUNNING ? 1 : 0,
    p95_tti,
    stats: {
      processed: stats.processed,
      duplicates: stats.duplicates,
      failures: stats.failures
    }
  };
}

// Inicialização
setupConfigWatcher();
loadPrintersConfig();
startLogFlushTimer();

module.exports = {
  imprimirEtiquetas,
  getHealthStats,
  // Funções para testes
  generateJobKey,
  isDuplicate,
  isCircuitBreakerOpen,
  loadPrintersConfig,
  preencherZPL,
  jitter,
  formatarDataBrasileira,
  sendToPrinter,
  updateCircuitBreaker
};
