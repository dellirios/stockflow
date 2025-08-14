// src/database/connection.js
// Módulo de conexão com MySQL para o sistema StockFlow

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

/**
 * Classe para gerenciamento de conexão com MySQL
 */
class DatabaseConnection {
  constructor() {
    this.connection = null;
    this.config = this.loadDatabaseConfig();
  }

  /**
   * Carrega configuração do banco de dados
   * @returns {Object} Configuração do banco
   */
  loadDatabaseConfig() {
    try {
      // Tentar carregar de arquivo de configuração se existir
      const configPath = path.join(__dirname, '../../config/database.json');
      
      if (fs.existsSync(configPath)) {
        const configData = fs.readFileSync(configPath, 'utf8');
        return JSON.parse(configData);
      }
      
      // Configuração padrão baseada no db.sql
      return {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER || 'u462461747_stockflow',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'u462461747_stockflow',
        charset: 'utf8mb4',
        timezone: '+00:00',
        acquireTimeout: 60000,
        timeout: 60000,
        reconnect: true
      };
    } catch (error) {
      console.error('Erro ao carregar configuração do banco:', error);
      throw new Error('Falha na configuração do banco de dados');
    }
  }

  /**
   * Estabelece conexão com o banco de dados
   * @returns {Promise<mysql.Connection>} Conexão ativa
   */
  async connect() {
    try {
      if (this.connection) {
        // Verificar se a conexão ainda está ativa
        await this.connection.ping();
        return this.connection;
      }

      console.log('Conectando ao banco de dados MySQL...');
      this.connection = await mysql.createConnection(this.config);
      
      console.log('Conexão com MySQL estabelecida com sucesso');
      return this.connection;
    } catch (error) {
      console.error('Erro ao conectar com MySQL:', error);
      throw new Error(`Falha na conexão com o banco: ${error.message}`);
    }
  }

  /**
   * Fecha a conexão com o banco de dados
   */
  async disconnect() {
    try {
      if (this.connection) {
        await this.connection.end();
        this.connection = null;
        console.log('Conexão com MySQL fechada');
      }
    } catch (error) {
      console.error('Erro ao fechar conexão:', error);
    }
  }

  /**
   * Executa uma query no banco de dados
   * @param {string} query - Query SQL
   * @param {Array} params - Parâmetros da query
   * @returns {Promise<Array>} Resultado da query
   */
  async execute(query, params = []) {
    try {
      const connection = await this.connect();
      const [rows] = await connection.execute(query, params);
      return rows;
    } catch (error) {
      console.error('Erro ao executar query:', error);
      throw error;
    }
  }

  /**
   * Executa uma transação
   * @param {Function} callback - Função que contém as operações da transação
   * @returns {Promise<any>} Resultado da transação
   */
  async transaction(callback) {
    const connection = await this.connect();
    
    try {
      await connection.beginTransaction();
      
      const result = await callback(connection);
      
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      console.error('Erro na transação, rollback executado:', error);
      throw error;
    }
  }

  /**
   * Verifica se uma tabela existe
   * @param {string} tableName - Nome da tabela
   * @returns {Promise<boolean>} True se a tabela existe
   */
  async tableExists(tableName) {
    try {
      const query = `
        SELECT COUNT(*) as count 
        FROM information_schema.tables 
        WHERE table_schema = ? AND table_name = ?
      `;
      
      const result = await this.execute(query, [this.config.database, tableName]);
      return result[0].count > 0;
    } catch (error) {
      console.error(`Erro ao verificar tabela ${tableName}:`, error);
      return false;
    }
  }

  /**
   * Testa a conexão com o banco
   * @returns {Promise<Object>} Status da conexão
   */
  async testConnection() {
    try {
      const connection = await this.connect();
      await connection.ping();
      
      // Verificar se as tabelas principais existem
      const produtosCadastrados = await this.tableExists('produtos_cadastrados');
      const produtosRemovidos = await this.tableExists('tb_produto_removido');
      
      return {
        status: 'connected',
        database: this.config.database,
        host: this.config.host,
        tables: {
          produtos_cadastrados: produtosCadastrados,
          tb_produto_removido: produtosRemovidos
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

// Instância singleton
let dbInstance = null;

/**
 * Retorna instância singleton da conexão
 * @returns {DatabaseConnection} Instância da conexão
 */
function getDatabase() {
  if (!dbInstance) {
    dbInstance = new DatabaseConnection();
  }
  return dbInstance;
}

module.exports = {
  DatabaseConnection,
  getDatabase
};