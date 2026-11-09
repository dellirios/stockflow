'use strict';
const fs=require('node:fs'),path=require('node:path');
const {readUsb,cupsJobs,cupsState}=require('./printFeedbackMonitor');
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const terminal=['concluido','erro','confirmacao_pendente'];

async function reportCommand(id,state,message){
 if(!uuid.test(id))throw Error('Invalid command identity');
 const response=await fetch('https://stockflow.pro/api/print-agent/commands/'+id,{
  method:'POST',redirect:'error',signal:AbortSignal.timeout(5000),
  headers:{'Content-Type':'application/json',Accept:'application/json',Authorization:'Bearer '+process.env.PRINT_FEEDBACK_TOKEN},
  body:JSON.stringify({state,message}),
 });
 if(!response.ok)throw Error('Calibration API HTTP '+response.status);
 return response.json();
}

class PrinterCalibration{
 constructor({directory,monitor,printer,submit,read=readUsb,jobs=cupsJobs,jobState=cupsState,
  report=reportCommand,wait=ms=>new Promise(r=>setTimeout(r,ms)),now=Date.now,timeoutMs=60000}={}){
  this.directory=directory||path.resolve(__dirname,'../../logs/printer-calibration');
  this.monitor=monitor;this.printer=printer;this.submit=submit;this.read=read;this.jobs=jobs;
  this.jobState=jobState;this.report=report;this.wait=wait;this.now=now;this.timeoutMs=timeoutMs;
  this.records=new Map();fs.mkdirSync(this.directory,{recursive:true,mode:0o700});
  for(const file of fs.readdirSync(this.directory).filter(n=>uuid.test(n.replace(/\.json$/,''))&&n.endsWith('.json'))){
   const r=JSON.parse(fs.readFileSync(path.join(this.directory,file),'utf8'));
   if(!terminal.includes(r.state)){r.state='confirmacao_pendente';r.message='Agente reiniciado durante a calibração. Confira a impressora.';r.reported=false;this.save(r);}
   this.records.set(r.id,r);
  }
 }
 save(r){
  const file=path.join(this.directory,r.id+'.json'),tmp=file+'.tmp';
  const fd=fs.openSync(tmp,'w',0o600);
  try{fs.writeFileSync(fd,JSON.stringify(r)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  fs.renameSync(tmp,file);
  const dir=fs.openSync(this.directory,'r');try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}
 }
 isUncertain(){
  const records=[...this.records.values()].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  for(const record of records){
   if(record.state==='concluido')return false;
   if(record.state==='confirmacao_pendente')return true;
  }
  return false;
 }
 async sync(r){
  const ack=await this.report(r.id,r.state,r.message);
  if(ack.accepted!==true||ack.command_id!==r.id)throw Error('Calibration acknowledgment mismatch');
  r.reported=true;this.save(r);
 }
 async process(commands=[]){
  for(const r of this.records.values()){
   if(terminal.includes(r.state)&&!r.reported){try{await this.sync(r);}catch(e){console.warn('[Calibration]',e.message);}}
  }
  const c=commands[0];
  if(!c)return;
  if(!uuid.test(c.id)||c.type!=='calibrate'||!['aguardando','calibrando'].includes(c.state))throw Error('Invalid printer command');
  if(this.records.has(c.id))return;
  const r={id:c.id,state:'calibrando',message:'Calibrando os sensores da impressora.',reported:false,
   createdAt:new Date(this.now()).toISOString()};
  this.records.set(r.id,r);
  let locked=false,submissionStarted=false;
  try{
   if(c.state!=='aguardando')throw Error('Comando já assumido anteriormente; confira a impressora.');
   if(this.monitor.running||this.monitor.needsReview(this.printer))throw Error('Existe impressão em andamento ou aguardando conferência.');
   this.monitor.running=true;locked=true;
   if((await this.jobs(this.printer,'not-completed')).length)throw Error('Fila de impressão ocupada.');
   const before=await this.read();
   if(before.status.reasons.some(reason=>!['sem_etiqueta','pausada'].includes(reason)) ||
      before.status.formatsPending || before.status.partialFormat || before.status.labelsRemaining) {
      throw Error('Feche a tampa, confira o ribbon e aguarde a impressão terminar antes de calibrar.');
   }
   this.save(r); // Durable claim before any physical action; a lost response never causes replay.
   const claim=await this.report(r.id,'calibrando',r.message);
   if(claim.accepted!==true||claim.command_id!==r.id)throw Error('O servidor não confirmou a calibração.');
   const previous=new Set(await this.jobs(this.printer));
   submissionStarted=true;this.save(r);
   const job=await this.submit('~JC\n');
   if(!job?.jobId||!/^[\w.-]+-\d+$/.test(job.jobId))throw Error('Calibração sem identificador CUPS.');
   r.cupsJobId=job.jobId;this.save(r);
   await this.wait(1500);
   const deadline=this.now()+this.timeoutMs;
   let stable=0;
   while(this.now()<deadline){
    const foreign=(await this.jobs(this.printer)).filter(id=>id!==job.jobId&&!previous.has(id));
    if(foreign.length)throw Error('Outro trabalho foi enviado durante a calibração.');
    const state=await this.jobState(job.jobId);
    if(['canceled','aborted'].includes(state))throw Error('Calibração interrompida pelo CUPS.');
    const snapshot=await this.read();
    stable=state==='completed'&&snapshot.status.idle?stable+1:0;
    if(stable>=2){r.state='concluido';r.message='Rotina de calibração concluída. Confira o alinhamento da próxima etiqueta.';break;}
    await this.wait(500);
   }
   if(r.state!=='concluido')throw Error('Sem confirmação do fim da calibração.');
  }catch(e){
   r.state=submissionStarted||c.state!=='aguardando'?'confirmacao_pendente':'erro';
   r.message=(e.message||'Não foi possível calibrar.').slice(0,255);
  }finally{
   r.reported=false;this.save(r);
   if(locked)this.monitor.running=false;
  }
  try{await this.sync(r);}catch(e){console.warn('[Calibration]',e.message);}
 }
}
module.exports={PrinterCalibration};
