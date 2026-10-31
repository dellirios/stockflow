// src/app.js - Versão Otimizada
// © 2025 StockFlow

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const etiquetasRouter = require('./api/etiquetas');
const { imprimirEtiquetas, getHealthStats } = require('./services/printerService');
const logger = require('./utils/logger').logger;

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 2508;
const HOST = process.env.HOST || '0.0.0.0';

// Rate limiting configuration
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// API specific rate limiting (more restrictive)
const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.API_RATE_LIMIT_MAX_REQUESTS) || 50,
  message: {
    error: 'Too many API requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// Apply rate limiting to all requests
app.use(limiter);

// Middleware
app.use(express.json({ 
  limit: process.env.MAX_REQUEST_SIZE || '10mb',
  verify: (req, res, buf) => {
    // Log large requests for monitoring
    if (buf.length > 1024 * 1024) { // 1MB
      logger.logSecurity('Large request received', {
        size: buf.length,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
    }
  }
}));

app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
  credentials: true
}));

// Add missing imports for daemon functionality
const axios = require('axios');
const LONG_POLL_URL = process.env.LONG_POLL_URL || 'https://stockflow.pro/start.php';
const IS_PROD = process.env.NODE_ENV === 'production';

// Configuração otimizada do axios para long polling
const axiosInstance = axios.create({
  timeout: 65000,
  headers: {
    'Connection': 'keep-alive',
    'Accept-Encoding': 'gzip',
    'User-Agent': 'StockFlow-Daemon/1.0',
    'Accept': 'application/json'
  },
  // Configurações para lidar com conexões instáveis
  maxRedirects: 3,
  validateStatus: function (status) {
    return status >= 200 && status < 300;
  }
});

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('combined', {
    stream: {
      write: (message) => logger.info(message.trim())
    }
  }));
}

// ---------- Rotas e Middlewares ---------- //
// Synthetic preview artifacts only: never exposes production label data.
app.get('/previa-etiqueta/:arquivo', (req, res) => {
  const allowed = new Set(['etiqueta-layout.png', 'etiqueta-com-offset.png',
    'etiqueta-layout.pdf', 'etiqueta-enviada.zpl', 'status.json']);
  if (!allowed.has(req.params.arquivo)) return res.sendStatus(404);
  res.set('Cache-Control', 'no-store');
  res.sendFile(require('path').resolve(__dirname, '../logs/previa-elgin', req.params.arquivo));
});
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
app.use('/imprimir-etiqueta', apiLimiter, etiquetasRouter);

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
let consecutiveNoOpCycles = 0;
let lastFailureTime = 0;
const CIRCUIT_BREAKER_TIMEOUT = 30000; // 30s
const MAX_FAILURES = 3;
const EMPTY_POLL_BASE_DELAY_MS = parseInt(process.env.EMPTY_POLL_BASE_DELAY_MS || '3000', 10);
const NOOP_PAYLOAD_BASE_DELAY_MS = parseInt(process.env.NOOP_PAYLOAD_BASE_DELAY_MS || '5000', 10);
const MAX_IDLE_BACKOFF_MS = parseInt(process.env.MAX_IDLE_BACKOFF_MS || '20000', 10);

function jitter(base, variance = 0.3) {
  return base + (Math.random() - 0.5) * 2 * variance * base;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
        await sleep(waitTime);
        continue;
      }

      const { data } = await axiosInstance.get(LONG_POLL_URL);

      if (data && Array.isArray(data.data) && data.data.length > 0) {
        logger.info(`Recebidas ${data.data.length} etiquetas para processar.`);
        const startTime = Date.now();
        
        const resultado = await imprimirEtiquetas(data);
        
        const processingTime = Date.now() - startTime;
        const printedCount = Array.isArray(resultado)
          ? resultado.filter(item => item?.status === 'impresso').length
          : 0;
        logger.info(`Processamento concluído em ${processingTime}ms (impressas=${printedCount})`);
        
        // Reset failures on success
        consecutiveFailures = 0;
        
        // Se vier payload mas nada foi impresso, desacelera para evitar loop quente.
        if (printedCount === 0) {
          consecutiveNoOpCycles = Math.min(consecutiveNoOpCycles + 1, 8);
          const baseDelay = Math.min(
            NOOP_PAYLOAD_BASE_DELAY_MS * Math.pow(1.6, consecutiveNoOpCycles - 1),
            MAX_IDLE_BACKOFF_MS
          );
          await sleep(jitter(baseDelay));
        } else {
          consecutiveNoOpCycles = 0;
        }
        
        if (!IS_PROD) {
          logger.debug(resultado);
        }
      } else {
        // Backoff em ciclos vazios
        consecutiveNoOpCycles = Math.min(consecutiveNoOpCycles + 1, 8);
        const baseDelay = Math.min(
          EMPTY_POLL_BASE_DELAY_MS * Math.pow(1.4, consecutiveNoOpCycles - 1),
          MAX_IDLE_BACKOFF_MS
        );
        await sleep(jitter(baseDelay));
      }
      
    } catch (err) {
      consecutiveFailures++;
      lastFailureTime = Date.now();
      
      // Tratamento específico para diferentes tipos de erro
      if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
        // Timeout normal do long-polling - não é erro real
        consecutiveFailures = Math.max(0, consecutiveFailures - 1);
        logger.debug('Long polling timeout - reconectando...');
      } else if (err.code === 'ECONNRESET' || err.message === 'socket hang up') {
        // Erro de conexão - reduzir severidade
        consecutiveFailures = Math.max(0, consecutiveFailures - 1);
        logger.warn('Conexão perdida - reconectando...', { error: err.message });
      } else if (err.response && err.response.status >= 500) {
        // Erro do servidor - aguardar mais tempo
        logger.warn(`Erro do servidor (${err.response.status}) - aguardando...`);
      } else {
        // Use enhanced error logging for daemon failures
        logger.logError(err, {
          context: 'daemon_failure',
          consecutiveFailures,
          maxFailures: MAX_FAILURES,
          lastFailureTime
        });
      }
      
      // Backoff exponencial com jitter em caso de erro
      const baseDelay = Math.min(Math.pow(2, consecutiveFailures - 1) * 1000, 10000);
      const waitTime = jitter(baseDelay);
      await sleep(waitTime);
    }
  }
  logger.info('Daemon finalizado.');
}


// Global error handler
app.use((err, req, res, next) => {
  // Use the enhanced error logging with email notification
  logger.logError(err, {
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    body: req.body,
    params: req.params,
    query: req.query
  });

  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  res.status(err.status || 500).json({
    error: isDevelopment ? err.message : 'Internal server error',
    timestamp: new Date().toISOString(),
    ...(isDevelopment && { stack: err.stack })
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

// ---------- Inicialização e Desligamento Gracioso ---------- //
logger.info(`Tentando iniciar servidor na porta ${PORT}...`);

const server = app.listen(PORT, HOST, () => {
  logger.info(`✅ StockFlow server running on http://${HOST}:${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Process ID: ${process.pid}`);
  
  // Inicia o daemon apenas depois que o servidor estiver no ar.
  iniciarDaemon().catch(err => {
    logger.error('❌ Erro fatal no daemon:', err);
    process.exit(1);
  });
});

// Tratamento de erro explícito para falhas no listen (ex: EADDRINUSE)
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    logger.error(`❌ Erro: A porta ${PORT} já está em uso por outro processo.`);
    console.error(`\n FATAL: A porta ${PORT} já está sendo usada.`);
    console.error(` Use 'fuser -k ${PORT}/tcp' para liberar a porta ou mude a variável PORT no código.\n`);
  } else {
    logger.error('❌ Erro fatal ao iniciar o servidor:', err);
  }
  process.exit(1);
});

function gracefulShutdown() {
  logger.info('Recebido sinal de desligamento. Encerrando graciosamente...');
  keepRunning = false; // Sinaliza para o daemon parar o loop

  server.close(() => {
    logger.info('Servidor HTTP encerrado.');
    // Dê ao daemon um momento para terminar o ciclo atual
    setTimeout(() => {
      process.exit(0);
    }, 1000); 
  });
}
