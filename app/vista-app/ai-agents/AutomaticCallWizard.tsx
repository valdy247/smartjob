"use client";
import {useEffect,useState} from "react";
import {ArrowLeft,ArrowRight,Bot,Check,LoaderCircle,Pencil,PhoneCall,ShieldCheck,Sparkles} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {loadPhoneSelection,selectPhoneAgent,type PersistedAgent,type PhoneSelection} from "./agentStore";
import {checkCallPolicy,days,initialCallPolicy,zoneOptions,type CallPolicy,type DayName} from "@/lib/vmv-ai-agents/call-policy";
import type {CentralBusiness} from "./centralBusiness";
import theme from "./AgentServiceFlow.module.css";
import styles from "./AutomaticWebWizard.module.css";
import extra from "./AutomaticCallWizard.module.css";

type Step="business"|"line"|"services"|"agent"|"hours"|"priority"|"voice"|"review";
type Voice="default"|"bright"|"calm";
type Preferences={voice_customer:Voice;voice_owner:Voice;greeting_customer:string;greeting_owner:string};
const defaults:Preferences={voice_customer:"default",voice_owner:"default",greeting_customer:"",greeting_owner:""};
const labels:Record<Step,string>={
 business:"¿Qué negocio vamos a configurar?",
 line:"¿Qué número configuraremos?",
 services:"¿Qué funciones tendrá tu línea?",
 agent:"¿Cómo atenderá Mi agente las llamadas?",
 hours:"¿En qué horarios atenderemos?",
 priority:"¿Qué hacemos cuando entran llamadas?",
 voice:"¿Qué voz y saludo usaremos?",
 review:"Revisa las reglas antes de guardarlas"
};
const weekdays:Record<DayName,string>={sun:"Domingo",mon:"Lunes",tue:"Martes",wed:"Miércoles",thu:"Jueves",fri:"Viernes",sat:"Sábado"};
function validGreeting(v:string){return v.length<=180&&!/[<>\r\n]/.test(v)&&(!v.trim()||v.trim().length>=10);}
async function callApi(method:"GET"|"PUT",payload?:object){
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
export default function AutomaticCallWizard({business,agent,workspaceId,onClose,onAdvanced,businesses,onChooseBusiness}:{
 business:CentralBusiness;agent:PersistedAgent;workspaceId:string;onClose:()=>void;onAdvanced:()=>void;
 businesses:CentralBusiness[];onChooseBusiness:(id:string)=>void;
}){
 const [step,setStep]=useState<Step>("business"),[returnReview,setReturnReview]=useState(false);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(""),[error,setError]=useState("");
 const [owner,setOwner]=useState(""),[line,setLine]=useState<PhoneSelection|null>(null);
 const [version,setVersion]=useState(0),[policy,setPolicy]=useState<CallPolicy>(initialCallPolicy);

 const [agentReady,setAgentReady]=useState(false),[businessHours,setBusinessHours]=useState(false);
 const [forwardReady,setForwardReady]=useState(false);
 const [bindAgent,setBindAgent]=useState(false);
 const [prefs,setPrefs]=useState<Preferences>(defaults),[originalPrefs,setOriginalPrefs]=useState<Preferences>(defaults);
 const [prefEditable,setPrefEditable]=useState(false),[preferencesAvailable,setPreferencesAvailable]=useState(false);
 const [saved,setSaved]=useState(false);
 const [showBusinesses,setShowBusinesses]=useState(false);
 const [lineChoice,setLineChoice]=useState<"current"|"different"|"new">("current");
 const patch=<K extends keyof CallPolicy>(key:K,value:CallPolicy[K])=>
  setPolicy(v=>({...v,[key]:value}));
 const schedule=policy.agent_enabled&&policy.agent_mode==="schedule"||
  policy.translation_enabled&&policy.translation_mode==="schedule";
 const steps:Step[]=["business","line","services",
  ...(policy.agent_enabled?["agent" as Step]:[]),
  ...(schedule?["hours" as Step]:[]),"priority","voice","review"];
 const index=Math.max(0,steps.indexOf(step));
 const valid=step==="services"?(policy.agent_enabled||policy.translation_enabled):
  step==="line"?Boolean(line?.routeId):
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
  if(!valid||busy||(step==="line"&&!line))return;
  setError("");
  if(returnReview){setReturnReview(false);setStep("review");return;}
  setStep(steps[Math.min(index+1,steps.length-1)]);
 };
 const previous=()=>{
  if(returnReview){setReturnReview(false);setStep("review");return;}
  if(index===0){onClose();return;}setStep(steps[index-1]);
 };
 const edit=(target:Step)=>{setReturnReview(true);setStep(target);setSaved(false);};
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
   if(policy.agent_enabled&&bindAgent&&line.agentId!==agent.id){
    if(agent.status!=="active")throw Error("Primero activa Mi agente antes de asignarlo al número.");
    await selectPhoneAgent(line.routeId,agent);
    setLine(p=>p?{...p,agentId:agent.id}:p);
    selectionChanged=true;
   }
   if(policy.agent_enabled&&(!bindAgent||(!agentReady&&!selectionChanged&&line.agentId!==agent.id))){
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
    Ningún cambio se aplicará automáticamente. Vuelve a seleccionar tu línea actual para continuar.
   </div>:null}
   <p className={styles.note}>No compramos líneas ni modificamos el desvío telefónico sin una configuración aparte.</p>
  </div>:null}
  {!loading&&step==="services"&&owner?<div className={styles.panel}>
   <div className={styles.optionsVertical}>
    {([["both","Atender con IA y traducir llamadas"],
      ["agent","Solo atender con Mi agente IA"],
      ["translation","Solo traducción Smart Call"]] as const).map(([value,label])=>{
     const chosen=value==="both"?policy.agent_enabled&&policy.translation_enabled:
      value==="agent"?policy.agent_enabled&&!policy.translation_enabled:
       !policy.agent_enabled&&policy.translation_enabled;
     return <button type="button" key={value} className={chosen?styles.optionActive:styles.option}
      aria-pressed={chosen} onClick={()=>
       setPolicy(p=>({...p,agent_enabled:value!=="translation",
        translation_enabled:value!=="agent",
        outside_action:value==="agent"?"message":p.outside_action}))}>
       {chosen?<Check size={16}/>:null}{label}</button>;
    })}
   </div>
   {policy.translation_enabled?<label className={styles.field}>Horario de traducción
    <select value={policy.translation_mode}
     onChange={event=>patch("translation_mode",event.target.value as CallPolicy["translation_mode"])}>
     <option value="always">Siempre disponible</option>
     <option value="schedule">Solo por horario</option>
    </select></label>:null}
  </div>:null}
  {!loading&&step==="agent"&&policy.agent_enabled&&owner?<div className={styles.panel}>
   <div className={extra.line}><strong>{agent.name}</strong><small>
    {agent.status==="active"?"Agente activo":"Agente aún no activo"}</small></div>
   <label className={styles.checkLine}><input type="checkbox" checked={bindAgent}
    onChange={e=>setBindAgent(e.target.checked)}/>
    Asignar Mi agente a esta línea telefónica</label>
   <label className={styles.field}>Cómo responderá Mi agente
    <select value={policy.agent_mode} onChange={e=>patch("agent_mode",e.target.value as CallPolicy["agent_mode"])}>
     <option value="always">Siempre que esté disponible</option>
     <option value="schedule">Solo en horario configurado</option>
     {forwardReady?<option value="after_no_answer">Cuando no conteste una persona</option>:null}
    </select></label>
   {policy.agent_mode==="after_no_answer"&&<label className={styles.field}>Segundos antes de transferir
    <select value={policy.ring_seconds} onChange={e=>patch("ring_seconds",Number(e.target.value))}>
     {[10,15,18,20,25,30].map(v=><option value={v} key={v}>{v} segundos</option>)}
    </select></label>}
   {agent.status!=="active"?<p className={styles.warning}>Debes activar y preparar el canal telefónico en Identidad del agente antes de guardar.</p>:null}
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

   {policy.agent_enabled&&policy.translation_enabled?<div className={styles.optionsVertical}>
    {([["menu","El cliente elige en el menú"],["agent_first","Mi agente responde primero"],
      ["translation_first","Smart Call traduce primero"]] as const).map(([value,label])=>
     <button type="button" key={value} className={policy.coexistence===value?styles.optionActive:styles.option}
      onClick={()=>patch("coexistence",value)}>{label}</button>)}</div>:null}
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
   {preferencesAvailable&&prefEditable?<div className={styles.optionsVertical}>
    <label className={styles.field}>Voz para el cliente<select value={prefs.voice_customer}
     onChange={e=>setPrefs(p=>({...p,voice_customer:e.target.value as Voice}))}>
     <option value="default">Original</option><option value="bright">Clara</option><option value="calm">Tranquila</option>
    </select></label>
    <label className={styles.field}>Voz para ti<select value={prefs.voice_owner}
     onChange={e=>setPrefs(p=>({...p,voice_owner:e.target.value as Voice}))}>
     <option value="default">Original</option><option value="bright">Clara</option><option value="calm">Tranquila</option>
    </select></label>
    <label className={styles.field}>Saludo al cliente (opcional)
     <textarea rows={3} maxLength={180} value={prefs.greeting_customer}
      onChange={e=>setPrefs(p=>({...p,greeting_customer:e.target.value}))}/></label>
    <label className={styles.field}>Saludo al propietario (opcional)
     <textarea rows={3} maxLength={180} value={prefs.greeting_owner}
      onChange={e=>setPrefs(p=>({...p,greeting_owner:e.target.value}))}/></label>
   </div>:<div className={styles.info}>Las voces y saludos de Smart Call no están disponibles para editar en tu cuenta actual.
    No se modificará esa configuración.</div>}
   <p className={styles.note}>Configuración guiada aquí. Los accesos manuales se conservarán en Cuenta → Configuración.</p>
  </div>:null}
  {!loading&&step==="review"&&owner?<div className={styles.panel}>
   {saved?<div className={extra.success}><Check size={24}/>
    <strong>Configuración guardada</strong>
    <p>Las nuevas reglas se aplicarán a las próximas llamadas. La ruta telefónica de Twilio no se modificó.</p>
    <a href="/vista-app?tab=services&service=smart-call">Ver Smart Call</a></div>:
    <div className={styles.review}>
     {card("Negocio",business.name,"business")}
     {card("Número",line?.maskedNumber||"Pendiente","line")}
     {card("Servicios",policy.agent_enabled&&policy.translation_enabled?"IA + Traducción":
      policy.agent_enabled?"Mi agente IA":"Traducción","services")}
     {policy.agent_enabled?card("Mi agente",bindAgent?agent.name:"Sin asignar","agent"):null}
     {card("Horarios",schedule?(policy.use_business_hours?"Horario del negocio":"Horario personalizado"):"Siempre","hours")}
     {card("Prioridad",policy.coexistence+" · "+policy.outside_action,"priority")}
     {card("Voz",prefEditable?prefs.voice_customer+" · "+prefs.voice_owner:"Sin cambios","voice")}
    </div>}
   {!saved?<p className={styles.note}>Debes aprobar cualquier cambio de selección y reglas. No compraremos números ni activaremos gastos adicionales automáticamente.</p>:null}

  </div>:null}
  {error?<p className={styles.error} role="alert">{error}</p>:null}
  {!loading&&owner?<div className={styles.footer}>
   {step==="review"?<button type="button" className={styles.primary+" "+theme.agentButton}
    onClick={()=>void save()} disabled={Boolean(busy)||saved}>
    {busy==="save"?<LoaderCircle size={17}/>:<ShieldCheck size={18}/>}
    {busy==="save"?"Guardando…":saved?"Guardado":"Aprobar y guardar reglas"} <ArrowRight size={17}/></button>:
   <button type="button" className={styles.primary+" "+theme.agentButton}
    onClick={next} disabled={Boolean(busy)||!valid||(step==="line"&&(!line||lineChoice!=="current"))}>
    {returnReview?"Guardar y volver a Revisión":"Continuar"} <ArrowRight size={17}/></button>}
  </div>:null}
  <p className={styles.footnote}><ShieldCheck size={14}/> Smart Call mantiene el control del número y la facturación.</p>
 </section>;
}
