'use strict';

function snapshotTelemetry(snapshot, ageSeconds=0) {
  return {state:snapshot.status.idle?'pronta':'bloqueada',reasons:snapshot.status.reasons,
    age_seconds:Math.min(86400,Math.max(0,ageSeconds))};
}
function createPrinterTelemetry({read,activity=()=>null}){
 return async()=>{
  const current=activity();
  if(current)return current;
  try{
   const snapshot=await read();
   return snapshot?snapshotTelemetry(snapshot):{state:'indisponivel',reasons:[],age_seconds:0};
  }catch(error){
   const disconnected=String(error.stderr||error.message).includes('desconectada ou identificacao ambigua');
   return {state:disconnected?'desconectada':'indisponivel',reasons:disconnected?[]:['falha_comunicacao'],age_seconds:0};
  }
 };
}
module.exports={createPrinterTelemetry,snapshotTelemetry};
