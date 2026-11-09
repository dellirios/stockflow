# Intervalo de consulta e início da impressão

O atraso identificado em 09/11/2026 estava antes de o agente receber o pedido.
Depois de ciclos vazios, a pausa chegava a 20 segundos, com jitter de 30%: 14 a 26 segundos.
O endpoint do sistema principal consultado responde imediatamente, apesar do nome histórico LONG_POLL_URL.

Medições da instalação piloto: envio ao CUPS 55 ms, processamento no agente cerca de 170 ms, consultas de diagnóstico 44–402 ms.
Esses números não medem clique até saída física e não constituem benchmark de capacidade.

A configuração aprovada para a loja piloto é:

    EMPTY_POLL_BASE_DELAY_MS=1000
    NOOP_PAYLOAD_BASE_DELAY_MS=1000
    MAX_IDLE_BACKOFF_MS=1000

Pausa efetiva 700–1300 ms, mais tempo da requisição. Consultas são sequenciais e filtradas por store_key.
Outras instalações preservam seus valores; não há mudança global dos defaults.
O operador confirmou impressão rápida após ajustar para um segundo.

A frequência aumenta a carga: ordem de 60 consultas/minuto por agente, conforme resposta/processamento.
A otimização do servidor para reduzir essa carga sem perder rapidez ficou acordada como etapa posterior.
Não foi realizado teste de carga.

O modo acompanhado espera o retorno físico antes de concluir; esse tempo não deve ser confundido com atraso antes de iniciar.
Heartbeat a cada 10 segundos e telemetria não mudam a configuração de polling.
Uma proteção contra falhas aberta não renova mais seu cooldown a cada chamada recusada.
Bloqueios físicos conhecidos antes do envio aguardam recuperação, sem gerar backoff de impressão.

Não copiar .env entre lojas. Faça backup e reinicie o serviço depois de alterar sua configuração.
