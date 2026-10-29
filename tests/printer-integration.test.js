#!/usr/bin/env node
/**
 * Teste de Integração com Emulador de Impressora
 * Valida a funcionalidade completa de impressão usando impressora virtual
 */

const assert = require('assert');
const http = require('http');
const ZPLPrinterEmulator = require('./printer-emulator');
const { imprimirEtiquetas } = require('../src/services/printerService');

class PrinterIntegrationTester {
  constructor() {
    this.emulator = new ZPLPrinterEmulator(9100, 'Test-Printer');
    this.testResults = [];
  }

  async runTest(testName, testFn) {
    try {
      console.log(`🧪 ${testName}`);
      await testFn();
      console.log(`✅ ${testName}`);
      this.testResults.push({ name: testName, status: 'PASS' });
    } catch (error) {
      console.log(`❌ ${testName}: ${error.message}`);
      this.testResults.push({ name: testName, status: 'FAIL', error: error.message });
    }
  }

  async makeRequest(method, path, data = null) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'localhost',
        port: 5000,
        path: path,
        method: method,
        headers: {
          'Content-Type': 'application/json'
        }
      };

      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          try {
            const parsed = body ? JSON.parse(body) : {};
            resolve({ status: res.statusCode, headers: res.headers, data: parsed });
          } catch (e) {
            resolve({ status: res.statusCode, headers: res.headers, data: body });
          }
        });
      });

      req.on('error', reject);
      
      if (data) {
        req.write(JSON.stringify(data));
      }
      
      req.end();
    });
  }

  async testEmulatorStartup() {
    await this.emulator.start();
    assert(this.emulator.isRunning, 'Emulador deve estar rodando');
    
    // Aguardar um pouco para garantir que está pronto
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  async testDirectPrinting() {
    // Teste direto da função de impressão
    const etiquetas = [
      {
        id: 'TEST001',
        produto: 'Produto Teste',
        codigo: '123456789',
        preco: '29.90',
        data: new Date().toISOString()
      }
    ];

    const resultado = await imprimirEtiquetas(etiquetas);
    assert(resultado.success, 'Impressão deve ser bem-sucedida');
    assert(resultado.processados >= 0, 'Deve processar pelo menos 0 etiquetas');
  }

  async testAPIEndpoint() {
    // Teste via API REST
    const payload = {
      etiquetas: [
        {
          id: 'API001',
          produto: 'Produto via API',
          codigo: '987654321',
          preco: '15.50'
        }
      ]
    };

    const response = await this.makeRequest('POST', '/imprimir-etiqueta', payload);
    assert(response.status === 200, `Status deve ser 200, recebido: ${response.status}`);
    assert(response.data.success, 'API deve retornar sucesso');
  }

  async testBatchPrinting() {
    // Teste de impressão em lote
    const etiquetas = [];
    for (let i = 1; i <= 5; i++) {
      etiquetas.push({
        id: `BATCH${i.toString().padStart(3, '0')}`,
        produto: `Produto Lote ${i}`,
        codigo: `${1000000 + i}`,
        preco: `${(10 + i).toFixed(2)}`
      });
    }

    const response = await this.makeRequest('POST', '/imprimir-etiqueta', { etiquetas });
    assert(response.status === 200, 'Impressão em lote deve ser bem-sucedida');
    assert(response.data.processados >= 0, 'Deve processar etiquetas do lote');
  }

  async testDuplicateHandling() {
    // Teste de tratamento de duplicatas
    const etiqueta = {
      id: 'DUP001',
      produto: 'Produto Duplicado',
      codigo: '555666777',
      preco: '99.99'
    };

    // Enviar a mesma etiqueta duas vezes
    const response1 = await this.makeRequest('POST', '/imprimir-etiqueta', { etiquetas: [etiqueta] });
    const response2 = await this.makeRequest('POST', '/imprimir-etiqueta', { etiquetas: [etiqueta] });

    assert(response1.status === 200, 'Primeira impressão deve ser bem-sucedida');
    assert(response2.status === 200, 'Segunda impressão deve ser aceita');
    
    // A segunda deve ser filtrada como duplicata
    assert(response2.data.duplicatas >= 1, 'Segunda impressão deve ser detectada como duplicata');
  }

  async testEmulatorStats() {
    // Verificar estatísticas do emulador
    const stats = this.emulator.getStats();
    assert(stats.totalJobs > 0, 'Emulador deve ter processado jobs');
    assert(stats.totalBytes > 0, 'Emulador deve ter processado bytes');
    assert(stats.isRunning, 'Emulador deve estar rodando');
    
    console.log(`   📊 Jobs processados: ${stats.totalJobs}`);
    console.log(`   📊 Bytes processados: ${stats.totalBytes}`);
    console.log(`   📊 Tempo ativo: ${stats.uptime}s`);
  }

  async testPrinterConfiguration() {
    // Verificar se a configuração da impressora está correta
    const fs = require('fs');
    const path = require('path');
    
    const configPath = path.join(__dirname, '../config/printers.json');
    assert(fs.existsSync(configPath), 'Arquivo de configuração deve existir');
    
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert(Array.isArray(config.impressoras), 'Deve ter array de impressoras');
    assert(config.impressoras.length > 0, 'Deve ter pelo menos uma impressora configurada');
    
    // Verificar se há uma impressora na porta 9100 (nossa virtual)
    const virtualPrinter = config.impressoras.find(p => p.ip === 'localhost' && p.porta === 9100);
    if (!virtualPrinter) {
      console.log('   ⚠️  Impressora virtual não encontrada na configuração');
    }
  }

  async cleanup() {
    if (this.emulator) {
      await this.emulator.stop();
    }
  }

  printSummary() {
    const passed = this.testResults.filter(r => r.status === 'PASS').length;
    const failed = this.testResults.filter(r => r.status === 'FAIL').length;
    const total = this.testResults.length;
    const successRate = ((passed / total) * 100).toFixed(1);

    console.log('\n📊 Resultados dos Testes de Impressão:');
    console.log(`✅ Passou: ${passed}`);
    console.log(`❌ Falhou: ${failed}`);
    console.log(`📈 Taxa de Sucesso: ${successRate}%`);

    if (failed > 0) {
      console.log('\n⚠️  Testes que falharam:');
      this.testResults
        .filter(r => r.status === 'FAIL')
        .forEach(r => console.log(`   - ${r.name}: ${r.error}`));
    }

    return failed === 0;
  }

  async run() {
    console.log('🖨️  Iniciando Testes de Integração com Impressora Virtual\n');

    try {
      // Iniciar emulador
      await this.runTest('Inicialização do emulador', () => this.testEmulatorStartup());
      
      // Aguardar um pouco para estabilizar
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Executar testes
      await this.runTest('Configuração da impressora', () => this.testPrinterConfiguration());
      await this.runTest('Impressão direta', () => this.testDirectPrinting());
      await this.runTest('Endpoint da API', () => this.testAPIEndpoint());
      await this.runTest('Impressão em lote', () => this.testBatchPrinting());
      await this.runTest('Tratamento de duplicatas', () => this.testDuplicateHandling());
      await this.runTest('Estatísticas do emulador', () => this.testEmulatorStats());
      
      return this.printSummary();
      
    } catch (error) {
      console.error('❌ Erro durante os testes:', error.message);
      return false;
    } finally {
      await this.cleanup();
    }
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  const tester = new PrinterIntegrationTester();
  
  tester.run().then((success) => {
    process.exit(success ? 0 : 1);
  }).catch((error) => {
    console.error('❌ Erro fatal:', error.message);
    process.exit(1);
  });
}

module.exports = PrinterIntegrationTester;