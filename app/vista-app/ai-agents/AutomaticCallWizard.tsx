"use client";
import {useEffect,useState} from "react";
import {ArrowLeft,ArrowRight,Bot,Check,LoaderCircle,Pencil,PhoneCall,ShieldCheck,Sparkles} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {loadPhoneSelection,selectPhoneAgent,type PersistedAgent,type PhoneSelection} from "./agentStore";
import SmartCallMenuEditor from "./SmartCallMenuEditor";
import SmartCallAgentSetup from "./SmartCallAgentSetup";
import SmartCallLineRequest from "./SmartCallLineRequest";
import {checkCallPolicy,days,initialCallPolicy,zoneOptions,type CallPolicy,type DayName} from "@/lib/vmv-ai-agents/call-policy";
import type {CentralBusiness} from "./centralBusiness";
import theme from "./AgentServiceFlow.module.css";
import styles from "./AutomaticWebWizard.module.css";
import extra from "./AutomaticCallWizard.module.css";

type Step="business"|"line"|"lineRequest"|"services"|"agent"|"translation"|"hours"|"priority"|"voice"|"menu"|"test"|"review";
type Voice="default"|"bright"|"calm";
type Preferences={voice_customer:Voice;voice_owner:Voice;greeting_customer:string;greeting_owner:string};
const defaults:Preferences={voice_customer:"default",voice_owner:"default",greeting_customer:"",greeting_owner:""};
const labels:Record<Step,string>={
 business:"¿Qué negocio vamos a configurar?",
 line:"¿Qué número configuraremos?",
 lineRequest:"Preparemos tu solicitud de número",
 services:"¿Quién responderá tus llamadas?",
 agent:"¿Cómo atenderá Mi agente las llamadas?",
 translation:"¿Quieres activar la traducción?",
 hours:"¿En qué horarios atenderemos?",
 priority:"¿Qué hacemos cuando entran llamadas?",
 voice:"¿Qué voz escucharán tus clientes?",
 menu:"Personalicemos el saludo y el menú telefónico",
 test:"Probemos la configuración antes de guardarla",
 review:"Revisa las reglas antes de guardarlas"
};
const weekdays:Record<DayName,string>={sun:"Domingo",mon:"Lunes",tue:"Martes",wed:"Miércoles",thu:"Jueves",fri:"Viernes",sat:"Sábado"};
function validGreeting(v:string){return v.length<=180&&!/[<>\r\n]/.test(v)&&(!v.trim()||v.trim().length>=10);}
async function callApi(method:"GET"|"POST"|"PUT",payload?:object){
 const db=getSupabase();if(!db)throw Error("No hay conexión.");
 const {data:{session}}=await db.auth.getSession();
 if(!session?.access_token)throw Error("Inicia sesión nuevamente.");
 const r=await fetch("/api/vmv/ai-agents/call-settings",{
  method,cache:"no-store",headers:{Authorization:"Bearer "+session.access_token,
   "Content-Type":"application/json"},
  ...(payload?{body:JSON.stringify(payload)}:{})
 });
 const data=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(String(data.error||"No se pudo consultar tu línea."));
 return data;
}
export default function AutomaticCallWizard({business,agent,workspaceId,onClose,onAdvanced,businesses,onChooseBusiness,onAgentUpdated}:{
 business:CentralBusiness;agent:PersistedAgent;workspaceId:string;onClose:()=>void;onAdvanced:()=>void;
 businesses:CentralBusiness[];onChooseBusiness:(id:string)=>void;
 onAgentUpdated?:(agent:PersistedAgent)=>void;
}){
 const [step,setStep]=useState<Step>("business"),[returnReview,setReturnReview]=useState(false);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(""),[error,setError]=useState("");
 const [owner,setOwner]=useState(""),[line,setLine]=useState<PhoneSelection|null>(null);
 const [version,setVersion]=useState(0),[policy,setPolicy]=useState<CallPolicy>(initialCallPolicy);

 const [agentReady,setAgentReady]=useState(false),[businessHours,setBusinessHours]=useState(false);
 const [forwardReady,setForwardReady]=useState(false);
 const [bindAgent,setBindAgent]=useState(false);
 const [workingAgent,setWorkingAgent]=useState<PersistedAgent>(agent);
 const [prefs,setPrefs]=useState<Preferences>(defaults),[originalPrefs,setOriginalPrefs]=useState<Preferences>(defaults);
 const [prefEditable,setPrefEditable]=useState(false),[preferencesAvailable,setPreferencesAvailable]=useState(false);
 const [saved,setSaved]=useState(false);
 const [showBusinesses,setShowBusinesses]=useState(false);
 const [lineChoice,setLineChoice]=useState<"current"|"different"|"new">("current");
 const [testDay,setTestDay]=useState<DayName>("mon");
 const [testTime,setTestTime]=useState("10:00");
 const [testDigit,setTestDigit]=useState("none");
 const [testResult,setTestResult]=useState("");
 const [testError,setTestError]=useState("");
 const patch=<K extends keyof CallPolicy>(key:K,value:CallPolicy[K])=>
  setPolicy(v=>({...v,[key]:value}));
 const schedule=policy.agent_enabled&&policy.agent_mode==="schedule"||
  policy.translation_enabled&&policy.translation_mode==="schedule";
 const steps:Step[]=["business","line",...(lineChoice==="current"?[]:["lineRequest" as Step]),"services",
  ...(policy.agent_enabled?["agent" as Step]:[]),
  "translation",...(schedule?["hours" as Step]:[]),"priority","voice","menu","test","review"];
 const index=Math.max(0,steps.indexOf(step));
 const valid=step==="services"?(policy.agent_enabled||policy.translation_enabled):
  step==="line"?(lineChoice==="current"?Boolean(line?.routeId):true):
  step==="agent"?(!policy.agent_enabled||bindAgent&&workingAgent.status==="active"):
  step==="menu"?(()=>{try{checkCallPolicy(policy);return true;}catch{return false;}})():
  step==="voice"?validGreeting(prefs.greeting_customer)&&validGreeting(prefs.greeting_owner):
  true;
 useEffect(()=>{
  let live=true;
  void(async()=>{
   try{
    const db=getSupabase();if(!db)throw Error("No hay sesión.");
    const {data:{user},error:authError}=await db.auth.getUser();
    if(authError||!user||user.is_anonymous||user.id!==agent.owner_id||
     user.id!==business.owner_id||agent.business_id!==workspaceId)
     throw Error("Primero selecciona el negocio y su agente principal.");
    if(!live)return;
    setOwner(user.id);
    const {data:central}=await db.from("vmv_marketing_businesses").select("id")
     .eq("id",business.id).eq("owner_id",user.id).maybeSingle();
    if(!central)throw Error("El negocio ya no está disponible en esta cuenta.");
    const phone=await loadPhoneSelection();
    if(!live)return;
    setLine(phone);setBindAgent(phone?.agentId===agent.id);
    if(!phone){setError("No encontré una línea activa. Primero configura o verifica tu número en Smart Call.");return;}
    const [status,smartCall]=await Promise.all([
     callApi("GET").catch(e=>({error:e instanceof Error?e.message:"No se pudo cargar la línea."})),
     (async()=>{
      const {data:{session}}=await db.auth.getSession();
      if(!session?.access_token)return null;
      const r=await fetch("/api/vista-app/smart-call",{
       headers:{Authorization:"Bearer "+session.access_token},cache:"no-store"
      }).catch(()=>null);
      return r?.ok?await r.json().catch(()=>null):null;
     })()
    ]);
    if(!live)return;
    if(status.error)throw Error(status.error);
    const settings=checkCallPolicy(status.policy);
    setPolicy(settings);setVersion(status.version);
    setAgentReady(status.agentActive===true);
    setBusinessHours(status.businessHoursReady===true);
    setForwardReady(status.forwardReady===true);

    const pref=smartCall?.preferences;
    if(pref?.ok&&pref?.data?.settings){
     const values=pref.data.settings;
     const safe=(raw:unknown):Voice=>raw==="bright"||raw==="calm"?raw:"default";
     const configured={voice_customer:safe(values.voice_customer),
      voice_owner:safe(values.voice_owner),
      greeting_customer:String(values.greeting_customer||"").slice(0,180),
      greeting_owner:String(values.greeting_owner||"").slice(0,180)};
     setPrefs(configured);setOriginalPrefs(configured);
     setPreferencesAvailable(true);setPrefEditable(pref.data.editable===true);
    }
   }catch(e){if(live)setError(e instanceof Error?e.message:"No se pudo abrir Smart Call.");}
   finally{if(live)setLoading(false);}
  })();
  return()=>{live=false;};
 },[business.id,agent.id,workspaceId]);
 const next=()=>{
  if(!valid||busy||(step==="line"&&!line&&lineChoice==="current"))return;
  setError("");
  if(returnReview){setReturnReview(false);setStep("review");return;}
  setStep(steps[Math.min(index+1,steps.length-1)]);
 };
 const previous=()=>{
  if(returnReview){setReturnReview(false);setStep("review");return;}
  if(index===0){onClose();return;}setStep(steps[index-1]);
 };
 const edit=(target:Step)=>{setReturnReview(true);setStep(target);setSaved(false);};
 const simulate=async()=>{
  if(busy||!line)return;
  setBusy("simulate");setTestResult("");setTestError("");setError("");
  try{
   const result=await callApi("POST",{policy:checkCallPolicy(policy),day:testDay,time:testTime,
    digit:testDigit==="none"?null:testDigit==="silent"?"":testDigit});
   const action=String(result.decision?.action||"");
   const labels:Record<string,string>={menu:"El cliente podrá elegir en el menú",
    agent:"Mi agente IA respondería",translation:"Se ofrecería traducción",
    ring_owner:"Primero sonaría el teléfono humano",message:"Se reproduciría el mensaje de cierre"};
   setTestResult(labels[action]||"Simulación completada");
  }catch(e){setTestError(e instanceof Error?e.message:"No fue posible simular las reglas.");}
  finally{setBusy("");}
 };
 const setDay=(d:DayName,k:"enabled"|"start"|"end",value:boolean|string,
  source:"schedule"|"translation_schedule")=>
  setPolicy(p=>({...p,[source]:{...p[source],[d]:{...p[source][d],[k]:value}}}));
 const save=async()=>{
  if(busy||!owner||!line||!valid||saved)return;
  if(!window.confirm("¿Guardar las reglas para tu número "+line.maskedNumber+
   "? Los cambios podrían afectar a las próximas llamadas; no se compra un número ni se modifica la ruta Twilio."))return;
  setBusy("save");setError("");
  let selectionChanged=false,policySaved=false;
  try{
   const db=getSupabase();if(!db)throw Error("No hay conexión.");
   const {data:{user}}=await db.auth.getUser();
   if(!user||user.id!==owner)throw Error("La sesión cambió. Inicia sesión nuevamente.");
   if(policy.agent_enabled&&bindAgent&&line.agentId!==workingAgent.id){
    if(workingAgent.status!=="active")throw Error("Activa Mi agente dentro de este asistente antes de asignarlo al número.");
    await selectPhoneAgent(line.routeId,workingAgent);
    setLine(p=>p?{...p,agentId:workingAgent.id}:p);
    selectionChanged=true;
   }
   if(policy.agent_enabled&&(!bindAgent||(!agentReady&&!selectionChanged&&line.agentId!==workingAgent.id))){
    throw Error("Para habilitar llamadas con IA, autoriza asignar Mi agente al número y verifica que esté activo.");
   }
   const result=await callApi("PUT",{policy:checkCallPolicy(policy),version});
   setPolicy(checkCallPolicy(result.policy));
   setVersion(result.version);policySaved=true;
   if(prefEditable&&JSON.stringify(prefs)!==JSON.stringify(originalPrefs)){
    const {data:{session}}=await db.auth.getSession();
    if(!session?.access_token)throw Error("Las reglas se guardaron, pero no se pudo verificar la sesión para los saludos.");
    const r=await fetch("/api/vista-app/smart-call",{
     method:"POST",cache:"no-store",headers:{
      Authorization:"Bearer "+session.access_token,"Content-Type":"application/json"
     },body:JSON.stringify(prefs)
    });
    const body=await r.json().catch(()=>({}));
    if(!r.ok||body.saved!==true)
     throw Error("Las reglas se guardaron, pero no se pudo guardar la voz y saludos. Revísalos en Smart Call.");
    setOriginalPrefs(prefs);
   }
   setSaved(true);
  }catch(e){
   const detail=e instanceof Error?e.message:"No se pudo guardar la configuración.";
   setError((selectionChanged&&!policySaved?"Mi agente quedó seleccionado, pero las reglas no se guardaron. ":"")+detail);
  }finally{setBusy("");}
 };
 const card=(title:string,value:string,to:Step)=><div className={styles.reviewCard} key={title}>
  <span><small>{title}</small><strong>{value}</strong></span>
  <button type="button" title={"Editar "+title} aria-label={"Editar "+title}
   className={styles.edit} onClick={()=>edit(to)}><Pencil size={17}/></button>
 </div>;
 return <section className={styles.root+" "+theme.flow} aria-label="Smart Call con AI Agents">
  <header className={styles.top}><button type="button" onClick={previous} aria-label="Volver">
   <ArrowLeft size={19}/></button><span>Smart Call · Mi agente</span>
   <span>{index+1}/{steps.length}</span></header>
  <div className={styles.track}><span className={theme.agentProgress}
   style={{width:(index+1)/steps.length*100+"%"}}/></div>
  <div className={styles.robot+" "+theme.agentRobot}><Bot size={35}/><Sparkles size={16}/></div>
  <h1 className={styles.question+" "+theme.agentHeading}>{labels[step]}</h1>
  {loading?<p className={styles.note} role="status"><LoaderCircle size={17}/> Consultando tu línea…</p>:null}
  {!loading&&step==="business"&&owner?<div className={styles.panel}>
   <div className={extra.line}><Check size={19}/><strong>{business.name}</strong><small>Negocio seleccionado</small></div>
   <button type="button" className={styles.option} onClick={()=>setShowBusinesses(v=>!v)}>
    {showBusinesses?"Ocultar negocios":"Cambiar negocio"}</button>
   {showBusinesses?<div className={styles.optionsVertical}>
    {businesses.map(b=><button type="button" key={b.id} className={business.id===b.id?styles.optionActive:styles.option}
     onClick={()=>{if(b.id!==business.id)onChooseBusiness(b.id);else setShowBusinesses(false);}}>{b.name}</button>)}
   </div>:null}
   <p className={styles.note}>El asistente usará tu agente principal y la línea existente. No creará otro agente.</p>
  </div>:null}
  {!loading&&step==="line"&&owner?<div className={styles.panel}>
   {line?<div className={extra.line}><PhoneCall size={25}/>
    <strong>{line.maskedNumber}</strong><span>Línea activa detectada en tu cuenta VMV</span>
    <small>{line.agentId===agent.id?(line.serverEnrolled?"Mi agente está vinculado a esta ruta":"Mi agente seleccionado · vinculación de voz pendiente"):"Puedes seleccionar Mi agente al guardar"}</small>
   </div>:<div className={styles.warning}>No hay una línea activa asociada a esta cuenta.
    Verifica tu número o configura Smart Call para continuar.</div>}
   <button type="button" className={lineChoice==="current"?styles.optionActive:styles.option}
    onClick={()=>setLineChoice("current")}>Usar línea actual</button>
   <button type="button" className={lineChoice==="different"?styles.optionActive:styles.option}
    onClick={()=>setLineChoice("different")}>Tengo otro número</button>
   <button type="button" className={lineChoice==="new"?styles.optionActive:styles.option}
    onClick={()=>setLineChoice("new")}>Necesito un número nuevo</button>
   {lineChoice!=="current"?<div className={styles.info}>
    {lineChoice==="new"?"Obtener un número nuevo puede tener costos y requiere aprobación del proveedor.":
     "El número nuevo debe verificarse y vincularse antes de utilizarlo."}
    Continúa para preparar la solicitud con Mi agente, sin compras ni cambios automáticos.
   </div>:null}
   <p className={styles.note}>No compramos líneas ni modificamos el desvío telefónico sin una configuración aparte.</p>
  </div>:null}
  {!loading&&step==="lineRequest"&&owner&&lineChoice!=="current"?<div className={styles.panel}>
   <SmartCallLineRequest businessId={business.id} choice={lineChoice}
    onReturn={()=>{setLineChoice("current");setStep("line");}}
    onClose={onClose}/>
  </div>:null}
  {!loading&&step==="services"&&owner?<div className={styles.panel}>
   <div className={styles.optionsVertical}>
    <button type="button" className={policy.agent_enabled&&policy.agent_mode!=="after_no_answer"?styles.optionActive:styles.option}
     aria-pressed={policy.agent_enabled&&policy.agent_mode!=="after_no_answer"}
     onClick={()=>setPolicy(p=>({...p,agent_enabled:true,agent_mode:"always"}))}>
     Mi agente IA responderá primero</button>
    {forwardReady?<button type="button" className={policy.agent_enabled&&policy.agent_mode==="after_no_answer"?styles.optionActive:styles.option}
     aria-pressed={policy.agent_enabled&&policy.agent_mode==="after_no_answer"}
     onClick={()=>setPolicy(p=>({...p,agent_enabled:true,agent_mode:"after_no_answer"}))}>
     Primero yo o mi equipo; después Mi agente IA</button>:null}
    <button type="button" className={!policy.agent_enabled?styles.optionActive:styles.option}
     aria-pressed={!policy.agent_enabled}
     onClick={()=>setPolicy(p=>({...p,agent_enabled:false,translation_enabled:true,outside_action:"translation"}))}>
     Atención mediante traducción, sin agente IA</button>
   </div>
   <p className={styles.note}>La opción de atención humana primero requiere un teléfono de destino verificado. Estos ajustes no modifican el desvío de Twilio.</p>
  </div>:null}
  {!loading&&step==="agent"&&policy.agent_enabled&&owner?<div className={styles.panel}>
   <div className={extra.agentCard}>
    <div><strong>{workingAgent.name}</strong>
     <small>Mi agente IA · {workingAgent.status==="active"?"Activo":"Pendiente de activación"}</small></div>
    <label className={extra.agentSwitch}><input type="checkbox" checked={bindAgent}
     onChange={e=>setBindAgent(e.target.checked)}/>
     <span>Asignar a este número</span></label>
   </div>
   {bindAgent?<SmartCallAgentSetup agent={workingAgent} businessName={business.name}
    onUpdated={updated=>{setWorkingAgent(updated);setAgentReady(updated.status==="active");
     onAgentUpdated?.(updated);}}/>:null}
   <label className={styles.field}>Cuándo responderá Mi agente
    <select value={policy.agent_mode} onChange={e=>patch("agent_mode",e.target.value as CallPolicy["agent_mode"])}>
     <option value="always">Siempre que esté disponible</option>
     <option value="schedule">Solo durante el horario configurado</option>
     {forwardReady?<option value="after_no_answer">Cuando una persona no conteste</option>:null}
    </select></label>
   {policy.agent_mode==="after_no_answer"?<label className={styles.field}>Segundos para esperar respuesta humana
    <select value={policy.ring_seconds} onChange={e=>patch("ring_seconds",Number(e.target.value))}>
     {[10,15,18,20,25,30].map(v=><option value={v} key={v}>{v} segundos</option>)}
    </select></label>:null}
   <p className={styles.note}>Al aprobar la configuración, VMV intentará vincular el agente a esta línea.
    Las llamadas reales requieren que el canal telefónico esté verificado.</p>
  </div>:null}
  {!loading&&step==="translation"&&owner?<div className={styles.panel}>
   <div className={styles.optionsVertical}>
    <button type="button" className={policy.translation_enabled?styles.optionActive:styles.option}
     aria-pressed={policy.translation_enabled} onClick={()=>patch("translation_enabled",true)}>
     {policy.translation_enabled?<Check size={16}/>:null} Activar traducción</button>
    <button type="button" className={!policy.translation_enabled?styles.optionActive:styles.option}
     aria-pressed={!policy.translation_enabled} disabled={!policy.agent_enabled}
     onClick={()=>setPolicy(p=>({...p,translation_enabled:false,outside_action:"message"}))}>
     No usar traducción</button>
   </div>
   {policy.translation_enabled?<label className={styles.field}>Cuándo traducir
    <select value={policy.translation_mode}
     onChange={e=>patch("translation_mode",e.target.value as CallPolicy["translation_mode"])}>
     <option value="always">Siempre que se necesite</option>
     <option value="schedule">Solo durante el horario establecido</option>
    </select></label>:null}
   <p className={styles.note}>Los minutos de traducción se descuentan cuando se utilizan. No se efectuarán recargas automáticas.</p>
  </div>:null}
  {!loading&&step==="hours"&&owner?<div className={styles.panel}>
   <label className={styles.field}>Zona horaria<select value={policy.time_zone}
    onChange={e=>patch("time_zone",e.target.value)}>
    {zoneOptions.map(z=><option value={z} key={z}>{z.replace("America/","").replaceAll("_"," ")}</option>)}
   </select></label>
   {businessHours&&policy.agent_enabled&&policy.agent_mode==="schedule"?
    <label className={styles.checkLine}><input type="checkbox" checked={policy.use_business_hours}
     onChange={e=>patch("use_business_hours",e.target.checked)}/> Usar los horarios verificados de tu negocio</label>:null}
   {(!policy.use_business_hours||!businessHours)&&schedule?
    <div className={extra.week}><strong>Horario del agente</strong>
     {days.map(d=><div key={d} className={extra.day}>
      <label><input type="checkbox" checked={policy.schedule[d].enabled}
       onChange={e=>setDay(d,"enabled",e.target.checked,"schedule")}/>{weekdays[d]}</label>
      {policy.schedule[d].enabled?<div><input type="time" value={policy.schedule[d].start}
       onChange={e=>setDay(d,"start",e.target.value,"schedule")}/>
       <input type="time" value={policy.schedule[d].end}
        onChange={e=>setDay(d,"end",e.target.value,"schedule")}/></div>:null}
     </div>)}
    </div>:null}
   {policy.translation_enabled&&policy.translation_mode==="schedule"?
    <div className={extra.week}><strong>Horario de traducción</strong>
     {days.map(d=><div key={d} className={extra.day}>
      <label><input type="checkbox" checked={policy.translation_schedule[d].enabled}
       onChange={e=>setDay(d,"enabled",e.target.checked,"translation_schedule")}/>{weekdays[d]}</label>
      {policy.translation_schedule[d].enabled?<div>
       <input type="time" value={policy.translation_schedule[d].start}
        onChange={e=>setDay(d,"start",e.target.value,"translation_schedule")}/>
       <input type="time" value={policy.translation_schedule[d].end}
        onChange={e=>setDay(d,"end",e.target.value,"translation_schedule")}/></div>:null}
     </div>)}</div>:null}
  </div>:null}
  {!loading&&step==="priority"&&owner?<div className={styles.panel}>

   <div className={styles.optionsVertical}>
    <button type="button" className={policy.menu_config.enabled?styles.optionActive:styles.option}
     onClick={()=>setPolicy(p=>({...p,coexistence:"menu",menu_config:{...p.menu_config,enabled:true}}))}>
     El cliente elige en un menú personalizado</button>
    {policy.agent_enabled?<button type="button"
     className={!policy.menu_config.enabled&&policy.coexistence==="agent_first"&&policy.agent_mode!=="after_no_answer"?styles.optionActive:styles.option}
     onClick={()=>setPolicy(p=>({...p,coexistence:"agent_first",agent_mode:"always",menu_config:{...p.menu_config,enabled:false}}))}>
     Mi agente IA responde directamente</button>:null}
    {policy.agent_enabled&&forwardReady?<button type="button"
     className={!policy.menu_config.enabled&&policy.agent_mode==="after_no_answer"?styles.optionActive:styles.option}
     onClick={()=>setPolicy(p=>({...p,coexistence:"agent_first",agent_mode:"after_no_answer",menu_config:{...p.menu_config,enabled:false}}))}>
     Primero suena mi teléfono; si no contesto, Mi agente responde</button>:null}
    {policy.translation_enabled?<button type="button"
     className={!policy.menu_config.enabled&&policy.coexistence==="translation_first"?styles.optionActive:styles.option}
     onClick={()=>setPolicy(p=>({...p,coexistence:"translation_first",menu_config:{...p.menu_config,enabled:false}}))}>
     Traducir directamente sin menú</button>:null}
   </div>
   <p className={styles.note}>Para que las llamadas en español sean directas y las de inglés usen traducción solo cuando se elija,
    recomendamos el menú personalizado. Puedes cambiar teclas y mensajes en el siguiente paso.</p>
   <label className={styles.field}>Fuera del horario o sin atención
    <select value={policy.outside_action}
     onChange={e=>patch("outside_action",e.target.value as CallPolicy["outside_action"])}>
     {policy.translation_enabled?<option value="translation">Usar traducción si está disponible</option>:null}
     <option value="message">Mensaje y cierre</option>
    </select></label>
   {policy.outside_action==="message"?<label className={styles.field}>Mensaje de cierre
    <textarea rows={3} maxLength={220} value={policy.closed_message}
     onChange={e=>patch("closed_message",e.target.value)}/></label>:null}
  </div>:null}
  {!loading&&step==="voice"&&owner?<div className={styles.panel}>
   <SmartCallMenuEditor mode="voices" menu={policy.menu_config}
    onChange={menu=>patch("menu_config",menu)} agentEnabled={policy.agent_enabled}
    translationEnabled={policy.translation_enabled}/>
   {preferencesAvailable&&prefEditable?<details className={extra.advanced}>
    <summary>Configuración anterior de voz y saludos de traducción</summary>
    <label className={styles.field}>Voz para el cliente
     <select value={prefs.voice_customer}
      onChange={e=>setPrefs(p=>({...p,voice_customer:e.target.value as Voice}))}>
      <option value="default">Original</option><option value="bright">Clara</option><option value="calm">Tranquila</option>
     </select></label>
    <label className={styles.field}>Voz para el propietario
     <select value={prefs.voice_owner}
      onChange={e=>setPrefs(p=>({...p,voice_owner:e.target.value as Voice}))}>
      <option value="default">Original</option><option value="bright">Clara</option><option value="calm">Tranquila</option>
     </select></label>
   </details>:null}
   <p className={styles.note}>Las voces ElevenLabs pueden seleccionarse durante el piloto sin exigir Pro o Premium.
    Son ajustes adicionales que Twilio debe admitir en cada llamada.</p>
  </div>:null}
  {!loading&&step==="menu"&&owner?<div className={styles.panel}>
   <SmartCallMenuEditor mode="menu" menu={policy.menu_config}
    onChange={menu=>patch("menu_config",menu)} agentEnabled={policy.agent_enabled}
    translationEnabled={policy.translation_enabled}/>
   <p className={styles.note}>Las llamadas directas no consumen créditos de IA ni de traducción;
    sí pueden consumir minutos telefónicos normales. Los servicios que no estén disponibles no se anunciarán.</p>
  </div>:null}
  {!loading&&step==="test"&&owner?<div className={styles.panel}>
   <p className={styles.note}>Prueba cómo se enrutaría una llamada, sin llamar a nadie ni modificar el número.</p>
   <label className={styles.field}>Día de prueba
    <select value={testDay} onChange={e=>setTestDay(e.target.value as DayName)}>
     {days.map(d=><option value={d} key={d}>{weekdays[d]}</option>)}
    </select></label>
   <label className={styles.field}>Hora de prueba
    <input type="time" value={testTime} onChange={e=>setTestTime(e.target.value)}/></label>
   {policy.menu_config.enabled?<label className={styles.field}>¿Qué opción marcará el cliente?
    <select value={testDigit} onChange={e=>setTestDigit(e.target.value)}>
     <option value="none">Escuchar el menú inicial</option>
     <option value="silent">Esperar sin marcar</option>
     <option value={policy.menu_config.spanish_digit}>Marcar {policy.menu_config.spanish_digit} · Atención directa en español</option>
     {policy.translation_enabled?<option value={policy.menu_config.english_digit}>Marcar {policy.menu_config.english_digit} · Traducción</option>:null}
     {policy.agent_enabled?<option value={policy.menu_config.agent_digit}>Marcar {policy.menu_config.agent_digit} · Mi agente IA</option>:null}
    </select></label>:null}
   <button type="button" className={styles.optionActive}
    disabled={!line||Boolean(busy)} onClick={()=>void simulate()}>
    <PhoneCall size={17}/> {busy==="simulate"?"Simulando…":"Simular llamada"}</button>
   {testResult?<div className={styles.info} role="status"><Check size={17}/>{testResult}</div>:null}
   {testError?<p className={styles.warning} role="alert">{testError}</p>:null}
   <p className={styles.note}>Esta simulación solo evalúa reglas. Una llamada real requiere el canal telefónico activo y autorización.</p>
  </div>:null}
  {!loading&&step==="review"&&owner?<div className={styles.panel}>
   {saved?<div className={extra.success}><Check size={24}/>
    <strong>Configuración guardada</strong>
    <p>Reglas guardadas. La activación de enrutamiento real requiere el piloto verificado de Twilio. Tu ruta de proveedor no se modificó.</p>
    <button type="button" className={styles.option} onClick={onClose}>Volver a AI Agents</button></div>:
    <div className={styles.review}>
     {card("Negocio",business.name,"business")}
     {card("Número",line?.maskedNumber||"Pendiente","line")}
     {card("Atención",policy.agent_enabled?(policy.agent_mode==="after_no_answer"?"Humano primero, luego IA":"Mi agente IA"):"Traducción sin IA","services")}
     {card("Traducción",policy.translation_enabled?policy.translation_mode==="always"?"Activada":"Por horario":"Desactivada","translation")}
     {policy.agent_enabled?card("Mi agente",bindAgent?workingAgent.name:"Sin asignar","agent"):null}
     {card("Horarios",schedule?(policy.use_business_hours?"Horario del negocio":"Horario personalizado"):"Siempre","hours")}
     {card("Prioridad",policy.coexistence+" · "+policy.outside_action,"priority")}
     {card("Voces ElevenLabs",policy.menu_config.voice_es+" · "+policy.menu_config.voice_en,"voice")}
      {card("Menú telefónico",policy.menu_config.enabled?"Activado · teclas personalizadas":"Sin menú","menu")}
     {card("Prueba",testResult||"No realizada","test")}
    </div>}
   {!saved?<p className={styles.note}>Debes aprobar cualquier cambio de selección y reglas. No compraremos números ni activaremos gastos adicionales automáticamente.</p>:null}

  </div>:null}
  {error?<p className={styles.error} role="alert">{error}</p>:null}
  {!loading&&owner&&step!=="lineRequest"?<div className={styles.footer}>
   {step==="review"?<button type="button" className={styles.primary+" "+theme.agentButton}
    onClick={()=>void save()} disabled={Boolean(busy)||saved}>
    {busy==="save"?<LoaderCircle size={17}/>:<ShieldCheck size={18}/>}
    {busy==="save"?"Guardando…":saved?"Guardado":"Aprobar y guardar reglas"} <ArrowRight size={17}/></button>:
   <button type="button" className={styles.primary+" "+theme.agentButton}
    onClick={next} disabled={Boolean(busy)||!valid||(step==="line"&&lineChoice==="current"&&!line)}>
    {returnReview?"Guardar y volver a Revisión":"Continuar"} <ArrowRight size={17}/></button>}
  </div>:null}
  <p className={styles.footnote}><ShieldCheck size={14}/> Smart Call mantiene el control del número y la facturación.</p>
 </section>;
}
