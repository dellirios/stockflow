#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const TEST_BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:'+(process.env.PORT || '2508');

// Script principal para executar todos os testes do StockFlow
class TestRunner {
  constructor() {
    this.results = {
      unit: { passed: 0, failed: 0 },
      integration: { passed: 0, failed: 0 },
      performance: { passed: 0, failed: 0 }
    };
  }
  
  async checkServiceStatus() {
    return new Promise((resolve) => {
      const http = require('http');
      const req = http.get(TEST_BASE_URL+'/health', { timeout: 2000 }, (res) => {
        resolve(res.statusCode === 200);
      });
      
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });
  }
  
  async runUnitTests() {
    console.log('🔧 Executando Testes Unitários...');
    console.log('=' .repeat(50));
    
    try {
      const { runTests } = require('./printerService.test.js');
      const results = runTests();
      this.results.unit = results;
      return results;
    } catch (error) {
      console.error('❌ Erro nos testes unitários:', error.message);
      this.results.unit = { passed: 0, failed: 1 };
      return this.results.unit;
    }
  }
  
  async runIntegrationTests() {
    console.log('\n🌐 Executando Testes de Integração...');
    console.log('=' .repeat(50));
    
    const serviceRunning = await this.checkServiceStatus();
    
    if (!serviceRunning) {
      console.log('⚠️  Serviço StockFlow indisponível em '+TEST_BASE_URL);
      console.log('💡 Para executar testes de integração:');
      console.log('   1. systemctl start stockflow');
      console.log('   2. ou: npm start');
      console.log('   3. aguarde alguns segundos e execute novamente');
      
      this.results.integration = { passed: 0, failed: 1 };
      return this.results.integration;
    }
    
    try {
      const { runIntegrationTests } = require('./integration.test.js');
      const results = await runIntegrationTests();
      this.results.integration = results;
      return results;
    } catch (error) {
      console.error('❌ Erro nos testes de integração:', error.message);
      this.results.integration = { passed: 0, failed: 1 };
      return this.results.integration;
    }
  }
  
  async runPerformanceTests() {
    console.log('\n⚡ Executando Testes de Performance...');
    console.log('=' .repeat(50));
    
    const serviceRunning = await this.checkServiceStatus();
    
    if (!serviceRunning) {
      console.log('⚠️  Serviço não disponível para testes de performance');
      this.results.performance = { passed: 0, failed: 1 };
      return this.results.performance;
    }
    
    let passed = 0;
    let failed = 0;
    
    try {
      // Teste 1: Latência do health endpoint
      console.log('🧪 Testando latência do /health...');
      const start = Date.now();
      const response = await this.makeRequest('/health');
      const latency = Date.now() - start;
      
      if (latency < 100) {
        console.log(`✅ Latência excelente: ${latency}ms`);
        passed++;
      } else if (latency < 500) {
        console.log(`✅ Latência boa: ${latency}ms`);
        passed++;
      } else {
        console.log(`❌ Latência alta: ${latency}ms`);
        failed++;
      }
      
      // Teste 2: Throughput básico
      console.log('🧪 Testando throughput (10 requests)...');
      const startTime = Date.now();
      const promises = Array(10).fill().map(() => this.makeRequest('/health'));
      await Promise.all(promises);
      const totalTime = Date.now() - startTime;
      const rps = (10 / totalTime) * 1000;
      
      if (rps > 50) {
        console.log(`✅ Throughput excelente: ${rps.toFixed(1)} req/s`);
        passed++;
      } else if (rps > 20) {
        console.log(`✅ Throughput bom: ${rps.toFixed(1)} req/s`);
        passed++;
      } else {
        console.log(`❌ Throughput baixo: ${rps.toFixed(1)} req/s`);
        failed++;
      }
      
      // Teste 3: Uso de memória
      console.log('🧪 Verificando uso de memória...');
      if (response && response.data && response.data.cpu_rss) {
        const memoryMB = response.data.cpu_rss;
        if (memoryMB < 160) {
          console.log(`✅ Uso de memória otimizado: ${memoryMB}MB`);
          passed++;
        } else if (memoryMB < 300) {
          console.log(`✅ Uso de memória aceitável: ${memoryMB}MB`);
          passed++;
        } else {
          console.log(`❌ Uso de memória alto: ${memoryMB}MB`);
          failed++;
        }
      } else {
        console.log('⚠️  Não foi possível obter dados de memória');
        failed++;
      }
      
    } catch (error) {
      console.error('❌ Erro nos testes de performance:', error.message);
      failed++;
    }
    
    this.results.performance = { passed, failed };
    return this.results.performance;
  }
  
  async makeRequest(path) {
    return new Promise((resolve, reject) => {
      const http = require('http');
      const req = http.get(`${TEST_BASE_URL}${path}`, { timeout: 5000 }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            resolve({ status: res.statusCode, data });
          } catch (e) {
            resolve({ status: res.statusCode, data: body });
          }
        });
      });
      
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }
  
  printFinalResults() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMO FINAL DOS TESTES STOCKFLOW');
    console.log('='.repeat(60));
    
    const totalPassed = this.results.unit.passed + this.results.integration.passed + this.results.performance.passed;
    const totalFailed = this.results.unit.failed + this.results.integration.failed + this.results.performance.failed;
    const totalTests = totalPassed + totalFailed;
    
    console.log(`🔧 Testes Unitários:     ${this.results.unit.passed}✅ ${this.results.unit.failed}❌`);
    console.log(`🌐 Testes Integração:    ${this.results.integration.passed}✅ ${this.results.integration.failed}❌`);
    console.log(`⚡ Testes Performance:   ${this.results.performance.passed}✅ ${this.results.performance.failed}❌`);
    console.log('-'.repeat(40));
    console.log(`📈 TOTAL:                ${totalPassed}✅ ${totalFailed}❌`);
    console.log(`📊 Taxa de Sucesso:      ${((totalPassed / totalTests) * 100).toFixed(1)}%`);
    
    if (totalFailed === 0) {
      console.log('\n🎉 TODOS OS TESTES PASSARAM!');
      console.log('✨ Sistema StockFlow otimizado está funcionando perfeitamente!');
      console.log('🚀 Pronto para produção!');
    } else {
      console.log('\n⚠️  ALGUNS TESTES FALHARAM');
      console.log('🔍 Verifique os logs acima para detalhes');
      console.log('🛠️  Corrija os problemas antes de ir para produção');
    }
    
    return totalFailed === 0;
  }
  
  async runAllTests() {
    console.log('🧪 STOCKFLOW - SUITE COMPLETA DE TESTES');
    console.log('🚀 Sistema de Impressão Ultra-Otimizado');
    console.log('='.repeat(60));
    
    // Executar todos os tipos de teste
    await this.runUnitTests();
    const labels = require('child_process').spawnSync(process.execPath,
      ['--test','--test-reporter=tap',path.join(__dirname,'labelPresentation.test.js'),path.join(__dirname,'labelFlow.test.js')],
      {encoding:'utf8',timeout:30000});
    process.stdout.write(labels.stdout || '');
    process.stderr.write(labels.stderr || '');
    const labelPassed = Number((labels.stdout || '').match(/# pass (\d+)/)?.[1] || 0);
    const labelFailed = Number((labels.stdout || '').match(/# fail (\d+)/)?.[1] || 0);
    this.results.unit.passed += labelPassed;
    this.results.unit.failed += labelFailed || (labels.status === 0 ? 0 : 1);

    await this.runIntegrationTests();
    await this.runPerformanceTests();
    
    // Mostrar resultados finais
    const success = this.printFinalResults();
    
    return success;
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  const runner = new TestRunner();
  
  runner.runAllTests().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('❌ Erro fatal na execução dos testes:', error);
    process.exit(1);
  });
}

module.exports = { TestRunner };