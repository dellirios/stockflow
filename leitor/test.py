#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script de teste para o Serviço Stockflow QR Reader
Verifica conectividade, configuração e dependências
"""

import sys
import os
import json

def test_dependencies():
    """Testa se todas as dependências estão instaladas"""
    print("=== Testando Dependências ===")
    
    try:
        import mysql.connector
        print("✓ mysql-connector-python: OK")
    except ImportError:
        print("✗ mysql-connector-python: FALTANDO")
        print("  Instale com: pip3 install mysql-connector-python")
        return False
    
    try:
        import evdev
        print("✓ evdev: OK")
    except ImportError:
        print("✗ evdev: FALTANDO")
        print("  Instale com: pip3 install evdev")
        return False
    
    return True

def test_configuration():
    """Testa se o arquivo de configuração existe e é válido"""
    print("\n=== Testando Configuração ===")
    
    config_file = '/home/stockflow/Stockflow/config/printers.json'
    
    if not os.path.exists(config_file):
        print(f"✗ Arquivo de configuração não encontrado: {config_file}")
        return False
    
    if not os.access(config_file, os.R_OK):
        print(f"✗ Sem permissão de leitura: {config_file}")
        return False
    
    try:
        with open(config_file, 'r', encoding='utf-8') as f:
            config = json.load(f)
        
        if 'store_key' not in config:
            print("✗ store_key não encontrado na configuração")
            return False
        
        print(f"✓ Configuração OK - Store Key: {config['store_key']}")
        return True
        
    except json.JSONDecodeError as e:
        print(f"✗ Erro ao decodificar JSON: {e}")
        return False
    except Exception as e:
        print(f"✗ Erro ao ler configuração: {e}")
        return False

def test_database_connection():
    """Testa conectividade com o banco de dados"""
    print("\n=== Testando Conexão com Banco ===")
    
    try:
        import mysql.connector
        
        db_config = {
            "host": "193.203.175.227",
            "port": 3306,
            "user": "u462461747_stockflow",
            "password": "!34Bolas",
            "database": "u462461747_stockflow",
            "charset": "utf8mb4",
            "connection_timeout": 10
        }
        
        print("Conectando ao banco...")
        connection = mysql.connector.connect(**db_config)
        
        if connection.is_connected():
            cursor = connection.cursor()
            cursor.execute("SELECT VERSION()")
            version = cursor.fetchone()
            print(f"✓ Conexão OK - MySQL {version[0]}")
            
            # Testa se as tabelas existem
            cursor.execute("SHOW TABLES LIKE 'tb_produto'")
            if cursor.fetchone():
                print("✓ Tabela tb_produto encontrada")
            else:
                print("✗ Tabela tb_produto não encontrada")
            
            cursor.execute("SHOW TABLES LIKE 'tb_produto_removido'")
            if cursor.fetchone():
                print("✓ Tabela tb_produto_removido encontrada")
            else:
                print("✗ Tabela tb_produto_removido não encontrada")
            
            cursor.close()
            connection.close()
            return True
        else:
            print("✗ Falha na conexão")
            return False
            
    except mysql.connector.Error as e:
        print(f"✗ Erro MySQL: {e}")
        return False
    except Exception as e:
        print(f"✗ Erro geral: {e}")
        return False

def test_input_devices():
    """Lista dispositivos de entrada disponíveis"""
    print("\n=== Testando Dispositivos de Entrada ===")
    
    try:
        import evdev
        
        devices = [evdev.InputDevice(path) for path in evdev.list_devices()]
        
        if not devices:
            print("✗ Nenhum dispositivo de entrada encontrado")
            return False
        
        print("Dispositivos encontrados:")
        for device in devices:
            print(f"  {device.path}: {device.name}")
            
            # Verifica se parece ser um leitor QR/barcode
            if any(keyword in device.name.lower() for keyword in ['barcode', 'scanner', 'qr', 'keyboard']):
                print(f"    → Possível leitor QR Code")
        
        return True
        
    except ImportError:
        print("✗ evdev não disponível")
        return False
    except Exception as e:
        print(f"✗ Erro ao listar dispositivos: {e}")
        return False

def test_permissions():
    """Verifica permissões necessárias"""
    print("\n=== Testando Permissões ===")
    
    # Verifica acesso aos dispositivos de entrada
    input_devices = []
    try:
        input_devices = os.listdir('/dev/input')
    except PermissionError:
        print("✗ Sem acesso a /dev/input")
        return False
    
    event_devices = [d for d in input_devices if d.startswith('event')]
    
    if not event_devices:
        print("✗ Nenhum dispositivo event* encontrado")
        return False
    
    accessible_devices = 0
    for device in event_devices[:3]:  # Testa apenas os primeiros 3
        device_path = f'/dev/input/{device}'
        if os.access(device_path, os.R_OK):
            accessible_devices += 1
    
    if accessible_devices > 0:
        print(f"✓ Acesso a {accessible_devices} dispositivos de entrada")
    else:
        print("✗ Sem acesso aos dispositivos de entrada")
        print("  Execute: sudo usermod -a -G input $USER")
        print("  Depois faça logout/login")
        return False
    
    # Verifica permissões de escrita no diretório
    leitor_dir = '/home/stockflow/Stockflow/leitor'
    if os.access(leitor_dir, os.W_OK):
        print(f"✓ Permissão de escrita em {leitor_dir}")
    else:
        print(f"✗ Sem permissão de escrita em {leitor_dir}")
        return False
    
    return True

def test_service_files():
    """Verifica se todos os arquivos necessários existem"""
    print("\n=== Testando Arquivos do Serviço ===")
    
    files_to_check = [
        '/home/stockflow/Stockflow/leitor/leitor.py',
        '/home/stockflow/Stockflow/leitor/requirements.txt',
        '/home/stockflow/Stockflow/leitor/install.sh',
        '/home/stockflow/Stockflow/leitor/stockflow-leitor.service',
        '/home/stockflow/Stockflow/config/printers.json'
    ]
    
    all_ok = True
    for file_path in files_to_check:
        if os.path.exists(file_path):
            print(f"✓ {file_path}")
        else:
            print(f"✗ {file_path} - FALTANDO")
            all_ok = False
    
    return all_ok

def main():
    """Executa todos os testes"""
    print("Stockflow QR Reader - Script de Teste")
    print("=====================================")
    
    tests = [
        test_dependencies,
        test_configuration,
        test_service_files,
        test_permissions,
        test_input_devices,
        test_database_connection
    ]
    
    results = []
    for test in tests:
        try:
            result = test()
            results.append(result)
        except Exception as e:
            print(f"✗ Erro no teste: {e}")
            results.append(False)
    
    print("\n=== Resumo dos Testes ===")
    passed = sum(results)
    total = len(results)
    
    print(f"Testes aprovados: {passed}/{total}")
    
    if passed == total:
        print("\n🎉 Todos os testes passaram! O serviço está pronto para uso.")
        print("\nPara iniciar o serviço:")
        print("  sudo systemctl start stockflow-leitor")
        print("\nPara ver logs:")
        print("  sudo journalctl -u stockflow-leitor -f")
    else:
        print("\n⚠️  Alguns testes falharam. Verifique os problemas acima.")
        print("\nPara mais informações, consulte o README.md")
    
    return passed == total

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)