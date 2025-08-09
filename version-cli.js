#!/usr/bin/env node
/**
 * StockFlow Version CLI
 * Interface de linha de comando para gerenciamento de versões e auto-update
 */

const VersionManager = require('./src/utils/versionManager');

class VersionCLI {
    constructor() {
        this.versionManager = new VersionManager();
        this.commands = {
            'info': this.showInfo.bind(this),
            'check': this.checkUpdates.bind(this),
            'update': this.performUpdate.bind(this),
            'increment': this.incrementVersion.bind(this),
            'config': this.manageConfig.bind(this),
            'releases': this.listReleases.bind(this),
            'backups': this.listBackups.bind(this),
            'enable-auto': this.enableAutoUpdate.bind(this),
            'disable-auto': this.disableAutoUpdate.bind(this),
            'help': this.showHelp.bind(this)
        };
    }

    /**
     * Executa comando baseado nos argumentos
     */
    async run() {
        const args = process.argv.slice(2);
        const command = args[0] || 'help';
        const params = args.slice(1);

        if (!this.commands[command]) {
            console.error(`❌ Comando desconhecido: ${command}`);
            this.showHelp();
            process.exit(1);
        }

        try {
            await this.commands[command](params);
        } catch (error) {
            console.error(`❌ Erro ao executar comando: ${error.message}`);
            process.exit(1);
        }
    }

    /**
     * Mostra informações de versão
     */
    async showInfo() {
        console.log('\n📦 StockFlow - Informações de Versão');
        console.log('=====================================');
        
        const info = await this.versionManager.getVersionInfo();
        
        console.log(`\n🏷️  Versão Atual: v${info.currentVersion}`);
        console.log(`📂 Repositório: ${this.versionManager.config.repository}`);
        console.log(`🌿 Branch: ${this.versionManager.config.branch}`);
        console.log(`🔄 Auto-Update: ${info.autoUpdateEnabled ? '✅ Habilitado' : '❌ Desabilitado'}`);
        
        if (info.hasUpdate) {
            console.log(`\n🆕 ${info.message}`);
            console.log(`📅 Publicado em: ${new Date(info.releaseInfo.published_at).toLocaleString('pt-BR')}`);
        } else {
            console.log(`\n✅ ${info.message}`);
        }
        
        console.log(`\n🕐 Última verificação: ${new Date(info.lastCheck).toLocaleString('pt-BR')}`);
    }

    /**
     * Verifica atualizações disponíveis
     */
    async checkUpdates() {
        console.log('\n🔍 Verificando atualizações...');
        
        const updateCheck = await this.versionManager.checkForUpdates();
        
        if (updateCheck.hasUpdate) {
            console.log(`\n🆕 ${updateCheck.message}`);
            console.log(`\n📋 Detalhes da Release:`);
            console.log(`   Nome: ${updateCheck.releaseInfo.name}`);
            console.log(`   Data: ${new Date(updateCheck.releaseInfo.published_at).toLocaleString('pt-BR')}`);
            
            if (updateCheck.releaseInfo.body) {
                console.log(`\n📝 Changelog:`);
                console.log(updateCheck.releaseInfo.body.substring(0, 500) + '...');
            }
        } else {
            console.log(`\n✅ ${updateCheck.message}`);
        }
    }

    /**
     * Executa atualização
     */
    async performUpdate() {
        console.log('\n🔄 Iniciando atualização...');
        
        const updateResult = await this.versionManager.performAutoUpdate();
        
        if (updateResult.success) {
            console.log(`\n✅ ${updateResult.message}`);
            if (updateResult.backupPath) {
                console.log(`💾 Backup criado em: ${updateResult.backupPath}`);
            }
        } else {
            console.log(`\n❌ Falha na atualização: ${updateResult.error}`);
        }
    }

    /**
     * Incrementa versão
     */
    async incrementVersion(params) {
        const type = params[0] || 'patch';
        
        if (!['major', 'minor', 'patch'].includes(type)) {
            console.error('❌ Tipo inválido. Use: major, minor ou patch');
            return;
        }
        
        const oldVersion = this.versionManager.getCurrentVersion();
        const newVersion = this.versionManager.incrementVersion(type);
        
        if (newVersion) {
            console.log(`\n✅ Versão incrementada: v${oldVersion} → v${newVersion}`);
            console.log(`📝 Tipo: ${type}`);
        } else {
            console.log('\n❌ Falha ao incrementar versão');
        }
    }

    /**
     * Gerencia configuração
     */
    async manageConfig(params) {
        const action = params[0];
        
        if (action === 'show') {
            console.log('\n⚙️  Configuração Atual');
            console.log('======================');
            console.log(`Repositório: ${this.versionManager.config.repository}`);
            console.log(`Branch: ${this.versionManager.config.branch}`);
            console.log(`Auto-Update: ${this.versionManager.config.autoUpdate ? 'Habilitado' : 'Desabilitado'}`);
            console.log(`Intervalo: ${this.versionManager.config.checkInterval / 1000 / 60} minutos`);
            console.log(`Arquivos Preservados: ${this.versionManager.config.preserveFiles.length} itens`);
        } else if (action === 'set') {
            const key = params[1];
            const value = params[2];
            
            if (!key || value === undefined) {
                console.error('❌ Uso: config set <chave> <valor>');
                return;
            }
            
            const updates = {};
            
            // Converter valores
            if (key === 'autoUpdate') {
                updates[key] = value === 'true';
            } else if (key === 'checkInterval') {
                updates[key] = parseInt(value) * 60 * 1000; // minutos para ms
            } else {
                updates[key] = value;
            }
            
            this.versionManager.configureAutoUpdate(updates);
            console.log(`✅ Configuração atualizada: ${key} = ${value}`);
        } else {
            console.log('\n⚙️  Gerenciamento de Configuração');
            console.log('==================================');
            console.log('Uso:');
            console.log('  config show              - Mostra configuração atual');
            console.log('  config set <key> <value> - Define configuração');
            console.log('\nChaves disponíveis:');
            console.log('  repository    - Repositório GitHub (ex: user/repo)');
            console.log('  branch        - Branch para atualização');
            console.log('  autoUpdate    - Habilitar auto-update (true/false)');
            console.log('  checkInterval - Intervalo em minutos');
            console.log('  githubToken   - Token de acesso GitHub');
        }
    }

    /**
     * Lista releases disponíveis
     */
    async listReleases() {
        console.log('\n📋 Releases Disponíveis');
        console.log('=======================');
        
        const releases = await this.versionManager.checkGitHubReleases();
        
        if (releases.length === 0) {
            console.log('Nenhuma release encontrada.');
            return;
        }
        
        releases.slice(0, 10).forEach((release, index) => {
            const date = new Date(release.published_at).toLocaleDateString('pt-BR');
            const status = release.prerelease ? '🧪 Pre-release' : '✅ Stable';
            
            console.log(`\n${index + 1}. ${release.tag_name} - ${release.name}`);
            console.log(`   📅 ${date} | ${status}`);
            
            if (release.body) {
                const description = release.body.substring(0, 100).replace(/\n/g, ' ');
                console.log(`   📝 ${description}...`);
            }
        });
    }

    /**
     * Lista backups disponíveis
     */
    async listBackups() {
        console.log('\n💾 Backups Disponíveis');
        console.log('======================');
        
        const fs = require('fs');
        const path = require('path');
        
        const backupDir = path.join(process.cwd(), 'backups');
        
        if (!fs.existsSync(backupDir)) {
            console.log('Nenhum backup encontrado.');
            return;
        }
        
        const backups = fs.readdirSync(backupDir)
            .filter(item => fs.statSync(path.join(backupDir, item)).isDirectory())
            .map(backup => {
                const backupPath = path.join(backupDir, backup);
                const stats = fs.statSync(backupPath);
                
                return {
                    name: backup,
                    path: backupPath,
                    createdAt: stats.birthtime
                };
            })
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        if (backups.length === 0) {
            console.log('Nenhum backup encontrado.');
            return;
        }
        
        backups.forEach((backup, index) => {
            const date = backup.createdAt.toLocaleString('pt-BR');
            console.log(`${index + 1}. ${backup.name}`);
            console.log(`   📅 ${date}`);
            console.log(`   📂 ${backup.path}`);
        });
    }

    /**
     * Habilita auto-update
     */
    async enableAutoUpdate() {
        this.versionManager.configureAutoUpdate({ autoUpdate: true });
        console.log('\n✅ Auto-update habilitado');
        console.log('🔄 O sistema verificará atualizações automaticamente');
    }

    /**
     * Desabilita auto-update
     */
    async disableAutoUpdate() {
        this.versionManager.configureAutoUpdate({ autoUpdate: false });
        this.versionManager.stopAutoUpdateScheduler();
        console.log('\n❌ Auto-update desabilitado');
        console.log('🛑 Verificações automáticas foram interrompidas');
    }

    /**
     * Mostra ajuda
     */
    showHelp() {
        console.log('\n🔧 StockFlow Version CLI');
        console.log('========================');
        console.log('\nComandos disponíveis:');
        console.log('\n📋 INFORMAÇÕES:');
        console.log('  info                     - Mostra informações de versão');
        console.log('  check                    - Verifica atualizações disponíveis');
        console.log('  releases                 - Lista releases do GitHub');
        console.log('\n🔄 ATUALIZAÇÕES:');
        console.log('  update                   - Executa atualização manual');
        console.log('  increment [type]         - Incrementa versão (major|minor|patch)');
        console.log('\n⚙️  CONFIGURAÇÃO:');
        console.log('  config show              - Mostra configuração atual');
        console.log('  config set <key> <value> - Define configuração');
        console.log('  enable-auto              - Habilita auto-update');
        console.log('  disable-auto             - Desabilita auto-update');
        console.log('\n💾 BACKUP:');
        console.log('  backups                  - Lista backups disponíveis');
        console.log('\n📚 AJUDA:');
        console.log('  help                     - Mostra esta ajuda');
        console.log('\nExemplos:');
        console.log('  node version-cli.js info');
        console.log('  node version-cli.js increment minor');
        console.log('  node version-cli.js config set autoUpdate true');
        console.log('');
    }
}

// Executar CLI se chamado diretamente
if (require.main === module) {
    const cli = new VersionCLI();
    cli.run().catch(error => {
        console.error('❌ Erro fatal:', error.message);
        process.exit(1);
    });
}

module.exports = VersionCLI;