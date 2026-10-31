const winston = require('winston');
const path = require('path');

// Import email service for error notifications
const emailService = require('../services/emailService');

// Create logs directory if it doesn't exist
const fs = require('fs');
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for structured logging
const customFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    return JSON.stringify({
      timestamp,
      level,
      message,
      ...meta
    });
  })
);

// Custom transport for email notifications
class EmailNotificationTransport extends winston.Transport {
  constructor(options) {
    super(options);
    this.name = 'emailNotification';
    this.level = options.level || 'error';
  }

  log(info, callback) {
    setImmediate(() => {
      this.emit('logged', info);
    });

    // Send email notification for errors and fatal logs
    if (info.level === 'error' || info.level === 'fatal') {
      const errorData = {
        severity: info.level,
        type: info.error?.name || info.type || 'Application Error',
        message: info.message,
        stack: info.stack || info.error?.stack,
        context: info.context || JSON.stringify(info, null, 2)
      };

      // Send email asynchronously without blocking logging
      emailService.sendErrorNotification(errorData)
        .then(result => {
          if (result.success) {
            console.log(`📧 Email de erro enviado: ${result.messageId}`);
          } else {
            console.log(`📧 Email não enviado: ${result.reason}`);
          }
        })
        .catch(err => {
          console.error('❌ Erro ao processar notificação por email:', err.message);
        });
    }

    callback();
  }
}

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: customFormat,
  // Configurar níveis de log personalizados
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    verbose: 4,
    debug: 5,
    silly: 6,
    critical: 0  // Mesmo nível que error
  },
  defaultMeta: { 
    service: 'stockflow',
    pid: process.pid,
    hostname: require('os').hostname()
  },
  transports: [
    // Main consolidated log file
    new winston.transports.File({
      filename: path.join(logsDir, 'main.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 1,
    }),
    // Email notification transport
    new EmailNotificationTransport({
      level: 'error'
    })
  ],
  // Handle exceptions and rejections in the main log
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'main.log')
    })
  ],
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'main.log')
    })
  ]
});

// Add console transport for development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple(),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
        return `${timestamp} [${level}]: ${message} ${metaStr}`;
      })
    )
  }));
}

// Add request logging helper
logger.logRequest = (req, res, responseTime) => {
  logger.info('HTTP Request', {
    method: req.method,
    url: req.url,
    statusCode: res.statusCode,
    responseTime: `${responseTime}ms`,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    contentLength: res.get('Content-Length') || 0
  });
};

// Add performance logging helper
logger.logPerformance = (operation, duration, metadata = {}) => {
  logger.info('Performance', {
    operation,
    duration: `${duration}ms`,
    ...metadata
  });
};

// Add security logging helper
logger.logSecurity = (event, details = {}) => {
  logger.warn('Security Event', {
    event,
    timestamp: new Date().toISOString(),
    ...details
  });
};

// Add error notification helper
logger.logError = (error, context = {}) => {
  logger.error(error.message || 'Unknown error', {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack
    },
    context,
    type: 'Application Error'
  });
};

// Add critical error helper (always sends email)
logger.logCritical = (message, error = null, context = {}) => {
  const logData = {
    message,
    context,
    type: 'Critical Error',
    severity: 'fatal'
  };

  if (error) {
    logData.error = {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  }

  logger.log('fatal', message, logData);
};

// Add impression logging function
const logImpressao = (data) => {
  logger.info('Impressão de Etiqueta', data);
};

module.exports = { logger, logImpressao };

async function imprimirEtiquetas(payload) {
    // ...restante do código
    for (const [storeKey, etiquetas] of Object.entries(agrupados)) {
        const printerInfo = printersConfig[storeKey];
        // ...verificações

        for (const etiqueta of etiquetas) {
            // ...Geração e impressão do ZPL
            const quantidade = Number(etiqueta.etiquetas) || 1;
            const now = new Date();

            let status = 'impresso';
            let mensagem = 'OK';

            try {
                await new Promise((resolve, reject) => {
                    exec(`lp -d ${printerInfo.impressora} ${zplPath}`, (error, stdout, stderr) => {
                        if (error) {
                            status = 'erro';
                            mensagem = stderr;
                            return reject(error);
                        }
                        mensagem = stdout;
                        resolve();
                    });
                });
            } catch (err) {
                // erro já capturado
            }
            fs.unlinkSync(zplPath);

            // Registro de LOG
            const { logImpressao } = require('../utils/logger');
            logImpressao({
                data: now.toISOString().split('T')[0], // YYYY-MM-DD
                hora: now.toTimeString().split(' ')[0], // HH:MM:SS
                store_key: storeKey,
                nm_empresa: etiqueta.nm_empresa,
                id_produto: etiqueta.id_produto,
                nome_produto: etiqueta.nome,
                quantidade: quantidade,
                impressora: printerInfo.impressora,
                status: status,
                mensagem: mensagem,
                anydesk_id: process.env.ANYDESK_ID || 'N/A'
            });

            resultados.push({
                id: etiqueta.id_produto,
                store_key: storeKey,
                status: status,
                mensagem: mensagem
            });
        }
    }
    return resultados;
}
