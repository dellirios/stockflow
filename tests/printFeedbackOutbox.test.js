'use strict';
const assert = require('node:assert/strict');
const { deliverOutbox } = require('../src/services/printFeedbackOutbox');
(async()=>{
 const record={id:'attempt1',printer:'Zebra',expected:1,items:[{id_produto:'123',store_key:'TEST'}],
  events:[{sequence:1,state:'enviado',printed:0,reasons:[],at:'2026-11-09T00:00:00Z'},
    {sequence:2,state:'concluido',printed:1,reasons:[],at:'2026-11-09T00:00:01Z'}]};
 let saves=0,sent=[];
 const monitor={records:new Map([[record.id,record]]),save:()=>{saves++;}};
 const request=async(url,options)=>{
  const e=JSON.parse(options.body);sent.push(e.event_id);
  assert.equal(options.headers.Authorization,'Bearer fake');
  return {ok:true,json:async()=>({accepted:true,event_id:e.event_id})};
 };
 const config={url:'https://stockflow.pro/api/print-agent/events',token:'fake',request};
 await deliverOutbox(monitor,config);
 assert.deepEqual(sent,['attempt1:1','attempt1:2']);assert.equal(saves,2);
 await deliverOutbox(monitor,config);assert.equal(sent.length,2);
 await assert.rejects(deliverOutbox(monitor,{...config,url:'https://stockflow.pro/status.php'}),/nao autorizado/);
 record.ackedSequence=0;
 await assert.rejects(deliverOutbox(monitor,{...config,request:async()=>({ok:false,status:503})}));
 assert.equal(record.ackedSequence,0);
 await assert.rejects(deliverOutbox(monitor,{...config,request:async()=>({ok:true,json:async()=>({accepted:true,event_id:'wrong'})})}));
 assert.equal(record.ackedSequence,0);
 record.released=true;
 record.ackedSequence=1;
 sent=[];
 await deliverOutbox(monitor,config);
 assert.deepEqual(sent,['attempt1:2'],'Manual cancellation/release events must still reach the server');
 console.log('PASS durable outbox: ordered delivery, matching acknowledgments, retries and legacy endpoint rejected');
})().catch(e=>{console.error(e);process.exitCode=1;});
