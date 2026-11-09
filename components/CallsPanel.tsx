"use client";
import {useEffect,useState,type FormEvent} from "react";
import {ArrowRight,Check,ChevronRight,Clock3,Headphones,Info,PhoneCall,PhoneForwarded,RefreshCw,ShieldCheck} from "lucide-react";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {Profile,CallSettings} from "@/lib/types";

type PhoneRoute={id:string;twilio_number:string;destination_phone:string;public_number:string|null;forwarding_mode:string;customer_language:string;owner_language:string;enabled:boolean;receive_method:"pstn"|"ios_app";assistant_name:string};
type CallRecord={bridge_sid:string;status:string;duration_seconds:number|null;started_at:string;call_mode:"direct"|"translated"};
type ProvisionRequest={id:string;status:string;created_at:string;destination_phone:string;carrier:string;connection_mode:string;answer_method:string};
type Mode="dial"|"numbers"|"history"|"preferences";
type Navigate=(screen:"numbers"|"history"|"support")=>void;
type Account={forwardingReady:boolean;verified:boolean;connectedToApp?:boolean;menuPrepared?:boolean;menuVerifiedByRealCall?:boolean;twilioPhone:string|null;usage:{calls:number;completed:number;minutes:number;directCalls?:number;translatedCalls?:number}};
const carriers=[
 ["verizon","Verizon"],["att","AT&T"],["tmobile","T-Mobile"],["xfinity","Xfinity Mobile"],
 ["spectrum","Spectrum Mobile"],["cricket","Cricket Wireless"],["metro","Metro by T-Mobile"],
 ["boost","Boost Mobile"],["uscellular","US Cellular"],["googlefi","Google Fi"],
 ["visible","Visible"],["mint","Mint Mobile"],["straighttalk","Straight Talk"],
 ["consumer","Consumer Cellular"],["usmobile","US Mobile"],["other","Otro operador"]
] as const;
const blank:CallSettings={existing_phone:"",forwarding_enabled:false,desired_language:"es",caller_language:"en",assistant_name:"Juan"};
const statusLabel:Record<string,string>={"initiated":"Iniciando","ringing":"Sonando","in-progress":"En curso","completed":"Finalizada","busy":"Ocupada","no-answer":"Sin respuesta","canceled":"Cancelada","failed":"Fallida"};
const requestLabels:Record<string,string>={pending:"En revisión",contacted:"En contacto",approved:"Aprobada",rejected:"No aprobada",activated:"Activada"};
export function CallsPanel({supabase,profile,apiStatus,mode="dial",onNavigate}:{supabase:SupabaseClient;profile:Profile;apiStatus:Record<string,boolean>;mode?:Mode;onNavigate?:Navigate}){
 const [form,setForm]=useState<CallSettings>(blank),[route,setRoute]=useState<PhoneRoute|null>(null);
 const [history,setHistory]=useState<CallRecord[]>([]),[request,setRequest]=useState<ProvisionRequest|null>(null);
 const [account,setAccount]=useState<Account|null>(null);
 const [carrier,setCarrier]=useState("other"),[connectionMode,setConnectionMode]=useState("all_calls"),[answerMethod,setAnswerMethod]=useState("app");
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[requestBusy,setRequestBusy]=useState(false);
 const [message,setMessage]=useState(""),[error,setError]=useState("");
 const refresh=async()=>{
  setLoading(true);setError("");
  try{
   const [settings,routing,calls,requests,session]=await Promise.all([
    supabase.from("smartjob_call_settings").select("*").eq("user_id",profile.id).maybeSingle(),
    supabase.from("smartjob_phone_routes").select("id,twilio_number,destination_phone,public_number,forwarding_mode,receive_method,customer_language,owner_language,enabled,assistant_name").eq("user_id",profile.id).limit(1).maybeSingle(),
    supabase.from("smartjob_call_sessions").select("bridge_sid,status,duration_seconds,started_at,call_mode").eq("owner_id",profile.id).order("started_at",{ascending:false}).limit(25),
    supabase.from("smartjob_provisioning_requests").select("id,status,created_at,destination_phone,carrier,connection_mode,answer_method").eq("user_id",profile.id).order("created_at",{ascending:false}).limit(1).maybeSingle(),
    supabase.auth.getSession()
   ]);
   setForm(settings.data?{...blank,...settings.data}:{...blank,existing_phone:profile.phone,desired_language:profile.owner_language,caller_language:profile.customer_language,assistant_name:profile.assistant_name});
   setRoute((routing.data as PhoneRoute|null)||null);
   setHistory((calls.data as CallRecord[]|null)||[]);
   setRequest((requests.data as ProvisionRequest|null)||null);
   if(requests.data){setCarrier(requests.data.carrier||"other");setConnectionMode(requests.data.connection_mode||"conditional");setAnswerMethod(requests.data.answer_method||"app");}
   if(settings.error||routing.error||calls.error||requests.error)setError("No se pudieron cargar todos los datos.");
   if(session.data.session){
    try{
     const response=await fetch("/api/ios/account-overview",{headers:{Authorization:"Bearer "+session.data.session.access_token},cache:"no-store"});
     if(response.ok)setAccount(await response.json() as Account);
    }catch{}
   }
  }catch{setError("No se pudo actualizar.");}
  finally{setLoading(false);}
 };
 useEffect(()=>{void refresh();},[supabase,profile.id]);
 const active=Boolean(route?.enabled);
 const lockedRequest=Boolean(request&&["pending","approved","activated"].includes(request.status));
 const verified=Boolean(account?.verified);
 const connected=Boolean(account?.connectedToApp);
 const line=route?.public_number||route?.twilio_number||account?.twilioPhone||"Sin asignar";
 const save=async(e:FormEvent)=>{
  e.preventDefault();setBusy(true);setError("");setMessage("");
  if(form.desired_language===form.caller_language){setError("Selecciona idiomas diferentes.");setBusy(false);return;}
  const {error:saveError}=await supabase.from("smartjob_call_settings").upsert({
   user_id:profile.id,existing_phone:form.existing_phone.trim(),forwarding_enabled:false,
   desired_language:form.desired_language,caller_language:form.caller_language,
   assistant_name:form.assistant_name.trim(),updated_at:new Date().toISOString()
  });
  if(saveError)setError("No se pudieron guardar las preferencias.");
  else setMessage("Preferencias guardadas.");
  setBusy(false);
 };
 const submitRequest=async()=>{
  setError("");setMessage("");
  const destination=form.existing_phone.trim().replace(/[ ()-]/g,"");
  if(!/^\+[1-9]\d{7,14}$/.test(destination)){setError("Escribe el número con código de país, por ejemplo +17060000000.");return;}
  if(answerMethod!=="app"){setError("La recepción en otra línea necesita verificación adicional.");return;}
  if(form.desired_language===form.caller_language){setError("Selecciona dos idiomas diferentes.");return;}
  const name=form.assistant_name.trim();
  if(!name||name.length>40){setError("Revisa el nombre del asistente.");return;}
  setRequestBusy(true);
  try{
   const {data,error:saveError}=await supabase.from("smartjob_provisioning_requests").insert({
    user_id:profile.id,destination_phone:destination,
    customer_language:form.caller_language==="es"?"es-ES":"en-US",
    owner_language:form.desired_language==="es"?"es-ES":"en-US",
    assistant_name:name,carrier,connection_mode:connectionMode,answer_method:answerMethod
   }).select("id,status,created_at,destination_phone,carrier,connection_mode,answer_method").single();
   if(saveError){setError(saveError.code==="23505"?"Ya existe una solicitud pendiente.":"No se pudo enviar la solicitud.");}
   else{setRequest(data as ProvisionRequest);setMessage("Solicitud enviada. Tu operador y desvío no cambiaron.");}
  }catch{setError("No se pudo enviar la solicitud.");}
  finally{setRequestBusy(false);}
 };
 const feedback=<>{error&&<p role="alert" className="notice danger vmv-inline-feedback">{error}</p>}{message&&<p role="status" className="notice vmv-inline-feedback">{message}</p>}</>;
 if(mode==="dial")return <section className="vmv-call-workspace" aria-label="Llamadas">
  <div className="vmv-call-focus">
   <div className="vmv-between"><span className="vmv-small-label"><PhoneCall size={18}/> Recepción</span>
    <span className={"vmv-tag "+(active&&connected?"is-live":"is-pending")}>{loading?"Cargando":active&&connected?"Conectada":"Pendiente"}</span></div>
   <div className="vmv-call-large-number">{line}</div>
   <p className="vmv-muted">{active&&connected?"Recibe llamadas en tu iPhone":"Activa tu línea en la app de iPhone"}</p>
   <div className="vmv-call-focus-actions">
    <button className="vmv-big-cta" onClick={()=>onNavigate?.("numbers")}>Mi línea <ChevronRight size={19}/></button>
    <button className="vmv-call-refresh" onClick={()=>void refresh()} disabled={loading} aria-label="Actualizar estado"><RefreshCw size={18}/></button>
   </div>
  </div>
  <div className="vmv-call-quick-links">
   <button onClick={()=>onNavigate?.("history")}><Clock3 size={19}/> Historial <ChevronRight size={18}/></button>
   <button onClick={()=>onNavigate?.("support")}><Headphones size={19}/> Ayuda <ChevronRight size={18}/></button>
  </div>
  {!active&&<p className="vmv-tiny-disclaimer">Las llamadas salientes traducidas aún no están disponibles en la web.</p>}
  {feedback}
 </section>;
 if(mode==="history")return <section className="vmv-history-list" aria-label="Historial de llamadas">
  <div className="vmv-between vmv-history-head"><span className="vmv-muted">{history.length?history.length+" registros":"Sin llamadas"}</span><button type="button" onClick={()=>void refresh()} disabled={loading} className="vmv-icon-button" aria-label="Actualizar historial"><RefreshCw size={18}/></button></div>
  {history.length?<div className="vmv-settings-list">{history.map(item=><div className="vmv-call-entry" key={item.bridge_sid}>
   <span className="vmv-settings-icon"><PhoneCall size={18}/></span>
   <div className="vmv-settings-copy"><b>{new Date(item.started_at).toLocaleString("es-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}</b><small>{item.call_mode==="direct"?"Directa · Español":"Con IA · Inglés"} · {statusLabel[item.status]||"Llamada"}</small></div>
   <span className="vmv-entry-duration">{item.duration_seconds==null?"—":Math.ceil(item.duration_seconds/60)+" min"}</span>
  </div>)}</div>:
  <div className="vmv-empty-state"><Clock3 size={26}/><span>Sin llamadas todavía</span></div>}
  {feedback}
 </section>;
 if(mode==="preferences")return <section className="vmv-number-settings" aria-label="Idiomas y asistente">
    <form className="vmv-compact-card vmv-number-form" onSubmit={save}>
   <h2>Preferencias</h2>
   <label className="label" htmlFor="vmv-owned-phone">Tu número actual</label>
   <input id="vmv-owned-phone" className="field" type="tel" required maxLength={25} value={form.existing_phone} onChange={e=>setForm({...form,existing_phone:e.target.value})} placeholder="+17060000000"/>
   <div className="form-grid">
    <div><label className="label" htmlFor="vmv-owner-lang">Tu idioma</label><select id="vmv-owner-lang" className="field" value={form.desired_language} onChange={e=>setForm({...form,desired_language:e.target.value})}><option value="es">Español</option><option value="en">English</option></select></div>
    <div><label className="label" htmlFor="vmv-client-lang">Cliente</label><select id="vmv-client-lang" className="field" value={form.caller_language} onChange={e=>setForm({...form,caller_language:e.target.value})}><option value="en">English</option><option value="es">Español</option></select></div>
   </div>
   <label className="label" htmlFor="vmv-assistant-name">Nombre del asistente</label>
   <input id="vmv-assistant-name" className="field" maxLength={40} value={form.assistant_name} onChange={e=>setForm({...form,assistant_name:e.target.value})}/>
   <button className="btn primary block" type="submit" disabled={busy}><Check size={16}/>{busy?"Guardando…":"Guardar"}</button>
   {active&&<p className="vmv-tiny-disclaimer">Cambiar preferencias no modifica una línea ya autorizada.</p>}
  </form>
  {feedback}
 </section>;
 return <section className="vmv-number-settings" aria-label="Número y verificación">
  <div className="vmv-compact-card">
   <div className="vmv-between"><span className="vmv-small-label"><PhoneCall size={18}/> Mi línea</span><span className={"vmv-tag "+(active?"is-live":"is-pending")}>{active?"Asignada":"Pendiente"}</span></div>
   <div className="vmv-number-value">{line}</div>
   <div className="vmv-number-statuses"><span><ShieldCheck size={15}/>{verified?"Verificado":"Sin verificar"}</span><span><PhoneCall size={15}/>{connected?"iPhone enlazado":"iPhone pendiente"}</span></div>
   <div className="vmv-route-check">
    <div><b>1</b> Verificar el número <span>{verified?"✓":"Pendiente"}</span></div>
    <div><b>2</b> Recibir en iPhone <span>{connected?"✓":"Pendiente"}</span></div>
    <div><b>3</b> Probar llamada real <span>Sin confirmar</span></div>
    <div><b>4</b> Menú bilingüe <span>{account?.menuPrepared?"Listo para probar":"No habilitado"}</span></div>
   </div>
   <button className="vmv-secondary-cta" onClick={()=>void refresh()} disabled={loading}>{loading?"Cargando…":"Actualizar"}</button>
  </div>

  <div className="vmv-compact-card vmv-number-request">
   <h2>Conexión con tu operador</h2><p className="vmv-muted vmv-carrier-explanation">Conservas tu número. VMV Call recibe la llamada solo después de configurar el desvío.</p>
   <div className="form-grid">
    <div><label className="label" htmlFor="vmv-carrier">Operador</label><select id="vmv-carrier" className="field" value={carrier} onChange={e=>setCarrier(e.target.value)} disabled={lockedRequest}>{carriers.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></div>
    <div><label className="label" htmlFor="vmv-connection">Desvío</label><select id="vmv-connection" className="field" value={connectionMode} onChange={e=>setConnectionMode(e.target.value)} disabled={request?.status==="pending"}><option value="all_calls">Todas las llamadas</option><option value="conditional">Solo no contestadas</option><option value="port">Portabilidad (consulta)</option></select></div>
   </div>
   <p className="vmv-muted vmv-carrier-explanation">{connectionMode==="all_calls"?"Todas las llamadas pasarán por el menú bilingüe una vez habilitado el desvío.":connectionMode==="conditional"?"El menú solo contestará las llamadas que tu operador desvíe por ocupación o falta de respuesta.":"Portar tu número necesita autorización y puede afectar llamadas y SMS."}</p>
   <label className="label" htmlFor="vmv-answer">Recibir en</label><select id="vmv-answer" className="field" value={answerMethod} onChange={e=>setAnswerMethod(e.target.value)} disabled={request?.status==="pending"}><option value="app">App de iPhone</option><option value="separate_line" disabled>Otra línea (próximamente)</option></select>
   {request&&<div className="vmv-request-status">Solicitud: {requestLabels[request.status]||request.status}</div>}
   {lockedRequest&&<p className="vmv-tiny-disclaimer">Para cambiar operador o número después de solicitarlo, contacta soporte y vuelve a verificar.</p>}
   {request?.connection_mode==="conditional"&&<p className="vmv-setup-warning">Tu configuración actual es condicional: el menú no aparece si contestas normalmente en tu línea móvil.</p>}
   <button type="button" className="btn primary block" disabled={requestBusy||active||lockedRequest||loading} onClick={()=>void submitRequest()}><ArrowRight size={16}/>{requestBusy?"Enviando…":active?"Línea asignada":lockedRequest?"Solicitud en revisión":"Solicitar conexión"}</button>
   <p className="vmv-tiny-disclaimer">Solo la prueba real confirma que tu número habitual llega a VMV Call.</p><details className="vmv-safety-details"><summary><Info size={15}/> Desvío y seguridad</summary>
    <p>Guardar o solicitar no compra números ni activa el desvío. Verifica tu número y comprueba llamadas reales con el iPhone bloqueado antes de modificar Verizon u otro operador.</p>
    <p>No desvíes llamadas de vuelta al mismo número: puede crear un bucle. La portabilidad puede afectar las llamadas y SMS del operador.</p>
    {account?.forwardingReady&&route?.twilio_number&&<p>Los códigos de desvío dependen del operador. Para Verizon, el desvío completo suele usar *72 y su cancelación *73; confirma con Verizon antes de marcar.</p>}
   </details>
  </div>
  <div className="vmv-compact-card vmv-language-explainer">
    <h2>Al recibir una llamada</h2>
    <div><span>🇪🇸 Español</span><strong>Directo · sin minutos IA</strong></div>
    <div><span>🇺🇸 English</span><strong>Traductor · con minutos IA</strong></div>
    <p className="vmv-tiny-disclaimer">El menú y el desvío necesitan pruebas reales antes de activarse. Pueden existir costes de telefonía externos.</p>
   </div>
  {feedback}
 </section>;
}
