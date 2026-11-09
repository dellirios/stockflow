# Confirmação física, estados e recuperação

## O que significa concluído

Aceitação de lp e CUPS completed isoladamente não comprovam a saída da etiqueta.
O monitor registra o contador antes de enviar e exige:
- CUPS completed;
- aumento exato correspondente à quantidade solicitada;
- dois retornos consecutivos da Zebra ociosa e sem bloqueios.

O transporte permanece CUPS/RAW, sem mudar o layout.
O retorno usa ~HS e odometer.total_label_count pela interface USB bidirecional.
Não disputa a interface quando o backend CUPS a estiver usando.
A contagem presume uso exclusivo dessa impressora pelo agente; não enviar ZPL direto ou por outras aplicações durante um trabalho acompanhado.

## Estados e persistência

Estados: recebido, enviando, enviado, imprimindo, bloqueado, confirmacao_pendente, concluido e cancelado por conferência.
Motivos incluem sem_etiqueta, sem_ribbon, tampa_aberta, pausada, temperatura, falha_comunicacao e conferencia_necessaria.
A tentativa é gravada ANTES de chamar lp. Eventos e observações ficam em logs/print-feedback/ com acesso restrito.
O JSON de cada tentativa contém identificador, chaves, identidade de pedidos, quantidade, contador, CUPS ID, eventos e sequência confirmada pela API.
O outbox repete somente eventos não confirmados, em ordem, com backoff; não reimprime.
Cada evento tem event_id=attempt_id:sequence; o servidor precisa devolver esse mesmo ID e accepted=true.

Antes do envio, bloqueios físicos conhecidos mantêm o mesmo pedido aguardando enquanto a Zebra responde.
A primeira leitura pronta permite enviar uma única vez, sem cooldown adicional; a pausa pode exigir Start/Pause físico.
Falhas de comunicação têm prazo de 120 segundos. Após envio, divergência, interferência, prazo excedido ou resposta incerta levam à conferência.
O reinício recupera tentativas enviadas/incompletas como confirmacao_pendente, bloqueando reenvios.
Pedidos ainda não enviados reutilizam a mesma tentativa após recuperação.
Uma solicitação de calibração pode suspender a espera antes do envio e retomar depois; nunca interrompe/reenvia uma impressão já enviada.

O modo moderno usa print_request_id na deduplicação durável.
Sem essa identidade, pedidos indistinguíveis são conservadoramente protegidos até conferência. O servidor atualizado deve sempre fornecê-la.
Não apagar registros para “resolver” uma impressão pendente.

## API e privacidade

Veja o contrato em versao-2026-11-09.md.
Novos eventos não vão para /status.php. Sem URL/token modernos, a conclusão fica somente local.
As filas/tentativas podem conter dados reais de produtos e lojas; não devem ser enviadas ao GitHub.
O health mostra modo, última tentativa, quantidades, pendência e estado da entrega dos eventos.

## Conferência manual

Pare stockflow.service antes de usar o utilitário e reinicie depois.
Ele exige impressora ociosa, fila sem trabalhos ativos e trabalho CUPS terminal.

    node scripts/review-print-feedback.js
    node scripts/review-print-feedback.js UUID confirmar "motivo detalhado da conferência"
    node scripts/review-print-feedback.js UUID liberar-reimpressao "motivo detalhado da conferência"

Liberação permite nova tentativa e pode fazer o pedido pendente voltar a imprimir ao iniciar o serviço.
Não liberar se houver dúvida sobre etiquetas já emitidas. O utilitário não cancela trabalhos nem limpa o buffer automaticamente.
Registra usuário local, motivo, horário e origem manual.

## Evidência e limites

No teste físico de uma unidade, o contador aumentou uma vez; repetir o pedido foi bloqueado; nenhuma confirmação legada foi enviada.
Tampa/pausa e falta/reposição de mídia foram observadas no USB e no sistema principal.
O parser trata o quarto campo da segunda linha ~HS como falta de ribbon, mas o teste físico com ribbon realmente acabado permanece pendente.
A remoção do ribbon não substitui o teste da ponta refletiva.
A confirmação mecânica não certifica qualidade visual nem leitura do QR.
