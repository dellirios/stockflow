PROMPT para Geração de Código Python (Aprimorado com Fila de Trabalhos)
Objetivo: Criar um serviço Python (leitor.py) em /home/stockflow/Stockflow/leitor/leitor.py totalmente independente do node para automação da baixa de produtos. O serviço deve ser executado de forma persistente, otimizado para baixo consumo de recursos, e independente de uma interface gráfica de usuário. O código deve ser resiliente a falhas de hardware, rede e dados, utilizando uma fila de trabalhos para garantir a não perda de dados durante a indisponibilidade do banco.

Estrutura do Código:

Importações:

mysql-connector-python para conexão com o banco de dados.
json para manipulação de arquivos JSON.
os para operações com sistema de arquivos.
time para manipulação de tempo.
logging para registro de eventos.
threading para suporte a threads.
queue para implementação de fila de trabalhos.
Requisitos e Componentes:

Entrada de Dados (Input):

Fonte: Leitor QR Code óptico (comportamento de teclado virtual).

Mecanismo: O serviço deve monitorar eventos de teclado (emulador input ou dispositivo /dev/input/event*) e capturar a sequência de caracteres lida pelo leitor, finalizada por um caractere de nova linha (\n).

Configuração do Sistema:

Arquivo: /home/stockflow/Stockflow/config/printers.json.

Conteúdo: Espera-se um objeto JSON contendo o store_key. Exemplo: { "store_key": "ID_DA_LOJA" }. O script deve ler e extrair este valor.

Conexão com Banco de Dados:

Tipo: MySQL.

Credenciais (db_config):

JSON

{
  "host": "193.203.175.227",
  "port": 3306,
  "user": "u462461747_stockflow",
  "password": "!34Bolas",
  "database": "u462461747_stockflow",
  "charset": "utf8mb4",
  "timezone": "+00:00",
  "acquireTimeout": 60000,
  "timeout": 60000,
  "reconnect": true
}
Biblioteca: mysql-connector-python. O script deve utilizar um pool de conexões para otimizar o desempenho.

Lógica de Processamento (Core Logic):

Função: process_job(product_id, store_key)

Etapas:

Inicie uma transação atômica.

Validação: Verifique a existência de um produto na tabela tb_produto com id = product_id e store_key = store_key.

Condicional:

Se Válido:

Copie o registro completo do produto da tabela tb_produto para a tabela tb_produto_removido.

No registro copiado, defina responsavel_retirada com 'Leitor QRCODE'.

Exclua o registro original da tabela tb_produto.

Confirme (COMMIT) a transação.

Retorne sucesso.

Se Inválido:

Reverta (ROLLBACK) a transação.

Retorne erro.

Tratamento de Erros: Capturar e logar exceções de banco de dados (mysql.connector.Error) e erros de validação.

Prevenção de Falhas Robóticas (Novo Item):

Fila de Trabalhos (Job Queue): Implementar uma fila em memória (ex: collections.deque) para armazenar os IDs de produtos lidos.

Falha de Conectividade com o Leitor: Se o leitor QR Code for desconectado, o serviço deve tentar reconectar ou aguardar. O loop principal não deve travar; deve logar o erro e continuar.

Problemas de Rede: Se a conexão com o banco de dados remoto for perdida:

O script deve detectar a falha de conexão.

Em vez de tentar processar imediatamente, o product_id lido deve ser adicionado à fila de trabalhos.

O script deve implementar um mecanismo de retentativa com backoff exponencial para reconectar ao banco de dados em segundo plano.

Quando a conexão for restabelecida, o script deve processar os itens pendentes na fila de trabalhos em ordem, um por um.

Problemas de Permissão: O script deve verificar as permissões de leitura do arquivo de configuração (printers.json) e do dispositivo do leitor. Se houver falha, deve logar um erro claro e encerrar o processo.

Dados Inválidos:

Formato do QR Code: A entrada deve ser validada para garantir que o product_id seja um formato esperado (ex: numérico).

Arquivo de Configuração: O script deve tratar o caso em que o arquivo printers.json está corrompido ou o store_key está ausente.

A inclusão da fila de trabalhos garante que a baixa de produtos seja eventual, mas consistentemente realizada, mesmo em ambientes com rede instável. O serviço se torna autônomo, resiliente e confiável.

Sugestões de Melhoria com Foco em Hardware Limitado
1. Persistência da Fila de Trabalhos

Atualmente, a fila de trabalhos está em memória. Se a máquina reiniciar inesperadamente (por falta de energia, por exemplo), todos os itens na fila serão perdidos.

Sugestão: Implemente uma persistência simples para a fila. Um arquivo de texto (jobs.json) pode ser a solução ideal, pois é leve e não exige um banco de dados local.

Como fazer: Sempre que um product_id for adicionado à fila, ele também é escrito no arquivo. Ao iniciar o serviço, o script deve ler esse arquivo e carregar os trabalhos pendentes. Após o processamento de cada item, ele é removido da fila em memória e do arquivo.

2. Otimização do Consumo de Recursos

Você já mencionou a necessidade de um código leve, mas o monitoramento contínuo de eventos de teclado pode ser otimizado.

Sugestão: Em vez de um polling constante, utilize um sistema baseado em eventos. O evdev em Python é ideal para isso, pois ele bloqueia a thread até que um evento ocorra, consumindo praticamente zero de CPU quando inativo.

Como fazer: O evdev permite escutar diretamente o dispositivo de entrada (o leitor QR Code) sem a sobrecarga de monitorar todos os eventos do sistema, como o pynput faria em um caso mais geral.

3. Mecanismo de Logs Detalhado

Um sistema robusto precisa de rastreabilidade. Em um hardware limitado, os logs precisam ser eficientes e úteis.

Sugestão: Implemente um sistema de log estruturado. Em vez de apenas print(), use a biblioteca logging do Python.

Como fazer: Configure os logs para registrar, no mínimo:

Timestamp: Momento exato da ocorrência.

Nível de severidade: INFO, WARNING, ERROR.

Mensagem: Detalhes da ação.

Exemplo de log: [2025-08-13 10:30:00] INFO: Produto 'QR-12345' adicionado à fila. ou [2025-08-13 10:30:05] ERROR: Falha na conexão com o DB. Tentando reconectar...

4. Isolamento e Gerenciamento do Serviço

Para garantir que o serviço rode de forma autônoma e ininterrupta, é preciso gerenciar seu ciclo de vida.

Sugestão: Configure o script Python para rodar como um daemon ou serviço de sistema.

Como fazer: Use o systemd, ferramenta padrão em sistemas Linux. Crie um arquivo .service simples que defina como o script leitor.py deve ser iniciado, reiniciado automaticamente em caso de falha, e logar para o journald. Isso garante que o serviço estará sempre ativo, mesmo após um reboot.

Ao incluir essas melhorias, a solução se torna não apenas funcional, mas também profissional, resiliente a falhas e pronta para um ambiente de produção real, mesmo com hardware restrito.