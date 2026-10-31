const express = require('express');
const Joi = require('joi');
const axios = require('axios');
const { imprimirEtiquetas } = require('../services/printerService');
const { logger } = require('../utils/logger');

const router = express.Router();

// Validation schema for URL parameter
const urlSchema = Joi.object({
  url: Joi.string().uri().optional().default('https://stockflow.pro/start.php')
});

// Validation schema for POST body (if needed in the future)
const etiquetaSchema = Joi.object({
  etiquetas: Joi.array().items(
    Joi.object({
      store_key: Joi.string().required(),
      produto: Joi.string().required(),
      preco: Joi.number().positive().required(),
      codigo_barras: Joi.string().optional(),
      // Add other fields as needed
    })
  ).min(1).required()
});

router.get('/', async (req, res) => {
  const startTime = Date.now();
  
  try {
    // Validate query parameters
    const { error, value } = urlSchema.validate(req.query);
    if (error) {
      logger.logSecurity('Invalid URL parameter', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        error: error.details[0].message
      });
      return res.status(400).json({
        error: 'Invalid URL parameter',
        details: error.details[0].message,
        timestamp: new Date().toISOString()
      });
    }

    const { url } = value;
    
    logger.info('Fetching labels data', { url, ip: req.ip });

    // Fetch data with timeout and proper error handling
    const response = await axios.get(url, {
      timeout: 30000, // 30 seconds timeout
      headers: {
        'User-Agent': 'StockFlow/1.0',
        'Accept': 'application/json'
      }
    });

    if (!response.data) {
      throw new Error('Empty response from URL');
    }

    // Process the labels
    const result = await imprimirEtiquetas(response.data);
    
    const responseTime = Date.now() - startTime;
    logger.logPerformance('etiquetas_processing', responseTime, {
      url,
      dataSize: JSON.stringify(response.data).length,
      resultCount: result?.processedCount || 0
    });

    res.json({
      status: 'success',
      data: result,
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`
    });

  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    logger.error('Error processing labels', {
      error: error.message,
      stack: error.stack,
      url: req.query.url,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      responseTime: `${responseTime}ms`
    });

    // Handle different types of errors
    let statusCode = 500;
    let errorMessage = 'Internal server error';

    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      statusCode = 502;
      errorMessage = 'Unable to connect to the specified URL';
    } else if (error.code === 'ECONNABORTED') {
      statusCode = 504;
      errorMessage = 'Request timeout';
    } else if (error.response?.status) {
      statusCode = error.response.status;
      errorMessage = `External service error: ${error.response.statusText}`;
    }

    res.status(statusCode).json({
      error: errorMessage,
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`,
      ...(process.env.NODE_ENV !== 'production' && { details: error.message })
    });
  }
});

// Health check for this specific router
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'etiquetas-api',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
