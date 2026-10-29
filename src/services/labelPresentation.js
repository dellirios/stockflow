'use strict';

// Presentation only: quantities, units and API objects are never changed.
const INVALID_WEIGHT = 'Não informado';
const DPI_PROFILES = new Map([[203,8],[203.2,8],[300,12],[304.8,12],[600,24],[609.6,24]]);
function resolveDensity(printer = {}) {
  const hasDpi = printer.dpi !== undefined && printer.dpi !== null;
  const hasDpmm = printer.dpmm !== undefined && printer.dpmm !== null;
  const dpiDensity = hasDpi ? DPI_PROFILES.get(Number(printer.dpi)) : undefined;
  const density = hasDpmm ? Number(printer.dpmm) : dpiDensity;
  if ((hasDpi && !dpiDensity) || (hasDpmm && ![8,12,24].includes(density)) ||
      (hasDpi && hasDpmm && density !== dpiDensity)) {
    throw new Error('Perfil de resolução/densidade inválido ou contraditório');
  }
  if (density) return density;
  if (/ZD220/i.test(printer.nome || printer.impressora || '')) return 8;
  throw new Error('Configure a resolução da impressora (dpi ou dpmm)');
}
function formatWeight(value, unit) {
  if (!['string','number','bigint'].includes(typeof value) ||
      (typeof value === 'number' && (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))))) {
    return INVALID_WEIGHT;
  }
  const input = String(value).trim();
  if (input.length > 2048) return INVALID_WEIGHT;
  const match = /^([+]?)(\d+)(?:[.,](\d+))?(?:[eE]([+-]?\d+))?$/.exec(input);
  if (!match) return INVALID_WEIGHT;
  const exponent = Number(match[4] || 0);
  if (!Number.isInteger(exponent) || Math.abs(exponent) > 1000) return INVALID_WEIGHT;
  const digits = match[2] + (match[3] || '');
  const point = match[2].length + exponent;
  let whole, fraction;
  if (point <= 0) {
    whole = '0';
    fraction = '0'.repeat(-point) + digits;
  } else if (point >= digits.length) {
    whole = digits + '0'.repeat(point - digits.length);
    fraction = '';
  } else {
    whole = digits.slice(0, point);
    fraction = digits.slice(point);
  }
  whole = whole.replace(/^0+(?=\d)/, '');
  fraction = fraction.replace(/0+$/, '');
  const number = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (fraction ? ',' + fraction : '');
  const suffix = typeof unit === 'string' ? unit.trim() : '';
  return number + (suffix ? ' ' + suffix : '');
}
function cleanText(value, fallback = '-') {
  if (value === null || value === undefined || value === '') return fallback;
  if (!['string','number','bigint'].includes(typeof value)) return fallback;
  return String(value).replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim() || fallback;
}
function escapeZpl(value) {
  return Array.from(Buffer.from(String(value),'utf8'), byte =>
    byte >= 32 && byte <= 126 && ![94,126,95].includes(byte)
      ? String.fromCharCode(byte)
      : '_' + byte.toString(16).toUpperCase().padStart(2,'0')).join('');
}
// Conservative advance estimates for resident proportional Zebra font 0.
// Font width remains natural (equal to height); no horizontal compression.
function textWidth(text, fontWidth) {
  let units=0;
  for (const char of Array.from(text)) {
    const base=char.normalize('NFD')[0];
    if (base===' ') units+=0.4;
    else if ('ilIjtrf.,:;!|'.includes(base)) units+=0.4;
    else if ('MW@%'.includes(base)) units+=1;
    else if ('mw'.includes(base)) units+=0.9;
    else if (/[A-Z]/.test(base)) units+=0.8;
    else if (base==='/') units+=0.35;
    else if (/[0-9]/.test(base)) units+=0.6;
    else if (/[a-z]/.test(base)) units+=0.65;
    else units+=1;
  }
  return Math.ceil(units*fontWidth)+2;
}
function wrap(text, width, fontWidth) {
  const lines = [];
  let current = '';
  for (const word of text.split(' ')) {
    if (current && textWidth(current+' '+word,fontWidth)<=width) {
      current+=' '+word;
      continue;
    }
    if (current) { lines.push(current); current=''; }
    for (const char of Array.from(word)) {
      if (current && textWidth(current+char,fontWidth)>width) {
        lines.push(current);
        current='';
      }
      current+=char;
    }
  }
  if (current) lines.push(current);
  return lines;
}
function fitText(value, options) {
  const { width,height,maxLines,font,minFont,key = 'texto' } = options;
  const text = cleanText(value);
  for (let size = font; size >= minFont; size--) {
    const fontWidth = Math.max(1,size);
    const capacity = Math.floor(width/fontWidth);
    if (capacity < 1) continue;
    const lines = wrap(text,width,fontWidth);
    const lineHeight = size + 1;
    if (lines.length <= maxLines && (lines.length-1)*lineHeight+size <= height) {
      return {lines,font:size,fontWidth,lineHeight};
    }
  }
  throw new Error('Campo '+key+' excede o espaço legível da etiqueta 60x60 mm; revise o conteúdo');
}
function dateParts(value, withTime = false) {
  if (!value) return ['-'];
  const raw = cleanText(value);
  const br = /^(\d{2}\/\d{2}\/\d{4})(?:\s+(\d{2}:\d{2}))?/.exec(raw);
  if (br) return withTime && br[2] ? [br[1],br[2]] : [br[1]];
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return [raw];
  const pad = n=>String(n).padStart(2,'0');
  const formatted = pad(date.getDate())+'/'+pad(date.getMonth()+1)+'/'+date.getFullYear();
  return withTime ? [formatted,pad(date.getHours())+':'+pad(date.getMinutes())] : [formatted];
}
function qrProfile(id, dpmm) {
  if (!['string','number','bigint'].includes(typeof id) ||
      (typeof id==='number' && (!Number.isSafeInteger(id) || id<0))) {
    throw new Error('Identificador de retirada/QR ausente ou inválido');
  }
  const payload = String(id);
  if (!payload || /[\s\u0000-\u001f\u007f]/.test(payload)) throw new Error('Identificador de retirada/QR inválido');
  // Conservative byte-mode Q capacities; reserve UTF-8 ECI overhead.
  const length = Buffer.byteLength(payload,'utf8')+(/[^\x00-\x7F]/.test(payload)?3:0);
  const capacities = [11,20,32,46,60,74,86,108,130];
  const index = capacities.findIndex(capacity=>length<=capacity);
  if (index<0) throw new Error('Identificador QR excede o limite físico de 60x60 mm');
  const modules = 21+4*index;
  const quietModules = 4;
  const region = 14*dpmm;
  const moduleDots = Math.min(10,Math.round(0.375*dpmm),Math.floor(region/(modules+8)));
  if (moduleDots < Math.ceil(dpmm/3)) throw new Error('Identificador QR longo para leitura segura em 60x60 mm');
  const size = (modules+8)*moduleDots;
  return {payload,modules,quietModules,moduleDots,size,x:39.5*dpmm,y:58*dpmm-size};
}
function renderLabel(etiqueta, printer = {}) {
  if (!etiqueta || typeof etiqueta !== 'object') throw new Error('Dados de etiqueta inválidos');
  const dpmm = resolveDensity(printer);
  const scale = dpmm/8;
  const d = n=>Math.round(n*scale);
  const qr = qrProfile(etiqueta.id_produto,dpmm);
  const fields = [], boxes = [];
  const commands = ['^XA','^MMT','^PW'+60*dpmm,'^LL'+60*dpmm,'^LH0,0','^LT0','^LS0','^PON','^PMN','^CI28','^MD0','~SD20'];
  function text(key,value,x,y,width,height,font,minFont=font,maxLines=1,align='L') {
    const fit = fitText(value,{width,height,font,minFont,maxLines,key});
    fit.lines.forEach((line,index)=>{
      const top = y+index*fit.lineHeight;
      const measured = textWidth(line,fit.fontWidth);
      const left = align==='R' ? x+width-measured : x;
      const field = {key,text:line,x:align==='R'?d(x+width)-d(measured):d(left),y:d(top),width:d(measured),height:d(fit.font)};
      fields.push(field); boxes.push(field);
      const block=align==='R' ? '^FB'+d(width)+',1,0,R' : '';
      commands.push('^FO'+d(align==='R'?x:left)+','+field.y+'^A0N,'+d(fit.font)+','+d(fit.fontWidth)+block+'^FH_^FD'+escapeZpl(line)+'^FS');
    });
  }
  function heading(key,label,x,y,width,align='L',font=13) {
    text(key+'_heading',label,x,y,width,font,font,font,1,align);
  }
  function rule(y,thickness=1) {
    commands.push('^FO0,'+d(y)+'^GB'+d(480)+',0,'+d(thickness)+'^FS');
  }
  // Preserve the original section order, dividers and two-column layout.
  text('nome',etiqueta.nome,16,12,448,50,32,24,2);
  rule(67,3);
  heading('grupo','GRUPO',16,73,216);
  heading('conservacao','CONSERVAÇÃO',248,73,216,'R');
  text('grupo',etiqueta.grupo,16,88,216,20,20,14);
  text('conservacao',etiqueta.conservacao,248,88,216,20,20,14,1,'R');
  rule(113);
  heading('peso','PESO',16,116,216);
  heading('sif_lote','SIF / LOTE',248,116,216,'R');
  text('peso',formatWeight(etiqueta.peso,etiqueta.unidade_medida),16,130,216,24,24,14);
  text('sif_lote',etiqueta.sif_lote,248,132,216,20,19,14,1,'R');
  rule(158,3);
  heading('data_entrada','DATA DE ENTRADA',16,164,280,'L',14);
  heading('validade','VALIDADE',312,164,152,'R',14);
  text('data_entrada',dateParts(etiqueta.data_entrada,true).join(' '),16,179,280,28,28,20);
  text('validade',dateParts(etiqueta.validade)[0],312,179,152,28,28,20,1,'R');
  rule(215,3);
  heading('armazenado','LOCAL ARMAZENADO',16,222,216);
  heading('responsavel_entrada','RESPONSÁVEL',248,222,216,'R');
  text('armazenado',etiqueta.armazenado,16,238,216,20,19,14);
  text('responsavel_entrada',etiqueta.responsavel_entrada,248,238,216,20,18,14,1,'R');
  rule(261);
  heading('fornecedor','FORNECEDOR',16,267,448);
  text('fornecedor',etiqueta.fornecedor,16,282,448,20,18,14);
  text('datas_fornecedor','Val: '+dateParts(etiqueta.val_fornecedor)[0]+'  Fab: '+dateParts(etiqueta.fab_fornecedor)[0],16,304,448,14,13);
  rule(321);
  text('nm_empresa',etiqueta.nm_empresa,16,323,216,28,17,13,2);
  text('cnpj','CNPJ: '+cleanText(etiqueta.cnpj),248,325,216,20,13,12,1,'R');
  rule(352);
  heading('id_produto','CÓDIGO RETIRADA',16,358,280);
  text('id_produto',qr.payload,16,377,280,28,26,14);
  boxes.push({key:'qr',x:qr.x,y:qr.y,width:qr.size,height:qr.size});
  commands.push('^FO'+(qr.x+4*qr.moduleDots)+','+(qr.y+4*qr.moduleDots)+'^BQN,2,'+qr.moduleDots+'^FH_^FDQA,'+escapeZpl(qr.payload)+'^FS');
  commands.push('^PQ1,0,1,Y','^XZ');
  return {zpl:commands.join('\n'),widthDots:60*dpmm,heightDots:60*dpmm,dpmm,fields,boxes,qr};
}
module.exports = {formatWeight,renderLabel,resolveDensity,fitText,escapeZpl,dateParts};
