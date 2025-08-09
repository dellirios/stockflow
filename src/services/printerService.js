// printerService.js — versão ultra-otimizada com canal RAW 9100, batching e circuit breaker
// © 2025 StockFlow

const fs = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');
const axios = require('axios');
const net = require('net');
const crypto = require('crypto');
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
let stats = {
  uptime: Date.now(),
  processed: 0,
  duplicates: 0,
  failures: 0,
  p95_tti: []
};

// ---------- Template Hardcoded (Policy de Negócio) ---------- //
const DEFAULT_TEMPLATE = `CT~~CD,~CC^~CT~
^XA
~TA000
~JSN
^LT0
^MNW
^MTT
^PON
^PMN
^LH0,0
^JMA
^PR4,4
~SD20
^JUS
^LRN
^CI27
^PA0,1,1,0
^XZ
^XA
^MMT
^PW480
^LL480
^LS0
^FT0,101^A0N,17,20^FB466,1,4,R^FH\\^CI28^FDConservação^FS^CI27
^FT16,44^A0N,28,23^FH\\^CI28^FD{nome}^FS^CI27
^FT16,104^A0N,20,20^FH\\^CI28^FDGrupo^FS^CI27
^FT0,294^A0N,17,20^FB466,1,4,R^FH\\^CI28^FDCod. Retirada^FS^CI27
^FT16,126^A0N,20,20^FH\\^CI28^FD{grupo}^FS^CI27
^FT0,126^A0N,20,23^FB466,1,5,R^FH\\^CI28^FD{conservacao}^FS^CI27
^FT16,149^A0N,20,20^FH\\^CI28^FDEntrada^FS^CI27
^FT0,149^A0N,20,23^FB466,1,5,R^FH\\^CI28^FDValidade^FS^CI27
^FT16,177^A0N,25,25^FH\\^CI28^FD{data_entrada}^FS^CI27
^FT0,173^A0N,25,28^FB466,1,6,R^FH\\^CI28^FD{validade}^FS^CI27
^FT16,246^A0N,20,20^FH\\^CI28^FDResponsável^FS^CI27
^FT0,311^A0N,20,23^FB466,1,5,R^FH\\^CI28^FD{id_produto}^FS^CI27
^FT16,272^A0N,23,23^FH\\^CI28^FD{responsavel_entrada}^FS^CI27
^FT16,201^A0N,20,20^FH\\^CI28^FDLocal Armazenado^FS^CI27
^FT331,200^A0N,17,18^FH\\^CI28^FD{peso_formatado}^FS^CI27
^FO421,18^GFA,173,328,8,:Z64:eJx9UDEOgDAIPBsH08knGCfDKxx8GKPxFU0nwyultEnL4jHA5eAoBYEYilWjgFgszxoFMZPlCRUhvfjDIl4PiRx/ONyuH+CxXXke+Qbszk45/+hqHltdDgjcuUHn7YFn50cr7QOI41uHZ2uJIsndI1LXX82BTP4AhFUVdg==:BF79
^FT16,223^A0N,20,20^FH\\^CI28^FD{armazenado}^FS^CI27
^FT16,370^A0N,17,18^FH\\^CI28^FDFornecedor: {fornecedor}^FS^CI27
^FT16,392^A0N,17,18^FH\\^CI28^FDVal: {val_fornecedor}^FS^CI27
^FT16,413^A0N,17,18^FH\\^CI28^FDFab: {fab_fornecedor}^FS^CI27
^FT16,462^A0N,23,23^FH\\^CI28^FDCNPJ: {cnpj}^FS^CI27
^FT16,440^A0N,23,23^FH\\^CI28^FD{nm_empresa}^FS^CI27
^FT319,489^BQN,2,7
^FH\\^FDLA,{id_produto}^FS
^FT16,75^A0N,28,23^FH\\^CI28^FD{nome_2}^FS^CI27
^PQ1,0,1,Y
^XZ`;

// ---------- Utilidades ---------- //
function jitter(base, variance = 0.3) {
  return base + (Math.random() - 0.5) * 2 * variance * base;
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
  try {
    const raw = await fs.readFile(PRINTERS_CONFIG_PATH, 'utf8');
    const config = JSON.parse(raw);
    
    // Suporte para formato antigo (store_key) e novo (array)
    if (Array.isArray(config.impressoras)) {
      // Novo formato com array - converter para formato store_key
      const storeKeyConfig = {};
      for (const printer of config.impressoras) {
        if (printer.id) {
          storeKeyConfig[printer.id] = {
            nome: printer.nome,
            ip: printer.ip,
            porta: printer.porta || 9100,
            ativo: printer.ativo,
            anydesk_id: printer.anydesk_id || ''
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
    console.error('Erro ao carregar config de impressoras:', err.message);
    return printersConfigCache || {};
  }
}

function setupConfigWatcher() {
  if (configWatcher) return;
  
  try {
    configWatcher = fs.watchFile(PRINTERS_CONFIG_PATH, { interval: 5000 }, async () => {
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
  const d = new Date(iso);
  if (Number.isNaN(d)) return iso;
  const pad = n => String(n).padStart(2,'0');
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function dividirNomeProduto(nome='') {
  const palavras = nome.split(' ');
  if (palavras.length<=7 && nome.length<=36) return { nome, nome_2:'' };
  let n1='', n2='';
  for (const p of palavras) {
    if ((n1+ ' '+p).trim().length<=36 && n1.split(' ').length<7){ n1+=' '+p; }
    else { n2+=p+' '; }
  }
  return { nome:n1.trim(), nome_2:n2.trim() };
}

function preencherZPL(etiqueta) {
  // Usa template hardcoded (policy de negócio)
  let zpl = DEFAULT_TEMPLATE;

  // Formatações
  for (const campo of ['data_entrada','validade','val_fornecedor','fab_fornecedor']) {
    if (etiqueta[campo]) etiqueta[campo] = formatarDataBrasileira(etiqueta[campo]);
  }
  etiqueta.peso_formatado = `${etiqueta.peso||''}${etiqueta.unidade_medida||''}`.trim();
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
    const lp = spawn('lp', ['-d', printerName, '-n', String(copies), '-o', 'raw']);
    let stderr = '';
    
    const timer = setTimeout(() => {
      lp.kill('SIGKILL');
      reject(new Error(`Timeout CUPS para ${printerName}`));
    }, 3000);
    
    lp.stderr.on('data', d => stderr += d.toString());
    
    lp.on('close', code => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(`CUPS enviado para ${printerName} (${copies} cópia[s])`);
      } else {
        reject(new Error(stderr || `lp saiu com código ${code}`));
      }
    });
    
    lp.stdin.write(zpl);
    lp.stdin.end();
  });
}

// Função unificada de impressão com fail-safe
async function sendToPrinter(printer, zpl, copies = 1) {
  const startTime = Date.now();
  
  try {
    // Tenta canal RAW se ip/porta disponível
    if (printer.ip && printer.porta) {
      const result = await sendToPrinterRaw(printer.ip, printer.porta, zpl);
      stats.p95_tti.push(Date.now() - startTime);
      if (stats.p95_tti.length > 100) stats.p95_tti.shift();
      return result;
    }
    // Suporte para formato antigo
    if (printer.host) {
      const result = await sendToPrinterRaw(printer.host, 9100, zpl);
      stats.p95_tti.push(Date.now() - startTime);
      if (stats.p95_tti.length > 100) stats.p95_tti.shift();
      return result;
    }
  } catch (err) {
    console.log(`[Fallback] RAW falhou: ${err.message}`);
  }
  
  try {
    // Fallback para CUPS
    const printerName = printer.nome || printer.impressora;
    const result = await sendToPrinterCUPS(printerName, zpl, copies);
    stats.p95_tti.push(Date.now() - startTime);
    if (stats.p95_tti.length > 100) stats.p95_tti.shift();
    return result;
  } catch (err) {
    stats.failures++;
    throw new Error(`Ambos canais falharam: ${err.message}`);
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

// Log NDJSON estruturado
async function logImpressao(obj) {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth()+1).padStart(2,'0');
  const dd = String(now.getDate()).padStart(2,'0');
  const logFile = path.join(LOG_DIR, `impressao_${yyyy}${mm}${dd}.ndjson`);
  
  const logEntry = {
    timestamp: now.toISOString(),
    ...obj,
    circuit_breaker_state: CIRCUIT_BREAKER.state
  };
  
  const line = JSON.stringify(logEntry) + '\n';
  
  try {
    await fs.appendFile(logFile, line, 'utf8');
  } catch (err) {
    console.error('Falha ao gravar log:', err.message);
  }
}

// Batching por impressora
function groupByPrinter(etiquetas, printersConfig) {
  const groups = new Map();
  
  for (const etiqueta of etiquetas) {
    const storeKey = etiqueta.store_key;
    
    if (!storeKey) {
      console.log(`[Warn] Etiqueta sem store_key: ${etiqueta.id_produto || etiqueta.id}`);
      continue;
    }
    
    // Buscar configuração da impressora para esta empresa
    const printerConfig = printersConfig[storeKey];
    
    if (!printerConfig) {
      console.log(`[Warn] Configuração de impressora não encontrada para store_key: ${storeKey}`);
      continue;
    }
    
    if (!printerConfig.ativo) {
      console.log(`[Warn] Impressora inativa para store_key: ${storeKey}`);
      continue;
    }
    
    const jobKey = generateJobKey(etiqueta);
    if (isDuplicate(jobKey)) {
      console.log(`[Dedup] Etiqueta duplicada ignorada: ${etiqueta.id_produto || etiqueta.id}`);
      continue;
    }
    
    // Criar objeto printer compatível com o formato antigo
    const printer = {
      nome: printerConfig.nome || printerConfig.impressora,
      ip: printerConfig.ip,
      porta: printerConfig.porta,
      anydesk_id: printerConfig.anydesk_id,
      ativo: printerConfig.ativo
    };
    
    const printerKey = `${storeKey}-${printer.nome}`;
    if (!groups.has(printerKey)) {
      groups.set(printerKey, { printer, etiquetas: [] });
    }
    groups.get(printerKey).etiquetas.push(etiqueta);
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
          let zpl = preencherZPL(etiqueta);
          
          // Multiplica etiquetas se necessário
          if (qtdEtiquetas > 1) {
            zpl = zpl.replace(/\^PQ1,0,1,Y/, `^PQ${qtdEtiquetas},0,1,Y`);
          }
          
          return zpl;
        }).join('\n');
        
        // Envia batch para impressora
        const mensagem = await sendToPrinter(group.printer, batchZpl);
        updateCircuitBreaker(true);
        
        // Processa confirmações assíncronas
        for (const etiqueta of group.etiquetas) {
          const confirmacao = await confirmarImpressao(etiqueta.id_produto);
          
          const logObj = {
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
          };
          
          await logImpressao(logObj);
          
          resultados.push({
            id: etiqueta.id_produto,
            store_key: etiqueta.store_key,
            status: 'impresso',
            mensagem,
            confirmacao_api: confirmacao
          });
        }
        
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
          
          await logImpressao(logObj);
          
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
    console.error('Erro no processamento:', err.message);
    updateCircuitBreaker(false);
  } finally {
    RUNNING = false;
    
    // Atualiza estatísticas
    const processingTime = Date.now() - startTime;
    console.log(`[Stats] Processados: ${resultados.length}, Tempo: ${processingTime}ms, Duplicatas: ${stats.duplicates}`);
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
