'use strict';
const assert = require('node:assert/strict');
const router = require('../src/api/etiquetas');
const route = router.stack.find(layer => layer.route?.path === '/');
const handler = route.route.stack[0].handle;
const req = { query: { url: 'invalid-url' }, ip: '127.0.0.1', get: () => 'StockFlow-Test' };
let status, payload;
const res = { status(code) { status = code; return this; }, json(body) { payload = body; return this; } };
handler(req, res).then(() => {
  assert.equal(status, 400);
  assert.equal(payload.error, 'Invalid URL parameter');
  console.log('PASS: HTTP label route validates input and logs without throwing');
  process.exit(0);
}).catch(error => { console.error(error); process.exit(1); });