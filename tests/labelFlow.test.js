'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs'),path=require('path'),vm=require('vm');
const {EventEmitter}=require('events');
const {PassThrough,Writable}=require('stream');
const sample=require('./fixtures/geleia.json');
function harness(printers) {
 const jobs=[], confirmations=[];
 const config=JSON.stringify({impressoras:printers});
 const originalPath=process.env.PRINTER_SERVICE_PATH;
 const filename=originalPath||path.resolve(__dirname,'../src/services/printerService.js');
 const source=fs.readFileSync(filename,'utf8');
 const localRequire=require('module').createRequire(filename);
 const fakeSpawn=(command,args)=>{
  assert.equal(command,'lp');
  const job={args,zpl:''}; jobs.push(job);
  const child=new EventEmitter(); child.stderr=new PassThrough();
  child.stdin=new Writable({write(chunk,encoding,done){job.zpl+=chunk;done();}});
  child.stdin.on('finish',()=>process.nextTick(()=>child.emit('close',0)));
  child.kill=()=>{};
  return child;
 };
 const logger=new Proxy({}, {get:()=>()=>{}});
 const fakeRequire=id=>{
  if(id==='child_process')return {spawn:fakeSpawn};
  if(id==='axios')return {post:async(url,body)=>{confirmations.push(body);return {data:{success:true}};}};
  if(id==='fs/promises')return {...require('fs/promises'),readFile:async()=>config};
  if(id==='fs')return {...fs,watchFile:()=>{},readFileSync:()=>config};
  if(id==='../utils/logger')return {logger};
  if(id==='dotenv')return {config:()=>{}};
  return localRequire(id);
 };
 const context={module:{exports:{}},require:fakeRequire,__dirname:path.dirname(filename),console:{log(){},warn(){},error(){}},
 process:{env:{ALLOWED_STORE_KEYS:'A,B',NODE_ENV:'production'},nextTick:process.nextTick.bind(process)},
 Buffer,setTimeout,clearTimeout,setInterval:()=>({unref(){}})};
 vm.runInNewContext(source,context,{filename});
 return {service:context.module.exports,jobs,confirmations};
}
const printers=[
 {id:'A',nome:'Printer A',ativo:true,dpi:203,dpmm:8},
 {id:'B',nome:'Printer B',ativo:true,dpi:300,dpmm:12}
];
test('fluxo real preserva perfil, empresa, cópias e confirmação',async()=>{
 const h=harness(printers);
 const payload={data:[
  {...sample,store_key:'A',nm_empresa:'Empresa Alfa',cnpj:'11.111.111/1111-11',id_produto:'ALFA-01',etiquetas:2},
  {...sample,store_key:'B',nm_empresa:'Empresa Beta',cnpj:'22.222.222/2222-22',id_produto:'BETA-01',peso:'2.65000000',unidade_medida:'kg'},
  {...sample,store_key:'OUTRA',id_produto:'BLOQUEADA'}
 ]};
 const before=JSON.stringify(payload);
 const result=await h.service.imprimirEtiquetas(payload);
 assert.equal(result.length,2);
 assert.ok(result.every(item=>item.status==='impresso'));
 assert.equal(JSON.stringify(payload),before);
 assert.equal(h.jobs.length,2);
 const a=h.jobs.find(job=>job.args.includes('Printer A'));
 const b=h.jobs.find(job=>job.args.includes('Printer B'));
 assert.ok(a.zpl.includes('^PW480'));assert.ok(b.zpl.includes('^PW720'));
 assert.ok(a.zpl.includes('400 g'));assert.ok(b.zpl.includes('2,65 kg'));
 assert.ok(a.zpl.includes('^PQ2,0,1,Y'));assert.ok(b.zpl.includes('^PQ1,0,1,Y'));
 assert.ok(!a.zpl.includes('Beta'));assert.ok(!b.zpl.includes('Alfa'));
 assert.deepEqual(h.confirmations.map(c=>c.id_produto).sort(),['ALFA-01','BETA-01']);
});
test('overflow não imprime e não confirma rastreabilidade falsa',async()=>{
 const h=harness(printers);
 const result=await h.service.imprimirEtiquetas({data:[{...sample,store_key:'A',nome:'X'.repeat(2000)}]});
 assert.equal(h.jobs.length,0);assert.equal(h.confirmations.length,0);
 assert.equal(result[0].status,'erro');
});
test('impressora sem resolução não dispara fallback em outra empresa',async()=>{
 const h=harness([{id:'A',nome:'Desconhecida',ativo:true}]);
 const result=await h.service.imprimirEtiquetas({data:[{...sample,store_key:'A'}]});
 assert.equal(h.jobs.length,0);assert.equal(h.confirmations.length,0);
 assert.equal(result[0].status,'erro');
});
