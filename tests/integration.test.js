const http = require('http');
const assert = require('assert');

// Teste de integração do sistema StockFlow
class IntegrationTester {
  constructor() {
    this.baseUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:'+(process.env.PORT || '2508');
    this.results = { passed: 0, failed: 0, tests: [] };
  }
  
  async makeRequest(path, method = 'GET', data = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'StockFlow-Test/1.0'
        },
        timeout: 5000
      };
      
      if (data) {
        const postData = JSON.stringify(data);
        options.headers['Content-Length'] = Buffer.byteLength(postData);
      }
      
      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          try {
            const parsed = res.headers['content-type']?.includes('application/json') 
              ? JSON.parse(body) 
              : body;
            resolve({ status: res.statusCode, data: parsed, headers: res.headers });
          } catch (e) {
            resolve({ status: res.statusCode, data: body, headers: res.headers });
          }
        });
      });
      
      req.on('error', reject);
      req.on('timeout', () => reject(new Error('Request timeout')));
      
      if (data) {
        req.write(JSON.stringify(data));
      }
      
      req.end();
    });
  }
  
  async test(name, testFn) {
    try {
      console.log(`🧪 ${name}`);
      await testFn();
      console.log(`✅ ${name}`);
      this.results.passed++;
      this.results.tests.push({ name, status: 'PASS' });
    } catch (error) {
      console.log(`❌ ${name}: ${error.message}`);
      this.results.failed++;
      this.results.tests.push({ name, status: 'FAIL', error: error.message });
    }
  }
  
  async runAllTests() {
    console.log('🚀 Iniciando testes de integração do StockFlow\n');
    
    // Teste 1: Health Check
    await this.test('Health endpoint disponível', async () => {
      const response = await this.makeRequest('/health');
      assert.strictEqual(response.status, 200, 'Health endpoint deve retornar 200');
      assert(response.data.status, 'Health deve ter campo status');
      assert(typeof response.data.uptime === 'number', 'Uptime deve ser numérico');
    });
    
    // Teste 2: Metrics endpoint
    await this.test('Metrics endpoint disponível', async () => {
      const response = await this.makeRequest('/metrics');
      assert.strictEqual(response.status, 200, 'Metrics endpoint deve retornar 200');
      assert(typeof response.data === 'string', 'Metrics deve retornar texto');
      assert(response.data.includes('stockflow_'), 'Deve conter métricas do StockFlow');
    });
    
    // Teste 3: API de etiquetas (GET)
    await this.test('API de etiquetas: diagnóstico sem consumir a fila', async () => {
      const response = await this.makeRequest('/imprimir-etiqueta/health');
      assert.strictEqual(response.status,200);
      assert.strictEqual(response.data.service,'etiquetas-api');
    });
    
    // Teste 4: POST não implementado responde 404
    await this.test('POST não implementado responde 404', async () => {
      const invalidPayload = { invalid: 'data' };
      const response = await this.makeRequest('/imprimir-etiqueta', 'POST', invalidPayload);
      // Deve aceitar ou rejeitar graciosamente
      assert.strictEqual(response.status,404);
    });
    
    // Teste 5: Performance do health check
    await this.test('Performance do health check', async () => {
      const start = Date.now();
      const response = await this.makeRequest('/health');
      const duration = Date.now() - start;
      
      assert.strictEqual(response.status, 200, 'Health deve responder');
      assert(duration < 1000, `Health deve responder em <1s (atual: ${duration}ms)`);
    });
    
    // Teste 6: Headers de segurança
    await this.test('Headers de segurança presentes', async () => {
      const response = await this.makeRequest('/health');
      // Verifica se não há headers perigosos expostos
      const poweredBy = response.headers['x-powered-by'];
      if (poweredBy) {
        throw new Error(`X-Powered-By header encontrado: ${poweredBy}`);
      }
    });
    
    // Teste 7: Stress test básico
    await this.test('Stress test básico (5 requests simultâneas)', async () => {
      const promises = Array(5).fill().map(() => this.makeRequest('/health'));
      const responses = await Promise.all(promises);
      
      responses.forEach((response, i) => {
        assert.strictEqual(response.status, 200, `Request ${i+1} deve retornar 200`);
      });
    });
    
    this.printResults();
    return this.results;
  }
  
  printResults() {
    console.log('\n📊 Resultados dos Testes de Integração:');
    console.log(`✅ Passou: ${this.results.passed}`);
    console.log(`❌ Falhou: ${this.results.failed}`);
    console.log(`📈 Taxa de Sucesso: ${((this.results.passed / (this.results.passed + this.results.failed)) * 100).toFixed(1)}%`);
    
    if (this.results.failed === 0) {
      console.log('\n🎉 Todos os testes de integração passaram!');
      console.log('✨ Sistema StockFlow otimizado está funcionando perfeitamente!');
    } else {
      console.log('\n⚠️  Alguns testes falharam:');
      this.results.tests
        .filter(t => t.status === 'FAIL')
        .forEach(t => console.log(`   - ${t.name}: ${t.error}`));
    }
  }
}

// Função para executar testes de integração
async function runIntegrationTests() {
  const tester = new IntegrationTester();
  
  try {
    return await tester.runAllTests();
  } catch (error) {
    console.error('❌ Erro fatal nos testes de integração:', error.message);
    return { passed: 0, failed: 1, error: error.message };
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  runIntegrationTests().then(results => {
    process.exit(results.failed > 0 ? 1 : 0);
  });
}

module.exports = { runIntegrationTests, IntegrationTester };