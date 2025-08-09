#!/bin/bash
# StockFlow Manager - Script Consolidado
# © 2025 StockFlow Team
# Gerencia instalação, produção, auto-update e sistema

set -e

# Configurações globais
PROJECT_DIR="/home/stockflow/Stockflow"
CONFIG_FILE="$PROJECT_DIR/.auto-update-config"
LOG_FILE="$PROJECT_DIR/logs/auto-update.log"
SERVICE_FILE="stockflow.service"
SYSTEMD_PATH="/etc/systemd/system/stockflow.service"
WRAPPER_SCRIPT="/usr/local/bin/stockflow-auto-update"

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Função para imprimir com cor
print_color() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

# Função para verificar se comando existe
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Função para verificar se está rodando como root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        print_color $RED "❌ Este comando requer privilégios de root"
        echo "   Execute: sudo $0 $1"
        exit 1
    fi
}

# Função para verificar se está rodando como stockflow
check_stockflow() {
    if [ "$(whoami)" != "stockflow" ]; then
        print_color $RED "❌ Este comando deve ser executado como usuário stockflow"
        echo "   Execute: sudo -u stockflow $0 $1"
        exit 1
    fi
}

# ==================== HELP ====================
show_help() {
    echo "🔧 StockFlow Manager - Script Consolidado"
    echo "========================================="
    echo ""
    echo "Uso: $0 [comando] [opções]"
    echo ""
    echo "📦 INSTALAÇÃO E PRODUÇÃO:"
    echo "  install-prod     - Instala StockFlow para produção"
    echo "  uninstall        - Remove StockFlow do sistema"
    echo "  setup-system     - Otimiza sistema para StockFlow"
    echo ""
    echo "🔄 AUTO-UPDATE:"
    echo "  setup-update     - Configura auto-update"
    echo "  update           - Executa atualização manual"
    echo "  update-status    - Status do auto-update"
    echo "  update-enable    - Habilita auto-update"
    echo "  update-disable   - Desabilita auto-update"
    echo "  update-config    - Mostra configuração"
    echo "  update-test      - Testa conectividade"
    echo "  update-logs      - Mostra logs"
    echo ""
    echo "📋 VERSIONAMENTO:"
    echo "  version          - Informações de versão"
    echo "  version-check    - Verifica atualizações"
    echo "  version-update   - Atualiza para nova versão"
    echo "  version-config   - Configuração de versionamento"
    echo "  version-releases - Lista releases disponíveis"
    echo "  version-backups  - Lista backups disponíveis"
    echo ""
    echo "🔍 DIAGNÓSTICO:"
    echo "  status           - Status geral do sistema"
    echo "  demo             - Demonstração e verificação"
    echo "  logs             - Logs do serviço"
    echo "  health           - Verificação de saúde"
    echo ""
    echo "🛠️  SERVIÇO:"
    echo "  start            - Inicia serviço"
    echo "  stop             - Para serviço"
    echo "  restart          - Reinicia serviço"
    echo "  service-status   - Status do serviço"
    echo ""
    echo "📚 AJUDA:"
    echo "  help             - Mostra esta ajuda"
    echo ""
}

# ==================== INSTALAÇÃO ====================
install_production() {
    print_color $BLUE "🚀 Configurando StockFlow para Produção"
    echo "==========================================="
    
    # Verificar se não está rodando como root
    if [[ $EUID -eq 0 ]]; then
        print_color $RED "❌ Este comando não deve ser executado como root"
        echo "   Execute como usuário stockflow: $0 install-prod"
        exit 1
    fi
    
    # Verificar se o usuário stockflow existe
    if ! id "stockflow" &>/dev/null; then
        print_color $RED "❌ Usuário 'stockflow' não encontrado"
        echo "   Crie o usuário primeiro: sudo useradd -m -s /bin/bash stockflow"
        exit 1
    fi
    
    print_color $BLUE "📁 Verificando diretório do projeto..."
    if [ ! -d "$PROJECT_DIR" ]; then
        print_color $RED "❌ Diretório $PROJECT_DIR não encontrado"
        exit 1
    fi
    
    print_color $BLUE "🔍 Verificando arquivos necessários..."
    if [ ! -f "$PROJECT_DIR/src/app.js" ]; then
        print_color $RED "❌ Arquivo principal app.js não encontrado"
        exit 1
    fi
    
    if [ ! -f "$PROJECT_DIR/$SERVICE_FILE" ]; then
        print_color $YELLOW "⚠️  Arquivo de serviço $SERVICE_FILE não encontrado"
        if [ -f "$PROJECT_DIR/stockflow-simple.service" ]; then
            print_color $BLUE "📋 Usando arquivo de serviço simplificado"
            SERVICE_FILE="stockflow-simple.service"
        else
            print_color $RED "❌ Nenhum arquivo de serviço encontrado!"
            exit 1
        fi
    fi
    
    cd "$PROJECT_DIR"
    
    print_color $BLUE "📦 Instalando dependências..."
    npm install --production
    
    print_color $BLUE "🔐 Configurando permissões..."
    chmod +x src/app.js
    chmod 755 "$PROJECT_DIR"
    
    print_color $BLUE "📁 Criando diretório de logs..."
    mkdir -p logs
    chmod 755 logs
    
    print_color $BLUE "⚙️  Configurando serviço systemd..."
    sudo cp "$SERVICE_FILE" "$SYSTEMD_PATH"
    sudo systemctl daemon-reload
    sudo systemctl enable stockflow.service
    
    print_color $BLUE "🚀 Iniciando serviço..."
    sudo systemctl start stockflow.service
    
    sleep 3
    
    print_color $BLUE "🔍 Verificando status..."
    if sudo systemctl is-active --quiet stockflow.service; then
        print_color $GREEN "✅ Serviço iniciado com sucesso!"
    else
        print_color $YELLOW "⚠️  Serviço pode ter problemas. Tentando fallback..."
        
        if [ -f "$PROJECT_DIR/stockflow-simple.service" ]; then
            print_color $BLUE "🔄 Tentando configuração simplificada..."
            sudo cp "$PROJECT_DIR/stockflow-simple.service" "$SYSTEMD_PATH"
            sudo systemctl daemon-reload
            sudo systemctl restart stockflow.service
            sleep 3
            
            if sudo systemctl is-active --quiet stockflow.service; then
                print_color $GREEN "✅ Serviço iniciado com configuração simplificada!"
            else
                print_color $RED "❌ Falha ao iniciar serviço"
                print_color $YELLOW "📋 Verifique os logs: sudo journalctl -u stockflow -f"
                exit 1
            fi
        fi
    fi
    
    print_color $BLUE "🌐 Testando conectividade..."
    sleep 2
    if curl -s http://localhost:5000 >/dev/null 2>&1; then
        print_color $GREEN "✅ API respondendo na porta 5000"
    else
        print_color $YELLOW "⚠️  API pode não estar respondendo ainda"
    fi
    
    print_color $GREEN "🎉 Instalação concluída!"
    echo ""
    print_color $BLUE "📋 Próximos passos:"
    echo "1. Configure as impressoras em config/printers.json"
    echo "2. Configure auto-update: sudo $0 setup-update"
    echo "3. Monitore logs: $0 logs"
    echo ""
    print_color $BLUE "🔧 Comandos úteis:"
    echo "• Status: $0 status"
    echo "• Logs: sudo journalctl -u stockflow -f"
    echo "• Reiniciar: sudo $0 restart"
}

# ==================== AUTO-UPDATE ====================
setup_auto_update() {
    check_root
    
    print_color $BLUE "⚙️  Configuração do Auto-Update StockFlow"
    echo "========================================="
    
    AUTO_UPDATE_SCRIPT="$PROJECT_DIR/auto-update.sh"
    
    print_color $BLUE "📋 Configurando auto-update..."
    
    # Solicitar URL do repositório
    echo ""
    print_color $BLUE "🔗 Configuração do Repositório:"
    read -p "Digite a URL do repositório Git: " REPO_URL
    read -p "Digite o branch (padrão: main): " BRANCH
    BRANCH=${BRANCH:-main}
    
    # Solicitar frequência
    echo ""
    print_color $BLUE "⏰ Frequência de Atualização:"
    echo "1) Diária (02:00)"
    echo "2) Semanal (Domingo 02:00)"
    echo "3) Mensal (Dia 1 às 02:00)"
    echo "4) Personalizada"
    read -p "Escolha uma opção (1-4): " FREQ_OPTION
    
    case $FREQ_OPTION in
        1)
            CRON_SCHEDULE="0 2 * * *"
            FREQ_DESC="Diária às 02:00"
            ;;
        2)
            CRON_SCHEDULE="0 2 * * 0"
            FREQ_DESC="Semanal (Domingo às 02:00)"
            ;;
        3)
            CRON_SCHEDULE="0 2 1 * *"
            FREQ_DESC="Mensal (Dia 1 às 02:00)"
            ;;
        4)
            read -p "Digite o cron schedule (ex: 0 3 * * *): " CRON_SCHEDULE
            FREQ_DESC="Personalizada: $CRON_SCHEDULE"
            ;;
        *)
            print_color $RED "❌ Opção inválida"
            exit 1
            ;;
    esac
    
    # Email para notificações
    echo ""
    read -p "Email para notificações (opcional): " NOTIFICATION_EMAIL
    
    # Salvar configuração
    cat > "$CONFIG_FILE" << EOF
# Configuração do Auto-Update StockFlow
REPO_URL="$REPO_URL"
BRANCH="$BRANCH"
CRON_SCHEDULE="$CRON_SCHEDULE"
FREQ_DESC="$FREQ_DESC"
NOTIFICATION_EMAIL="$NOTIFICATION_EMAIL"
CONFIG_DATE="$(date)"
EOF
    
    chown stockflow:stockflow "$CONFIG_FILE"
    
    # Criar wrapper script
    cat > "$WRAPPER_SCRIPT" << EOF
#!/bin/bash
cd "$PROJECT_DIR"
sudo -u stockflow ./auto-update.sh >> "$LOG_FILE" 2>&1
EOF
    
    chmod +x "$WRAPPER_SCRIPT"
    
    # Configurar cron
    (crontab -l 2>/dev/null | grep -v "stockflow.*auto-update"; echo "$CRON_SCHEDULE $WRAPPER_SCRIPT") | crontab -
    
    print_color $GREEN "✅ Auto-update configurado com sucesso!"
    echo ""
    print_color $BLUE "📋 Configuração:"
    echo "• Repositório: $REPO_URL"
    echo "• Branch: $BRANCH"
    echo "• Frequência: $FREQ_DESC"
    if [ -n "$NOTIFICATION_EMAIL" ]; then
        echo "• Email: $NOTIFICATION_EMAIL"
    fi
    echo ""
    print_color $BLUE "🔧 Comandos úteis:"
    echo "• Status: $0 update-status"
    echo "• Teste: $0 update-test"
    echo "• Logs: $0 update-logs"
}

run_auto_update() {
    check_stockflow
    
    print_color $BLUE "🔄 StockFlow Auto-Update"
    echo "========================"
    
    BACKUP_DIR="/tmp/stockflow-backup-$(date +%Y%m%d-%H%M%S)"
    
    # Arquivos preservados
    PRESERVE_FILES=(
        "config/printers.json"
        "logs/"
        ".env"
        ".auto-update-config"
    )
    
    if [ ! -f "$CONFIG_FILE" ]; then
        print_color $RED "❌ Auto-update não configurado"
        echo "   Execute: sudo $0 setup-update"
        exit 1
    fi
    
    source "$CONFIG_FILE"
    
    print_color $BLUE "💾 Criando backup..."
    mkdir -p "$BACKUP_DIR"
    
    for item in "${PRESERVE_FILES[@]}"; do
        if [ -e "$item" ]; then
            cp -r "$item" "$BACKUP_DIR/"
            print_color $GREEN "✅ Backup: $item"
        fi
    done
    
    print_color $BLUE "⏹️  Parando serviço..."
    sudo systemctl stop stockflow.service || true
    
    print_color $BLUE "📥 Baixando atualizações..."
    git fetch origin
    git reset --hard "origin/$BRANCH"
    
    print_color $BLUE "📦 Instalando dependências..."
    npm install --production
    
    print_color $BLUE "🔄 Restaurando configurações..."
    for item in "${PRESERVE_FILES[@]}"; do
        if [ -e "$BACKUP_DIR/$item" ]; then
            cp -r "$BACKUP_DIR/$item" "./"
            print_color $GREEN "✅ Restaurado: $item"
        fi
    done
    
    print_color $BLUE "🚀 Reiniciando serviço..."
    sudo systemctl start stockflow.service
    
    sleep 3
    
    if sudo systemctl is-active --quiet stockflow.service; then
        print_color $GREEN "✅ Atualização concluída com sucesso!"
        echo "LAST_UPDATE=$(date)" >> "$CONFIG_FILE"
    else
        print_color $RED "❌ Falha na atualização. Restaurando backup..."
        sudo systemctl stop stockflow.service || true
        
        for item in "${PRESERVE_FILES[@]}"; do
            if [ -e "$BACKUP_DIR/$item" ]; then
                cp -r "$BACKUP_DIR/$item" "./"
            fi
        done
        
        sudo systemctl start stockflow.service
        exit 1
    fi
    
    print_color $BLUE "🧹 Limpando arquivos temporários..."
    rm -rf "$BACKUP_DIR"
    
    print_color $GREEN "🎉 Auto-update concluído!"
}

# ==================== STATUS E DIAGNÓSTICO ====================
show_status() {
    print_color $BLUE "📊 Status Geral do StockFlow"
    echo "============================"
    
    # Status do serviço
    print_color $BLUE "🔍 Serviço:"
    if sudo systemctl is-active --quiet stockflow.service 2>/dev/null; then
        print_color $GREEN "✅ StockFlow está ativo"
    else
        print_color $RED "❌ StockFlow não está ativo"
    fi
    
    # Status do auto-update
    echo ""
    print_color $BLUE "🔄 Auto-Update:"
    if [ -f "$CONFIG_FILE" ]; then
        source "$CONFIG_FILE"
        print_color $GREEN "✅ Configurado"
        echo "📍 Repositório: $REPO_URL"
        echo "🌿 Branch: $BRANCH"
        if [ -n "$LAST_UPDATE" ]; then
            echo "🕐 Última atualização: $LAST_UPDATE"
        else
            echo "🕐 Última atualização: Nunca executado"
        fi
    else
        print_color $YELLOW "⚠️  Não configurado"
    fi
    
    # Cron
    echo ""
    print_color $BLUE "⏰ Tarefas Agendadas:"
    if crontab -l 2>/dev/null | grep -q "stockflow.*auto-update"; then
        print_color $GREEN "✅ Cron configurado"
        crontab -l 2>/dev/null | grep "stockflow" || true
    else
        print_color $YELLOW "⚠️  Nenhuma tarefa agendada"
    fi
    
    # Conectividade
    echo ""
    print_color $BLUE "🌐 Conectividade:"
    if curl -s http://localhost:5000 >/dev/null 2>&1; then
        print_color $GREEN "✅ API respondendo na porta 5000"
    else
        print_color $RED "❌ API não está respondendo"
    fi
}

# ==================== SISTEMA ====================
setup_system() {
    check_root
    
    print_color $BLUE "🚀 Otimizando sistema para StockFlow..."
    
    print_color $BLUE "📝 Configurando swappiness..."
    echo 'vm.swappiness=10' >> /etc/sysctl.conf
    echo 'vm.vfs_cache_pressure=50' >> /etc/sysctl.conf
    sysctl -p
    
    print_color $BLUE "🖨️  Otimizando CUPS..."
    cp /etc/cups/cupsd.conf /etc/cups/cupsd.conf.backup
    
    # Configuração CUPS otimizada
    cat > /etc/cups/cupsd.conf << 'EOF'
# CUPS Configuration - StockFlow Optimized
LogLevel warn
MaxLogSize 1m
PreserveJobHistory Off
PreserveJobFiles Off
MaxJobs 100
Timeout 300
Listen localhost:631
DefaultAuthType Basic
<Location />
Order allow,deny
Allow localhost
</Location>
EOF
    
    systemctl restart cups
    
    print_color $GREEN "✅ Sistema otimizado!"
}

# ==================== MAIN ====================
case "$1" in
    "install-prod")
        install_production
        ;;
    "setup-update")
        setup_auto_update
        ;;
    "update")
        run_auto_update
        ;;
    "update-status")
        if [ -f "$CONFIG_FILE" ]; then
            source "$CONFIG_FILE"
            print_color $GREEN "✅ Auto-update configurado"
            echo "📍 Repositório: $REPO_URL"
            echo "🌿 Branch: $BRANCH"
        else
            print_color $YELLOW "⚠️  Auto-update não configurado"
        fi
        ;;
    "update-logs")
        if [ -f "$LOG_FILE" ]; then
            tail -50 "$LOG_FILE"
        else
            print_color $YELLOW "⚠️  Nenhum log encontrado"
        fi
        ;;
    "status")
        show_status
        ;;
    "start")
        sudo systemctl start stockflow.service
        print_color $GREEN "✅ Serviço iniciado"
        ;;
    "stop")
        sudo systemctl stop stockflow.service
        print_color $GREEN "✅ Serviço parado"
        ;;
    "restart")
        sudo systemctl restart stockflow.service
        print_color $GREEN "✅ Serviço reiniciado"
        ;;
    "logs")
        sudo journalctl -u stockflow -f
        ;;
    "setup-system")
        setup_system
        ;;
    "version")
        cd "$PROJECT_DIR" && node version-cli.js info
        ;;
    "version-check")
        cd "$PROJECT_DIR" && node version-cli.js check
        ;;
    "version-update")
        cd "$PROJECT_DIR" && node version-cli.js update
        ;;
    "version-config")
        cd "$PROJECT_DIR" && node version-cli.js config show
        ;;
    "version-releases")
        cd "$PROJECT_DIR" && node version-cli.js releases
        ;;
    "version-backups")
        cd "$PROJECT_DIR" && node version-cli.js backups
        ;;
    "help"|"")
        show_help
        ;;
    *)
        print_color $RED "❌ Comando inválido: $1"
        echo ""
        show_help
        exit 1
        ;;
esac