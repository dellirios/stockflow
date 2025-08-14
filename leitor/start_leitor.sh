#!/bin/bash
# Script wrapper para o serviço Stockflow QR Reader

# Define o diretório de trabalho
cd /home/stockflow/Stockflow/leitor

# Define variáveis de ambiente
export HOME=/home/stockflow
export USER=stockflow
export PYTHONPATH=/home/stockflow/.local/lib/python3.12/site-packages:$PYTHONPATH

# Executa o script Python
exec /usr/bin/python3 /home/stockflow/Stockflow/leitor/leitor.py