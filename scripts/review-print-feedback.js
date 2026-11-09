'use strict';
const { execFileSync } = require('node:child_process');
const os = require('node:os');
const { PrintFeedbackMonitor, readUsb, cupsJobs, cupsState } = require('../src/services/printFeedbackMonitor');
const [id, action, ...notes] = process.argv.slice(2);
(async () => {
  const running = execFileSync('systemctl', ['show','stockflow','-p','ActiveState','--value'], {encoding:'utf8'}).trim();
  if (['active','activating','deactivating'].includes(running)) {
    throw Error('Pare stockflow.service antes da conferencia; reinicie depois.');
  }
  const monitor = new PrintFeedbackMonitor({recover:false});
  if (!id) {
    console.log(JSON.stringify([...monitor.records.values()].map(r=>({
      id:r.id,state:r.state,reasons:r.reasons,expected:r.expected,printed:r.printed,
      cupsJobId:r.cupsJobId,released:Boolean(r.released)
    })),null,2)); return;
  }
  const record=monitor.records.get(id);
  if (!record) throw Error('Trabalho desconhecido');
  if (!['confirmar','liberar-reimpressao'].includes(action) || notes.join(' ').trim().length<10) {
    throw Error('Uso: node scripts/review-print-feedback.js UUID confirmar|liberar-reimpressao "motivo da conferencia"');
  }
  const snapshot=await readUsb();
  if (!snapshot.status.idle || (await cupsJobs(record.printer,'not-completed')).length) {
    throw Error('Impressora ou fila ainda ocupada; nao e seguro liberar');
  }
  if (record.cupsJobId && !['completed','canceled','aborted'].includes(await cupsState(record.cupsJobId))) {
    throw Error('Trabalho CUPS ainda pendente');
  }
  record.manualReview={user:os.userInfo().username,note:notes.join(' '),at:new Date().toISOString(),action};
  record.released=action==='liberar-reimpressao';
  if(action==='confirmar') record.printed=record.expected;
  monitor.change(record,action==='confirmar'?'concluido':'cancelado',['conferencia_manual']);
  console.log('Conferencia registrada localmente. Reinicie stockflow.service.');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
