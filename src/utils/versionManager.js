/**
 * StockFlow Version Manager
 * Sistema de versionamento simplificado
 */

const fs = require('fs');
const path = require('path');

const logger = {
    info: (msg) => console.log(`[${new Date().toISOString()}] [VERSION] ${msg}`),
    error: (msg, err) => console.error(`[${new Date().toISOString()}] [VERSION ERROR] ${msg}`, err || ''),
    debug: (msg) => console.log(`[${new Date().toISOString()}] [VERSION DEBUG] ${msg}`)
};

class VersionManager {
    constructor() {
        this.packagePath = path.join(__dirname, '../../package.json');
        this.currentVersion = this.getCurrentVersion();
    }



    /**
     * Obtém a versão atual do package.json
     */
    getCurrentVersion() {
        try {
            const packageData = JSON.parse(fs.readFileSync(this.packagePath, 'utf8'));
            return packageData.version || '1.0.0';
        } catch (error) {
            logger.error('Erro ao ler versão atual:', error.message);
            return '1.0.0';
        }
    }

    /**
     * Atualiza a versão no package.json
     */
    updateVersion(newVersion) {
        try {
            const packageData = JSON.parse(fs.readFileSync(this.packagePath, 'utf8'));
            packageData.version = newVersion;
            fs.writeFileSync(this.packagePath, JSON.stringify(packageData, null, 2));
            this.currentVersion = newVersion;
            logger.info(`Versão atualizada para: ${newVersion}`);
            return true;
        } catch (error) {
            logger.error('Erro ao atualizar versão:', error.message);
            return false;
        }
    }

    /**
     * Incrementa versão (patch, minor, major)
     */
    incrementVersion(type = 'patch') {
        const version = this.currentVersion.split('.').map(Number);
        
        switch (type) {
            case 'major':
                version[0]++;
                version[1] = 0;
                version[2] = 0;
                break;
            case 'minor':
                version[1]++;
                version[2] = 0;
                break;
            case 'patch':
            default:
                version[2]++;
                break;
        }
        
        const newVersion = version.join('.');
        return this.updateVersion(newVersion) ? newVersion : null;
    }

    /**
     * Obtém informações da versão
     */
    getVersionInfo() {
        return {
            current: this.currentVersion,
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = VersionManager;