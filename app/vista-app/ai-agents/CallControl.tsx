"use client";
import {useEffect,useState} from "react";
import {ArrowLeft,Check,PhoneCall,ShieldCheck,TestTube2} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {checkCallPolicy,days,initialCallPolicy,zoneOptions,type CallPolicy,type DayName} from "@/lib/vmv-ai-agents/call-policy";
import styles from "./CallControl.module.css";
const weekLabels:Record<DayName,string>={sun:"Domingo",mon:"Lunes",tue:"Martes",wed:"Miércoles",thu:"Jueves",fri:"Viernes",sat:"Sábado"};
type Info={policy:CallPolicy;version:number;maskedPhone:string;agentActive:boolean;selectedAgentId:string|null;forwardReady:boolean;businessHoursReady:boolean;error?:string};
type Evaluation={decision:{action:string;agentAvailable:boolean;translationAvailable:boolean};error?:string};
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
 const [policy,setPolicy]=useState<CallPolicy>(initialCallPolicy);
 const [version,setVersion]=useState(0);
 const [line,setLine]=useState("");
 const [ready,setReady]=useState(false);
 const [forward,setForward]=useState(false);
 const [business,setBusiness]=useState(false);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState("");
 const [testDay,setTestDay]=useState<DayName>("mon");
 const [testTime,setTestTime]=useState("10:00");
 const [result,setResult]=useState("");
 const patch=<K extends keyof CallPolicy>(k:K,v:CallPolicy[K])=>{setPolicy(x=>({...x,[k]:v}));setResult("");};
 useEffect(()=>{let active=true;void request("GET").then((x:Info)=>{
  if(!active)return;setPolicy(checkCallPolicy(x.policy));setVersion(x.version);
  setLine(x.maskedPhone);setReady(Boolean(x.selectedAgentId&&x.agentActive));
  setForward(x.forwardReady);setBusiness(x.businessHoursReady);
 }).catch(e=>{if(active)setNotice(String(e.message));}).finally(()=>{if(active)setLoading(false);});
 return()=>{active=false;};},[]);
 const setDay=(d:DayName,k:"enabled"|"start"|"end",v:boolean|string,
  target:"schedule"|"translation_schedule"="schedule")=>{
  setPolicy(x=>({...x,[target]:{...x[target],[d]:{...x[target][d],[k]:v}}}));setResult("");
 };
 const submit=async()=>{
  if(busy)return;setBusy(true);setNotice("");
  try{const x=await request("PUT",{policy:checkCallPolicy(policy),version});
   setPolicy(x.policy);setVersion(x.version);setNotice("Guardado. Se aplicará a las próximas llamadas.");
  }catch(e){setNotice(e instanceof Error?e.message:"No se pudo guardar.");}finally{setBusy(false);}
 };
 const simulate=async()=>{
  if(busy)return;setBusy(true);setNotice("");
  try{const x=await request("POST",{policy,day:testDay,time:testTime}) as Evaluation;
   setResult(({menu:"Se ofrece el menú para elegir agente o traducción",
    agent:"Responde el agente de IA seleccionado",translation:"Se utiliza Smart Call",
    ring_owner:"Primero suena el teléfono del negocio; si nadie contesta, atiende el agente",
    message:"Se reproduce el mensaje de cierre y termina la llamada"} as Record<string,string>)[x.decision.action]||"Sin atención");
  }catch(e){setNotice(e instanceof Error?e.message:"No se pudo probar.");}finally{setBusy(false);}
 };
 return <div className={styles.root}>
  <button type="button" className={styles.back} onClick={onBack}><ArrowLeft size={16}/> AI Agents</button>
  <header className={styles.hero}><PhoneCall size={24}/><div><small>CONFIGURACIÓN DE LÍNEA</small>
   <h1>Atención de llamadas</h1><p>{line?"Número "+line:"Tu número de VMV"}</p></div></header>
  {notice&&<p className={styles.notice} role="status">{notice}</p>}
  {loading?<p>Cargando configuración…</p>:<div className={styles.stack}>
   <section className={styles.section}><h2>Agente IA</h2>
    <label className={styles.toggle}>Atender con IA <input type="checkbox" checked={policy.agent_enabled} onChange={e=>patch("agent_enabled",e.target.checked)}/></label>
    <small>{ready?"Agente elegido y activo":"Selecciona y activa un agente antes de guardar"}</small>
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
   <section className={styles.section}><h2>Traducción</h2>
    <label className={styles.toggle}>Activar traducción <input type="checkbox" checked={policy.translation_enabled}
     onChange={e=>{patch("translation_enabled",e.target.checked);if(!e.target.checked)patch("outside_action","message");}}/></label>
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
   {policy.agent_enabled&&policy.translation_enabled&&<section className={styles.section}>
    <h2>Si ambos están disponibles</h2>
    <select aria-label="Prioridad" value={policy.coexistence}
     onChange={e=>patch("coexistence",e.target.value as CallPolicy["coexistence"])}>
     <option value="menu">El cliente elige en un menú</option>
     <option value="agent_first">Responde primero el agente IA</option>
     <option value="translation_first">Inicia Smart Call con traducción</option>
    </select>
   </section>}
   <section className={styles.section}><h2>Fuera de horario</h2>
    <label>Si no hay atención<select value={policy.outside_action}
     onChange={e=>patch("outside_action",e.target.value as CallPolicy["outside_action"])}>
     {policy.translation_enabled&&<option value="translation">Usar Smart Call si está disponible</option>}
     <option value="message">Mensaje y cierre</option>
    </select></label>
    {policy.outside_action==="message"&&<textarea rows={3} maxLength={220}
     aria-label="Mensaje de cierre" value={policy.closed_message}
     onChange={e=>patch("closed_message",e.target.value)}/>}
   </section>
   <div className={styles.summary}><ShieldCheck size={17}/><p>Las reglas se aplican en el servidor a nuevas llamadas. El traductor existente no se modifica.</p></div>
   <button className={styles.primary} type="button" disabled={busy} onClick={()=>void submit()}>
    <Check size={17}/> {busy?"Procesando…":"Guardar configuración"}</button>
   <section className={styles.section}><h2>Probar configuración</h2>
    <p className={styles.hint}>Simula un horario sin realizar llamadas.</p>
    <div className={styles.time}>
     <select aria-label="Día" value={testDay} onChange={e=>setTestDay(e.target.value as DayName)}>
      {days.map(d=><option key={d} value={d}>{weekLabels[d]}</option>)}
     </select>
     <input type="time" aria-label="Hora" value={testTime} onChange={e=>setTestTime(e.target.value)}/>
    </div>
    <button className={styles.secondary} disabled={busy} type="button" onClick={()=>void simulate()}>
     <TestTube2 size={16}/> Ver resultado</button>
    {result&&<p className={styles.result} role="status">{result}</p>}
   </section>
  </div>}
 </div>;
}
