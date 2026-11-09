# Calibração, presença e status da impressora

## Calibração

O agente recebe commands do polling moderno e consulta comandos durante uma espera prévia de impressão.
O único comando suportado é calibrate: envia exatamente ~JC pela fila configurada.
Registra a intenção local antes de enviar; resposta perdida ou reinício não causa repetição automática.
Exige fila livre e nenhum trabalho enviado/incerto. Pedido ainda não enviado pode aguardar a manutenção.
Tampa aberta, falta de ribbon e problemas impeditivos bloqueiam a operação; pausa/sem mídia podem ser a condição a corrigir, desde que o operador confirme mídia instalada.
Não envia resume, restauração de fábrica ou ZPL arbitrário.
A conclusão exige CUPS completed e duas leituras estáveis da impressora pronta depois do início; prazo de 60 segundos.
Uma calibração incerta impede novas impressões até conferir ou concluir uma calibração posterior.
Registros ficam em logs/printer-calibration/, fora do Git.

A rotina pode avançar várias etiquetas. O contador de produtos não é usado para medir o consumo da calibração.
O operador validou que o botão moveu a mídia e a tela recebeu conclusão, em cerca de quatro segundos.
Ainda é necessária conferência visual da próxima etiqueta; término da rotina não prova alinhamento perfeito.

## Presença do computador

POST autenticado /api/print-agent/heartbeat a cada 10 segundos, independente de impressão/calibração.
Sem token, o heartbeat fica desativado e o modo legado continua.
No sistema principal, print_agent_devices.heartbeat_at guarda o último sinal; last_seen_at é o contato da integração existente.
O servidor usa seu relógio. Não se grava um histórico com uma linha por sinal.

Online: contato há menos de 45 segundos.
Sem comunicação: 45 segundos ou mais sem sinal.
Desconhecido: agente antigo ou ausência de sinal compatível.
Não é possível distinguir somente pelo silêncio entre máquina desligada, Wi-Fi fora ou serviço parado; exibir último contato em vez de inventar a hora do desligamento.
Nada disso bloqueia o usuário de enviar novas etiquetas; o sistema mantém pedidos aguardando.

O teste real de presença online passou. A parada intencional do serviço para simular ausência foi rejeitada pela revisão automática; offline/recuperação foram verificados em testes isolados.

## Telemetria da Zebra

O mesmo heartbeat pode incluir printer={state,reasons,age_seconds}, sem chamada HTTP adicional.
Estados: pronta, bloqueada, imprimindo, calibrando, desconectada e indisponivel.
Quando livre, o agente lê USB sob exclusão com o envio; enquanto trabalha, reutiliza as observações do monitor.
Falha de leitura não vira “pronta”.
O servidor guarda printer_state, printer_reasons e printer_seen_at em print_agent_devices.
Se o computador não está online ou a leitura tem mais de 30 segundos, a API não deve anunciar pronta.
A leitura real pronta e o recebimento pelo servidor foram validados.

No sistema principal, dashboards de lojista/funcionário e páginas Administração/Manutenção apresentam o status.
Dashboard do lojista e Manutenção combinam status e calibração numa faixa compacta; Administração mantém o botão destacado.
As páginas e migrations Laravel ficam no repositório do sistema principal, não neste agente.
A interface consulta periodicamente; uma mudança pode levar aproximadamente 20 segundos para aparecer.

## Configuração por máquina

ZEBRA_USB_SERIAL seleciona exclusivamente a Zebra no USB.
ZEBRA_PRINTER_NAME seleciona a fila CUPS acompanhada.
A regra udev deve ter o mesmo serial e permitir acesso somente ao grupo do serviço.
Não executar um agente antigo e um novo ao mesmo tempo na mesma impressora/loja.
Não apagar tentativas pendentes ou copiar o estado de outro dispositivo.

As credenciais modernas são emitidas pelo servidor e restritas à loja/dispositivo.
Os exemplos não contêm tokens. Backups, dumps e .env são privados e devem permanecer fora do GitHub.
