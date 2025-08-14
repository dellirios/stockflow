const fs = require('fs');
const path = require('path');

/**
 * Função para registrar logs de impressão
 * @param {Object} logData - Dados do log de impressão
 */
function logImpressao(logData) {
  try {
    const logEntry = {
      timestamp: new Date().toISOString(),
      type: 'impressao',
      ...logData
    };
    
    console.log('[IMPRESSAO]', JSON.stringify(logEntry));
  } catch (error) {
    console.error('Erro ao registrar log de impressão:', error.message);
  }
}

/**
 * Função para registrar logs de informação
 * @param {string} message - Mensagem do log
 * @param {Object} data - Dados adicionais
 */
function logInfo(message, data = {}) {
  try {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      message,
      ...data
    };
    
    console.log('[INFO]', message, data);
  } catch (error) {
    console.error('Erro ao registrar log de info:', error.message);
  }
}

/**
 * Função para registrar logs de erro
 * @param {string} message - Mensagem do log
 * @param {Object} data - Dados adicionais
 */
function logError(message, data = {}) {
  try {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      message,
      ...data
    };
    
    console.error('[ERROR]', message, data);
  } catch (error) {
    console.error('Erro ao registrar log de erro:', error.message);
  }
}

/**
 * Função para registrar logs de aviso
 * @param {string} message - Mensagem do log
 * @param {Object} data - Dados adicionais
 */
function logWarning(message, data = {}) {
  try {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: 'WARNING',
      message,
      ...data
    };
    
    console.warn('[WARNING]', message, data);
  } catch (error) {
    console.error('Erro ao registrar log de warning:', error.message);
  }
}

module.exports = {
  logImpressao,
  logInfo,
  logError,
  logWarning
};
