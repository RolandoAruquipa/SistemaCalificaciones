(function(root) {
  'use strict';
  function prepare(data, previous, createId = () => crypto.randomUUID()) {
    const snapshot = JSON.stringify(data);
    if(previous && previous.snapshot === snapshot && typeof previous.id === 'string') return previous;
    return {id:createId(),snapshot,sentAt:null};
  }
  async function send(config, data, attempt, fetcher = fetch) {
    if(!config.supabaseUrl || !config.supabasePublishableKey) throw new Error('El envío todavía no está habilitado. Debemos conectar Supabase para recibir las respuestas. Puedes guardar y descargar el Word.');
    const response = await fetcher(`${config.supabaseUrl.replace(/\/$/,'')}/rest/v1/rpc/submit_evaluation`,{
      method:'POST',headers:{apikey:config.supabasePublishableKey,'Content-Type':'application/json'},
      body:JSON.stringify({p_id:attempt.id,p_data:data}),signal:AbortSignal.timeout(25000)
    });
    const body = await response.json().catch(()=>null);
    if(!response.ok) throw new Error(body?.message || 'No se pudo enviar. Conservamos tus respuestas para que puedas reintentar.');
    if(body !== attempt.id) throw new Error('No se pudo confirmar la recepción. Reintenta el envío.');
    return {...attempt,sentAt:new Date().toISOString()};
  }
  const api = {prepare,send};
  if(typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EvaluationDelivery = api;
})(globalThis);
