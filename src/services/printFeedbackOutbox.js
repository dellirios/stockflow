'use strict';

// Disabled until the new server API and its store-scoped credential are configured.
function eventPayload(record, event) {
  return { event_id: record.id + ':' + event.sequence, attempt_id: record.id,
    sequence: event.sequence, state: event.state, reasons: event.reasons, printed: event.printed,
    expected: record.expected, at: event.at, source: event.source,
    printer_serial: process.env.ZEBRA_USB_SERIAL || 'D5N214500934', printer_name: record.printer,
    items: record.items || [], cups_job_id: record.cupsJobId || null };
}

async function deliverOutbox(monitor, { url, token, request = fetch } = {}) {
  const target = new URL(url);
  if (target.origin !== 'https://stockflow.pro' || target.pathname !== '/api/print-agent/events' ||
      target.search || target.hash || target.username || target.password || !token) {
    throw Error('Destino de eventos nao autorizado; API antiga nunca pode receber novos estados');
  }
  let delivered = 0;
  for (const record of monitor.records.values()) {
    if (!record.items?.length || record.supersededBy) continue;
    for (const event of record.events) {
      if (event.sequence <= (record.ackedSequence || 0)) continue;
      const body = eventPayload(record, event);
      const response = await request(target.href, { method: 'POST', redirect: 'error',
        signal: AbortSignal.timeout(3000),
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify(body) });
      if (!response.ok) throw Error('API de eventos indisponivel: ' + response.status);
      const ack = await response.json();
      if (ack.accepted !== true || ack.event_id !== body.event_id) throw Error('API nao confirmou o evento esperado');
      record.ackedSequence = event.sequence;
      monitor.save(record);
      delivered++;
    }
  }
  return delivered;
}

function startOutbox(monitor) {
  const url = process.env.PRINT_FEEDBACK_EVENTS_URL;
  const token = process.env.PRINT_FEEDBACK_TOKEN;
  if (!url || !token) return;
  monitor.delivery = { configured: true, last_success_at: null, last_error: null };
  let busy = false, failures = 0, next = 0;
  const timer = setInterval(async () => {
    if (busy || Date.now() < next) return;
    busy = true;
    try {
      const delivered = await deliverOutbox(monitor, { url, token });
      failures = 0;
      if (delivered) monitor.delivery.last_success_at = new Date().toISOString();
      monitor.delivery.last_error = null;
    }
    catch (error) {
      monitor.delivery.last_error = error.message;
      failures++;
      next = Date.now() + Math.min(60000, 1000 * 2 ** Math.min(failures, 6));
      console.warn('[PrintFeedbackOutbox]', error.message);
    } finally { busy = false; }
  }, 1000);
  timer.unref();
}
module.exports = { eventPayload, deliverOutbox, startOutbox };
