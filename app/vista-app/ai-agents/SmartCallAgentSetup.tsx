"use client";
import {useMemo,useState} from "react";
import {Check,LoaderCircle,ShieldCheck} from "lucide-react";
import {storeAgent,setStudyStatus,type PersistedAgent} from "./agentStore";
import {inspectAgent} from "./agentQuality";
import styles from "./SmartCallAgentSetup.module.css";
type Props={agent:PersistedAgent;businessName:string;onUpdated:(updated:PersistedAgent)=>void};
const fields=[
 ["business_name","Nombre del negocio"],
 ["industry","¿A qué se dedica el negocio?"],
 ["country","País"],
 ["city","Ciudad"],
 ["state","Estado o provincia"],
 ["human_review","¿Qué debe hacer si necesita atención humana?"],
 ["data_scope","¿Qué datos del cliente puede solicitar?"],
 ["calls_goal","Objetivo de las llamadas"],
 ["call_forward","¿Qué hacer si no puede atender?"],
 ["support_topics","Temas sobre los que puede responder"],
 ["sales_catalog","Productos o servicios que puede mencionar"],
 ["sales_goal","Objetivo de ventas"],
 ["sales_discounts","¿Puede ofrecer descuentos?"],
 ["booking_services","Servicios que puede reservar"],
 ["booking_lead","Anticipación de las citas"],
 ["booking_cancel","Política de cancelaciones"],
 ["booking_confirmation","¿Quién confirma una reserva?"],
 ["inventory_products","Categorías de inventario"],
 ["inventory_freshness","Qué decir si el inventario no está actualizado"],
 ["ops_goal","Tareas de administración autorizadas"],
 ["ops_permissions","Qué cambios puede realizar"],
 ["custom_tasks","Tareas autorizadas"],
 ["custom_limits","Acciones prohibidas"]
] as const;
export default function SmartCallAgentSetup({agent,businessName,onUpdated}:Props){
 const [draft,setDraft]=useState<PersistedAgent>(agent);
 const [saving,setSaving]=useState(false),[error,setError]=useState("");
 const report=useMemo(()=>inspectAgent(draft),[draft]);
 const setup={...draft.setup};
 const missingKeys=new Set(report.missing.filter(x=>x.priority==="required").map(x=>x.id));
 const needed=(id:string)=>missingKeys.has(id);
 const phoneReady=setup.call_disclosure==="Sí"||setup.call_consent==="Sí";
 const channelReady=setup.channel==="Teléfono"||setup.channel==="Teléfono y chat"||
   (!setup.channel&&draft.kind==="calls");
 const put=(id:string,value:string)=>setDraft(p=>({...p,setup:{...p.setup,[id]:value}}));
 const activate=async()=>{
  if(saving)return;
  setError("");setSaving(true);
  try{
   if(!report.requiredPassed)throw Error("Completa los datos obligatorios que aparecen abajo.");
   if(!phoneReady)throw Error("Debes aprobar el aviso de que el cliente hablará con una IA.");
   if(!channelReady)throw Error("Autoriza el canal telefónico para Mi agente.");
   const changed=JSON.stringify(draft.setup)!==JSON.stringify(agent.setup)||
    draft.name!==agent.name||draft.purpose!==agent.purpose;
   const updated=changed?await storeAgent(draft,agent):agent;
   const active=updated.status==="active"?updated:await setStudyStatus(updated,"active");
   onUpdated(active);
  }catch(e){setError(e instanceof Error?e.message:"No se pudo activar este agente.");}
  finally{setSaving(false);}
 };
 if(agent.status==="active"&&phoneReady&&channelReady)return <div className={styles.ready}><Check size={18}/>
  <span>Mi agente está activo y autorizado para llamadas. La conexión al número se aprobará en el último paso.</span></div>;
 return <div className={styles.root}>
  <strong>Preparemos Mi agente aquí mismo</strong>
  <p>Completa lo que falta y autoriza el uso telefónico. No es necesario salir del asistente.</p>
  {needed("identity")?<div className={styles.fields}>
   <label>Nombre del agente<input maxLength={90} value={draft.name} onChange={e=>setDraft(p=>({...p,name:e.target.value}))}/></label>
   <label>Para qué ayudará<input maxLength={250} value={draft.purpose} onChange={e=>setDraft(p=>({...p,purpose:e.target.value}))}/></label>
  </div>:null}
  <div className={styles.fields}>
   {fields.filter(([key])=>
     !setup[key]&&(
      key==="business_name"&&needed("business")||
      key==="industry"&&needed("business")||
      ["country","city","state"].includes(key)&&needed("location")||
      key==="human_review"&&needed("escalation")||
      key==="data_scope"&&needed("privacy")||
      key==="calls_goal"&&needed("call_goal")||
      key==="call_forward"&&needed("call_handoff")||
      key==="support_topics"&&needed("faq")||
      key==="sales_catalog"&&needed("catalog")||
      key==="sales_goal"&&needed("sale_goal")||
      key==="sales_discounts"&&needed("discount")||
      key==="booking_services"&&needed("booking_services")||
      key==="booking_lead"&&needed("lead")||
      key==="booking_cancel"&&needed("cancel")||
      key==="booking_confirmation"&&needed("booking_confirmation")||
      key==="inventory_products"&&needed("inventory_catalog")||
      key==="inventory_freshness"&&needed("inventory_freshness")||
      key==="ops_goal"&&needed("ops_task")||
      key==="ops_permissions"&&needed("ops_approval")||
      key==="custom_tasks"&&needed("custom_scope")||
      key==="custom_limits"&&needed("custom_boundary")
    )).map(([key,label])=><label key={key}>{label}
      <input value={setup[key]||key==="business_name"&&businessName||""} maxLength={230}
       onChange={e=>put(key,e.target.value)}/></label>)}
  </div>
  <label className={styles.check}><input type="checkbox" checked={channelReady}
   onChange={e=>put("channel",e.target.checked?"Teléfono y chat":"Solo chat")}/>
   Autorizo que Mi agente atienda llamadas telefónicas.</label>
  <label className={styles.check}><input type="checkbox" checked={phoneReady}
   onChange={e=>put("call_disclosure",e.target.checked?"Sí":"No")}/>
   Autorizo el aviso de que quien llama será atendido por un agente de inteligencia artificial.</label>
  {report.missing.filter(c=>c.priority==="required").length?<p className={styles.missing}>
   Pendiente: {report.missing.filter(c=>c.priority==="required").map(c=>c.title).join(" · ")}
  </p>:null}
  {error?<p className={styles.error} role="alert">{error}</p>:null}
  <button className={styles.activate} type="button" onClick={()=>void activate()} disabled={saving}>
   {saving?<LoaderCircle size={17}/>:<ShieldCheck size={17}/>}
   {saving?"Guardando…":"Guardar y activar Mi agente"} </button>
  <small>La activación prepara al agente. La línea y el menú solo cambiarán con la aprobación final y la verificación de Twilio.</small>
 </div>;
}
