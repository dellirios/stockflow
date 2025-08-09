/**
 * StockFlow Version API
 * Endpoints para gerenciamento de versão e auto-update
 */

const express = require('express');
const VersionManager = require('../utils/versionManager');
const logger = require('../utils/logger');

const router = express.Router();
const versionManager = new VersionManager();

/**
 * GET /api/version/info
 * Obtém informações de versão atual e disponível
 */
router.get('/info', async (req, res) => {
    try {
        const versionInfo = await versionManager.getVersionInfo();
        
        res.json({
            success: true,
            data: versionInfo,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Erro ao obter informações de versão:', error.message);
        res.status(500).json({
            success: false,
            error: 'Erro interno do servidor',
            message: error.message
        });
    }
});

/**
 * GET /api/version/check
 * Verifica se há atualizações disponíveis
 */
router.get('/check', async (req, res) => {
    try {
        const updateCheck = await versionManager.checkForUpdates();
        
        res.json({
            success: true,
            data: updateCheck,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Erro ao verificar atualizações:', error.message);
        res.status(500).json({
            success: false,
            error: 'Erro ao verificar atualizações',
            message: error.message
        });
    }
});

/**
 * GET /api/version/releases
 * Lista todas as releases disponíveis no GitHub
 */
router.get('/releases', async (req, res) => {
    try {
        const releases = await versionManager.checkGitHubReleases();
        
        const formattedReleases = releases.map(release => ({
            version: release.tag_name,
            name: release.name,
            description: release.body,
            publishedAt: release.published_at,
            prerelease: release.prerelease,
            draft: release.draft,
            downloadUrl: release.zipball_url
        }));
        
        res.json({
            success: true,
            data: formattedReleases,
            count: formattedReleases.length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Erro ao listar releases:', error.message);
        res.status(500).json({
            success: false,
            error: 'Erro ao listar releases',
            message: error.message
        });
    }
});

/**
 * POST /api/version/update
 * Executa atualização manual
 */
router.post('/update', async (req, res) => {
    try {
        logger.info('Iniciando atualização manual via API');
        
        // Verificar se há atualizações disponíveis
        const updateCheck = await versionManager.checkForUpdates();
        
        if (!updateCheck.hasUpdate) {
            return res.json({
                success: true,
                message: 'Sistema já está atualizado',
                data: updateCheck
            });
        }
        
        // Executar atualização
        const updateResult = await versionManager.performAutoUpdate();
        
        if (updateResult.success) {
            res.json({
                success: true,
                message: updateResult.message,
                data: {
                    backupPath: updateResult.backupPath,
                    previousVersion: updateCheck.currentVersion,
                    newVersion: updateCheck.latestVersion
                }
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Falha na atualização',
                message: updateResult.error
            });
        }
    } catch (error) {
        logger.error('Erro na atualização manual:', error.message);
        res.status(500).json({
            success: false,
            error: 'Erro na atualização',
            message: error.message
        });
    }
});

/**
 * POST /api/version/increment
 * Incrementa versão local (major, minor, patch)
 */
router.post('/increment', (req, res) => {
    try {
        const { type = 'patch' } = req.body;
        
        if (!['major', 'minor', 'patch'].includes(type)) {
            return res.status(400).json({
                success: false,
                error: 'Tipo de incremento inválido',
                message: 'Use: major, minor ou patch'
            });
        }
        
        const oldVersion = versionManager.getCurrentVersion();
        const newVersion = versionManager.incrementVersion(type);
        
        if (newVersion) {
            logger.info(`Versão incrementada: ${oldVersion} → ${newVersion}`);
            
            res.json({
                success: true,
                message: `Versão incrementada: ${oldVersion} → ${newVersion}`,
                data: {
                    previousVersion: oldVersion,
                    newVersion: newVersion,
                    incrementType: type
                }
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Falha ao incrementar versão'
            });
        }
    } catch (error) {
        logger.error('Erro ao incrementar versão:', error.message);
        res.status(500).json({
            success: false,
            error: 'Erro ao incrementar versão',
            message: error.message
        });
    }
});

/**
 * GET /api/version/config
 * Obtém configuração atual do auto-update
 */
router.get('/config', (req, res) => {
    try {
        const config = {
            repository: versionManager.config.repository,
            branch: versionManager.config.branch,
            autoUpdate: versionManager.config.autoUpdate,
            checkInterval: versionManager.config.checkInterval,
            preserveFiles: versionManager.config.preserveFiles
        };
        
        res.json({
            success: true,
            data: config,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Erro ao obter configuração:', error.message);
        res.status(500).json({
            success: false,
            error: 'Erro ao obter configuração',
            message: error.message
        });
    }
});

/**
 * POST /api/version/config
 * Atualiza configuração do auto-update
 */
router.post('/config', (req, res) => {
    try {
        const {
            repository,
            branch,
            autoUpdate,
            checkInterval,
            githubToken
        } = req.body;
        
        const updates = {};
        
        if (repository !== undefined) updates.repository = repository;
        if (branch !== undefined) updates.branch = branch;
        if (autoUpdate !== undefined) updates.autoUpdate = autoUpdate;
        if (checkInterval !== undefined) updates.checkInterval = checkInterval;
        if (githubToken !== undefined) updates.githubToken = githubToken;
        
        versionManager.configureAutoUpdate(updates);
        
        logger.info('Configuração de auto-update atualizada:', updates);
        
        res.json({
            success: true,
            message: 'Configuração atualizada com sucesso',
            data: {
                repository: versionManager.config.repository,
                branch: versionManager.config.branch,
                autoUpdate: versionManager.config.autoUpdate,
                checkInterval: versionManager.config.checkInterval
            }
        });
    } catch (error) {
        logger.error('Erro ao atualizar configuração:', error.message);
        res.status(500).json({
            success: false,
            error: 'Erro ao atualizar configuração',
            message: error.message
        });
    }
});

/**
 * POST /api/version/auto-update/enable
 * Habilita auto-update
 */
router.post('/auto-update/enable', (req, res) => {
    try {
        versionManager.configureAutoUpdate({ autoUpdate: true });
        
        logger.info('Auto-update habilitado');
        
        res.json({
            success: true,
            message: 'Auto-update habilitado com sucesso'
        });
    } catch (error) {
        logger.error('Erro ao habilitar auto-update:', error.message);
        res.status(500).json({
            success: false,
            error: 'Erro ao habilitar auto-update',
            message: error.message
        });
    }
});

/**
 * POST /api/version/auto-update/disable
 * Desabilita auto-update
 */
router.post('/auto-update/disable', (req, res) => {
    try {
        versionManager.configureAutoUpdate({ autoUpdate: false });
        versionManager.stopAutoUpdateScheduler();
        
        logger.info('Auto-update desabilitado');
        
        res.json({
            success: true,
            message: 'Auto-update desabilitado com sucesso'
        });
    } catch (error) {
        logger.error('Erro ao desabilitar auto-update:', error.message);
        res.status(500).json({
            success: false,
            error: 'Erro ao desabilitar auto-update',
            message: error.message
        });
    }
});

/**
 * GET /api/version/backups
 * Lista backups disponíveis
 */
router.get('/backups', (req, res) => {
    try {
        const fs = require('fs');
        const path = require('path');
        
        const backupDir = path.join(process.cwd(), 'backups');
        
        if (!fs.existsSync(backupDir)) {
            return res.json({
                success: true,
                data: [],
                message: 'Nenhum backup encontrado'
            });
        }
        
        const backups = fs.readdirSync(backupDir)
            .filter(item => fs.statSync(path.join(backupDir, item)).isDirectory())
            .map(backup => {
                const backupPath = path.join(backupDir, backup);
                const stats = fs.statSync(backupPath);
                
                return {
                    name: backup,
                    path: backupPath,
                    createdAt: stats.birthtime,
                    size: this.getDirectorySize(backupPath)
                };
            })
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        res.json({
            success: true,
            data: backups,
            count: backups.length
        });
    } catch (error) {
        logger.error('Erro ao listar backups:', error.message);
        res.status(500).json({
            success: false,
            error: 'Erro ao listar backups',
            message: error.message
        });
    }
});

/**
 * Função auxiliar para calcular tamanho do diretório
 */
function getDirectorySize(dirPath) {
    const fs = require('fs');
    const path = require('path');
    
    let totalSize = 0;
    
    function calculateSize(currentPath) {
        const stats = fs.statSync(currentPath);
        
        if (stats.isFile()) {
            totalSize += stats.size;
        } else if (stats.isDirectory()) {
            const files = fs.readdirSync(currentPath);
            files.forEach(file => {
                calculateSize(path.join(currentPath, file));
            });
        }
    }
    
    try {
        calculateSize(dirPath);
        return totalSize;
    } catch (error) {
        return 0;
    }
}

module.exports = router;