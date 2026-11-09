'use strict';

function createHeartbeat({ token, request = fetch, now = Date.now, getPrinter } = {}) {
  const state = { enabled: Boolean(token), last_success_at: null, last_error: null };
  let busy = false;
  async function tick() {
    if (!token || busy) return;
    busy = true;
    try {
      const printer = getPrinter ? await getPrinter() : null;
      const response = await request('https://stockflow.pro/api/print-agent/heartbeat', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
        headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(printer ? { printer } : {}),
      });
      if (!response.ok) throw Error('Heartbeat HTTP ' + response.status);
      const result = await response.json();
      if (result.accepted !== true) throw Error('Heartbeat not accepted');
      state.last_success_at = new Date(now()).toISOString();
      state.last_error = null;
    } catch (error) { state.last_error = error.message; }
    finally { busy = false; }
  }
  return { state, tick };
}

function startHeartbeat(getPrinter) {
  const heartbeat = createHeartbeat({ token: process.env.PRINT_FEEDBACK_TOKEN, getPrinter });
  if (heartbeat.state.enabled) {
    void heartbeat.tick();
    const timer = setInterval(() => { void heartbeat.tick(); }, 10000);
    timer.unref();
  }
  return heartbeat.state;
}
module.exports = { createHeartbeat, startHeartbeat };
