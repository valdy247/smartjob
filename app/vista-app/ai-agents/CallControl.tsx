"use client";
import {useEffect,useState} from "react";
import {ArrowLeft,Check,Languages,MessageCircle,PhoneCall,ShieldCheck} from "lucide-react";
import {useAgentHeaderBack} from "./AgentHeaderBack";
import {getSupabase} from "@/lib/supabase";
import {checkCallPolicy,days,initialCallPolicy,zoneOptions,type CallPolicy,type DayName} from "@/lib/vmv-ai-agents/call-policy";
import styles from "./CallControl.module.css";
import CallPreviewChat from "./CallPreviewChat";
const weekLabels:Record<DayName,string>={sun:"Domingo",mon:"Lunes",tue:"Martes",wed:"Miércoles",thu:"Jueves",fri:"Viernes",sat:"Sábado"};
type Info={policy:CallPolicy;version:number;maskedPhone:string;agentActive:boolean;selectedAgentId:string|null;forwardReady:boolean;businessHoursReady:boolean;source?:"saved"|"legacy_menu";error?:string};
async function request(method:"GET"|"POST"|"PUT",payload?:object){
 const db=getSupabase();if(!db)throw Error("Supabase no disponible.");
 const {data}=await db.auth.getSession();if(!data.session?.access_token)throw Error("Inicia sesión en VMV.");
 const r=await fetch("/api/vmv/ai-agents/call-settings",{method,cache:"no-store",
  headers:{"Content-Type":"application/json",Authorization:"Bearer "+data.session.access_token},
  ...(payload?{body:JSON.stringify(payload)}:{})});
 const result=await r.json();
 if(!r.ok)throw Error(result.error||"No se pudo comprobar la configuración.");
 return result;
}
export default function CallControl({onBack}:{onBack:()=>void}){
 const useSharedHeader=useAgentHeaderBack(onBack);
 const [policy,setPolicy]=useState<CallPolicy>(initialCallPolicy);
 const [savedPolicy,setSavedPolicy]=useState<CallPolicy|null>(null);
 const [legacyMenu,setLegacyMenu]=useState(false);
 const [version,setVersion]=useState(0);
 const [line,setLine]=useState("");
 const [selectedAgentId,setSelectedAgentId]=useState<string|null>(null);
 const [preview,setPreview]=useState(false);
 const [ready,setReady]=useState(false);
 const [forward,setForward]=useState(false);
 const [business,setBusiness]=useState(false);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState("");
 const pending=Boolean(savedPolicy&&JSON.stringify(policy)!==JSON.stringify(savedPolicy));
 const patch=<K extends keyof CallPolicy>(k:K,v:CallPolicy[K])=>setPolicy(x=>({...x,[k]:v}));
 useEffect(()=>{let active=true;void request("GET").then((x:Info)=>{
  if(!active)return;const current=checkCallPolicy(x.policy);setPolicy(current);
  setSavedPolicy(current);setLegacyMenu(x.source==="legacy_menu");setVersion(x.version);
  setLine(x.maskedPhone);setSelectedAgentId(x.selectedAgentId);
  setReady(Boolean(x.selectedAgentId&&x.agentActive));
  setForward(x.forwardReady);setBusiness(x.businessHoursReady);
 }).catch(e=>{if(active)setNotice(String(e.message));}).finally(()=>{if(active)setLoading(false);});
 return()=>{active=false;};},[]);
 const setDay=(d:DayName,k:"enabled"|"start"|"end",v:boolean|string,
  target:"schedule"|"translation_schedule"="schedule")=>{
  setPolicy(x=>({...x,[target]:{...x[target],[d]:{...x[target][d],[k]:v}}}));
 };
 const submit=async()=>{
  if(busy)return;
  if(policy.agent_enabled&&!ready){setNotice("No se guardó: selecciona y activa un agente telefónico. La línea no cambió.");return;}
  setBusy(true);setNotice("");
  try{const x=await request("PUT",{policy:checkCallPolicy(policy),version});
   const next=checkCallPolicy(x.policy);setPolicy(next);setSavedPolicy(next);
   setLegacyMenu(false);setVersion(x.version);setNotice("Reglas guardadas en VMV. No se modificó la ruta telefónica de Twilio.");
  }catch(e){setNotice(e instanceof Error?e.message:"No se pudo guardar.");}finally{setBusy(false);}
 };
 return <div className={styles.root}>
  {!useSharedHeader?<button type="button" className={styles.back} onClick={onBack}><ArrowLeft size={16}/> AI Agents</button>:null}
  <header className={styles.hero}>
   <span className={styles.heroEyebrow}>CONFIGURACIÓN DE LÍNEA</span>
   <h1>Atención de llamadas<span>.</span></h1>
   <p>Decide cómo quieres atender a tus clientes.</p>
   <span className={styles.lineChip}><PhoneCall size={15}/>{line?"Número "+line:"Tu número de VMV"}</span>
  </header>
  {notice&&<p className={styles.notice} role="status">{notice}</p>}
  {!loading&&legacyMenu?<p className={styles.routeWarning} role="status">Esta línea no tiene reglas guardadas: continúa con el menú telefónico anterior.</p>:null}
  {loading?<p>Cargando configuración…</p>:<div className={styles.stack}>
   <section className={`${styles.section} ${styles.featureSection}`}>
    <span className={styles.featureEyebrow}>AGENTE IA</span>
    <div className={styles.featureTop}>
     <span className={styles.featureIcon}><PhoneCall size={24}/></span>
     <div className={styles.featureTitle}><h2>Atender con IA</h2><p>Tu agente responde las llamadas por ti.</p></div>
     <label className={styles.switch}><span className={styles.srOnly}>Atender con IA</span><input type="checkbox" checked={policy.agent_enabled} onChange={e=>patch("agent_enabled",e.target.checked)}/></label>
    </div>
    <small className={styles.featureHint}>{ready?"Agente elegido y activo":"Selecciona y activa un agente antes de guardar"}</small>
    {policy.agent_enabled&&<>
     <label>Modalidad<select value={policy.agent_mode} onChange={e=>patch("agent_mode",e.target.value as CallPolicy["agent_mode"])}>
      <option value="always">Siempre</option><option value="schedule">Por horario</option>
      {forward&&<option value="after_no_answer">Cuando no conteste una persona</option>}
     </select></label>
     {policy.agent_mode==="after_no_answer"&&<>
      <label>Tiempo de espera<select value={policy.ring_seconds} onChange={e=>patch("ring_seconds",Number(e.target.value))}>
       {[10,15,18,20,25,30].map(n=><option key={n} value={n}>{n} segundos</option>)}
      </select></label><small>Intenta llamar al teléfono autorizado. Puede generar cargos telefónicos.</small>
     </>}
     {policy.agent_enabled&&policy.agent_mode==="schedule"&&<div className={styles.inlineHours}>
      <h3>Horario del agente IA</h3>
      <label>Zona horaria del negocio<select value={policy.time_zone} onChange={e=>patch("time_zone",e.target.value)}>
       {zoneOptions.map(z=><option key={z} value={z}>{z.replace("America/","").replaceAll("_"," ")}</option>)}
      </select></label>
      <small>El horario aparece aquí cuando eliges «Por horario».</small>
      {business&&<label className={styles.toggle}>Usar el horario del negocio
       <input type="checkbox" checked={policy.use_business_hours}
        onChange={e=>patch("use_business_hours",e.target.checked)}/></label>}
      {!policy.use_business_hours&&days.map(d=><div key={d} className={styles.day}>
       <label className={styles.toggle}><span>{weekLabels[d]}</span><input type="checkbox"
        checked={policy.schedule[d].enabled} onChange={e=>setDay(d,"enabled",e.target.checked)}/></label>
       {policy.schedule[d].enabled&&<div className={styles.time}>
        <label>Desde<input type="time" value={policy.schedule[d].start}
         onChange={e=>setDay(d,"start",e.target.value)}/></label>
        <label>Hasta<input type="time" value={policy.schedule[d].end}
         onChange={e=>setDay(d,"end",e.target.value)}/></label>
       </div>}
      </div>)}
     </div>}
    </>}
   </section>
   <section className={`${styles.section} ${styles.featureSection}`}>
    <span className={styles.featureEyebrow}>SMART CALL</span>
    <div className={styles.featureTop}>
     <span className={styles.featureIcon}><Languages size={24}/></span>
     <div className={styles.featureTitle}><h2>Traducción</h2><p>Conversa con clientes en otros idiomas.</p></div>
     <label className={styles.switch}><span className={styles.srOnly}>Activar traducción</span><input type="checkbox" checked={policy.translation_enabled}
      onChange={e=>{patch("translation_enabled",e.target.checked);if(!e.target.checked)patch("outside_action","message");}}/></label>
    </div>
    {!policy.translation_enabled&&pending?<p className={styles.pendingWarning} role="status">Traducción apagada, pero el cambio aún no está guardado.</p>:null}
    {policy.translation_enabled&&<label>Disponibilidad<select value={policy.translation_mode}
     onChange={e=>patch("translation_mode",e.target.value as CallPolicy["translation_mode"])}>
     <option value="always">Siempre</option><option value="schedule">Por horario</option>
    </select></label>}
     {policy.translation_enabled&&policy.translation_mode==="schedule"&&<div className={styles.inlineHours}>
      <h3>Horario de traducción</h3>
      <label>Zona horaria del negocio<select value={policy.time_zone} onChange={e=>patch("time_zone",e.target.value)}>
       {zoneOptions.map(z=><option key={z} value={z}>{z.replace("America/","").replaceAll("_"," ")}</option>)}
      </select></label>

      <small>Independiente del agente. Conserva el traductor existente.</small>
      {days.map(d=><div key={d} className={styles.day}>
       <label className={styles.toggle}><span>{weekLabels[d]}</span><input type="checkbox"
        checked={policy.translation_schedule[d].enabled}
        onChange={e=>setDay(d,"enabled",e.target.checked,"translation_schedule")}/></label>
       {policy.translation_schedule[d].enabled&&<div className={styles.time}>
        <label>Desde<input type="time" value={policy.translation_schedule[d].start}
         onChange={e=>setDay(d,"start",e.target.value,"translation_schedule")}/></label>
        <label>Hasta<input type="time" value={policy.translation_schedule[d].end}
         onChange={e=>setDay(d,"end",e.target.value,"translation_schedule")}/></label>
       </div>}
      </div>)}
      <small>Los turnos nocturnos continúan hasta el cierre del día siguiente.</small>
     </div>}
   </section>
   <button type="button" className={styles.secondary} onClick={()=>setPreview(value=>!value)}>
    <MessageCircle size={17}/> {preview?"Cerrar prueba":"Probar llamada"}
   </button>
   {preview?<CallPreviewChat policy={policy} selectedAgentId={selectedAgentId} onClose={()=>setPreview(false)}/>:null}
   {policy.agent_enabled&&policy.translation_enabled&&<section className={`${styles.section} ${styles.rulesSection}`}>
    <h2>Si ambos están disponibles</h2>
    <select aria-label="Prioridad" value={policy.coexistence}
     onChange={e=>patch("coexistence",e.target.value as CallPolicy["coexistence"])}>
     <option value="menu">El cliente elige en un menú</option>
     <option value="agent_first">Responde primero el agente IA</option>
     <option value="translation_first">Inicia Smart Call con traducción</option>
    </select>
   </section>}
   <section className={`${styles.section} ${styles.rulesSection}`}><h2>Fuera de horario</h2>
    <label>Si no hay atención<select value={policy.outside_action}
     onChange={e=>patch("outside_action",e.target.value as CallPolicy["outside_action"])}>
     {policy.translation_enabled&&<option value="translation">Usar Smart Call si está disponible</option>}
     <option value="message">Mensaje y cierre</option>
    </select></label>
    {policy.outside_action==="message"&&<textarea rows={3} maxLength={220}
     aria-label="Mensaje de cierre" value={policy.closed_message}
     onChange={e=>patch("closed_message",e.target.value)}/>}
   </section>
   {pending?<p className={styles.pendingWarning} role="status">Tienes cambios sin guardar.</p>:null}
   <div className={styles.summary}><ShieldCheck size={17}/><p>El menú real depende de la ruta de Twilio; guardar aquí no la modifica.</p></div>
   <button className={styles.primary} type="button" disabled={busy} onClick={()=>void submit()}>
    <Check size={17}/> {busy?"Procesando…":pending?"Guardar cambios":"Guardar configuración"}</button>
  </div>}
 </div>;
}
