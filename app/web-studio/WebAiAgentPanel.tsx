"use client";
import {useEffect,useState} from "react";
import {createPortal} from "react-dom";
import {Bot,CheckCircle2,ChevronRight,ShieldCheck,X} from "lucide-react";
import AgentSetupWizard,{type WizardDraft} from "@/app/vista-app/ai-agents/AgentSetupWizard";
import {loadBusinessChoices,provisionAiWorkspace,centralPrefill,type CentralBusiness} from "@/app/vista-app/ai-agents/centralBusiness";
import {loadAgents,storeAgent,type PersistedAgent} from "@/app/vista-app/ai-agents/agentStore";
import styles from "./WebAiAgentPanel.module.css";

export type WebsiteAgentChoice={id:string;name:string;status:"draft"|"active"|"paused"};
const empty:WizardDraft={kind:"support",name:"Asistente para mi web",purpose:"Ayudar a los visitantes con consultas sobre productos, servicios y horarios.",personality:"Amable y profesional",language:"Español",instructions:"Contesta solo con información confirmada del negocio. Si falta un dato, ofrece que el dueño responda.",knowledge:"",setup:{}};

export default function WebAiAgentPanel({businessId,ownerId,selected,onSelect}:{
 businessId:string;ownerId:string;selected:WebsiteAgentChoice|null;onSelect:(agent:WebsiteAgentChoice|null)=>void;
}){
 const [open,setOpen]=useState(false);
 const [creating,setCreating]=useState(false);
 const [business,setBusiness]=useState<CentralBusiness|null>(null);
 const [workspace,setWorkspace]=useState("");
 const [agents,setAgents]=useState<PersistedAgent[]>([]);
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 useEffect(()=>{
  let alive=true;
  setAgents([]);setWorkspace("");setBusiness(null);setError("");setLoading(true);
  if(!businessId){setLoading(false);return;}
  void(async()=>{
   try{
    const [choices,all]=await Promise.all([loadBusinessChoices(),loadAgents()]);
    if(!alive)return;
    if(choices.owner!==ownerId)throw Error("Tu sesión cambió. Recarga el asistente.");
    const central=choices.businesses.find(b=>b.id===businessId);
    if(!central)throw Error("Selecciona un negocio registrado en VMV.");
    const match=choices.workspaces.find(w=>w.central_business_id===businessId);
    setBusiness(central);setWorkspace(match?.id||"");
    setAgents(all.filter(a=>a.business_id===match?.id));
   }catch(e){if(alive)setError(e instanceof Error?e.message:"No se pudieron cargar los agentes.");}
   finally{if(alive)setLoading(false);}
  })();
  return()=>{alive=false;};
 },[businessId,ownerId]);
 useEffect(()=>{
  if(!open)return;
  const old=document.body.style.overflow;
  document.body.style.overflow="hidden";
  return()=>{document.body.style.overflow=old;};
 },[open]);
 async function begin(){
  if(!businessId||!business)return;
  setSaving(true);setError("");
  try{
   const id=workspace||await provisionAiWorkspace(businessId);
   setWorkspace(id);setCreating(true);setOpen(true);
  }catch(e){setError(e instanceof Error?e.message:"No se pudo preparar el agente.");}
  finally{setSaving(false);}
 }
 async function save(updated:WizardDraft){
  setSaving(true);setError("");
  try{
   const id=workspace||await provisionAiWorkspace(businessId);
   const agent=await storeAgent(updated,null,id);
   setWorkspace(id);setAgents(current=>[agent,...current]);
   onSelect({id:agent.id,name:agent.name,status:agent.status});
   setNotice("Agente guardado como borrador en AI Agents. Las consultas web seguirán llegando a tu bandeja hasta activar el canal público.");
   setCreating(false);setOpen(false);
  }catch(e){setError(e instanceof Error?e.message:"No se pudo guardar el agente.");throw e;}
  finally{setSaving(false);}
 }
 const initial=business?centralPrefill(business,empty):empty;
 return <div className={styles.root}>
  <div className={styles.heading}><Bot size={21}/><div><strong>Preparar un agente desde aquí</strong><small>No perderás los colores, fotos ni el progreso del asistente.</small></div></div>
  <p className={styles.note}>El canal público de respuestas automáticas aún no está disponible. Puedes configurar un agente existente o crear uno nuevo ahora. Hasta entonces, los mensajes llegarán a la bandeja de VMV.</p>
  {loading?<p className={styles.muted}>Buscando agentes del negocio…</p>:null}
  {agents.length?<div className={styles.agentList}>{agents.map(agent=><label key={agent.id}>
   <input type="radio" name="web-agent-choice" checked={selected?.id===agent.id}
    onChange={()=>{onSelect({id:agent.id,name:agent.name,status:agent.status});setNotice("Agente elegido para preparar la futura conexión web. La respuesta sigue siendo manual.");}}/>
   <span><strong>{agent.name}</strong><small>{agent.status==="active"?"Activo en AI Agents":agent.status==="draft"?"Borrador":"Pausado"} · no conectado al chat público</small></span>
  </label>)}</div>:!loading?<p className={styles.muted}>Todavía no hay agentes configurados para este negocio.</p>:null}
  <div className={styles.actions}>
   <button type="button" disabled={saving||loading||!business} onClick={()=>void begin()}><Bot size={17}/> Crear y configurar agente <ChevronRight size={16}/></button>
   {selected?<button type="button" className={styles.clear} onClick={()=>onSelect(null)}>Quitar selección</button>:null}
  </div>
  {selected?<p className={styles.selected}><CheckCircle2 size={16}/> Seleccionado: {selected.name}. La conexión web automática queda pendiente.</p>:null}
  {notice?<p className={styles.selected} role="status">{notice}</p>:null}
  {error?<p role="alert" className={styles.error}>{error}</p>:null}
  {open&&business&&typeof document!=="undefined"?createPortal(
   <div className={styles.overlay}>
    <section className={styles.modal} role="dialog" aria-modal="true" aria-label="Configurar agente para tu web">
     <header><div><strong>Tu agente para {business.name}</strong><small>Configuración integrada · Las respuestas en web requieren una conexión posterior.</small></div>
      <button type="button" disabled={saving} onClick={()=>{setOpen(false);setCreating(false);}} aria-label="Cerrar configuración"><X size={20}/></button></header>
     {error?<p role="alert" className={styles.error}>{error}</p>:null}
     {creating?<AgentSetupWizard initial={initial} workspaceId={workspace} saving={saving} onCancel={()=>{setOpen(false);setCreating(false);}} onSave={save}/>:null}
     <footer><ShieldCheck size={16}/> Guardar el agente no autoriza pagos, reservas ni respuestas públicas automáticas.</footer>
    </section>
   </div>,document.body):null}
 </div>;
}
