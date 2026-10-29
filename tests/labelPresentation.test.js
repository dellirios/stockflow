'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { formatWeight, renderLabel, resolveDensity, fitText } = require('../src/services/labelPresentation');
const sample = require('./fixtures/geleia.json');
const printer = { nome: 'Zebra ZD220', dpi: 203, dpmm: 8 };
const decode = zpl => zpl.replace(/_([0-9A-F]{2})/g, (_,h) => String.fromCharCode(parseInt(h,16)));
const cases = [
 ['400.00000000','g','400 g'], ['1.00000000','kg','1 kg'],
 ['2.65000000','kg','2,65 kg'], ['0.50000000','kg','0,5 kg'],
 ['1500.00000000','g','1.500 g'], ['750.00000000','ml','750 ml'],
 ['1.25000000','L','1,25 L'], ['12.00000000','un','12 un'],
 ['0.00000000','g','0 g'], ['12345678901234567890.1234567890123000','g','12.345.678.901.234.567.890,1234567890123 g'],
 ['0.000000000000000001','kg','0,000000000000000001 kg'],
 [2.65,'kg','2,65 kg'], [1e-7,'L','0,0000001 L'],
 ['2.65e3','g','2.650 g'], ['2,6500','kg','2,65 kg']
];
for (const [value,unit,expected] of cases) test('formata '+value+' '+unit, () => assert.equal(formatWeight(value,unit),expected));
for (const value of [null,undefined,'','abc','400g',NaN,Infinity,{},true,'1.2.3','-2','1,234.56']) {
 test('peso inválido '+String(value), () => assert.equal(formatWeight(value,'g'),'Não informado'));
}
test('unidade ausente não inventa unidade', () => assert.equal(formatWeight('400',null),'400'));
test('não converte unidade ou arredonda', () => assert.equal(formatWeight('1500.000000000001','g'),'1.500,000000000001 g'));
test('não altera payload e utiliza peso original', () => {
 const value = { ...sample, quantidade:17, initial_quantity:'17', quantidade_disponivel:'200', cost_basis_quantity:'1' };
 const before=structuredClone(value);
 const label=renderLabel(value,printer);
 assert.deepEqual(value,before);
 assert.ok(label.zpl.includes('400 g'));
 assert.ok(!label.zpl.includes('200 g'));
});
test('não usa saldo/embalagens quando peso está ausente', () => {
 const label=renderLabel({...sample,peso:null},printer);
 assert.equal(label.fields.filter(f=>f.key==='peso').map(f=>f.text).join(' '),'Não informado');
 assert.ok(!label.zpl.includes('400 g'));
});
for (const [dpi,dpmm,size] of [[203,8,480],[300,12,720],[600,24,1440]]) test('60 mm a '+dpi+' dpi', () => {
 const label=renderLabel(sample,{dpi,dpmm});
 assert.equal(label.widthDots,size); assert.equal(label.heightDots,size);
 assert.equal(label.dpmm,dpmm);
 assert.ok(label.zpl.includes('^PW'+size)); assert.ok(label.zpl.includes('^LL'+size));
 for (const box of label.boxes) {
   assert.ok(box.x>=2*dpmm && box.y>=1.5*dpmm, JSON.stringify(box));
   assert.ok(box.x+box.width<=58*dpmm, JSON.stringify(box));
   assert.ok(box.y+box.height<=59*dpmm, JSON.stringify(box));
 }
});
test('perfil desconhecido não presume densidade', () => assert.throws(()=>resolveDensity({nome:'Impressora desconhecida'}),/resolu|densidade/i));
test('modelo ZD220 resolve densidade real',()=>assert.equal(resolveDensity({nome:'Zebra ZD220'}),8));
test('rejeita configuração contraditória ou não suportada',()=>{
 for (const p of [{dpi:300,dpmm:8},{dpi:999},{dpmm:9}]) assert.throws(()=>resolveDensity(p),/resolu|densidade|perfil/i);
});
test('nomes longos quebram sem apagar conteúdo', () => {
 const long = { ...sample, nome:'Geleia Artesanal de Frutas Vermelhas Selecionadas',
 fornecedor:'Cooperativa Regional de Alimentos Artesanais',
 nm_empresa:'Restaurante e Gastronomia Artesanal Exemplo' };
 const label=renderLabel(long,printer);
 for(const key of ['nome','fornecedor','nm_empresa']) {
  const text=label.fields.filter(f=>f.key===key).map(f=>f.text).join(' ');
  assert.equal(text,long[key]);
 }
});
test('palavra longa quebra sem truncar',()=>{
 const text='ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZ';
 const fit=fitText(text,{width:448,height:60,maxLines:2,font:30,minFont:20,key:'nome'});
 assert.equal(fit.lines.join(''),text);
});
test('texto impossível informa campo em vez de cortar',()=>assert.throws(()=>renderLabel({...sample,nome:'PRODUTO '.repeat(100)},printer),/nome.*60|nome.*cabe|nome.*limite/i));
test('campos opcionais ausentes são seguros',()=>{
 const label=renderLabel({nome:'Produto',peso:'1',unidade_medida:'kg',id_produto:'001'},printer);
 assert.ok(!/undefined|null|NaN|\{[a-z_]+\}/.test(label.zpl));
});
test('QR e código de retirada preservam identificador',()=>{
 const label=renderLabel(sample,printer);
 assert.equal(label.qr.payload,sample.id_produto);
 assert.ok(label.zpl.includes('^FDQA,'+sample.id_produto+'^FS'));
 assert.ok(label.fields.some(f=>f.key==='id_produto'&&f.text===sample.id_produto));
 assert.equal(label.qr.quietModules,4);
 assert.ok(label.qr.moduleDots>=3);
});
test('id inválido ou longo não gera QR errado',()=>{
 for (const id of ['',null,'A'.repeat(200),'id\nmalicioso']) assert.throws(()=>renderLabel({...sample,id_produto:id},printer),/identificador|QR|retirada/i);
});
test('escape de comandos preserva dados sem injetar ZPL',()=>{
 const label=renderLabel({...sample,nome:'A^XZ~JA_B'},printer);
 assert.ok(label.zpl.includes('A_5EXZ_7EJA_5FB'));
 assert.equal((label.zpl.match(/\^XZ/g)||[]).length,1);
});
test('isola todos os campos entre duas empresas',()=>{
 const a={...sample,store_key:'A',nm_empresa:'Empresa Alfa',cnpj:'11.111.111/1111-11',id_produto:'ALFA-01',fornecedor:'Fornecedor Alfa',responsavel_entrada:'Pessoa Alfa',grupo:'Grupo Alfa',armazenado:'Local Alfa'};
 const b={...sample,store_key:'B',nm_empresa:'Empresa Beta',cnpj:'22.222.222/2222-22',id_produto:'BETA-02',fornecedor:'Fornecedor Beta',responsavel_entrada:'Pessoa Beta',grupo:'Grupo Beta',armazenado:'Local Beta',peso:'2.65',unidade_medida:'kg'};
 const za=renderLabel(a,printer).zpl, zb=renderLabel(b,printer).zpl;
 assert.ok(za.includes('Empresa Alfa')); assert.ok(!zb.includes('Alfa'));
 assert.ok(zb.includes('Empresa Beta')); assert.ok(!za.includes('Beta'));
 assert.ok(zb.includes('2,65 kg')); assert.ok(za.includes('400 g'));
});
test('caixas de dados não se sobrepõem',()=>{
 const label=renderLabel(sample,printer);
 for(let i=0;i<label.boxes.length;i++) for(let j=i+1;j<label.boxes.length;j++){
  const a=label.boxes[i],b=label.boxes[j];
  const overlaps=a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
  assert.ok(!overlaps, a.key+' sobrepõe '+b.key);
 }
});
test('não comprime horizontalmente fontes para caber',()=>{
 const zpl=renderLabel(sample,printer).zpl;
 for(const match of zpl.matchAll(/\^A0N,(\d+),(\d+)/g)) assert.ok(Number(match[2])>=0.85*Number(match[1]),match[0]);
});
test('mesmo identificador ASCII de 20 e 29 bytes funciona em todas as densidades',()=>{
 for(const id of ['ABCDEFGHIJKLMNOPQRST','12345678901234567890123456789']) {
  for(const dpmm of [8,12,24]){
   const label=renderLabel({...sample,id_produto:id},{dpmm});
   assert.equal(label.qr.payload,id);
   assert.ok(label.qr.moduleDots/dpmm>=1/3);
  }
 }
});
