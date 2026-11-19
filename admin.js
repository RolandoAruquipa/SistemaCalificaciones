'use strict';
const $ = selector => document.querySelector(selector);
const config = window.APP_CONFIG || {};
let session = null, rows = [], page = 0, hasMore = false, selected = null, loading = false;
const PAGE_SIZE = 25;
const message = text => $('#adminMessage').textContent = text;
function clearAccess() {
  session = null; rows = []; selected = null; page = 0;
  $('#inboxList').replaceChildren(); $('#responseData').replaceChildren();
  $('#responseDialog').close(); $('#inbox').hidden = true; $('#adminLogin').hidden = false;
  $('#adminPassword').value = ''; $('#adminAccount').textContent = '';
}
async function request(path, options = {}, token = session?.access_token) {
  if(!config.supabaseUrl || !config.supabasePublishableKey) throw new Error('Primero debemos configurar Supabase para activar la recepción de respuestas.');
  if(session && Date.now() >= session.expiresAt) { clearAccess(); throw new Error('Tu sesión venció. Inicia sesión nuevamente.'); }
  const response = await fetch(`${config.supabaseUrl.replace(/\/$/,'')}${path}`,{...options,headers:{apikey:config.supabasePublishableKey,'Content-Type':'application/json',...(token ? {Authorization:`Bearer ${token}`} : {}),...options.headers}});
  const data = await response.json().catch(()=>null);
  if(!response.ok) { if(response.status === 401) clearAccess(); throw new Error(data?.message || data?.msg || data?.error_description || 'No se pudo completar la solicitud.'); }
  return data;
}
async function run(action) {
  if(loading) return; loading = true;
  document.querySelectorAll('button').forEach(b=>b.disabled = true);
  try { await action(); } catch(error) { message(error.message || 'No se pudo conectar. Inténtalo nuevamente.'); }
  finally { loading = false; document.querySelectorAll('button').forEach(b=>b.disabled = false); $('#inboxPrevious').disabled = page === 0; $('#inboxNext').disabled = !hasMore; }
}
function render() {
  const query = $('#inboxSearch').value.toLocaleLowerCase('es');
  const matches = rows.filter(r=>`${r.student} ${r.company}`.toLocaleLowerCase('es').includes(query));
  const list = $('#inboxList'); list.replaceChildren();
  $('#inboxCount').textContent = `${matches.length} respuestas en esta página. Ordenadas de más reciente a más antigua.`;
  $('#inboxPage').textContent = `Página ${page+1}`;
  if(!matches.length) { const p=document.createElement('p'); p.className='empty'; p.textContent=query ? 'No hay coincidencias en esta página.' : 'Todavía no se han recibido evaluaciones.'; list.append(p); }
  for(const row of matches) {
    const item=document.createElement('div'); item.className='history-row';
    const info=document.createElement('div'), name=document.createElement('strong'), detail=document.createElement('small');
    name.textContent=row.student; detail.textContent=`${row.company} · Recibida: ${new Date(row.submitted_at).toLocaleString('es-BO')} · Nota: ${Number(row.final_score).toFixed(2)}`;
    info.append(name,detail);
    const view=document.createElement('button'); view.type='button'; view.className='button'; view.textContent='Ver respuestas'; view.addEventListener('click',()=>showResponse(row));
    const download=document.createElement('button'); download.type='button'; download.className='button'; download.textContent='Descargar Word'; download.addEventListener('click',()=>downloadWord(row));
    const pdf=document.createElement('button'); pdf.type='button'; pdf.className='button'; pdf.textContent='Guardar en PDF'; pdf.addEventListener('click',()=>printResponse(row));
    item.append(info,view,download,pdf); list.append(item);
  }
}
async function loadPage(target = page) {
  const offset=target*PAGE_SIZE;
  const data=await request(`/rest/v1/evaluation_submissions?select=id,student,company,final_score,submitted_at,data&order=submitted_at.desc,id.desc&limit=${PAGE_SIZE+1}&offset=${offset}`);
  if(!Array.isArray(data)) throw new Error('Respuesta de la bandeja no válida.');
  rows=data.slice(0,PAGE_SIZE); hasMore=data.length>PAGE_SIZE; page=target; selected=null;
  $('#inboxSearch').value=''; render(); message('Bandeja actualizada.');
}
function downloadWord(row) {
  try { if(!session || Date.now() >= session.expiresAt) { clearAccess(); throw new Error('Inicia sesión nuevamente.'); } DocxExport.download(row.data); }
  catch(error) { message(error.message); }
}
function printResponse(row) {
  if(!session || Date.now() >= session.expiresAt) { clearAccess(); message('Inicia sesi?n nuevamente.'); return; }
  if(!$('#responseDialog').open || selected !== row) showResponse(row);
  window.print();
}
function showResponse(row) {
  if(!session || Date.now() >= session.expiresAt) { clearAccess(); message('Inicia sesi?n nuevamente.'); return; }
  selected=row; const list=$('#responseData'); list.replaceChildren();
  const add=(label,value)=>{const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=String(value || 'Sin completar');list.append(dt,dd);};
  const labels={student:'Practicante',company:'Institución',companyPhone:'Teléfono de la institución',department:'Unidad o dirección',supervisor:'Supervisor',supervisorPhone:'Celular del supervisor',startDate:'Fecha de inicio',endDate:'Fecha de finalización',startTime:'Ingreso',endTime:'Salida',comments:'Comentarios',manager:'Jefe inmediato superior',teacher:'Docente',decision:'Decisión docente'};
  add('Código de recepción',row.id);add('Fecha de recepción',new Date(row.submitted_at).toLocaleString('es-BO'));
  for(const [key,label] of Object.entries(labels)) add(label,row.data[key]);
  Evaluation.criteria.forEach(([title],i)=>add(title,`${row.data.personal[i]} / 100`));
  row.data.activities.forEach((a,i)=>add(`Actividad ${i+1}`,`${a.description} · ${a.score} / 100`));
  const result=Evaluation.calculate(row.data.personal,row.data.activities.map(a=>a.score));
  add('Promedio personal',result.personal.toFixed(2));add('Promedio de actividades',result.activities.toFixed(2));add('Nota final',Number(row.final_score).toFixed(2));add('Resultado',result.result);
  $('#responseDialog').showModal();
}
$('#adminLoginForm').addEventListener('submit',event=>{event.preventDefault();return run(async()=>{
  message('Comprobando acceso…');
  const auth=await request('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:$('#adminEmail').value,password:$('#adminPassword').value})},null);
  $('#adminPassword').value='';
  session={...auth,expiresAt:Date.now()+auth.expires_in*1000};
  try {
    const access=await request('/rest/v1/evaluation_admins?select=user_id&limit=1');
    if(!access?.length) throw new Error('Esta cuenta no tiene permiso para ver las evaluaciones recibidas.');
    await loadPage(0); $('#adminAccount').textContent=auth.user.email; $('#adminLogin').hidden=true; $('#inbox').hidden=false;
  } catch(error) { clearAccess(); throw error; }
});});
$('#refreshInbox').addEventListener('click',()=>run(()=>loadPage(0)));
$('#inboxPrevious').addEventListener('click',()=>run(()=>loadPage(Math.max(0,page-1))));
$('#inboxNext').addEventListener('click',()=>run(()=>loadPage(page+1)));
$('#inboxSearch').addEventListener('input',render);
$('#adminLogout').addEventListener('click',()=>run(async()=>{try{if(session)await request('/auth/v1/logout',{method:'POST'});}finally{clearAccess();message('Sesión cerrada en este navegador.');}}));
$('#closeResponse').addEventListener('click',()=>$('#responseDialog').close());
$('#printResponse').addEventListener('click',()=>{if(selected)printResponse(selected);});
$('#downloadResponse').addEventListener('click',()=>{if(selected)downloadWord(selected);});
if(!config.supabaseUrl || !config.supabasePublishableKey) message('La bandeja estará disponible cuando conectemos Supabase.');
