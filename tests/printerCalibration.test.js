'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const { PrinterCalibration }=require('../src/services/printerCalibration');
const idle={status:{idle:true,reasons:[]},counter:5};
const command={id:'0d6acb38-ea10-447d-8c48-d180695f7aa7',type:'calibrate',state:'aguardando'};
let dirs=[];
function harness({read=async()=>idle,jobs=async()=>[],busy=()=>false,state=async()=>'completed'}={}){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sf-cal-'));dirs.push(directory);
 let now=0,sent=0;const reports=[];
 const monitor={running:false,needsReview:busy};
 const instance=new PrinterCalibration({directory,monitor,printer:'Zebra_Test',read,jobs,jobState:state,
   submit:async payload=>{assert.equal(payload,'~JC\n');sent++;return{jobId:'Zebra_Test-1'};},
   report:async(id,status,message)=>{reports.push(status);return {accepted:true,command_id:id};},
   wait:async ms=>{now+=ms;},now:()=>now,timeoutMs:5000});
 return {instance,sent:()=>sent,reports};
}
(async()=>{
 let h=harness();await h.instance.process([command]);
 assert.equal(h.sent(),1);assert.deepEqual(h.reports,['calibrando','concluido']);
 await h.instance.process([command]);assert.equal(h.sent(),1);
 h=harness({read:async()=>({status:{idle:false,reasons:['tampa_aberta']},counter:5})});
 await h.instance.process([command]);assert.equal(h.sent(),0);assert.equal(h.reports.at(-1),'erro');
 h=harness({read:async()=>({status:{idle:false,reasons:['tampa_aberta']},counter:5})});
 await h.instance.process([command]);assert.equal(h.sent(),0);
 h=harness({jobs:async()=>['Zebra_Test-2']});
 await h.instance.process([command]);assert.equal(h.sent(),0);
 h=harness({busy:()=>true});await h.instance.process([command]);assert.equal(h.sent(),0);
 h=harness({state:async()=>'processing'});await h.instance.process([command]);
 assert.equal(h.sent(),1);assert.equal(h.reports.at(-1),'confirmacao_pendente');
 assert.equal(h.instance.isUncertain(),true);
 h=harness();h.instance.report=async()=>{throw Error('API unavailable');};
 await h.instance.process([command]);assert.equal(h.sent(),0);
 h=harness();h.instance.submit=async()=>{throw Error('lost CUPS reply');};
 await h.instance.process([command]);assert.equal(h.reports.at(-1),'confirmacao_pendente');
 h=harness();
 fs.writeFileSync(path.join(h.instance.directory,command.id+'.json'),JSON.stringify({id:command.id,state:'calibrando',createdAt:'2026-11-09T00:00:00Z',reported:false}));
 const recovered=new PrinterCalibration({directory:h.instance.directory,monitor:{running:false,needsReview:()=>false},
  report:async(id,state)=>{assert.equal(state,'confirmacao_pendente');return{accepted:true,command_id:id};}});
 await recovered.process([command]);assert.equal(h.sent(),0);assert.equal(recovered.isUncertain(),true);
 console.log('PASS calibration: single ~JC, two stable readings, busy protection, failed claims, uncertain sends, restart and no replay');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>dirs.forEach(d=>fs.rmSync(d,{recursive:true,force:true})));
