const express = require('express');
const router = express.Router();
const axios = require('axios');
const { imprimirEtiquetas } = require('../services/printerService');

// GET: Busca JSON da URL (padrão ou customizada via ?url=)
router.get('/', async (req, res) => {
  try {
    // Permite override de URL via query, mas default é a produção
    const url = req.query.url || 'https://stockflow.pro/start.php';
    const { data } = await axios.get(url, { timeout: 15000 });

    if (!data || !Array.isArray(data.data)) {
      return res.status(400).json({ status: 'error', message: 'JSON externo malformado ou sem dados.' });
    }

    // Chama a rotina principal de impressão (incluindo confirmação de impressão via callback)
    const result = await imprimirEtiquetas(data);

    res.status(200).json({ status: 'success', data: result });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

module.exports = router;
