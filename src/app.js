// src/app.js - Versão Otimizada
// © 2025 StockFlow

require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const axios = require('axios');
const etiquetasRouter = require('./api/etiquetas');
const versionRouter = require('./api/version');
const { imprimirEtiquetas, getHealthStats } = require('./services/printerService');
const VersionManager = require('./utils/versionManager');

// ---------- Configuração e Constantes ---------- //
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';
const LONG_POLL_URL = process.env.LONG_POLL_URL || 'https://stockflow.pro/start.php';
const IS_PROD = process.env.NODE_ENV === 'production';

// ---------- Logger Simples ---------- //
// Um logger simples para padronizar as mensagens e controlar a verbosidade.
const logger = {
  info: (msg) => console.log(`[${new Date().toISOString()}] [INFO] ${msg}`),
  error: (msg, err) => console.error(`[${new Date().toISOString()}] [ERROR] ${msg}`, err || ''),
  debug: (obj) => {
    if (!IS_PROD) {
      console.dir(obj, { depth: null });
    }
  },
};

// ---------- Aplicação Express ---------- //
const app = express();

// Segurança: remover header X-Powered-By
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set('X-Powered-By', '');
  res.removeHeader('X-Powered-By');
  next();
});

app.use(express.json({ limit: '2mb' }));
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));

// Use um logger HTTP menos verboso em produção.
app.use(IS_PROD ? morgan('tiny') : morgan('dev'));

// ---------- Rotas e Middlewares ---------- //
app.get('/health', (req, res) => {
  try {
    const healthStats = getHealthStats();
    const systemStats = {
      ...healthStats,
      daemon_failures: consecutiveFailures,
      daemon_circuit_breaker: consecutiveFailures >= MAX_FAILURES,
      node_uptime: Math.floor(process.uptime()),
      memory_usage: {
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
      },
      cpu_usage: process.cpuUsage()
    };
    res.status(200).json(systemStats);
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});
app.use('/imprimir-etiqueta', etiquetasRouter);
app.use('/api/version', versionRouter);

// Endpoint de métricas simplificado
app.get('/metrics', (req, res) => {
  try {
    const stats = getHealthStats();
    const metrics = [
      `# HELP stockflow_uptime_seconds Uptime do serviço em segundos`,
      `# TYPE stockflow_uptime_seconds counter`,
      `stockflow_uptime_seconds ${stats.uptime}`,
      `# HELP stockflow_processed_total Total de etiquetas processadas`,
      `# TYPE stockflow_processed_total counter`, 
      `stockflow_processed_total ${stats.stats.processed}`,
      `# HELP stockflow_duplicates_total Total de duplicatas detectadas`,
      `# TYPE stockflow_duplicates_total counter`,
      `stockflow_duplicates_total ${stats.stats.duplicates}`,
      `# HELP stockflow_failures_total Total de falhas`,
      `# TYPE stockflow_failures_total counter`,
      `stockflow_failures_total ${stats.stats.failures}`,
      `# HELP stockflow_p95_tti_ms P95 do tempo de impressão em ms`,
      `# TYPE stockflow_p95_tti_ms gauge`,
      `stockflow_p95_tti_ms ${stats.p95_tti}`,
      `# HELP stockflow_memory_rss_mb Memória RSS em MB`,
      `# TYPE stockflow_memory_rss_mb gauge`,
      `stockflow_memory_rss_mb ${stats.cpu_rss}`
    ].join('\n');
    
    res.set('Content-Type', 'text/plain');
    res.send(metrics);
  } catch (err) {
    res.status(500).send('# Error generating metrics');
  }
});

// Middleware de erro genérico
app.use((err, req, res, next) => {
  logger.error('Erro não tratado na aplicação:', err);
  res.status(500).json({ status: 'error', message: 'Erro interno do servidor.' });
});


// ---------- Daemon Otimizado com Circuit Breaker ---------- //
let keepRunning = true;
let consecutiveFailures = 0;
let lastFailureTime = 0;
const CIRCUIT_BREAKER_TIMEOUT = 30000; // 30s
const MAX_FAILURES = 3;

function jitter(base, variance = 0.3) {
  return base + (Math.random() - 0.5) * 2 * variance * base;
}

function shouldSkipDueToCircuitBreaker() {
  if (consecutiveFailures >= MAX_FAILURES) {
    const timeSinceLastFailure = Date.now() - lastFailureTime;
    if (timeSinceLastFailure < CIRCUIT_BREAKER_TIMEOUT) {
      return true;
    } else {
      // Reset circuit breaker
      consecutiveFailures = 0;
      logger.info('Circuit breaker resetado - tentando reconectar');
    }
  }
  return false;
}

async function iniciarDaemon() {
  logger.info('Daemon de impressão ultra-otimizado iniciado.');
  
  while (keepRunning) {
    try {
      // Circuit breaker check
      if (shouldSkipDueToCircuitBreaker()) {
        const waitTime = jitter(5000); // 3.5-6.5s com jitter
        await new Promise(res => setTimeout(res, waitTime));
        continue;
      }

      const { data } = await axios.get(LONG_POLL_URL, { 
        timeout: 65000,
        headers: {
          'Connection': 'keep-alive',
          'Accept-Encoding': 'gzip'
        }
      });

      if (data && Array.isArray(data.data) && data.data.length > 0) {
        logger.info(`Recebidas ${data.data.length} etiquetas para processar.`);
        const startTime = Date.now();
        
        const resultado = await imprimirEtiquetas(data);
        
        const processingTime = Date.now() - startTime;
        logger.info(`Processamento concluído em ${processingTime}ms`);
        
        // Reset failures on success
        consecutiveFailures = 0;
        
        if (!IS_PROD) {
          logger.debug(resultado);
        }
      } else {
        // Backoff em ciclos vazios
        const waitTime = jitter(2000); // 1.4-2.6s com jitter
        await new Promise(res => setTimeout(res, waitTime));
      }
      
    } catch (err) {
      consecutiveFailures++;
      lastFailureTime = Date.now();
      
      if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
        // Timeout normal do long-polling - não é erro real
        consecutiveFailures = Math.max(0, consecutiveFailures - 1);
      } else {
        logger.error(`Falha no daemon (${consecutiveFailures}/${MAX_FAILURES}):`, err.message);
        
        // Backoff exponencial com jitter em caso de erro
        const baseDelay = Math.min(Math.pow(2, consecutiveFailures - 1) * 1000, 10000);
        const waitTime = jitter(baseDelay);
        await new Promise(res => setTimeout(res, waitTime));
      }
    }
  }
  logger.info('Daemon finalizado.');
}


// ---------- Inicialização e Desligamento Gracioso ---------- //
// Inicializar sistema de versionamento
const versionManager = new VersionManager();

const server = app.listen(PORT, HOST, () => {
  logger.info(`Servidor HTTP rodando em http://${HOST}:${PORT}`);
  
  // Inicializar auto-update se habilitado
  if (versionManager.config.autoUpdate) {
    versionManager.startAutoUpdateScheduler();
    logger.info('Sistema de auto-update inicializado');
  }
  
  // Inicia o daemon apenas depois que o servidor estiver no ar.
  iniciarDaemon();
});

function gracefulShutdown() {
  logger.info('Recebido sinal de desligamento. Encerrando graciosamente...');
  keepRunning = false; // Sinaliza para o daemon parar o loop
  
  // Parar auto-update scheduler
  if (versionManager) {
    versionManager.stopAutoUpdateScheduler();
    logger.info('Auto-update scheduler parado');
  }

  server.close(() => {
    logger.info('Servidor HTTP encerrado.');
    // Dê ao daemon um momento para terminar o ciclo atual
    setTimeout(() => {
      process.exit(0);
    }, 1000); 
  });
}

process.on('SIGTERM', gracefulShutdown); // Sinal de término (padrão do Docker, SystemD)
process.on('SIGINT', gracefulShutdown);  // Sinal de interrupção (Ctrl+C)
