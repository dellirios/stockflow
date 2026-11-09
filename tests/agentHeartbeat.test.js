'use strict';
const assert = require('node:assert/strict');
const { createHeartbeat } = require('../src/services/agentHeartbeat');
(async () => {
 let calls=0;
 const beat=createHeartbeat({token:'fake',now:()=>0,request:async(url,options)=>{
  calls++;assert.equal(url,'https://stockflow.pro/api/print-agent/heartbeat');
  assert.equal(options.headers.Authorization,'Bearer fake');
  assert.equal(options.method,'POST');
  return {ok:true,json:async()=>({accepted:true})};
 }});
 await beat.tick();assert.equal(calls,1);assert.equal(beat.state.last_success_at,'1970-01-01T00:00:00.000Z');
 let resolve;
 const waiting=createHeartbeat({token:'fake',request:()=>new Promise(r=>{resolve=r;})});
 const first=waiting.tick();await waiting.tick();
 resolve({ok:true,json:async()=>({accepted:true})});await first;
 const offline=createHeartbeat({token:'fake',request:async()=>{throw Error('offline');}});
 await offline.tick();assert.equal(offline.state.last_error,'offline');assert.equal(offline.state.last_success_at,null);
 let sent=false;
 const legacy=createHeartbeat({request:async()=>{sent=true;}});
 await legacy.tick();assert.equal(sent,false);
 const denied=createHeartbeat({token:'fake',request:async()=>({ok:false,status:401})});
 await denied.tick();assert.equal(denied.state.last_success_at,null);

 const telemetry=createHeartbeat({token:'fake',getPrinter:async()=>({state:'bloqueada',reasons:['sem_etiqueta'],age_seconds:0}),
  request:async(url,options)=>{
   assert.equal(JSON.parse(options.body).printer.state,'bloqueada');
   return {ok:true,json:async()=>({accepted:true})};
 }});
 await telemetry.tick();assert.equal(telemetry.state.last_error,null);
 console.log('PASS heartbeat: authenticated signal, accepted replies, no overlap, failure isolation and legacy disabled');
})().catch(e=>{console.error(e);process.exitCode=1;});
