const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Mock do printerService para testes
let printerService;
try {
  printerService = require('../src/services/printerService');
} catch (error) {
  console.log('⚠️  Erro ao carregar printerService:', error.message);
}

// Função para executar um teste
function runTest(name, testFn) {
  try {
    testFn();
    console.log(`✅ ${name}`);
    return true;
  } catch (error) {
    console.log(`❌ ${name}: ${error.message}`);
    return false;
  }
}

// Testes básicos do sistema otimizado
function testDeduplication() {
  if (!printerService || !printerService.generateJobKey) {
    throw new Error('Função generateJobKey não disponível');
  }
  
  const job1 = {
    store_key: 'loja1',
    id_produto: '12345',
    qtd: 1,
    nome: 'Produto A'
  };
  
  const job2 = {
    store_key: 'loja1',
    id_produto: '12346',
    qtd: 1,
    nome: 'Produto B'
  };
  
  const key1 = printerService.generateJobKey(job1);
  const key2 = printerService.generateJobKey(job2);
  
  if (key1 === key2) {
    throw new Error('Chaves devem ser diferentes para jobs diferentes');
  }
}

function testDeduplicationSame() {
  if (!printerService || !printerService.generateJobKey) {
    throw new Error('Função generateJobKey não disponível');
  }
  
  const job1 = {
    store_key: 'loja1',
    id_produto: '12345',
    qtd: 2,
    nome: 'Produto A'
  };
  
  const job2 = {
    store_key: 'loja1',
    id_produto: '12345',
    qtd: 2,
    nome: 'Produto A'
  };
  
  const key1 = printerService.generateJobKey(job1);
  const key2 = printerService.generateJobKey(job2);
  
  if (key1 !== key2) {
    throw new Error('Chaves devem ser idênticas para jobs duplicados');
  }
}

function testCircuitBreaker() {
  if (!printerService || !printerService.isCircuitBreakerOpen) {
    throw new Error('Função isCircuitBreakerOpen não disponível');
  }
  
  const isOpen = printerService.isCircuitBreakerOpen();
  if (typeof isOpen !== 'boolean') {
    throw new Error('Circuit breaker deve retornar boolean');
  }
}

function testTemplateZPL() {
  if (!printerService || !printerService.preencherZPL) {
    throw new Error('Função preencherZPL não disponível');
  }
  
  const dados = {
    nome: 'Produto Teste',
    grupo: 'Grupo A',
    data_entrada: '2025-01-27',
    validade: '2025-02-27',
    id_produto: '12345',
    peso_formatado: '1.5kg',
    fornecedor: 'Fornecedor XYZ',
    nm_empresa: 'Empresa ABC'
  };
  
  const zpl = printerService.preencherZPL(dados);
  
  if (!zpl.includes('Produto Teste')) {
    throw new Error('ZPL deve conter o nome do produto');
  }
  if (!zpl.includes('12345')) {
    throw new Error('ZPL deve conter o ID do produto');
  }
  if (!zpl.includes('^XZ')) {
    throw new Error('ZPL deve terminar com ^XZ');
  }
}

function testPrintersConfig() {
  if (!printerService || !printerService.loadPrintersConfig) {
    throw new Error('Função loadPrintersConfig não disponível');
  }
  
  const config = printerService.loadPrintersConfig();
  if (typeof config !== 'object') {
    throw new Error('Configuração deve ser um objeto');
  }
}

function testJitter() {
  if (!printerService || !printerService.jitter) {
    throw new Error('Função jitter não disponível');
  }
  
  const baseValue = 1000;
  const jitterValue = printerService.jitter(baseValue);
  
  if (typeof jitterValue !== 'number') {
    throw new Error('Jitter deve retornar um número');
  }
  
  // Jitter pode variar entre 70% e 130% do valor base (variance padrão 0.3)
  const minExpected = baseValue * 0.7;
  const maxExpected = baseValue * 1.3;
  
  if (jitterValue < minExpected || jitterValue > maxExpected) {
    throw new Error(`Jitter fora do range esperado: ${jitterValue} (esperado: ${minExpected}-${maxExpected})`);
  }
}

function testDateFormat() {
  if (!printerService || !printerService.formatarDataBrasileira) {
    throw new Error('Função formatarDataBrasileira não disponível');
  }
  
  const data = new Date('2025-01-27T10:30:00Z');
  const formatada = printerService.formatarDataBrasileira(data);
  
  if (!formatada.includes('27/01/2025')) {
    throw new Error('Data deve estar no formato brasileiro');
  }
}

// Função para executar todos os testes
function runTests() {
  console.log('🧪 Executando testes do StockFlow...');
  
  let passed = 0;
  let failed = 0;
  
  // Lista de testes para executar
  const tests = [
    { name: 'Carregamento do printerService', fn: () => {
      if (!printerService) throw new Error('Serviço não carregou');
    }},
    { name: 'Configuração de impressoras', fn: testPrintersConfig },
    { name: 'Template ZPL', fn: testTemplateZPL },
    { name: 'Deduplicação - chaves diferentes', fn: testDeduplication },
    { name: 'Deduplicação - chaves iguais', fn: testDeduplicationSame },
    { name: 'Circuit breaker', fn: testCircuitBreaker },
    { name: 'Função jitter', fn: testJitter },
    { name: 'Formatação de data', fn: testDateFormat }
  ];
  
  // Executar cada teste
  tests.forEach(test => {
    if (runTest(test.name, test.fn)) {
      passed++;
    } else {
      failed++;
    }
  });
  
  console.log('\n📊 Resultados dos Testes:');
  console.log(`✅ Passou: ${passed}`);
  console.log(`❌ Falhou: ${failed}`);
  console.log(`📈 Taxa de Sucesso: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  
  if (failed === 0) {
    console.log('\n🎉 Todos os testes passaram! Sistema otimizado funcionando corretamente.');
  } else {
    console.log('\n⚠️  Alguns testes falharam. Verifique a implementação.');
  }
  
  return { passed, failed };
}

// Exportar função para uso direto
if (require.main === module) {
  runTests();
}

module.exports = { runTests };