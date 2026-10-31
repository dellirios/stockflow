const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const os = require('os');

class EmailService {
    constructor() {
        this.transporter = null;
        this.rateLimitMap = new Map(); // Para controle de rate limiting
        this.initializeTransporter();
        
        // Configurações do .env
        this.config = {
            enabled: process.env.EMAIL_NOTIFICATIONS_ENABLED === 'true',
            recipient: process.env.EMAIL_ERROR_RECIPIENT,
            subject: process.env.EMAIL_ERROR_SUBJECT || '🚨 StockFlow - Erro Crítico',
            rateLimitMinutes: parseInt(process.env.EMAIL_ERROR_RATE_LIMIT_MINUTES) || 15,
            minSeverity: process.env.EMAIL_ERROR_MIN_SEVERITY || 'error',
            includeStackTrace: process.env.EMAIL_ERROR_INCLUDE_STACKTRACE === 'true',
            includeSystemInfo: process.env.EMAIL_ERROR_INCLUDE_SYSTEM_INFO === 'true',
            anydeskId: process.env.ANYDESK_ID
        };

        // Níveis de severidade (ordem crescente de importância)
        this.severityLevels = {
            'debug': 0,
            'info': 1,
            'warn': 2,
            'error': 3,
            'fatal': 4
        };
    }

    initializeTransporter() {
        try {
            this.transporter = nodemailer.createTransport({
                host: process.env.MAIL_HOST,
                port: parseInt(process.env.MAIL_PORT),
                secure: process.env.MAIL_SCHEME === 'smtps', // true para 465, false para outros
                auth: {
                    user: process.env.MAIL_USERNAME,
                    pass: process.env.MAIL_PASSWORD
                },
                tls: {
                    rejectUnauthorized: false // Para desenvolvimento
                }
            });

            console.log('✅ Serviço de email inicializado com sucesso');
        } catch (error) {
            console.error('❌ Erro ao inicializar serviço de email:', error.message);
        }
    }

    /**
     * Verifica se deve enviar email baseado no rate limiting
     */
    shouldSendEmail(errorType) {
        if (!this.config.enabled) {
            return false;
        }

        const now = Date.now();
        const key = `${errorType}_${this.config.recipient}`;
        const lastSent = this.rateLimitMap.get(key);
        const rateLimitMs = this.config.rateLimitMinutes * 60 * 1000;

        if (lastSent && (now - lastSent) < rateLimitMs) {
            return false; // Rate limit ativo
        }

        this.rateLimitMap.set(key, now);
        return true;
    }

    /**
     * Verifica se a severidade é suficiente para enviar email
     */
    shouldNotifyBySeverity(severity) {
        const currentLevel = this.severityLevels[severity.toLowerCase()] || 0;
        const minLevel = this.severityLevels[this.config.minSeverity.toLowerCase()] || 3;
        return currentLevel >= minLevel;
    }

    /**
     * Coleta informações do sistema
     */
    getSystemInfo() {
        const memUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();
        
        return {
            timestamp: new Date().toISOString(),
            hostname: os.hostname(),
            platform: os.platform(),
            arch: os.arch(),
            nodeVersion: process.version,
            uptime: process.uptime(),
            pid: process.pid,
            memory: {
                rss: Math.round(memUsage.rss / 1024 / 1024) + ' MB',
                heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + ' MB',
                heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + ' MB',
                external: Math.round(memUsage.external / 1024 / 1024) + ' MB'
            },
            cpu: {
                user: cpuUsage.user,
                system: cpuUsage.system
            },
            loadAverage: os.loadavg(),
            freeMemory: Math.round(os.freemem() / 1024 / 1024) + ' MB',
            totalMemory: Math.round(os.totalmem() / 1024 / 1024) + ' MB'
        };
    }

    /**
     * Gera template HTML para o email de erro
     */
    generateErrorEmailTemplate(errorData) {
        const systemInfo = this.config.includeSystemInfo ? this.getSystemInfo() : null;
        
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>StockFlow - Erro Crítico</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 800px; margin: 0 auto; padding: 20px; }
        .header { background: #dc3545; color: white; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
        .section { background: #f8f9fa; padding: 15px; margin: 10px 0; border-radius: 5px; border-left: 4px solid #dc3545; }
        .code { background: #f1f1f1; padding: 10px; border-radius: 3px; font-family: monospace; white-space: pre-wrap; overflow-x: auto; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .anydesk { background: #007bff; color: white; padding: 15px; border-radius: 5px; text-align: center; margin: 20px 0; }
        .footer { text-align: center; color: #666; margin-top: 30px; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚨 StockFlow - Erro Crítico Detectado</h1>
            <p><strong>Data/Hora:</strong> ${errorData.timestamp}</p>
            <p><strong>Severidade:</strong> ${errorData.severity.toUpperCase()}</p>
        </div>

        <div class="section">
            <h3>📋 Detalhes do Erro</h3>
            <p><strong>Tipo:</strong> ${errorData.type || 'Não especificado'}</p>
            <p><strong>Mensagem:</strong> ${errorData.message}</p>
            ${errorData.context ? `<p><strong>Contexto:</strong> ${errorData.context}</p>` : ''}
        </div>

        ${this.config.includeStackTrace && errorData.stack ? `
        <div class="section">
            <h3>🔍 Stack Trace</h3>
            <div class="code">${errorData.stack}</div>
        </div>
        ` : ''}

        ${systemInfo ? `
        <div class="section">
            <h3>💻 Informações do Sistema</h3>
            <div class="info-grid">
                <div>
                    <p><strong>Servidor:</strong> ${systemInfo.hostname}</p>
                    <p><strong>Plataforma:</strong> ${systemInfo.platform} (${systemInfo.arch})</p>
                    <p><strong>Node.js:</strong> ${systemInfo.nodeVersion}</p>
                    <p><strong>PID:</strong> ${systemInfo.pid}</p>
                    <p><strong>Uptime:</strong> ${Math.round(systemInfo.uptime / 60)} minutos</p>
                </div>
                <div>
                    <p><strong>Memória RSS:</strong> ${systemInfo.memory.rss}</p>
                    <p><strong>Heap Usado:</strong> ${systemInfo.memory.heapUsed}</p>
                    <p><strong>Memória Livre:</strong> ${systemInfo.freeMemory}</p>
                    <p><strong>Load Average:</strong> ${systemInfo.loadAverage.map(l => l.toFixed(2)).join(', ')}</p>
                </div>
            </div>
        </div>
        ` : ''}

        ${this.config.anydeskId ? `
        <div class="anydesk">
            <h3>🖥️ Acesso Remoto</h3>
            <p><strong>AnyDesk ID:</strong> ${this.config.anydeskId}</p>
            <p>Use este ID para acessar o servidor remotamente e investigar o problema.</p>
        </div>
        ` : ''}

        <div class="footer">
            <p>Este email foi gerado automaticamente pelo sistema de monitoramento StockFlow.</p>
            <p>Para desabilitar estas notificações, altere EMAIL_NOTIFICATIONS_ENABLED=false no arquivo .env</p>
        </div>
    </div>
</body>
</html>
        `;
    }

    /**
     * Envia email de notificação de erro
     */
    async sendErrorNotification(errorData) {
        try {
            // Verificações de configuração
            if (!this.config.enabled) {
                console.log('📧 Notificações por email desabilitadas');
                return { success: false, reason: 'disabled' };
            }

            if (!this.config.recipient) {
                console.error('❌ Email de destinatário não configurado');
                return { success: false, reason: 'no_recipient' };
            }

            // Verificar severidade
            if (!this.shouldNotifyBySeverity(errorData.severity)) {
                console.log(`📧 Severidade '${errorData.severity}' abaixo do mínimo '${this.config.minSeverity}'`);
                return { success: false, reason: 'low_severity' };
            }

            // Verificar rate limiting
            const errorType = errorData.type || 'unknown';
            if (!this.shouldSendEmail(errorType)) {
                console.log(`📧 Rate limit ativo para erro '${errorType}' (${this.config.rateLimitMinutes} min)`);
                return { success: false, reason: 'rate_limited' };
            }

            // Preparar dados do erro
            const emailData = {
                timestamp: new Date().toLocaleString('pt-BR'),
                severity: errorData.severity || 'error',
                type: errorData.type || errorData.name || 'Erro Desconhecido',
                message: errorData.message || 'Mensagem não disponível',
                stack: errorData.stack || null,
                context: errorData.context || null
            };

            // Configurar email
            const mailOptions = {
                from: `"${process.env.MAIL_FROM_NAME}" <${process.env.MAIL_FROM_ADDRESS}>`,
                to: this.config.recipient,
                subject: `${this.config.subject} - ${emailData.type}`,
                html: this.generateErrorEmailTemplate(emailData),
                text: this.generateTextVersion(emailData)
            };

            // Enviar email
            const info = await this.transporter.sendMail(mailOptions);
            
            console.log('✅ Email de erro enviado com sucesso:', info.messageId);
            this.logEmailSent(emailData, info.messageId);
            
            return { 
                success: true, 
                messageId: info.messageId,
                recipient: this.config.recipient
            };

        } catch (error) {
            console.error('❌ Erro ao enviar email de notificação:', error.message);
            this.logEmailError(errorData, error);
            
            return { 
                success: false, 
                reason: 'send_failed',
                error: error.message 
            };
        }
    }

    /**
     * Gera versão texto do email (fallback)
     */
    generateTextVersion(errorData) {
        const systemInfo = this.config.includeSystemInfo ? this.getSystemInfo() : null;
        
        let text = `STOCKFLOW - ERRO CRÍTICO DETECTADO\n`;
        text += `=====================================\n\n`;
        text += `Data/Hora: ${errorData.timestamp}\n`;
        text += `Severidade: ${errorData.severity.toUpperCase()}\n`;
        text += `Tipo: ${errorData.type}\n`;
        text += `Mensagem: ${errorData.message}\n\n`;
        
        if (errorData.context) {
            text += `Contexto: ${errorData.context}\n\n`;
        }
        
        if (this.config.includeStackTrace && errorData.stack) {
            text += `STACK TRACE:\n${errorData.stack}\n\n`;
        }
        
        if (systemInfo) {
            text += `INFORMAÇÕES DO SISTEMA:\n`;
            text += `Servidor: ${systemInfo.hostname}\n`;
            text += `Plataforma: ${systemInfo.platform} (${systemInfo.arch})\n`;
            text += `Node.js: ${systemInfo.nodeVersion}\n`;
            text += `Memória RSS: ${systemInfo.memory.rss}\n`;
            text += `Uptime: ${Math.round(systemInfo.uptime / 60)} minutos\n\n`;
        }
        
        if (this.config.anydeskId) {
            text += `ACESSO REMOTO:\n`;
            text += `AnyDesk ID: ${this.config.anydeskId}\n\n`;
        }
        
        text += `Este email foi gerado automaticamente pelo sistema StockFlow.`;
        
        return text;
    }

    /**
     * Log de email enviado com sucesso
     */
    logEmailSent(errorData, messageId) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            action: 'email_sent',
            messageId: messageId,
            recipient: this.config.recipient,
            errorType: errorData.type,
            severity: errorData.severity
        };
        
        this.writeToLogFile('email-notifications.log', JSON.stringify(logEntry));
    }

    /**
     * Log de erro no envio de email
     */
    logEmailError(errorData, sendError) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            action: 'email_failed',
            error: sendError.message,
            recipient: this.config.recipient,
            errorType: errorData.type,
            severity: errorData.severity
        };
        
        this.writeToLogFile('email-notifications.log', JSON.stringify(logEntry));
    }

    /**
     * Escreve no arquivo de log
     */
    writeToLogFile(filename, content) {
        try {
            const logDir = path.join(__dirname, '../../logs');
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }
            
            const logFile = path.join(logDir, filename);
            fs.appendFileSync(logFile, content + '\n');
        } catch (error) {
            console.error('Erro ao escrever log de email:', error.message);
        }
    }

    /**
     * Testa a configuração de email
     */
    async testEmailConfiguration() {
        try {
            await this.transporter.verify();
            console.log('✅ Configuração de email válida');
            return true;
        } catch (error) {
            console.error('❌ Erro na configuração de email:', error.message);
            return false;
        }
    }

    /**
     * Envia email de teste
     */
    async sendTestEmail() {
        const testError = {
            severity: 'error',
            type: 'Teste do Sistema',
            message: 'Este é um email de teste do sistema de notificações StockFlow.',
            context: 'Teste manual da funcionalidade de email',
            stack: null
        };

        return await this.sendErrorNotification(testError);
    }
}

module.exports = new EmailService();