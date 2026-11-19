(function(root) {
  'use strict';
  const encoder = new TextEncoder();
  const escapeXml = value => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;').replace(/\r?\n/g,'</w:t><w:br/><w:t xml:space="preserve">');
  const number = value => value === null ? '' : Number(value).toLocaleString('es-BO',{minimumFractionDigits:2,maximumFractionDigits:2});
  function values(data) {
    const result = Evaluation.calculate(data.personal,data.activities.map(a => a.score));
    const date = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value.split('-').reverse().join('-') : '';
    const resultIndex = ['Insuficiente','Suficiente','Bueno','Excelente'].indexOf(result.result);
    const map = {...data,startDate:date(data.startDate),endDate:date(data.endDate),schedule:`${data.startTime || ''} – ${data.endTime || ''}`,
      personalAverage:number(result.personal),activityAverage:number(result.activities),
      personalWeighted:number(result.personal === null ? null : result.personal*.4),activityWeighted:number(result.activities === null ? null : result.activities*.6),finalScore:number(result.final),
      approved:data.decision === 'aprobado' ? 'X' : '',rejected:data.decision === 'reprobado' ? 'X' : '',
      supervisorSignatures:[data.supervisor,data.manager].filter(Boolean).join('                         ')};
    for(let i=0;i<8;i++) { map[`personal${i}`] = data.personal[i] === '' ? '' : number(data.personal[i]); map[`activityNumber${i}`] = String(i+1); map[`activity${i}`] = data.activities[i].description; map[`activityScore${i}`] = data.activities[i].score === '' ? '' : number(data.activities[i].score); }
    for(let i=0;i<4;i++) map[`result${i}`] = i === resultIndex ? 'X' : '';
    return map;
  }
  function fillXml(xml,data) {
    const map = values(data);
    return xml.replace(/\{\{(\w+)\}\}/g,(_,key) => {
      if(!Object.hasOwn(map,key)) throw new Error(`Campo de plantilla desconocido: ${key}`);
      return escapeXml(map[key]);
    });
  }
  const crcTable = Array.from({length:256},(_,n) => { for(let k=0;k<8;k++) n = n&1 ? 0xedb88320^(n>>>1) : n>>>1; return n>>>0; });
  function crc32(bytes) { let crc = 0xffffffff; for(const byte of bytes) crc = crcTable[(crc^byte)&255]^(crc>>>8); return (crc^0xffffffff)>>>0; }
  // Standard ZIP with stored entries: no CDN, dependencies or server required.
  function zip(entries) {
    const locals = [], centrals = []; let offset = 0, centralSize = 0;
    for(const entry of entries) {
      const name = encoder.encode(entry.name), bytes = entry.bytes, crc = crc32(bytes);
      const local = new Uint8Array(30+name.length), l = new DataView(local.buffer);
      l.setUint32(0,0x04034b50,true); l.setUint16(4,20,true); l.setUint16(6,0x800,true); l.setUint16(12,33,true);
      l.setUint32(14,crc,true); l.setUint32(18,bytes.length,true); l.setUint32(22,bytes.length,true); l.setUint16(26,name.length,true); local.set(name,30);
      const central = new Uint8Array(46+name.length), c = new DataView(central.buffer);
      c.setUint32(0,0x02014b50,true); c.setUint16(4,20,true); c.setUint16(6,20,true); c.setUint16(8,0x800,true); c.setUint16(14,33,true);
      c.setUint32(16,crc,true); c.setUint32(20,bytes.length,true); c.setUint32(24,bytes.length,true); c.setUint16(28,name.length,true); c.setUint32(42,offset,true); central.set(name,46);
      locals.push(local,bytes); centrals.push(central); offset += local.length+bytes.length; centralSize += central.length;
    }
    const end = new Uint8Array(22), e = new DataView(end.buffer);
    e.setUint32(0,0x06054b50,true); e.setUint16(8,entries.length,true); e.setUint16(10,entries.length,true); e.setUint32(12,centralSize,true); e.setUint32(16,offset,true);
    const output = new Uint8Array(offset+centralSize+end.length); let position = 0;
    for(const part of [...locals,...centrals,end]) { output.set(part,position); position += part.length; }
    return output;
  }
  function generate(data, template = root.DOCX_TEMPLATE) {
    if(!template) throw new Error('No se pudo cargar la plantilla de Word. Recarga la página.');
    const entries = template.entries.map(entry => ({name:entry.name,bytes:Uint8Array.from(atob(entry.base64),c=>c.charCodeAt(0))}));
    entries.push({name:'word/document.xml',bytes:encoder.encode(fillXml(template.xml,data))});
    return zip(entries);
  }
  function download(data) {
    const bytes = generate(data), blob = new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = `Evaluacion_${(data.student || 'practicante').replace(/[^\p{L}\p{N} _-]/gu,'').trim().slice(0,80)}.docx`;
    document.body.append(link); link.click(); link.remove(); setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  root.DocxExport = {generate,download,fillXml,values,crc32};
})(globalThis);
