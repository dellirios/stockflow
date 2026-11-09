'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { parseHostStatus, parseLabelCounter, completionEvidence } = require('./zebraFeedback');
const run = promisify(execFile);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function atomicJson(file, data) {
  const temp = file + '.tmp';
  const fd = fs.openSync(temp, 'w', 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify(data) + '\n');
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
  fs.renameSync(temp, file);
  const directory = fs.openSync(path.dirname(file), 'r');
  try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
}

async function readUsb() {
  const { stdout } = await run('python3', [path.resolve(__dirname, '../../scripts/zebra-usb-feedback.py')],
    { timeout: 6500, maxBuffer: 32768 });
  const raw = JSON.parse(stdout);
  return { status: parseHostStatus(raw.hostStatus), counter: parseLabelCounter(raw.counter), raw };
}

async function cupsJobs(printer, which = 'all') {
  const { stdout } = await run('lpstat', ['-W', which, '-o', printer],
    { timeout: 3000, env: { ...process.env, LC_ALL: 'C' } });
  return stdout.trim().split('\n').filter(Boolean).map(line => line.split(/\s+/)[0]);
}

async function cupsState(jobId) {
  if (!/^[\w.-]+-\d+$/.test(jobId)) throw Error('Identificador CUPS invalido');
  const numeric = jobId.match(/-(\d+)$/)[1];
  const { stdout } = await run('ipptool', ['-tv', 'ipp://localhost/jobs/' + numeric,
    '/usr/share/cups/ipptool/get-job-attributes.test'],
  { timeout: 4000, maxBuffer: 262144, env: { ...process.env, LC_ALL: 'C' } });
  const match = /job-state \(enum\) = ([a-z-]+)/.exec(stdout);
  if (!match) throw Error('Estado CUPS indisponivel');
  return match[1];
}

class PrintFeedbackMonitor {
  constructor({ directory, read = readUsb, jobs = cupsJobs, jobState = cupsState,
    wait = pause, now = Date.now, timeoutMs = 120000, intervalMs = 500, recover = true } = {}) {
    this.directory = directory || path.resolve(__dirname, '../../logs/print-feedback');
    this.read = read; this.jobs = jobs; this.jobState = jobState;
    this.wait = wait; this.now = now; this.timeoutMs = timeoutMs; this.intervalMs = intervalMs;
    this.records = new Map();
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    for (const name of fs.readdirSync(this.directory).filter(n => /^[a-f0-9-]+\.json$/.test(n))) {
      const record = JSON.parse(fs.readFileSync(path.join(this.directory, name), 'utf8'));
      if (recover && record.submissionStarted && !['concluido', 'cancelado'].includes(record.state)) {
        this.change(record, 'confirmacao_pendente', ['reinicio_do_agente']);
      }
      this.records.set(record.id, record);
    }
  }

  save(record) { atomicJson(path.join(this.directory, record.id + '.json'), record); }

  change(record, state, reasons = [], observation) {
    if (observation) {
      record.lastObservation = { ...observation, observedAt: new Date(this.now()).toISOString() };
      fs.appendFileSync(path.join(this.directory, record.id + '.observations.jsonl'),
        JSON.stringify(record.lastObservation) + '\n', { mode: 0o600 });
      record.printed = record.baseline == null ? 0 : observation.counter - record.baseline;
    }
    const fingerprint = JSON.stringify([state, reasons, record.printed || 0]);
    if (fingerprint !== record.fingerprint) {
      record.fingerprint = fingerprint;
      record.state = state;
      record.reasons = reasons;
      record.updatedAt = new Date(this.now()).toISOString();
      record.events.push({ sequence: record.events.length + 1, state, reasons,
        printed: record.printed || 0, at: record.updatedAt,
        source: record.manualReview ? 'manual' : state === 'concluido' ? 'counter_and_status' : 'agent' });
      console.log('[PrinterFeedback]', record.id, state, reasons.join(','), record.printed || 0);
    }
    this.save(record);
  }

  hasRecorded(key) {
    return [...this.records.values()].some(r => r.submissionStarted && !r.released && r.keys.includes(key));
  }

  needsReview(printer) {
    return [...this.records.values()].some(r => r.printer === printer &&
      r.submissionStarted && !r.released && !['concluido', 'cancelado'].includes(r.state));
  }

  summary() {
    const records = [...this.records.values()];
    const latest = records.filter(r => !r.supersededBy).sort((a,b) => String(a.updatedAt).localeCompare(String(b.updatedAt))).at(-1);
    return { mode: this.delivery?.configured ? 'server_events' : 'local_only',
      awaiting_server_integration: !this.delivery?.configured,
      delivery: this.delivery || { configured: false },
      jobs: records.length,
      pending_review: records.filter(r => r.submissionStarted && r.state === 'confirmacao_pendente').length,
      latest: latest ? { id: latest.id, state: latest.state, reasons: latest.reasons,
        expected: latest.expected, printed: latest.printed || 0, updated_at: latest.updatedAt } : null };
  }

  async print({ printer, keys, expected, items = [], submit }) {
    if (!Number.isSafeInteger(expected) || expected < 1) throw Error('Quantidade invalida');
    if (this.running || this.needsReview(printer)) throw Error('Impressora aguardando conferencia de trabalho anterior');
    if (keys.some(k => this.hasRecorded(k))) throw Error('Trabalho ja registrado; reenvio automatico bloqueado');
    this.running = true;
    this.phase = 'preflight';
    const candidates = [...this.records.values()].filter(r => !r.submissionStarted && !r.released &&
      r.printer === printer && r.expected === expected &&
      JSON.stringify([...r.keys].sort()) === JSON.stringify([...keys].sort()))
      .sort((a,b) => (b.ackedSequence || 0) - (a.ackedSequence || 0));
    const record = candidates[0] || { id: crypto.randomUUID(), printer, keys, items, expected, baseline: null,
      state: 'recebido', reasons: [], submissionStarted: false, events: [],
      createdAt: new Date(this.now()).toISOString() };
    for (const duplicate of candidates.slice(1)) {
      if (!duplicate.ackedSequence) { duplicate.supersededBy = record.id; this.save(duplicate); }
    }
    this.records.set(record.id, record);
    try {
      this.change(record, 'recebido');
      let preflightDeadline = this.now() + this.timeoutMs;
      let baseline;
      while (this.now() < preflightDeadline) {
        if (this.maintenanceRequested) throw Object.assign(Error('Pedido suspenso para calibrar a impressora'), { maintenance: true });
        try {
          const snapshot = await this.read();
          // Known physical stops keep the original request waiting, without error backoff.
          if (snapshot.status.reasons.some(reason => ['tampa_aberta','pausada','sem_etiqueta','sem_ribbon','temperatura'].includes(reason))) {
            preflightDeadline = this.now() + this.timeoutMs;
          }
          this.change(record, snapshot.status.idle ? 'recebido' : 'bloqueado',
            snapshot.status.reasons.length ? snapshot.status.reasons : snapshot.status.idle ? [] : ['impressora_ocupada'], snapshot);
          if (snapshot.status.idle && !(await this.jobs(printer, 'not-completed')).length) {
            baseline = snapshot; break;
          }
        } catch (error) {
          this.change(record, 'bloqueado', ['falha_comunicacao']);
        }
        await this.wait(this.intervalMs);
      }
      if (!baseline) throw Error('Impressora indisponivel; nenhum envio realizado');
      if (this.maintenanceRequested) throw Object.assign(Error('Pedido suspenso para calibrar a impressora'), { maintenance: true });
      const previousJobs = new Set(await this.jobs(printer));
      // Persist before invoking lp: a crash or lost reply must never trigger a second submission.
      record.baseline = baseline.counter;
      this.phase = 'printing';
      record.submissionStarted = true;
      this.change(record, 'enviando');
      const accepted = await submit();
      if (!accepted || !/^[\w.-]+-\d+$/.test(accepted.jobId)) throw Error('CUPS nao retornou identificador verificavel');
      record.cupsJobId = accepted.jobId;
      this.change(record, 'enviado');
      const deadline = this.now() + this.timeoutMs;
      let stable = 0;
      while (this.now() < deadline) {
        try {
          const foreign = (await this.jobs(printer)).filter(id => id !== record.cupsJobId && !previousJobs.has(id));
          if (foreign.length) throw Object.assign(Error('Outro trabalho interferiu no contador'), { uncertain: true });
          const state = await this.jobState(record.cupsJobId);
          if (['aborted', 'canceled'].includes(state)) {
            throw Object.assign(Error('Trabalho CUPS interrompido'), { uncertain: true });
          }
          const snapshot = await this.read();
          const evidence = completionEvidence({ baseline: record.baseline, current: snapshot.counter,
            expected, status: snapshot.status });
          if (evidence === 'confirmacao_pendente') throw Object.assign(Error('Contador divergente'), { uncertain: true });
          stable = evidence === 'concluido' && state === 'completed' ? stable + 1 : 0;
          if (stable >= 2) {
            this.change(record, 'concluido', [], snapshot);
            return { id: record.id, state: 'concluido', printed: expected, cupsJobId: record.cupsJobId };
          }
          this.change(record, evidence === 'bloqueado' ? 'bloqueado' : 'imprimindo',
            snapshot.status.reasons, snapshot);
        } catch (error) {
          stable = 0;
          if (error.uncertain) throw error;
          this.change(record, 'bloqueado', ['falha_comunicacao']);
        }
        await this.wait(this.intervalMs);
      }
      throw Error('Prazo de verificacao esgotado; conferencia necessaria');
    } catch (error) {
      this.change(record, record.submissionStarted ? 'confirmacao_pendente' : 'bloqueado',
        record.submissionStarted ? ['conferencia_necessaria'] : error.maintenance ? ['calibracao_solicitada'] : record.reasons.length ? record.reasons : ['erro_antes_do_envio']);
      error.feedbackId = record.id;
      error.feedbackState = record.state;
      throw error;
    } finally { this.running = false; this.phase = 'idle'; }
  }
}

module.exports = { PrintFeedbackMonitor, readUsb, cupsJobs, cupsState };
