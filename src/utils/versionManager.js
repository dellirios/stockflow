/**
 * StockFlow Version Manager
 * Sistema de versionamento e auto-update sincronizado com GitHub
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const axios = require('axios');

// Logger simples para evitar dependências circulares
const logger = {
    info: (msg) => console.log(`[INFO] ${msg}`),
    error: (msg) => console.error(`[ERROR] ${msg}`),
    warn: (msg) => console.warn(`[WARN] ${msg}`)
};

class VersionManager {
    constructor() {
        this.projectDir = process.cwd();
        this.packagePath = path.join(this.projectDir, 'package.json');
        this.configPath = path.join(this.projectDir, '.version-config.json');
        this.backupDir = path.join(this.projectDir, 'backups');
        
        // Configuração padrão
        this.config = {
            repository: 'dellirios/stockflow',
            branch: 'main',
            autoUpdate: false,
            checkInterval: 3600000, // 1 hora em ms
            preserveFiles: [
                'config/printers.json',
                'logs/',
                '.env',
                '.version-config.json',
                '.auto-update-config'
            ],
            githubToken: process.env.GITHUB_TOKEN || '',
            backupRetention: 5
        };
        
        this.loadConfig();
    }

    /**
     * Carrega configuração do arquivo
     */
    loadConfig() {
        try {
            if (fs.existsSync(this.configPath)) {
                const fileConfig = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
                this.config = { ...this.config, ...fileConfig };
            }
        } catch (error) {
            logger.warn('Erro ao carregar configuração de versão:', error.message);
        }
    }

    /**
     * Salva configuração no arquivo
     */
    saveConfig() {
        try {
            fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
            logger.info('Configuração de versão salva');
        } catch (error) {
            logger.error('Erro ao salvar configuração:', error.message);
        }
    }

    /**
     * Obtém versão atual do package.json
     */
    getCurrentVersion() {
        try {
            const packageJson = JSON.parse(fs.readFileSync(this.packagePath, 'utf8'));
            return packageJson.version;
        } catch (error) {
            logger.error('Erro ao ler versão atual:', error.message);
            return '0.0.0';
        }
    }

    /**
     * Atualiza versão no package.json
     */
    updateVersion(newVersion) {
        try {
            const packageJson = JSON.parse(fs.readFileSync(this.packagePath, 'utf8'));
            packageJson.version = newVersion;
            fs.writeFileSync(this.packagePath, JSON.stringify(packageJson, null, 2));
            logger.info(`Versão atualizada para ${newVersion}`);
            return true;
        } catch (error) {
            logger.error('Erro ao atualizar versão:', error.message);
            return false;
        }
    }

    /**
     * Incrementa versão seguindo semântica (major.minor.patch)
     */
    incrementVersion(type = 'patch') {
        const currentVersion = this.getCurrentVersion();
        const [major, minor, patch] = currentVersion.split('.').map(Number);
        
        let newVersion;
        switch (type) {
            case 'major':
                newVersion = `${major + 1}.0.0`;
                break;
            case 'minor':
                newVersion = `${major}.${minor + 1}.0`;
                break;
            case 'patch':
            default:
                newVersion = `${major}.${minor}.${patch + 1}`;
                break;
        }
        
        return this.updateVersion(newVersion) ? newVersion : null;
    }

    /**
     * Verifica releases disponíveis no GitHub
     */
    async checkGitHubReleases() {
        try {
            const url = `https://api.github.com/repos/${this.config.repository}/releases`;
            const headers = {};
            
            if (this.config.githubToken) {
                headers.Authorization = `token ${this.config.githubToken}`;
            }
            
            const response = await axios.get(url, { headers });
            return response.data;
        } catch (error) {
            logger.error('Erro ao verificar releases:', error.message);
            return [];
        }
    }

    /**
     * Obtém última release disponível
     */
    async getLatestRelease() {
        try {
            const url = `https://api.github.com/repos/${this.config.repository}/releases/latest`;
            const headers = {};
            
            if (this.config.githubToken) {
                headers.Authorization = `token ${this.config.githubToken}`;
            }
            
            const response = await axios.get(url, { headers });
            return response.data;
        } catch (error) {
            logger.error('Erro ao obter última release:', error.message);
            return null;
        }
    }

    /**
     * Compara versões (retorna -1, 0, ou 1)
     */
    compareVersions(version1, version2) {
        const v1 = version1.replace(/^v/, '').split('.').map(Number);
        const v2 = version2.replace(/^v/, '').split('.').map(Number);
        
        for (let i = 0; i < Math.max(v1.length, v2.length); i++) {
            const num1 = v1[i] || 0;
            const num2 = v2[i] || 0;
            
            if (num1 < num2) return -1;
            if (num1 > num2) return 1;
        }
        
        return 0;
    }

    /**
     * Verifica se há atualizações disponíveis
     */
    async checkForUpdates() {
        try {
            const currentVersion = this.getCurrentVersion();
            const latestRelease = await this.getLatestRelease();
            
            if (!latestRelease) {
                return { hasUpdate: false, message: 'Não foi possível verificar atualizações' };
            }
            
            const latestVersion = latestRelease.tag_name.replace(/^v/, '');
            const comparison = this.compareVersions(currentVersion, latestVersion);
            
            if (comparison < 0) {
                return {
                    hasUpdate: true,
                    currentVersion,
                    latestVersion,
                    releaseInfo: latestRelease,
                    message: `Atualização disponível: v${currentVersion} → v${latestVersion}`
                };
            }
            
            return {
                hasUpdate: false,
                currentVersion,
                latestVersion,
                message: 'Sistema atualizado'
            };
        } catch (error) {
            logger.error('Erro ao verificar atualizações:', error.message);
            return { hasUpdate: false, error: error.message };
        }
    }

    /**
     * Cria backup antes da atualização
     */
    createBackup() {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPath = path.join(this.backupDir, `backup-${timestamp}`);
            
            if (!fs.existsSync(this.backupDir)) {
                fs.mkdirSync(this.backupDir, { recursive: true });
            }
            
            fs.mkdirSync(backupPath, { recursive: true });
            
            // Backup dos arquivos preservados
            for (const file of this.config.preserveFiles) {
                const sourcePath = path.join(this.projectDir, file);
                const targetPath = path.join(backupPath, file);
                
                if (fs.existsSync(sourcePath)) {
                    const targetDir = path.dirname(targetPath);
                    if (!fs.existsSync(targetDir)) {
                        fs.mkdirSync(targetDir, { recursive: true });
                    }
                    
                    if (fs.lstatSync(sourcePath).isDirectory()) {
                        execSync(`cp -r "${sourcePath}" "${targetPath}"`);
                    } else {
                        fs.copyFileSync(sourcePath, targetPath);
                    }
                }
            }
            
            logger.info(`Backup criado em: ${backupPath}`);
            return backupPath;
        } catch (error) {
            logger.error('Erro ao criar backup:', error.message);
            return null;
        }
    }

    /**
     * Restaura backup
     */
    restoreBackup(backupPath) {
        try {
            if (!fs.existsSync(backupPath)) {
                throw new Error('Backup não encontrado');
            }
            
            for (const file of this.config.preserveFiles) {
                const sourcePath = path.join(backupPath, file);
                const targetPath = path.join(this.projectDir, file);
                
                if (fs.existsSync(sourcePath)) {
                    if (fs.lstatSync(sourcePath).isDirectory()) {
                        execSync(`cp -r "${sourcePath}" "${targetPath}"`);
                    } else {
                        fs.copyFileSync(sourcePath, targetPath);
                    }
                }
            }
            
            logger.info('Backup restaurado com sucesso');
            return true;
        } catch (error) {
            logger.error('Erro ao restaurar backup:', error.message);
            return false;
        }
    }

    /**
     * Executa atualização automática
     */
    async performAutoUpdate() {
        try {
            logger.info('Iniciando verificação de atualização automática');
            
            const updateCheck = await this.checkForUpdates();
            
            if (!updateCheck.hasUpdate) {
                logger.info(updateCheck.message);
                return { success: true, message: updateCheck.message };
            }
            
            logger.info(`Atualização encontrada: ${updateCheck.message}`);
            
            // Criar backup
            const backupPath = this.createBackup();
            if (!backupPath) {
                throw new Error('Falha ao criar backup');
            }
            
            try {
                // Parar serviço
                logger.info('Parando serviço StockFlow...');
                execSync('sudo systemctl stop stockflow.service', { stdio: 'inherit' });
                
                // Atualizar código
                logger.info('Atualizando código do repositório...');
                execSync(`git fetch origin ${this.config.branch}`, { stdio: 'inherit' });
                execSync(`git reset --hard origin/${this.config.branch}`, { stdio: 'inherit' });
                
                // Instalar dependências
                logger.info('Instalando dependências...');
                execSync('npm install --production', { stdio: 'inherit' });
                
                // Restaurar arquivos preservados
                logger.info('Restaurando configurações...');
                this.restoreBackup(backupPath);
                
                // Atualizar versão no package.json
                this.updateVersion(updateCheck.latestVersion);
                
                // Reiniciar serviço
                logger.info('Reiniciando serviço StockFlow...');
                execSync('sudo systemctl start stockflow.service', { stdio: 'inherit' });
                
                logger.info(`Atualização concluída: v${updateCheck.currentVersion} → v${updateCheck.latestVersion}`);
                
                return {
                    success: true,
                    message: `Atualização concluída: v${updateCheck.currentVersion} → v${updateCheck.latestVersion}`,
                    backupPath
                };
                
            } catch (updateError) {
                logger.error('Erro durante atualização, restaurando backup:', updateError.message);
                
                // Restaurar backup em caso de erro
                this.restoreBackup(backupPath);
                
                // Tentar reiniciar serviço
                try {
                    execSync('sudo systemctl start stockflow.service', { stdio: 'inherit' });
                } catch (serviceError) {
                    logger.error('Erro ao reiniciar serviço:', serviceError.message);
                }
                
                throw updateError;
            }
            
        } catch (error) {
            logger.error('Erro na atualização automática:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Configura auto-update
     */
    configureAutoUpdate(options = {}) {
        this.config = { ...this.config, ...options };
        this.saveConfig();
        
        if (this.config.autoUpdate) {
            this.startAutoUpdateScheduler();
        }
    }

    /**
     * Inicia agendador de auto-update
     */
    startAutoUpdateScheduler() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        
        this.updateInterval = setInterval(async () => {
            if (this.config.autoUpdate) {
                await this.performAutoUpdate();
            }
        }, this.config.checkInterval);
        
        logger.info(`Auto-update agendado a cada ${this.config.checkInterval / 1000 / 60} minutos`);
    }

    /**
     * Para agendador de auto-update
     */
    stopAutoUpdateScheduler() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
            logger.info('Auto-update scheduler parado');
        }
    }

    /**
     * Obtém informações de versão e status
     */
    async getVersionInfo() {
        const currentVersion = this.getCurrentVersion();
        const updateCheck = await this.checkForUpdates();
        
        return {
            currentVersion,
            ...updateCheck,
            autoUpdateEnabled: this.config.autoUpdate,
            repository: this.config.repository,
            branch: this.config.branch,
            lastCheck: new Date().toISOString()
        };
    }
}

module.exports = VersionManager;