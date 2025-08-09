# 📦 StockFlow - Sistema Completo de Gestão

> Sistema de gestão de estoque com impressão de etiquetas, auto-atualização e otimização para produção.

## 🚀 Visão Geral

O StockFlow é um sistema Node.js robusto para gestão de estoque com funcionalidades avançadas de impressão, auto-atualização automática e otimização para ambiente de produção.

### ✨ Características Principais

- 🖨️ **Impressão de Etiquetas** - Suporte a impressoras térmicas e laser
- 🔄 **Auto-Update** - Atualização automática preservando configurações locais
- 🏭 **Produção Ready** - Configuração otimizada para ambiente produtivo
- 🛡️ **Segurança** - Configurações de segurança e permissões adequadas
- 📊 **Monitoramento** - Logs detalhados e diagnósticos
- 🔧 **Gerenciamento Unificado** - Script consolidado para todas as operações

## 📋 Requisitos do Sistema

### Software Necessário
- **Node.js** 16+ 
- **npm** 8+
- **Git** (para auto-update)
- **CUPS** (para impressão)
- **systemd** (para serviço)

### Sistema Operacional
- Ubuntu 20.04+ / Debian 11+
- CentOS 8+ / RHEL 8+
- Outras distribuições Linux compatíveis

## 🛠️ Instalação

### 1. Preparação do Sistema

```bash
# Atualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar dependências
sudo apt install -y nodejs npm git cups curl

# Criar usuário stockflow
sudo useradd -m -s /bin/bash stockflow
sudo usermod -aG lpadmin stockflow
```

### 2. Download e Configuração

```bash
# Clonar repositório
git clone https://github.com/seu-usuario/stockflow.git
cd stockflow

# Alterar proprietário
sudo chown -R stockflow:stockflow /home/stockflow/Stockflow

# Mudar para usuário stockflow
sudo -u stockflow bash
```

### 3. Instalação para Produção

```bash
# Executar instalação automatizada
./stockflow-manager.sh install-prod

# Otimizar sistema (como root)
sudo ./stockflow-manager.sh setup-system
```

## 🔧 Gerenciamento do Sistema

### Script Principal

Todas as operações são realizadas através do script consolidado:

```bash
./stockflow-manager.sh [comando]
# ou usar o atalho:
./stockflow [comando]
```

### 📦 Comandos de Instalação

```bash
./stockflow install-prod     # Instala para produção
./stockflow setup-system     # Otimiza sistema (requer root)
./stockflow uninstall        # Remove do sistema
```

### 🔄 Comandos de Auto-Update

```bash
./stockflow setup-update     # Configura auto-update (requer root)
./stockflow update           # Executa atualização manual
./stockflow update-status    # Status do auto-update
./stockflow update-logs      # Logs das atualizações
./stockflow update-test      # Testa conectividade com repositório
```

### 🔍 Comandos de Diagnóstico

```bash
./stockflow status           # Status geral do sistema
./stockflow logs             # Logs do serviço em tempo real
./stockflow health           # Verificação de saúde
```

### 🛠️ Controle de Serviço

```bash
./stockflow start            # Inicia serviço
./stockflow stop             # Para serviço
./stockflow restart          # Reinicia serviço
./stockflow service-status   # Status detalhado do serviço
```

## 🔄 Sistema de Auto-Update

### Configuração Inicial

```bash
# Configurar auto-update (como root)
sudo ./stockflow setup-update
```

O sistema solicitará:
- 🔗 **URL do repositório Git**
- 🌿 **Branch** (padrão: main)
- ⏰ **Frequência** (diária, semanal, mensal ou personalizada)
- 📧 **Email** para notificações (opcional)

### Arquivos Preservados

O auto-update **NUNCA** sobrescreve:
- `config/printers.json` - Configurações de impressoras locais
- `logs/` - Logs históricos
- `.env` - Variáveis de ambiente
- `.auto-update-config` - Configurações do auto-update

### Processo de Atualização

1. **Backup** - Configurações locais
2. **Parada** - Serviço StockFlow
3. **Download** - Atualizações do repositório
4. **Instalação** - Dependências npm
5. **Restauração** - Configurações locais
6. **Reinício** - Serviço
7. **Verificação** - Funcionamento
8. **Rollback** - Automático em caso de falha

## 🖨️ Configuração de Impressoras

### Arquivo de Configuração

Edite `config/printers.json` com suas impressoras:

```json
{
  "printers": {
    "etiquetas": {
      "name": "Impressora de Etiquetas",
      "type": "thermal",
      "connection": {
        "type": "usb",
        "device": "/dev/usb/lp0"
      },
      "settings": {
        "width": 58,
        "height": 40,
        "dpi": 203
      },
      "enabled": true
    }
  }
}
```

### Tipos de Conexão Suportados

- **USB**: `/dev/usb/lp0`
- **Rede**: IP + Porta
- **CUPS**: Nome da impressora

## 🏭 Ambiente de Produção

### Otimizações Aplicadas

#### Sistema
- ✅ **Swappiness** otimizada (10)
- ✅ **Cache pressure** ajustada (50)
- ✅ **Dirty ratio** configurada (15/5)

#### CUPS
- ✅ **Logs** limitados (1MB)
- ✅ **Jobs** otimizados (100 max)
- ✅ **Timeouts** ajustados (300s)
- ✅ **Segurança** localhost only

#### Serviço
- ✅ **Systemd** configurado
- ✅ **Auto-restart** habilitado
- ✅ **Logs** estruturados
- ✅ **Permissões** adequadas

### Monitoramento

```bash
# Status geral
./stockflow status

# Logs em tempo real
./stockflow logs

# Verificação de saúde
./stockflow health

# Logs do sistema
sudo journalctl -u stockflow -f
```

## 🔒 Segurança

### Usuário Dedicado
- Serviço executa como usuário `stockflow`
- Permissões mínimas necessárias
- Isolamento do sistema

### Configurações de Rede
- API disponível apenas em localhost:5000
- CUPS restrito ao localhost
- Firewall configurável

### Backup e Recuperação
- Backup automático antes de atualizações
- Rollback automático em falhas
- Configurações locais preservadas

## 📊 API Endpoints

### Impressão de Etiquetas

```bash
# Imprimir etiqueta
POST http://localhost:5000/api/etiquetas/imprimir
Content-Type: application/json

{
  "codigo": "123456",
  "descricao": "Produto Teste",
  "preco": "29.90",
  "impressora": "etiquetas"
}
```

### Health Check

```bash
# Verificar saúde da API
GET http://localhost:5000/health
```

## 🚨 Troubleshooting

### Problemas Comuns

#### Serviço não inicia
```bash
# Verificar logs
sudo journalctl -u stockflow -n 50

# Verificar permissões
ls -la /home/stockflow/Stockflow/

# Testar manualmente
cd /home/stockflow/Stockflow
node src/app.js
```

#### Auto-update falha
```bash
# Verificar configuração
./stockflow update-status

# Testar conectividade
./stockflow update-test

# Ver logs
./stockflow update-logs
```

#### Impressora não funciona
```bash
# Verificar CUPS
lpstat -p

# Testar impressão
echo "Teste" | lp -d nome_impressora

# Verificar configuração
cat config/printers.json
```

### Comandos de Diagnóstico

```bash
# Status completo
./stockflow status

# Verificar dependências
node --version
npm --version
git --version

# Verificar portas
sudo netstat -tlnp | grep :5000

# Verificar processos
ps aux | grep stockflow
```

## 📁 Estrutura do Projeto

```
Stockflow/
├── src/                     # Código fonte
│   ├── app.js              # Aplicação principal
│   ├── api/                # Endpoints da API
│   ├── services/           # Serviços (impressão, etc)
│   ├── templates/          # Templates ZPL
│   └── utils/              # Utilitários
├── config/                 # Configurações
│   ├── printers.json       # Configuração de impressoras
│   └── printers.json.example
├── logs/                   # Logs da aplicação
├── tests/                  # Testes automatizados
├── stockflow-manager.sh    # Script principal de gerenciamento
├── stockflow.service       # Arquivo de serviço systemd
├── package.json           # Dependências npm
└── README-COMPLETO.md     # Esta documentação
```

## 🔄 Desenvolvimento

### Ambiente de Desenvolvimento

```bash
# Instalar dependências
npm install

# Executar em modo desenvolvimento
npm run dev

# Executar testes
npm test

# Executar testes de integração
npm run test:integration
```

### Contribuição

1. Fork o repositório
2. Crie uma branch para sua feature
3. Commit suas mudanças
4. Push para a branch
5. Abra um Pull Request

### Padrões de Código

- **ESLint** para linting
- **Prettier** para formatação
- **Jest** para testes
- **Conventional Commits** para mensagens

## 📞 Suporte

### Logs Importantes

```bash
# Logs da aplicação
tail -f logs/app.log

# Logs do auto-update
tail -f logs/auto-update.log

# Logs do sistema
sudo journalctl -u stockflow -f

# Logs do CUPS
sudo tail -f /var/log/cups/error_log
```

### Informações do Sistema

```bash
# Versão do StockFlow
./stockflow status

# Informações do sistema
uname -a
cat /etc/os-release

# Recursos do sistema
free -h
df -h
```

## 📋 Checklist de Produção

### Antes do Deploy

- [ ] Sistema atualizado
- [ ] Usuário `stockflow` criado
- [ ] Dependências instaladas
- [ ] Configurações de rede verificadas
- [ ] Impressoras configuradas

### Após o Deploy

- [ ] Serviço ativo e funcionando
- [ ] API respondendo (http://localhost:5000)
- [ ] Auto-update configurado
- [ ] Impressão testada
- [ ] Logs sendo gerados
- [ ] Monitoramento configurado

### Manutenção Regular

- [ ] Verificar logs semanalmente
- [ ] Testar impressão mensalmente
- [ ] Verificar atualizações
- [ ] Backup de configurações
- [ ] Monitorar recursos do sistema

## 🎯 Roadmap

### Próximas Funcionalidades

- 📱 **Interface Web** - Dashboard de gerenciamento
- 📊 **Relatórios** - Estatísticas de impressão
- 🔔 **Notificações** - Alertas via Slack/Teams
- 🌐 **Multi-loja** - Gerenciamento centralizado
- 📦 **Docker** - Containerização
- ☁️ **Cloud** - Deploy em nuvem

### Melhorias Planejadas

- ⚡ **Performance** - Otimizações de velocidade
- 🔒 **Segurança** - Autenticação e autorização
- 📱 **Mobile** - App para dispositivos móveis
- 🤖 **Automação** - Integração com ERPs

---

## 📄 Licença

Este projeto está licenciado sob a MIT License - veja o arquivo [LICENSE](LICENSE) para detalhes.

## 👥 Equipe

**StockFlow Team** - *Desenvolvimento e Manutenção*

- 📧 Email: team@stockflow.com
- 🌐 Website: https://stockflow.com
- 📱 Suporte: +55 (11) 99999-9999

---

**© 2025 StockFlow Team - Todos os direitos reservados**

> 🚀 **StockFlow** - Simplificando a gestão de estoque com tecnologia moderna!