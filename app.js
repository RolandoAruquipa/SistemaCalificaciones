'use strict';
const $ = selector => document.querySelector(selector);
const form = $('#evaluationForm');
const STORAGE = 'practica.evaluaciones.v1';
const ACTIVE = 'practica.activa.v1';
const fields = ['student','company','companyPhone','department','supervisor','supervisorPhone','startDate','endDate','startTime','endTime','comments','manager','teacher','decision'];
let records = [], currentId = crypto.randomUUID(), currentStatus = 'draft', session = null, timer, toastTimer;
let delivery = null, sending = false;
let currentStep = 0;
const stepNames = ['Identificación','Características personales','Actividades y proyecto','Comentarios y cierre','Revisar y generar'];
let stepSections = [];
const config = window.APP_CONFIG || {};
const cloudEnabled = Boolean(config.supabaseUrl && config.supabasePublishableKey);
const fmt = n => n === null ? '—' : n.toLocaleString('es-BO', {minimumFractionDigits:2,maximumFractionDigits:2});
function notify(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').hidden = true, 4500); }
function readStorage() {
  try { const data = JSON.parse(localStorage.getItem(STORAGE) || '[]'); records = Array.isArray(data) ? data.filter(validRecord) : []; }
  catch { records = []; notify('No se pudo leer el almacenamiento local.'); }
}
function validRecord(r) {
  return r && typeof r.id === 'string' && r.data && typeof r.data === 'object' && Array.isArray(r.data.personal) && r.data.personal.length === 8 && Array.isArray(r.data.activities) && r.data.activities.length === 8 && r.data.activities.every(a => a && typeof a === 'object');
}
function renderCriteria() {
  Evaluation.criteria.forEach(([title,description], i) => {
    const row = document.createElement('div'); row.className = 'criterion';
    row.innerHTML = `<span class="criterion-index">${String(i+1).padStart(2,'0')}</span><div class="criterion-copy"><strong>${title}</strong><p>${description}</p></div><label class="score-label">Nota / 100<input name="personal${i}" type="number" min="1" max="100" step="0.01" required placeholder="—" aria-label="Calificación: ${title}"></label>`;
    $('#personalCriteria').append(row);
    const activity = document.createElement('div'); activity.className = 'criterion';
    activity.innerHTML = `<span class="criterion-index">${String(i+1).padStart(2,'0')}</span><div class="criterion-copy"><label for="activity${i}">Actividad ${i+1}</label><textarea id="activity${i}" name="activity${i}" class="activity-input" rows="2" maxlength="1000" required placeholder="Describe la actividad o el resultado esperado…"></textarea></div><label class="score-label">Nota / 100<input name="activityScore${i}" type="number" min="1" max="100" step="0.01" required placeholder="—" aria-label="Calificación de actividad ${i+1}"></label>`;
    $('#activityCriteria').append(activity);
  });
}
function collect() {
  const data = Object.fromEntries(fields.map(key => [key,form.elements[key].value]));
  data.personal = Array.from({length:8},(_,i) => form.elements[`personal${i}`].value);
  data.activities = Array.from({length:8},(_,i) => ({description:form.elements[`activity${i}`].value,score:form.elements[`activityScore${i}`].value}));
  return data;
}
function recalculate() {
  const data = collect(), result = Evaluation.calculate(data.personal,data.activities.map(a => a.score));
  $('#personalAverage').textContent = `${fmt(result.personal)} / 100`;
  $('#activityAverage').textContent = `${fmt(result.activities)} / 100`;
  $('#personalWeighted').textContent = fmt(result.personal === null ? null : result.personal * .4);
  $('#activityWeighted').textContent = fmt(result.activities === null ? null : result.activities * .6);
  $('#finalScore').textContent = fmt(result.final); $('#resultLabel').textContent = result.result;
  $('#completion').textContent = `${result.completed} de 16 criterios calificados`; $('#progress').value = result.completed;
  $('#documentStatus').textContent = currentStatus === 'completed' ? 'Finalizada' : 'Borrador';
  form.elements.endDate.setCustomValidity(data.startDate && data.endDate && data.endDate < data.startDate ? 'La fecha de finalización debe ser igual o posterior al inicio.' : '');
  return result;
}
function persist(announce = false) {
  const record = {id:currentId,status:currentStatus,updatedAt:new Date().toISOString(),data:collect(),delivery};
  const next = [record,...records.filter(r => r.id !== currentId)];
  try { localStorage.setItem(STORAGE,JSON.stringify(next)); localStorage.setItem(ACTIVE,currentId); records = next; $('#saveStatus').textContent = `Guardado en este navegador · ${new Date().toLocaleTimeString('es-BO',{hour:'2-digit',minute:'2-digit'})}`; if(announce) notify('Evaluación guardada en este navegador.'); return true; }
  catch { $('#saveStatus').textContent = 'No se pudo guardar. El almacenamiento puede estar lleno o bloqueado.'; notify('No se pudo guardar: revisa el almacenamiento del navegador.'); return false; }
}
function load(record) {
  clearTimeout(timer); form.reset(); currentId = record.id; delivery = record.delivery || null; currentStatus = record.status === 'completed' ? 'completed' : 'draft';
  fields.forEach(key => form.elements[key].value = typeof record.data[key] === 'string' ? record.data[key] : '');
  for(let i=0;i<8;i++) { form.elements[`personal${i}`].value = record.data.personal[i] ?? ''; form.elements[`activity${i}`].value = record.data.activities[i].description ?? ''; form.elements[`activityScore${i}`].value = record.data.activities[i].score ?? ''; }
  recalculate(); if(stepSections.length) showStep(0,false); try { localStorage.setItem(ACTIVE,currentId); } catch {} $('#saveStatus').textContent = 'Evaluación recuperada. Los cambios se guardan en este navegador.';
}
function renderReview() {
  const data = collect(), result = recalculate();
  const labels = {student:'Practicante',company:'Institución',companyPhone:'Teléfono de la institución',department:'Unidad o dirección',supervisor:'Supervisor',supervisorPhone:'Celular del supervisor',startDate:'Fecha de inicio',endDate:'Fecha de finalización',startTime:'Ingreso',endTime:'Salida',comments:'Comentarios',manager:'Jefe inmediato superior',teacher:'Docente',decision:'Decisión docente'};
  const list = $('#reviewData'); list.replaceChildren();
  function add(label,value) { const dt=document.createElement('dt'),dd=document.createElement('dd'); dt.textContent=label; dd.textContent=value || 'Sin completar'; list.append(dt,dd); }
  for(const key of fields) add(labels[key],data[key]);
  add('Promedio personal (40 %)',fmt(result.personal)); add('Promedio de actividades (60 %)',fmt(result.activities)); add('Nota final',fmt(result.final)); add('Resultado',result.result);
  Evaluation.criteria.forEach(([title],i)=>add(title, data.personal[i] ? `${data.personal[i]} / 100` : 'Sin calificar'));
  data.activities.forEach((activity,i)=>add(`Actividad ${i+1}`,`${activity.description || 'Sin descripción'} · ${activity.score || 'Sin calificar'} / 100`));
}
function showStep(index, scroll = true) {
  currentStep = index;
  $('.summary-column').hidden = index !== 4;
  stepSections.forEach((sections,i)=>sections.forEach(section=>section.hidden = i !== index));
  document.querySelectorAll('#stepper button').forEach((button,i)=> { if(i === index) button.setAttribute('aria-current','step'); else button.removeAttribute('aria-current'); button.classList.toggle('passed',i<index); });
  $('#previousStep').hidden = index === 0; $('#nextStep').hidden = index === 4;
  $('#stepCount').textContent = `${index+1} / 5`; $('#stepCaption').textContent = `Paso ${index+1} de 5 · ${stepNames[index]}`;
  form.querySelector('button[type="submit"]').hidden = index !== 4;
  $('#sendButton').hidden = index !== 4;
  updateDeliveryStatus();
  if(index === 4) renderReview();
  if(scroll) { $('#stepper').scrollIntoView({behavior:'smooth',block:'start'}); const heading=stepSections[index].at(-1).querySelector('h2'); heading.setAttribute('tabindex','-1'); heading.focus({preventScroll:true}); }
}
function validateSections(indices) {
  recalculate();
  for(const index of indices) {
    for(const section of stepSections[index]) {
      for(const control of section.querySelectorAll('input,textarea,select')) {
        if(!control.checkValidity()) { section.classList.add('was-validated'); showStep(index); control.focus(); control.reportValidity(); return false; }
      }
    }
  }
  return true;
}
function generateWord() {
  if(!validateSections([0,1,2,3])) return false;
  if(!persist()) return false;
  try { DocxExport.download(collect()); notify('Documento Word generado con tu plantilla original.'); return true; }
  catch(error) { notify(error.message); return false; }
}
function updateDeliveryStatus() {
  const same = delivery?.snapshot === JSON.stringify(collect());
  $('#deliveryStatus').textContent = same && delivery.sentAt
    ? `Evaluación recibida. Código: ${delivery.id}. Puedes descargar tu copia en Word.`
    : !cloudEnabled ? 'El envío estará disponible cuando conectemos Supabase. Por ahora puedes guardar y descargar tu evaluación.'
    : delivery?.sentAt ? 'Hay cambios posteriores al último envío. Envía nuevamente para entregar la nueva versión.'
    : 'Al enviar, el responsable recibirá estas respuestas y podrá descargarlas. No necesitas crear una cuenta.';
  $('#sendButton').disabled = sending || !cloudEnabled || Boolean(same && delivery?.sentAt);
  $('#sendButton').textContent = sending ? 'Enviando…' : same && delivery?.sentAt ? 'Evaluación enviada' : !cloudEnabled ? 'Envío pendiente de activar' : 'Enviar evaluación al responsable';
}
async function sendEvaluation() {
  if(sending || !validateSections([0,1,2,3])) return;
  clearTimeout(timer);
  const data = collect();
  delivery = EvaluationDelivery.prepare(data,delivery);
  if(delivery.sentAt) { updateDeliveryStatus(); return; }
  if(!persist()) return;
  sending = true; updateDeliveryStatus();
  // Evita cambiar de registro o editar los datos mientras se confirma el envio.
  const controls = [...document.querySelectorAll('button,input,textarea,select')];
  const disabled = controls.map(control=>control.disabled);
  controls.forEach(control=>control.disabled = true);
  try {
    delivery = await EvaluationDelivery.send(config,data,delivery);
    currentStatus = 'completed'; persist(); recalculate();
    notify('Evaluación recibida correctamente por el responsable.');
  } catch(error) {
    $('#deliveryStatus').textContent = `No se confirmó el envío: ${error.message}`;
    notify(error.message);
  } finally {
    controls.forEach((control,i)=>control.disabled = disabled[i]);
    sending = false;
    const errorText = $('#deliveryStatus').textContent;
    updateDeliveryStatus();
    if(errorText.startsWith('No se confirmó')) $('#deliveryStatus').textContent = errorText;
  }
}
async function cloudRequest(path, options = {}, authenticated = true) {
  if(!cloudEnabled) throw new Error('Primero debemos configurar Supabase en config.js. Tu evaluación sigue guardada localmente.');
  if(authenticated && !session) throw new Error('Inicia sesión para consultar o guardar tus evaluaciones en Supabase.');
  if(authenticated && Date.now() >= session.expiresAt) { session = null; updateAccount(); throw new Error('Tu sesión venció. Inicia sesión otra vez.'); }
  const response = await fetch(`${config.supabaseUrl.replace(/\/$/,'')}${path}`,{...options,headers:{apikey:config.supabasePublishableKey,'Content-Type':'application/json',...(authenticated ? {Authorization:`Bearer ${session.access_token}`} : {}),...options.headers}});
  const body = await response.json().catch(() => null);
  if(!response.ok) throw new Error(response.status === 401 ? 'La sesión no es válida. Inicia sesión nuevamente.' : body?.msg || body?.message || body?.error_description || 'No se pudo completar la conexión con Supabase.');
  return body;
}
function updateAccount() {
  $('#accountButton').textContent = session ? 'Mi cuenta' : 'Iniciar sesión';

  $('#cloudButton').hidden = !cloudEnabled;

  $('#authDescription').textContent = session ? `Sesión iniciada: ${session.user.email}` : cloudEnabled ? 'Usa una cuenta creada en el proyecto de Supabase.' : 'Configura Supabase en config.js para activar la sincronización.';
  $('#logoutButton').hidden = !session; $('#loginButton').hidden = Boolean(session); $('#email').disabled = Boolean(session); $('#password').disabled = Boolean(session);
}
async function busy(button, action) { button.disabled = true; try { await action(); } catch(error) { notify(error.message || 'Ocurrió un error. Inténtalo nuevamente.'); } finally { button.disabled = false; } }
renderCriteria(); readStorage();
const cards = [...document.querySelectorAll('.form-column > .card')];
stepSections = [[cards[0]],[$('#instrucciones'),cards[1]],[cards[2]],[cards[3]],[$('#reviewSection')]];
let activeId; try { activeId = localStorage.getItem(ACTIVE); } catch {}
const active = records.find(r => r.id === activeId); if(active) load(active); else recalculate(); updateAccount();
showStep(0,false);
document.querySelectorAll('#stepper button').forEach(button=>button.addEventListener('click',()=> {
  const target = Number(button.dataset.step);
  if(target > currentStep && !validateSections(Array.from({length:target},(_,i)=>i))) return;
  showStep(target);
}));
$('#nextStep').addEventListener('click',()=> { if(validateSections([currentStep])) showStep(Math.min(4,currentStep+1)); });
$('#previousStep').addEventListener('click',()=>showStep(Math.max(0,currentStep-1)));
form.addEventListener('input',() => { currentStatus = 'draft'; recalculate(); updateDeliveryStatus(); $('#saveStatus').textContent = 'Guardando cambios…'; clearTimeout(timer); timer = setTimeout(() => persist(),450); });
form.addEventListener('change',() => { currentStatus = 'draft'; recalculate(); updateDeliveryStatus(); clearTimeout(timer); persist(); });
form.addEventListener('submit',event => { event.preventDefault(); if(currentStep !== 4) { if(validateSections([currentStep])) showStep(Math.min(4,currentStep+1)); return; } if(!validateSections([0,1,2,3])) return; currentStatus = 'completed'; if(generateWord()) { recalculate(); renderReview(); } });
$('#saveButton').addEventListener('click',() => { clearTimeout(timer); persist(true); });
$('#newButton').addEventListener('click',() => { clearTimeout(timer); if(!persist()) return; form.reset(); currentId = crypto.randomUUID(); delivery = null; currentStatus = 'draft'; recalculate(); persist(); showStep(0); form.elements.student.focus({preventScroll:true}); });
$('#sendButton').addEventListener('click',sendEvaluation);
$('#printButton').addEventListener('click',generateWord);

$('#closeDialog').addEventListener('click',() => $('#accountDialog').close());
$('#loginForm').addEventListener('submit',event => { event.preventDefault(); busy($('#loginButton'),async () => { $('#authStatus').textContent = 'Conectando…'; try { const data = await cloudRequest('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:$('#email').value,password:$('#password').value})},false); session = {...data,expiresAt:Date.now()+data.expires_in*1000}; $('#password').value = ''; $('#authStatus').textContent = ''; updateAccount(); $('#accountDialog').close(); notify('Sesión iniciada. Ya puedes sincronizar tus evaluaciones.'); } catch(e) { $('#authStatus').textContent = e.message; throw e; } }); });
$('#logoutButton').addEventListener('click',() => busy($('#logoutButton'),async () => { await cloudRequest('/auth/v1/logout',{method:'POST'}); session = null; updateAccount(); $('#accountDialog').close(); notify('Sesión cerrada.'); }));
$('#cloudButton').addEventListener('click',() => busy($('#cloudButton'),async () => { if(!persist()) return; const data = collect(); await cloudRequest('/rest/v1/evaluations?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({id:currentId,owner_id:session?.user?.id,status:currentStatus,data})}); notify('Evaluación sincronizada con Supabase.'); }));
window.addEventListener('beforeunload',() => { if(timer) { clearTimeout(timer); persist(); } });
