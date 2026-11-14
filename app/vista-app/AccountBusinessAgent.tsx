"use client";
import dynamic from "next/dynamic";
import {useEffect,useRef,useState} from "react";
import {Bot,BriefcaseBusiness,ChevronRight,RefreshCw,Wallet} from "lucide-react";
import {useInterfaceLanguage} from "@/lib/i18n-web";
const BusinessProfileDialog=dynamic(()=>import("./ai-agents/BusinessProfileDialog"));
import type {WizardDraft} from "./ai-agents/AgentSetupWizard";
const AgentSetupWizard=dynamic(()=>import("./ai-agents/AgentSetupWizard"));
import {businessMissing,centralPrefill,choosePrincipalAgent,loadBusinessChoices,provisionAiWorkspace,type CentralBusiness,type AiWorkspace} from "./ai-agents/centralBusiness";
import {loadAgents,storeAgent,type PersistedAgent} from "./ai-agents/agentStore";
import {inspectAgent} from "./ai-agents/agentQuality";
import styles from "./AccountBusinessAgent.module.css";

function AgentDialog({children,onClose,busy,title}:{children:React.ReactNode;onClose:()=>void;busy:boolean;title:string}){
 const ref=useRef<HTMLDialogElement>(null);
 const {language}=useInterfaceLanguage();
 useEffect(()=>{const d=ref.current;d?.showModal();return()=>d?.close();},[]);
 return <dialog ref={ref} className={styles.dialog} aria-label={title} onCancel={e=>{e.preventDefault();if(!busy)onClose();}}>
  <header><strong>{title}</strong><button type="button" disabled={busy} aria-label={language==="en"?"Close agent settings":"Cerrar configuración del agente"} onClick={onClose}>×</button></header>{children}</dialog>;
}
export default function AccountBusinessAgent({ownerId,initialName=""}:{ownerId:string;initialName?:string}){
 const {language}=useInterfaceLanguage();const en=language==="en";const L=(es:string,english:string)=>en?english:es;
 const [businesses,setBusinesses]=useState<CentralBusiness[]>([]),[workspaces,setWorkspaces]=useState<AiWorkspace[]>([]),[agents,setAgents]=useState<PersistedAgent[]>([]);
 const [businessId,setBusinessId]=useState("");const [loading,setLoading]=useState(true),[error,setError]=useState(""),[agentError,setAgentError]=useState("");
 const [businessOpen,setBusinessOpen]=useState(false),[agentOpen,setAgentOpen]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState("");
 const [draft,setDraft]=useState<WizardDraft|null>(null),[editing,setEditing]=useState<PersistedAgent|null>(null),[candidate,setCandidate]=useState("");
 const [resumeAgent,setResumeAgent]=useState(false),[setupRequested,setSetupRequested]=useState(false);
 const setupHandled=useRef(false);
 const wizardDraft=useRef<WizardDraft|null>(null);
 const [retry,setRetry]=useState(0);const alive=useRef(true),saving=useRef(false),loadSequence=useRef(0);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const business=businesses.find(b=>b.id===businessId)||null;
 const workspace=workspaces.find(w=>w.central_business_id===businessId)||null;
 const scopedAgents=workspace?agents.filter(a=>a.business_id===workspace.id):[];
 const principal=scopedAgents.find(a=>a.id===workspace?.primary_agent_id)||null;
 const unlinked=workspaces.filter(w=>!w.central_business_id);
 const reload=async(prefer?:string)=>{
  const sequence=++loadSequence.current;
  setLoading(true);setError("");setAgentError("");
  const [profile,list]=await Promise.allSettled([loadBusinessChoices(),loadAgents()]);
  if(!alive.current||sequence!==loadSequence.current)return;
  if(profile.status==="fulfilled"&&profile.value.owner===ownerId){
   setBusinesses(profile.value.businesses);setWorkspaces(profile.value.workspaces);
   setBusinessId(current=>{
    let saved="";try{saved=sessionStorage.getItem("vmv-active-business:"+ownerId)||"";}catch{/* Optional preference only. */}
    const choice=prefer||current||saved;
    return profile.value.businesses.some(b=>b.id===choice)?choice:profile.value.businesses[0]?.id||"";
   });
  }else setError(L("No pudimos cargar tus negocios.","Could not load your businesses."));
  if(list.status==="fulfilled")setAgents(list.value.filter(a=>a.owner_id===ownerId));
  else setAgentError(L("No pudimos cargar tu agente.","Could not load your agent."));
  setLoading(false);
 };
 useEffect(()=>{void reload();},[retry]);
 useEffect(()=>{
  if(businesses.some(b=>b.id===businessId))try{sessionStorage.setItem("vmv-active-business:"+ownerId,businessId);}catch{/* Optional preference only. */}
 },[ownerId,businessId,businesses]);
 const openAgent=()=>{
  setNotice("");if(!business){setResumeAgent(true);setBusinessOpen(true);return;}
  setCandidate("");setEditing(principal);
  setDraft(centralPrefill(business,principal?{...principal,setup:{...principal.setup}}:{
   name:L("Mi agente","My agent"),kind:"support",purpose:L("Atender a los clientes de mi negocio con información autorizada.","Help my business customers using approved information."),
   personality:L("Amable y profesional","Friendly and professional"),language:en?"English":"Español",instructions:"",knowledge:"",setup:{}
  }));setAgentOpen(true);
 };
 useEffect(()=>{
  if(loading||error||agentError||setupHandled.current)return;
  const query=new URLSearchParams(window.location.search);
  if(query.get("setup")!=="agent")return;
  const requested=query.get("business");
  if(requested&&!businesses.some(b=>b.id===requested)){
   setupHandled.current=true;setNotice(L("No tienes acceso al negocio solicitado. Selecciona uno de tu cuenta.","The requested business is unavailable. Select one from your account."));return;
  }
  if(requested&&businessId!==requested){setBusinessId(requested);return;}
  setupHandled.current=true;setSetupRequested(true);openAgent();
 },[loading,error,agentError,businessId,businesses]);
 useEffect(()=>{
  if(resumeAgent&&business&&!loading&&!businessOpen){setResumeAgent(false);openAgent();}
 },[resumeAgent,business,loading,businessOpen]);
 const finishSetup=()=>{
  setSetupRequested(false);
  const url=new URL(window.location.href);url.searchParams.delete("setup");
  window.history.replaceState(null,"",url.pathname+url.search+url.hash);
 };
 const save=async(value:WizardDraft)=>{
  if(saving.current||!business)throw Error(L("Espera a que termine el guardado.","Wait for saving to finish."));
  saving.current=true;setBusy(true);
  try{
   const workspaceId=editing?.business_id||workspace?.id||await provisionAiWorkspace(business.id);
   const saved=await storeAgent({...value,setup:{...value.setup,central_source_updated_at:business.updated_at}},editing,workspaceId);
   setAgents(current=>[saved,...current.filter(a=>a.id!==saved.id)]);setEditing(saved);
   let assigned=true;
   if(!editing){try{await choosePrincipalAgent(workspaceId,saved.id,workspace?.primary_agent_id||null);}catch{assigned=false;}}
   setAgentOpen(false);finishSetup();setNotice(assigned?L("Agente guardado. Las llamadas conservan su configuración.","Agent saved. Call settings are preserved."):L("Agente guardado. Revisa cuál es el principal; otra sesión cambió la selección.","Agent saved. Review the primary selection; another session changed it."));
   await reload(business.id);
  }finally{saving.current=false;if(alive.current)setBusy(false);}
 };
 const designate=async()=>{
  if(!workspace||!candidate||saving.current)return;
  saving.current=true;setBusy(true);
  try{await choosePrincipalAgent(workspace.id,candidate,workspace.primary_agent_id);setAgentOpen(false);setNotice(L("Agente principal elegido. No se cambió la línea telefónica.","Primary agent selected. The phone line was not changed."));
   const chosen=scopedAgents.find(a=>a.id===candidate);
   if(setupRequested&&chosen&&!inspectAgent(chosen).requiredPassed)setResumeAgent(true);
   else if(setupRequested)finishSetup();
   await reload(businessId);}
  catch{setNotice(L("No pudimos guardar la selección. Actualiza y vuelve a intentarlo.","Could not save the selection. Refresh and try again."));}
  finally{saving.current=false;setBusy(false);}
 };
 return <section className={styles.root} aria-label={L("Mi negocio y mi agente","My business and my agent")}>
  {businesses.length>1?<label className={styles.selector}>{L("Negocio seleccionado","Selected business")}<select value={businessId} disabled={busy} onChange={e=>{setBusinessId(e.target.value);setNotice("");}}>{businesses.map(b=><option value={b.id} key={b.id}>{b.name}</option>)}</select></label>:null}
  {error?<div role="alert" className={styles.feedback}>{error}<button type="button" onClick={()=>setRetry(n=>n+1)}><RefreshCw size={14}/>{L("Reintentar","Retry")}</button></div>:null}
  <button type="button" className={styles.card} disabled={loading||Boolean(error)} onClick={()=>setBusinessOpen(true)}>
   <span className={styles.businessIcon}><BriefcaseBusiness size={23}/></span><span className={styles.copy}><small>{L("Mi negocio","My business")}</small><strong>{loading?L("Cargando…","Loading…"):business?.name||L("Configura tu negocio","Set up your business")}</strong><span>{business?(businessMissing(business).length?L("Completar perfil","Complete profile"):L("Editar perfil","Edit profile")):L("Tus datos, una sola vez","Your details, just once")}</span></span><ChevronRight size={18}/>
  </button>
  <button type="button" className={styles.card} disabled={loading||Boolean(error)||Boolean(agentError)} onClick={openAgent}>
   <span className={styles.agentIcon}><Bot size={23}/></span><span className={styles.copy}><small>{L("Mi agente","My agent")}</small><strong>{loading?L("Cargando…","Loading…"):principal?.name||(scopedAgents.length?L("Elige tu agente principal","Choose your primary agent"):L("Configura tu agente","Set up your agent"))}</strong><span>{!business?L("Primero completa tu negocio","Complete your business first"):principal?(inspectAgent(principal).requiredPassed?L("Editar identidad y configuración","Edit identity and settings"):L("Completar configuración","Complete setup")):L("Nombre, personalidad y funciones","Name, personality and capabilities")}</span></span><ChevronRight size={18}/>
  </button>
  <a className={styles.card} href={"/vista-app/finanzas"+(businessId?"?business="+encodeURIComponent(businessId):"")}
   style={{textDecoration:"none"}}>
   <span className={styles.financeIcon}><Wallet size={23}/></span>
   <span className={styles.copy}><small>{L("Finanzas","Finances")}</small>
    <strong>{L("Cobros y depósitos","Payments and payouts")}</strong>
    <span>{L("Conecta Stripe con tu negocio","Connect your business to Stripe")}</span>
   </span><ChevronRight size={18}/>
  </a>
  {agentError?<div role="alert" className={styles.feedback}>{agentError}<button type="button" onClick={()=>setRetry(n=>n+1)}>{L("Reintentar","Retry")}</button></div>:null}
  {setupRequested?<p role="status" className={styles.feedback}>{L("Termina de configurar tu agente para usar sus funciones.","Finish setting up your agent to use its capabilities.")}</p>:null}
  {notice?<p role="status" className={styles.feedback}>{notice}</p>:null}
  {businessOpen?<BusinessProfileDialog businessId={business?.id} initialName={initialName||unlinked[0]?.name} legacy={workspace?[]:unlinked} onClose={()=>{wizardDraft.current=null;setBusinessOpen(false);setResumeAgent(false);if(!agentOpen)finishSetup();}} onSaved={async id=>{const profile=await loadBusinessChoices();const refreshed=profile.businesses.find(b=>b.id===id);if(refreshed&&wizardDraft.current){setDraft(centralPrefill(refreshed,wizardDraft.current));wizardDraft.current=null;}setBusinessOpen(false);await reload(id);}}/>:null}
  {agentOpen&&draft?<AgentDialog title={setupRequested?L("Termina de configurar tu agente","Finish setting up your agent"):L("Mi agente","My agent")} busy={busy} onClose={()=>{setAgentOpen(false);finishSetup();}}>
   {!principal&&scopedAgents.length>0?<div className={styles.choose}><p>{L("Elige uno de tus agentes existentes. Sus datos e historial se conservarán.","Choose an existing agent. Its data and history will be preserved.")}</p><label>{L("Agente principal","Primary agent")}<select value={candidate} disabled={busy} onChange={e=>setCandidate(e.target.value)}><option value="">{L("Seleccionar","Select")}</option>{scopedAgents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label><button type="button" disabled={busy||!candidate} onClick={()=>void designate()}>{L("Guardar selección","Save selection")}</button></div>:
    <AgentSetupWizard key={draft.setup.central_source_updated_at} initial={draft} workspaceId={workspace?.id} onReviewBusiness={current=>{wizardDraft.current=current;setBusinessOpen(true);}} onSave={save} saving={busy} onCancel={()=>{setAgentOpen(false);finishSetup();}} recoverDraft={false}/>}
  </AgentDialog>:null}
 </section>;
}
