#!/bin/bash
# Script de instalação do Serviço Stockflow QR Reader
# Autor: Sistema Stockflow
# Descrição: Instala e configura o serviço de leitura QR Code

set -e

echo "=== Instalação do Serviço Stockflow QR Reader ==="

# Verifica se está executando como root para algumas operações
if [[ $EUID -eq 0 ]]; then
    echo "AVISO: Executando como root. Algumas operações serão realizadas com privilégios elevados."
fi

# Diretório base
BASE_DIR="/home/stockflow/Stockflow/leitor"
SERVICE_FILE="stockflow-leitor.service"
SYSTEMD_DIR="/etc/systemd/system"

echo "1. Verificando dependências do sistema..."

# Verifica se o Python 3 está instalado
if ! command -v python3 &> /dev/null; then
    echo "ERRO: Python 3 não está instalado. Instale com:"
    echo "sudo apt update && sudo apt install python3 python3-pip"
    exit 1
fi

# Verifica se o pip está instalado
if ! command -v pip3 &> /dev/null; then
    echo "ERRO: pip3 não está instalado. Instale com:"
    echo "sudo apt install python3-pip"
    exit 1
fi

echo "2. Verificando dependências Python..."
# Dependências já instaladas via apt:
# - python3-mysql.connector
# - python3-evdev
echo "✓ Dependências Python já instaladas via apt"

echo "3. Configurando permissões..."
# Torna o script principal executável
chmod +x leitor.py

# Verifica permissões dos arquivos de configuração
if [ ! -r "/home/stockflow/Stockflow/config/printers.json" ]; then
    echo "AVISO: Arquivo de configuração não encontrado ou sem permissão de leitura:"
    echo "/home/stockflow/Stockflow/config/printers.json"
fi

echo "4. Configurando serviço systemd..."
if [[ $EUID -eq 0 ]]; then
    # Copia arquivo de serviço para systemd
    cp "$SERVICE_FILE" "$SYSTEMD_DIR/"
    
    # Recarrega systemd
    systemctl daemon-reload
    
    # Habilita o serviço para iniciar automaticamente
    systemctl enable stockflow-leitor.service
    
    echo "Serviço instalado e habilitado com sucesso!"
    echo ""
    echo "Comandos úteis:"
    echo "  Iniciar serviço:    sudo systemctl start stockflow-leitor"
    echo "  Parar serviço:      sudo systemctl stop stockflow-leitor"
    echo "  Status do serviço:  sudo systemctl status stockflow-leitor"
    echo "  Ver logs:           sudo journalctl -u stockflow-leitor -f"
    echo "  Reiniciar serviço:  sudo systemctl restart stockflow-leitor"
else
    echo "AVISO: Para instalar o serviço systemd, execute este script como root:"
    echo "sudo $0"
    echo ""
    echo "Ou copie manualmente o arquivo de serviço:"
    echo "sudo cp $SERVICE_FILE $SYSTEMD_DIR/"
    echo "sudo systemctl daemon-reload"
    echo "sudo systemctl enable stockflow-leitor.service"
fi

echo ""
echo "5. Verificando configuração..."

# Verifica se o arquivo de configuração existe
if [ -f "/home/stockflow/Stockflow/config/printers.json" ]; then
    echo "✓ Arquivo de configuração encontrado"
else
    echo "✗ Arquivo de configuração não encontrado: /home/stockflow/Stockflow/config/printers.json"
fi

# Verifica dependências Python
echo "Verificando dependências Python..."
python3 -c "import mysql.connector; print('✓ mysql-connector-python instalado')" 2>/dev/null || echo "✗ mysql-connector-python não instalado"
python3 -c "import evdev; print('✓ evdev instalado')" 2>/dev/null || echo "✗ evdev não instalado"

echo ""
echo "=== Instalação concluída ==="
echo ""
echo "Para testar o serviço manualmente:"
echo "cd $BASE_DIR && python3 leitor.py"
echo ""
echo "Para verificar dispositivos de entrada disponíveis:"
echo "python3 -c \"import evdev; [print(f'{d.path}: {d.name}') for d in [evdev.InputDevice(p) for p in evdev.list_devices()]]\""
echo ""
echo "IMPORTANTE:"
echo "- Certifique-se de que o usuário 'stockflow' tem permissão para acessar /dev/input/event*"
echo "- Adicione o usuário ao grupo 'input' se necessário: sudo usermod -a -G input stockflow"
echo "- Verifique se o leitor QR Code está conectado e funcionando"
echo "- Teste a conectividade com o banco de dados MySQL"