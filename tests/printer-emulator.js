#!/usr/bin/env node
/**
 * Emulador de Impressora ZPL Virtual
 * Simula uma impressora térmica Zebra para testes do StockFlow
 */

const net = require('net');
const fs = require('fs');
const path = require('path');

class ZPLPrinterEmulator {
  constructor(port = 9100, name = 'Virtual-Zebra-ZT230') {
    this.port = port;
    this.name = name;
    this.server = null;
    this.jobCounter = 0;
    this.logFile = path.join(__dirname, '../logs/printer-emulator.log');
    this.isRunning = false;
    
    // Estatísticas
    this.stats = {
      totalJobs: 0,
      totalBytes: 0,
      startTime: new Date(),
      lastJob: null
    };
  }

  log(message) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [PRINTER-EMU] ${message}\n`;
    
    console.log(logEntry.trim());
    
    // Salvar no arquivo de log
    try {
      fs.appendFileSync(this.logFile, logEntry);
    } catch (err) {
      console.error('Erro ao escrever log:', err.message);
    }
  }

  parseZPL(zplData) {
    const lines = zplData.split('\n');
    const parsed = {
      format: 'ZPL',
      commands: [],
      text: [],
      barcodes: []
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Detectar comandos ZPL comuns
      if (trimmed.startsWith('^XA')) {
        parsed.commands.push('START_FORMAT');
      } else if (trimmed.startsWith('^XZ')) {
        parsed.commands.push('END_FORMAT');
      } else if (trimmed.startsWith('^FD')) {
        const text = trimmed.substring(3);
        parsed.text.push(text);
      } else if (trimmed.startsWith('^BY')) {
        parsed.commands.push('BARCODE_CONFIG');
      } else if (trimmed.startsWith('^BC')) {
        parsed.barcodes.push('CODE128');
      } else if (trimmed.startsWith('^FO')) {
        const coords = trimmed.substring(3);
        parsed.commands.push(`POSITION:${coords}`);
      }
    }

    return parsed;
  }

  simulatePrinting(zplData) {
    const parsed = this.parseZPL(zplData);
    const jobId = ++this.jobCounter;
    
    this.log(`📄 Job #${jobId} recebido (${zplData.length} bytes)`);
    this.log(`   Texto: [${parsed.text.join(', ')}]`);
    this.log(`   Códigos de barras: ${parsed.barcodes.length}`);
    this.log(`   Comandos: ${parsed.commands.length}`);
    
    // Simular tempo de processamento
    const processingTime = Math.random() * 100 + 50; // 50-150ms
    
    setTimeout(() => {
      this.log(`✅ Job #${jobId} impresso com sucesso (${processingTime.toFixed(0)}ms)`);
      
      // Atualizar estatísticas
      this.stats.totalJobs++;
      this.stats.totalBytes += zplData.length;
      this.stats.lastJob = new Date();
    }, processingTime);

    return jobId;
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        this.log(`🔌 Cliente conectado: ${socket.remoteAddress}:${socket.remotePort}`);
        
        let buffer = '';
        
        socket.on('data', (data) => {
          buffer += data.toString();
          
          // Processar quando receber comando completo ZPL (^XA...^XZ)
          if (buffer.includes('^XZ')) {
            const jobId = this.simulatePrinting(buffer);
            
            // Enviar resposta de confirmação (opcional)
            socket.write(`Job ${jobId} queued\n`);
            
            buffer = ''; // Limpar buffer
          }
        });
        
        socket.on('close', () => {
          this.log(`🔌 Cliente desconectado`);
        });
        
        socket.on('error', (err) => {
          this.log(`❌ Erro no socket: ${err.message}`);
        });
      });
      
      this.server.listen(this.port, '0.0.0.0', () => {
        this.isRunning = true;
        this.log(`🖨️  Emulador de impressora iniciado`);
        this.log(`   Nome: ${this.name}`);
        this.log(`   Porta: ${this.port}`);
        this.log(`   Protocolo: RAW/ZPL`);
        this.log(`   Status: ONLINE`);
        resolve();
      });
      
      this.server.on('error', (err) => {
        this.log(`❌ Erro no servidor: ${err.message}`);
        reject(err);
      });
    });
  }

  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.isRunning = false;
          this.log(`🛑 Emulador de impressora parado`);
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  getStats() {
    const uptime = Date.now() - this.stats.startTime.getTime();
    return {
      ...this.stats,
      uptime: Math.floor(uptime / 1000),
      avgJobSize: this.stats.totalJobs > 0 ? Math.floor(this.stats.totalBytes / this.stats.totalJobs) : 0,
      isRunning: this.isRunning
    };
  }

  printStats() {
    const stats = this.getStats();
    this.log(`📊 Estatísticas da Impressora Virtual:`);
    this.log(`   Jobs processados: ${stats.totalJobs}`);
    this.log(`   Bytes processados: ${stats.totalBytes}`);
    this.log(`   Tamanho médio do job: ${stats.avgJobSize} bytes`);
    this.log(`   Tempo ativo: ${stats.uptime}s`);
    this.log(`   Status: ${stats.isRunning ? 'ONLINE' : 'OFFLINE'}`);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  const emulator = new ZPLPrinterEmulator();
  
  // Handlers para shutdown graceful
  process.on('SIGINT', async () => {
    console.log('\n🛑 Parando emulador...');
    emulator.printStats();
    await emulator.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    await emulator.stop();
    process.exit(0);
  });
  
  // Iniciar emulador
  emulator.start().then(() => {
    console.log('\n✅ Emulador pronto para receber jobs de impressão!');
    console.log('   Pressione Ctrl+C para parar\n');
    
    // Imprimir estatísticas a cada 30 segundos
    setInterval(() => {
      emulator.printStats();
    }, 30000);
  }).catch((err) => {
    console.error('❌ Erro ao iniciar emulador:', err.message);
    process.exit(1);
  });
}

module.exports = ZPLPrinterEmulator;