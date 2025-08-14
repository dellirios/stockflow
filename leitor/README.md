# Serviço Stockflow QR Reader

Serviço Python independente para automação da baixa de produtos via leitor QR Code óptico.

## Características

- **Independente**: Não depende do serviço Node.js principal
- **Resiliente**: Fila de trabalhos com persistência para garantir não perda de dados
- **Otimizado**: Baixo consumo de recursos, ideal para hardware limitado
- **Robusto**: Reconexão automática com banco de dados e dispositivos
- **Auditável**: Sistema de logs estruturado e detalhado

## Arquitetura

### Componentes Principais

1. **Monitor de Entrada**: Captura eventos do leitor QR Code via `evdev`
2. **Fila de Trabalhos**: Armazena produtos para processamento (memória + arquivo)
3. **Processador**: Executa transações atômicas no banco MySQL
4. **Reconector**: Gerencia reconexões automáticas com backoff exponencial
5. **Logger**: Sistema de logs estruturado com rotação automática

### Fluxo de Dados

```
Leitor QR → Monitor → Validação → Fila → Processador → MySQL
                                    ↓
                              Persistência (jobs.json)
```

## Instalação

### Pré-requisitos

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install python3 python3-pip

# Adicionar usuário ao grupo input (para acessar dispositivos)
sudo usermod -a -G input stockflow
```

### Instalação Automática

```bash
cd /home/stockflow/Stockflow/leitor
./install.sh
```

### Instalação Manual

```bash
# 1. Instalar dependências Python
pip3 install -r requirements.txt --user

# 2. Tornar executável
chmod +x leitor.py

# 3. Instalar serviço systemd (como root)
sudo cp stockflow-leitor.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable stockflow-leitor.service
```

## Configuração

### Arquivo de Configuração

O serviço lê a configuração de `/home/stockflow/Stockflow/config/printers.json`:

```json
{
  "store_key": "STOCKFLOW-TESTE-WJYXNI1W1P",
  "store_name": "Loja Principal",
  "qr_code_settings": {
    "enabled": true,
    "validation_required": true,
    "audit_trail": true
  }
}
```

### Banco de Dados

Credenciais hardcoded no código (conforme especificação):
- Host: `193.203.175.227:3306`
- Database: `u462461747_stockflow`
- User: `u462461747_stockflow`

## Uso

### Comandos do Serviço

```bash
# Iniciar serviço
sudo systemctl start stockflow-leitor

# Parar serviço
sudo systemctl stop stockflow-leitor

# Status do serviço
sudo systemctl status stockflow-leitor

# Reiniciar serviço
sudo systemctl restart stockflow-leitor

# Habilitar inicialização automática
sudo systemctl enable stockflow-leitor
```

### Logs

```bash
# Ver logs em tempo real
sudo journalctl -u stockflow-leitor -f

# Ver logs das últimas 24h
sudo journalctl -u stockflow-leitor --since "24 hours ago"

# Ver logs do arquivo local
tail -f /home/stockflow/Stockflow/leitor/leitor.log
```

### Teste Manual

```bash
# Executar em modo debug
cd /home/stockflow/Stockflow/leitor
python3 leitor.py
```

## Funcionamento

### Processo de Baixa

1. **Leitura**: Leitor QR Code emite sequência de caracteres + Enter
2. **Validação**: Verifica formato do product_id
3. **Enfileiramento**: Adiciona à fila de trabalhos
4. **Persistência**: Salva em `jobs.json`
5. **Processamento**: Executa transação atômica:
   - Verifica existência em `tb_produto`
   - Copia para `tb_produto_removido` com `responsavel_retirada = 'Leitor QRCODE'`
   - Remove de `tb_produto`
   - Confirma transação
6. **Limpeza**: Remove da fila e arquivo

### Tratamento de Falhas

- **Rede**: Fila persiste dados até reconexão
- **Banco**: Backoff exponencial para reconexão
- **Dispositivo**: Detecção e reconexão automática
- **Energia**: Fila persistida em arquivo sobrevive a reinicializações

## Arquivos

```
/home/stockflow/Stockflow/leitor/
├── leitor.py                    # Serviço principal
├── requirements.txt             # Dependências Python
├── install.sh                   # Script de instalação
├── stockflow-leitor.service     # Arquivo systemd
├── README.md                    # Esta documentação
├── leitor.log                   # Logs do serviço
└── jobs.json                    # Fila persistida
```

## Monitoramento

### Indicadores de Saúde

- **Logs INFO**: Operações normais
- **Logs WARNING**: Problemas não críticos
- **Logs ERROR**: Falhas que requerem atenção

### Métricas Importantes

- Taxa de processamento de QR Codes
- Tempo de reconexão com banco
- Tamanho da fila de trabalhos
- Erros de validação

## Troubleshooting

### Problemas Comuns

**Serviço não inicia:**
```bash
# Verificar logs
sudo journalctl -u stockflow-leitor --no-pager

# Verificar permissões
ls -la /home/stockflow/Stockflow/config/printers.json
ls -la /dev/input/event*
```

**Leitor não detectado:**
```bash
# Listar dispositivos de entrada
python3 -c "import evdev; [print(f'{d.path}: {d.name}') for d in [evdev.InputDevice(p) for p in evdev.list_devices()]]"

# Verificar grupo input
groups stockflow
```

**Banco não conecta:**
```bash
# Testar conectividade
telnet 193.203.175.227 3306

# Verificar logs de rede
sudo journalctl -u stockflow-leitor | grep -i mysql
```

### Comandos de Diagnóstico

```bash
# Status completo do sistema
sudo systemctl status stockflow-leitor
ps aux | grep leitor
netstat -an | grep 3306

# Verificar recursos
top -p $(pgrep -f leitor.py)
df -h /home/stockflow/Stockflow/leitor/
```

## Desenvolvimento

### Estrutura do Código

- `StockflowQRService`: Classe principal do serviço
- `setup_logging()`: Configuração de logs
- `load_configuration()`: Carregamento de configuração
- `setup_database_pool()`: Pool de conexões MySQL
- `process_job()`: Lógica de processamento
- `monitor_input_events()`: Captura de eventos
- `queue_processor()`: Thread de processamento
- `db_reconnect_worker()`: Thread de reconexão

### Extensões Futuras

- Métricas Prometheus
- Interface web de monitoramento
- Suporte a múltiplos leitores
- Integração com sistemas de alerta
- API REST para status

## Licença

Proprietário - Sistema Stockflow