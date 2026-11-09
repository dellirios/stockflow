'use strict';
const assert=require('node:assert/strict');
const {createPrinterTelemetry,snapshotTelemetry}=require('../src/services/printerTelemetry');
(async()=>{
 assert.equal(snapshotTelemetry({status:{idle:true,reasons:[]}}).state,'pronta');
 assert.equal(snapshotTelemetry({status:{idle:false,reasons:['tampa_aberta']}}).state,'bloqueada');
 let reads=0;
 const active=createPrinterTelemetry({activity:()=>({state:'imprimindo',reasons:[],age_seconds:0}),read:async()=>{reads++;}});
 assert.equal((await active()).state,'imprimindo');assert.equal(reads,0);
 const disconnected=createPrinterTelemetry({read:async()=>{throw {stderr:'Zebra configurada desconectada ou identificacao ambigua'};}});
 assert.equal((await disconnected()).state,'desconectada');
 const busy=createPrinterTelemetry({read:async()=>null});
 assert.equal((await busy()).state,'indisponivel');
 console.log('PASS printer telemetry: ready, blocked, active without USB contention and disconnected');
})().catch(e=>{console.error(e);process.exitCode=1;});
