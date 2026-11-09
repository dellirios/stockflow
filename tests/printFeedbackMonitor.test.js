'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { PrintFeedbackMonitor } = require('../src/services/printFeedbackMonitor');
const directories = [];
const idle = { reasons: [], idle: true, formatsPending: 0, labelsRemaining: 0, partialFormat: false };
const sample = (counter, status = idle) => ({ counter, status, raw: {} });
function harness({ reads, jobState = async () => 'completed', jobs = async () => [] } = {}) {
 const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'stockflow-feedback-'));
 directories.push(directory);
 let time = 0, sent = 0, index = 0;
 const monitor = new PrintFeedbackMonitor({ directory, now: () => time,
  wait: async ms => { time += ms; }, timeoutMs: 20, intervalMs: 1, jobs, jobState,
  read: async () => { const item = reads[Math.min(index++, reads.length - 1)]; if (item instanceof Error) throw item; return item; } });
 const options = { printer: 'Zebra_Test', keys: ['key1'], expected: 1,
  submit: async () => { sent++; return { jobId: 'Zebra_Test-123' }; } };
 return { monitor, options, sent: () => sent };
}
(async () => {
 let h = harness({ reads: [sample(10), sample(10), sample(11), sample(11)] });
 assert.equal((await h.monitor.print(h.options)).state, 'concluido');
 assert.equal(h.sent(),1); assert.ok(h.monitor.hasRecorded('key1'));
 await assert.rejects(h.monitor.print(h.options), /ja registrado/);
 const replay = new PrintFeedbackMonitor({ directory: h.monitor.directory });
 assert.ok(replay.hasRecorded('key1')); assert.equal(replay.summary().latest.state,'concluido');
 h = harness({ reads: [sample(10), sample(11, {...idle,idle:false,reasons:['sem_ribbon']}),sample(11),sample(11)] });
 await h.monitor.print(h.options);
 assert.ok([...h.monitor.records.values()][0].events.some(e=>e.state==='bloqueado'&&e.reasons.includes('sem_ribbon')));
 for (const reads of [[sample(10),sample(10)],[sample(10),new Error('USB disconnected')],[sample(10),sample(12)],[sample(10),sample(0)]]) {
  h=harness({reads}); await assert.rejects(h.monitor.print(h.options));
  assert.equal(h.monitor.summary().latest.state,'confirmacao_pendente');assert.equal(h.sent(),1);
  await assert.rejects(h.monitor.print({...h.options,keys:['other']}),/conferencia/);assert.equal(h.sent(),1);
 }
 h=harness({reads:[sample(10,{...idle,idle:false,reasons:['sem_etiqueta']}),new Error('USB disconnected')]});
 await assert.rejects(h.monitor.print(h.options),/nenhum envio/);assert.equal(h.sent(),0);assert.ok(!h.monitor.hasRecorded('key1'));
 const waitingId=[...h.monitor.records.values()][0].id;
 h.monitor.read=async()=>{throw Error('USB disconnected');};
 await assert.rejects(h.monitor.print(h.options),/nenhum envio/);
 assert.equal(h.monitor.records.size,1,'Retries before submission must preserve the original attempt');
 assert.equal([...h.monitor.records.values()][0].id,waitingId);
 const restartedWaiting=new PrintFeedbackMonitor({directory:h.monitor.directory});
 let count=0;
 restartedWaiting.read=async()=>sample(count++===0?10:11);
 restartedWaiting.jobs=async()=>[];
 restartedWaiting.jobState=async()=>'completed';
 restartedWaiting.wait=async()=>{};
 assert.equal((await restartedWaiting.print(h.options)).id,waitingId);
 assert.equal(h.sent(),1);

 h=harness({reads:[sample(10),sample(11)],jobState:async()=>'aborted'});
 await assert.rejects(h.monitor.print(h.options));assert.equal(h.monitor.summary().latest.state,'confirmacao_pendente');
 h=harness({reads:[sample(10),sample(11)],jobs:async(p,which)=>which==='not-completed'?[]:h.sent()?['Zebra_Test-123','Zebra_Test-124']:[]});
 await assert.rejects(h.monitor.print(h.options),/interferiu/);assert.equal(h.sent(),1);
 h=harness({reads:[sample(10),sample(11)]});
 h.options.submit=async()=>{throw Error('lost acceptance reply');};
 await assert.rejects(h.monitor.print(h.options));assert.ok(h.monitor.hasRecorded('key1'));
 const record=[...h.monitor.records.values()][0];record.state='enviado';h.monitor.save(record);
 const recovered=new PrintFeedbackMonitor({directory:h.monitor.directory});
 assert.equal(recovered.summary().latest.state,'confirmacao_pendente');assert.ok(recovered.hasRecorded('key1'));
 h=harness({reads:[sample(10),sample(11)],jobState:async()=>'processing'});
 await assert.rejects(h.monitor.print(h.options));assert.equal(h.monitor.summary().latest.state,'confirmacao_pendente');

 // A known physical block must not expire while the printer keeps answering.
 h=harness({reads:[sample(10)]});
 let reads=0, ticks=0, submittedAt=null;
 h.monitor.now=()=>ticks;
 h.monitor.wait=async ms=>{ticks+=ms;};
 h.monitor.read=async()=>{
  reads++;
  if(reads<=40)return sample(10,{...idle,idle:false,reasons:['tampa_aberta','pausada']});
  return sample(submittedAt===null?10:11);
 };
 const originalSubmit=h.options.submit;
 h.options.submit=async()=>{submittedAt=ticks;return originalSubmit();};
 assert.equal((await h.monitor.print(h.options)).state,'concluido');
 assert.equal(submittedAt,40,'Submit on the first ready reading, without cooldown');
 assert.equal(h.sent(),1);

 h=harness({reads:[sample(10)]});
 h.monitor.maintenanceRequested=true;
 await assert.rejects(h.monitor.print(h.options),e=>e.maintenance===true);
 assert.equal(h.sent(),0);
 assert.deepEqual([...h.monitor.records.values()][0].reasons,['calibracao_solicitada']);
 h.monitor.maintenanceRequested=false;
 let resumeReads=0;
 h.monitor.read=async()=>sample(resumeReads++===0?10:11);
 assert.equal((await h.monitor.print(h.options)).state,'concluido');
 assert.equal(h.monitor.records.size,1);assert.equal(h.sent(),1);
 console.log('PASS monitor: stable evidence, persistence, restart, blocked media, lost replies, CUPS, foreign jobs and no duplicate submissions');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>directories.forEach(d=>fs.rmSync(d,{recursive:true,force:true})));
