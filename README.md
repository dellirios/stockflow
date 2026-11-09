# StockFlow Pro — agente local 2.1.0

Agente Node.js de impressão ZPL por CUPS e leitor QR em Python. Este repositório roda no computador da loja; o sistema principal/API Laravel é um projeto separado.

A versão de 09/11/2026 acrescenta layout Zebra 60 × 60 mm, confirmação por retorno USB/contador, proteção persistente contra duplicação, calibração remota, presença do agente e estado da impressora.

## Documentação

- [Instalação, atualização e contrato da versão 2.1.0](docs/versao-2026-11-09.md)
- [Layout Zebra aprovado](docs/zebra-premium-60x60.md)
- [Confirmação física e recuperação de trabalhos](docs/confirmacao-fisica-impressao.md)
- [Polling e latência](docs/latencia-impressao.md)
- [Calibração, presença e telemetria](docs/manutencao-presenca-impressora.md)
- [Versão anterior e leitor QR](docs/versao-2026-10-31.md)
- [Leitor QR](leitor/README.md)

## Requisitos

Node.js 24 ou superior, Linux, Python 3, CUPS com lp/lpstat/ipptool e libusb-1.0 para retorno USB.
Homologado na Zebra ZD220 a 203 dpi. GC420t tem geração de layout validada, sem certificação física do retorno USB.

Instale dependências com npm ci. Copie os exemplos para arquivos locais e configure a loja e a fila correta.
O modo novo é opt-in e exige cadastro do dispositivo e API compatível no sistema principal.
Nunca reutilize o token, a configuração ou o estado de outra loja.

## Executar

    npm start
    npm run health

Em produção, use stockflow.service, ajustando usuário, caminhos e loja.
Para retorno USB, instale uma regra udev restrita ao serial e grupo do serviço; veja deploy/udev/70-stockflow-zebra.rules.example.

## Testar

    npm test

A suíte padrão executa regressões isoladas sem imprimir, consultar pedidos reais ou confirmar status na produção.
Os testes históricos de integração/performance permanecem em npm run test:legacy e dependem de serviço em localhost:5000; não fazem parte da regressão segura padrão.
Não os execute numa loja em operação: alguns caminhos históricos podem consumir pedidos ou alterar configuração de impressora.

Prévia com dados fictícios:

    npm run preview:elgin

O script histórico de prévia também seleciona o layout Zebra conforme a fila configurada. A renderização usa o serviço externo Labelary; não use dados reais/sensíveis nas fixtures.

## Arquivos privados

.env, config/printers.json, config/database.json, config/device_config.json, leitor/leitor.env, filas, logs, backups, dumps e ambientes virtuais são locais.
Os arquivos preenchidos e o dump SQL legado foram removidos do versionamento atual, preservando os arquivos na máquina.
Faça backup antes de atualizar uma instalação antiga, pois arquivos anteriormente versionados podem ser removidos pelo Git.
A remoção no commit atual não apaga versões antigas no histórico do Git.

O atalho histórico stockflow aponta para stockflow-manager.sh, que não é fornecido nesta versão.
Use npm/systemd conforme a documentação; não dependa desse atalho para instalar ou atualizar.
