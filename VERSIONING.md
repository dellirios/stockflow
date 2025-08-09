# 📋 Sistema de Versionamento StockFlow

Sistema completo de versionamento e auto-atualização sincronizado com GitHub.

## 🚀 Funcionalidades

- **Versionamento Semântico**: Incremento automático de versões (major.minor.patch)
- **Auto-Update**: Sincronização automática com releases do GitHub
- **Backup & Rollback**: Sistema de backup automático antes de atualizações
- **CLI Integrado**: Interface de linha de comando completa
- **API REST**: Endpoints para integração com outras aplicações
- **Configuração Flexível**: Via JSON e variáveis de ambiente

## 🔧 Configuração Inicial

### 1. Configurar Token GitHub

```bash
# Criar arquivo .env (copie do .env.example)
cp .env.example .env

# Editar e adicionar seu token GitHub
# GITHUB_TOKEN=seu_token_aqui
```

### 2. Obter Token GitHub

1. Acesse: https://github.com/settings/tokens
2. Clique em "Generate new token (classic)"
3. Selecione as permissões:
   - `repo` (para repositórios privados)
   - `public_repo` (para repositórios públicos)
4. Copie o token gerado

## 📱 Uso via CLI

### Comandos Básicos

```bash
# Informações de versão
node version-cli.js info

# Verificar atualizações
node version-cli.js check

# Executar atualização
node version-cli.js update

# Incrementar versão
node version-cli.js increment patch   # 2.0.0 → 2.0.1
node version-cli.js increment minor   # 2.0.1 → 2.1.0
node version-cli.js increment major   # 2.1.0 → 3.0.0
```

### Configuração

```bash
# Mostrar configuração
node version-cli.js config show

# Configurar auto-update
node version-cli.js config set autoUpdate true
node version-cli.js config set checkInterval 30  # minutos

# Habilitar/desabilitar auto-update
node version-cli.js enable-auto
node version-cli.js disable-auto
```

### Releases e Backups

```bash
# Listar releases do GitHub
node version-cli.js releases

# Listar backups locais
node version-cli.js backups
```

## 🛠️ Uso via NPM Scripts

```bash
# Comandos rápidos via npm
npm run version:info
npm run version:check
npm run version:update
npm run version:config
npm run version:releases
npm run version:backups
npm run version:enable-auto
npm run version:disable-auto
```

## 🔄 Integração com StockFlow Manager

```bash
# Via stockflow-manager.sh
./stockflow-manager.sh version
./stockflow-manager.sh version-check
./stockflow-manager.sh version-update
./stockflow-manager.sh version-config
./stockflow-manager.sh version-releases
./stockflow-manager.sh version-backups
```

## 🌐 API REST

O sistema expõe endpoints REST em `/api/version`:

```bash
# Informações de versão
curl http://localhost:5000/api/version/info

# Verificar atualizações
curl http://localhost:5000/api/version/check

# Executar atualização
curl -X POST http://localhost:5000/api/version/update

# Incrementar versão
curl -X POST http://localhost:5000/api/version/increment \
  -H "Content-Type: application/json" \
  -d '{"type": "patch"}'

# Configuração
curl http://localhost:5000/api/version/config
curl -X POST http://localhost:5000/api/version/config \
  -H "Content-Type: application/json" \
  -d '{"autoUpdate": true}'
```

## ⚙️ Configuração Avançada

### Arquivo de Configuração

O arquivo `.version-config.json` contém:

```json
{
  "repository": "dellirios/stockflow",
  "branch": "main",
  "autoUpdate": false,
  "checkInterval": 3600000,
  "preserveFiles": [
    "config/",
    "logs/",
    ".env",
    ".version-config.json"
  ],
  "backupRetention": 5
}
```

### Variáveis de Ambiente

```bash
# Token GitHub (obrigatório para funcionalidades GitHub)
GITHUB_TOKEN=seu_token_aqui

# Configurações opcionais
PORT=5000
NODE_ENV=production
LOG_LEVEL=info
```

## 🔒 Segurança

- **Tokens**: Nunca commite tokens no código
- **Variáveis de Ambiente**: Use `.env` para configurações sensíveis
- **Backup**: Backups automáticos antes de cada atualização
- **Rollback**: Possibilidade de reverter atualizações

## 🚨 Troubleshooting

### Erro: "Não foi possível verificar atualizações"

1. Verifique se o `GITHUB_TOKEN` está configurado
2. Confirme se o token tem as permissões corretas
3. Verifique se há releases no repositório GitHub

### Erro: "logger.error is not a function"

- Problema de dependência circular resolvido na v2.0.1
- Use a versão mais recente

### Auto-update não funciona

1. Verifique se está habilitado: `node version-cli.js config show`
2. Habilite: `node version-cli.js enable-auto`
3. Verifique logs: `tail -f logs/stockflow.log`

## 📚 Exemplos de Uso

### Workflow de Release

```bash
# 1. Desenvolver funcionalidades
# 2. Incrementar versão
node version-cli.js increment minor

# 3. Commit e push
git add .
git commit -m "feat: nova funcionalidade"
git push origin main

# 4. Criar tag
git tag -a v2.1.0 -m "Release v2.1.0"
git push origin v2.1.0

# 5. Criar release no GitHub (manual ou via GitHub CLI)
gh release create v2.1.0 --title "v2.1.0" --notes "Descrição da release"
```

### Auto-Update em Produção

```bash
# Configurar auto-update
node version-cli.js enable-auto
node version-cli.js config set checkInterval 60  # verificar a cada hora

# Verificar status
node version-cli.js info
```

## 🎯 Próximos Passos

- Criar releases no GitHub para testar atualizações
- Configurar webhooks para notificações
- Implementar rollback automático em caso de falha
- Adicionar métricas de atualização

---

**Versão**: 2.0.1  
**Última Atualização**: Janeiro 2025  
**Documentação**: [GitHub](https://github.com/dellirios/stockflow)