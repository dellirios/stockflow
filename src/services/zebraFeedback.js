'use strict';

// Parse complete ~HS frames only; absent or malformed feedback is never "ready".
function parseHostStatus(raw) {
  const frames = [...String(raw).matchAll(/\x02([^\x03]*)\x03/g)].map(m => m[1].split(','));
  if (frames.length !== 3 || frames[0].length !== 12 || frames[1].length !== 11 ||
      frames.some(row => row.some(v => !/^\d+$/.test(v)))) {
    throw new Error('Resposta ~HS incompleta ou invalida');
  }
  const [first, second] = frames.map(row => row.map(Number));
  const reasons = [];
  if (first[1]) reasons.push('sem_etiqueta');
  if (second[3]) reasons.push('sem_ribbon');
  if (second[2]) reasons.push('tampa_aberta');
  if (first[2]) reasons.push('pausada');
  if (first[10] || first[11]) reasons.push('temperatura');
  if (first[9]) reasons.push('configuracao_corrompida');
  if (first[5]) reasons.push('buffer_cheio');
  return {
    reasons,
    formatsPending: first[4],
    partialFormat: Boolean(first[7]),
    labelsRemaining: second[8],
    idle: !reasons.length && first[4] === 0 && first[7] === 0 && second[8] === 0,
  };
}

function parseLabelCounter(raw) {
  const match = /^(?:"(\d+)"|(\d+))$/.exec(String(raw).trim());
  if (!match || !Number.isSafeInteger(Number(match[1] ?? match[2]))) {
    throw new Error('Contador de etiquetas ausente ou invalido');
  }
  return Number(match[1] ?? match[2]);
}

function completionEvidence({ baseline, current, expected, status }) {
  if (![baseline, current, expected].every(Number.isSafeInteger) ||
      baseline < 0 || expected < 1 || current < baseline) return 'confirmacao_pendente';
  const printed = current - baseline;
  if (printed > expected) return 'confirmacao_pendente';
  if (status.reasons.length) return 'bloqueado';
  return printed === expected && status.idle ? 'concluido' : 'imprimindo';
}

module.exports = { parseHostStatus, parseLabelCounter, completionEvidence };
