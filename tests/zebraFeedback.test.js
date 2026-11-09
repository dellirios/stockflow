'use strict';
const assert = require('node:assert/strict');
const { parseHostStatus, parseLabelCounter, completionEvidence } = require('../src/services/zebraFeedback');
const first = '030,0,0,0480,000,0,0,0,000,0,0,0'.split(',');
const second = '001,0,0,0,1,2,3,0,00000000,1,000'.split(',');
const raw = (a = first, b = second) => [a.join(','), b.join(','), '0000,0'].map(s => '\x02' + s + '\x03\r\n').join('');
const idle = parseHostStatus(raw());
const openLid = parseHostStatus(raw(first.map((v,i)=>i===2?'1':v),second.map((v,i)=>i===2?'1':v)));
assert.deepEqual(openLid.reasons,['tampa_aberta','pausada']);
const closedStillPaused = parseHostStatus(raw(first.map((v,i)=>i===2?'1':v)));
assert.deepEqual(closedStillPaused.reasons,['pausada']);
assert.equal(completionEvidence({baseline:12149,current:12149,expected:1,status:closedStillPaused}),'bloqueado');

assert.equal(idle.idle, true);
for (const [row, index, reason] of [[0,1,'sem_etiqueta'],[0,2,'pausada'],[1,2,'tampa_aberta'],[1,3,'sem_ribbon'],[0,11,'temperatura']]) {
  const rows = [[...first],[...second]]; rows[row][index] = '1';
  const status = parseHostStatus(raw(...rows));
  assert.equal(status.idle,false); assert.ok(status.reasons.includes(reason));
}
for(const input of ['', 'ready',raw().slice(0,30)])assert.throws(()=>parseHostStatus(input));
assert.equal(parseLabelCounter('"12149"'),12149);
for(const input of ['', '"?"', '-1','1.5','9007199254740993'])assert.throws(()=>parseLabelCounter(input));
assert.equal(completionEvidence({baseline:12149,current:12149,expected:1,status:idle}),'imprimindo');
assert.equal(completionEvidence({baseline:12149,current:12150,expected:1,status:idle}),'concluido');
for(const current of [0,12151])assert.equal(completionEvidence({baseline:12149,current,expected:1,status:idle}),'confirmacao_pendente');
console.log('PASS Zebra feedback: status flags, malformed replies, counters and completion evidence');

for (const sample of require('./fixtures/zebra-feedback-observed.json')) {
  assert.deepEqual(parseHostStatus(sample.hostStatus).reasons, sample.reasons, sample.name);
}
console.log('PASS observed physical USB responses');
