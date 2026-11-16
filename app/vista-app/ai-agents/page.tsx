"use client";
import {useEffect,useState} from "react";
import {
 ArrowLeft,ArrowUpRight,Bot,BookOpen,BookCheck,BriefcaseBusiness,CalendarDays,Check,
 ChevronRight,ClipboardList,Headphones,MessageCircle,Package,PauseCircle,
 PhoneCall,PlayCircle,ShieldCheck,ShoppingBag,Sparkles,WandSparkles
} from "lucide-react";
import type {LucideIcon} from "lucide-react";
import styles from "./page.module.css";
import BusinessProfileDialog from "./BusinessProfileDialog";
import AgentSetupWizard,{type WizardDraft} from "./AgentSetupWizard";
import AgentQualityLab from "./AgentQualityLab";
import CommerceStudio from "./CommerceStudio";
import BookingStudio from "./BookingStudio";
import CallControl from "./CallControl";
import AgentLiveTest from "./AgentLiveTest";
import {inspectAgent} from "./agentQuality";
import {getSupabase} from "@/lib/supabase";
import {centralPrefill,businessMissing,choosePrincipalAgent,linkLegacyWorkspace,loadBusinessChoices,provisionAiWorkspace,type CentralBusiness,type AiWorkspace} from "./centralBusiness";
import {loadAgents,loadPhoneSelection,selectPhoneAgent,setStudyStatus,storeAgent,type PersistedAgent,type PhoneSelection} from "./agentStore";

type Kind="calls"|"support"|"sales"|"bookings"|"inventory"|"operations"|"custom";
type Status="draft"|"active"|"paused";
type Screen="home"|"editor"|"test"|"quality"|"commerce"|"phone"|"bookings";
type AgentDraft=WizardDraft;
type Agent=PersistedAgent;
const types:{id:Kind;title:string;sub:string;Icon:LucideIcon;bg:string;fg:string;purpose:string}[]=[
 {id:"calls",title:"Llamadas",sub:"Atención telefónica",Icon:PhoneCall,bg:"#ede2ff",fg:"#7143c7",purpose:"Orientar a quien llama y derivar a una persona cuando sea necesario."},
 {id:"support",title:"Clientes",sub:"Atención y consultas",Icon:Headphones,bg:"#c8f3e4",fg:"#17624f",purpose:"Responder preguntas habituales sobre productos, servicios y horarios."},
 {id:"sales",title:"Ventas",sub:"Productos y servicios",Icon:ShoppingBag,bg:"#ffdf84",fg:"#775018",purpose:"Informar sobre productos confirmados e identificar oportunidades de venta."},
 {id:"bookings",title:"Reservas",sub:"Citas y disponibilidad",Icon:CalendarDays,bg:"#bfe4ff",fg:"#2c6086",purpose:"Informar sobre horarios y ayudar a los clientes a solicitar citas."},
 {id:"inventory",title:"Inventario",sub:"Productos y existencias",Icon:Package,bg:"#ffd4e6",fg:"#9b4776",purpose:"Explicar productos y existencias autorizadas de la empresa."},
 {id:"operations",title:"Administración",sub:"Solicitudes y procesos",Icon:BriefcaseBusiness,bg:"#d7ecff",fg:"#416995",purpose:"Orientar y organizar solicitudes administrativas de forma segura."},
 {id:"custom",title:"A mi medida",sub:"Tu propio objetivo",Icon:WandSparkles,bg:"#e7dfff",fg:"#6b45bb",purpose:"Ayudar con el propósito personalizado del negocio."}
];
function blank(kind:Kind):AgentDraft{
 const item=types.find(t=>t.id===kind)||types[6];
 return {kind,name:kind==="custom"?"Mi agente":"Agente de "+item.title,
  purpose:item.purpose,personality:"Amable y profesional",language:"Español",
  instructions:"",knowledge:"",setup:{}};
}
export default function AIAgentsPreview(){
 const [screen,setScreen]=useState<Screen>("home");
 const [editStep,setEditStep]=useState<0|1|2|3>(0);
 const [draft,setDraft]=useState<AgentDraft>(()=>blank("support"));
 const [agents,setAgents]=useState<Agent[]>([]);
 const [businesses,setBusinesses]=useState<CentralBusiness[]>([]);
 const [workspaces,setWorkspaces]=useState<AiWorkspace[]>([]);
 const [chosenBusiness,setChosenBusiness]=useState<string>("");
 const [linkBusy,setLinkBusy]=useState(false);
 const [businessDialog,setBusinessDialog]=useState(false);
 const [pendingKind,setPendingKind]=useState<Kind|null>(null);
 const [commerceTab,setCommerceTab]=useState<"setup"|"catalog">("catalog");
 const [phone,setPhone]=useState<PhoneSelection|null>(null);
 const [pilotChecks,setPilotChecks]=useState<{key:string;label:string;ok:boolean}[]|null>(null);
 const [pilotChecking,setPilotChecking]=useState(false);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [authenticated,setAuthenticated]=useState(false);
 const [retryAccount,setRetryAccount]=useState(0);
 useEffect(()=>{let live=true;
  // Business profile is canonical; a phone lookup must never break the agent list.
  void Promise.all([loadAgents(),loadBusinessChoices()])
   .then(([list,profile])=>{
    if(!live)return;
    setAgents(list);
    setBusinesses(profile.businesses);
    setWorkspaces(profile.workspaces);
    setChosenBusiness(previous=>{
     if(previous&&profile.businesses.some(x=>x.id===previous))return previous;
     if(previous.startsWith("legacy:")&&profile.workspaces.some(x=>x.id===previous.slice(7)&&!x.central_business_id))return previous;
     try{const saved=sessionStorage.getItem("vmv-active-business:"+profile.owner);if(profile.businesses.some(b=>b.id===saved))return saved!;}catch{/* Storage may be restricted. */}
     if(profile.businesses.length>0)return profile.businesses[0].id;
     if(profile.businesses.length===0&&profile.workspaces.length===1)return "legacy:"+profile.workspaces[0].id;
     return "";
    });
    setAuthenticated(true);
    void loadPhoneSelection().then(selection=>{if(live)setPhone(selection);})
     .catch(()=>{if(live)setPhone(null);});
   })
   .catch(()=>{if(live){setAuthenticated(false);setNotice("");}})
   .finally(()=>{if(live)setLoading(false);});
  return ()=>{live=false;};
 },[retryAccount]);
 async function reload(){
  const [list,profile]=await Promise.all([loadAgents(),loadBusinessChoices()]);
  setAgents(list);setBusinesses(profile.businesses);setWorkspaces(profile.workspaces);
  setAuthenticated(true);
  void loadPhoneSelection().then(setPhone).catch(()=>setPhone(null));
 }
 const [selected,setSelected]=useState<string|null>(null);
 const [message,setMessage]=useState("");
 const [messageNotice,setMessageNotice]=useState("");
 const [notice,setNotice]=useState("");
 const active=agents.find(a=>a.id===selected)||null;
 const selectedBusiness=businesses.find(x=>x.id===chosenBusiness)||null;
 const selectedWorkspace=workspaces.find(x=>x.central_business_id===chosenBusiness)||null;
 const legacyId=chosenBusiness.startsWith("legacy:")?chosenBusiness.slice(7):null;
 const visibleAgents=agents.filter(a=>selectedWorkspace?
  a.business_id===selectedWorkspace.id:legacyId?a.business_id===legacyId:false);
 const unlinked=workspaces.filter(x=>!x.central_business_id);
 const linkedWorkspaceForNew=selectedWorkspace?.id||null;
 const missingBusinessInfo=selectedBusiness?businessMissing(selectedBusiness):[];
 const staleAgents=selectedBusiness&&selectedWorkspace?visibleAgents.filter(a=>
  a.revision>0&&a.setup.central_source_updated_at&&
  a.setup.central_source_updated_at!==selectedBusiness.updated_at):[];

 const typeInfo=(kind:Kind)=>types.find(t=>t.id===kind)||types[6];
 const principal=visibleAgents.find(a=>a.id===selectedWorkspace?.primary_agent_id)||null;
 const proposal=principal?null:
  (visibleAgents.find(a=>a.id===phone?.agentId)|| (visibleAgents.length===1?visibleAgents[0]:null));
 const designate=async(agent:Agent)=>{
  if(!selectedWorkspace||!agent.revision||agent.business_id!==selectedWorkspace.id)
   throw Error("Vincula primero el negocio y guarda un agente real.");
  await choosePrincipalAgent(selectedWorkspace.id,agent.id,selectedWorkspace.primary_agent_id||null);
  setWorkspaces(old=>old.map(w=>w.id===selectedWorkspace.id?{...w,primary_agent_id:agent.id}:w));
  setNotice("Agente principal guardado para este negocio. La selección telefónica no ha cambiado.");
 };
 const openFor=(kind:Kind,agent:Agent)=>{
  setSelected(agent.id);
  if(kind==="sales"||kind==="inventory"){
   setCommerceTab(kind==="inventory"?"catalog":"setup");setScreen("commerce");
  }else if(kind==="calls"){
   setScreen("phone");
   setNotice(phone?.agentId===agent.id?"":"Configura las llamadas aquí. Para que este agente atienda la línea, asígnalo explícitamente desde AI Agents.");
  }else if(kind==="bookings"){
   setScreen("bookings");setNotice("");
  }else if(kind==="support"){
   test(agent);setNotice("Prueba privada. El chat público de Web Services todavía requiere una conexión verificada.");
  }else if(kind==="operations"){
   quality(agent);setNotice("Actividad: consulta el historial telefónico y la calidad del agente.");
  }else{
   edit(agent,0);
  }
 };
 const start=async(kind:Kind)=>{
  // A missing permission or incomplete readiness is NOT a missing agent.
  // If this screen was opened in an older tab, first discover fresh agents.
  if(principal){openFor(kind,principal);return;}
  if(!selectedBusiness){
   setPendingKind(kind);setBusinessDialog(true);
   setNotice("Selecciona o vincula tu negocio para continuar con su agente existente.");
   return;
  }
  try{
   const [list,profile]=await Promise.all([loadAgents(),loadBusinessChoices()]);
   setAgents(list);setBusinesses(profile.businesses);setWorkspaces(profile.workspaces);
   const workspace=profile.workspaces.find(w=>w.central_business_id===selectedBusiness.id);
   const candidates=workspace?list.filter(a=>a.business_id===workspace.id):[];
   const assigned=candidates.find(a=>a.id===workspace?.primary_agent_id);
   if(assigned){openFor(kind,assigned);return;}
   if(workspace&&candidates.length===1){
    const existing=candidates[0];
    await choosePrincipalAgent(workspace.id,existing.id,workspace.primary_agent_id||null);
    setWorkspaces(old=>old.map(w=>w.id===workspace.id?{...w,primary_agent_id:existing.id}:w));
    openFor(kind,existing);return;
   }
   if(candidates.length>1){
    setNotice("Ya tienes agentes. Selecciona «Hacer principal» en el agente que quieres usar; no crearemos otro.");
    return;
   }
   if(!workspace&&profile.workspaces.some(w=>!w.central_business_id)){
    setPendingKind(kind);setBusinessDialog(true);
    setNotice("Ya hay agentes de un espacio anterior. Vincula el negocio para reutilizarlos sin crear otro.");
    return;
   }
   // Only a genuinely empty workspace may start the one-time identity wizard.
   setPendingKind(kind);
   setDraft(centralPrefill(selectedBusiness,blank("support")));
   setSelected(null);setEditStep(0);setScreen("editor");setNotice("");
  }catch(e){
   setNotice(e instanceof Error?e.message:"No se pudo comprobar tu agente. Intenta actualizar la página.");
  }
 };
 const businessSaved=async(id:string)=>{
  const [list,profile]=await Promise.all([loadAgents(),loadBusinessChoices()]);
  setAgents(list);setBusinesses(profile.businesses);setWorkspaces(profile.workspaces);setChosenBusiness(id);
  const saved=profile.businesses.find(b=>b.id===id);
  if(!saved)throw Error("El negocio se guardó, pero no se pudo actualizar la lista. Vuelve a intentarlo.");
  if(screen==="editor")setDraft(current=>centralPrefill(saved,current));
  setBusinessDialog(false);setNotice("Negocio guardado. Puedes configurar su agente principal aquí.");
  if(pendingKind){
   const match=profile.workspaces.find(w=>w.central_business_id===id);
   const candidate=list.find(a=>a.id===match?.primary_agent_id);
   if(candidate){setPendingKind(null);openFor(pendingKind,candidate);}
   else if(match&&list.filter(a=>a.business_id===match.id).length>0){
    setNotice("Elige qué agente existente será el principal; conserva sus capacidades y llamadas.");setPendingKind(null);
   }else{setDraft(centralPrefill(saved,blank("support")));setSelected(null);setEditStep(0);setScreen("editor");}
  }
 };
 const edit=(agent:Agent,step:0|1|2|3=0)=>{setSelected(agent.id);setEditStep(step);setDraft(selectedBusiness?centralPrefill(selectedBusiness,{...agent,setup:{...agent.setup}}):{
  name:agent.name,kind:agent.kind,purpose:agent.purpose,personality:agent.personality,
  language:agent.language,instructions:agent.instructions,knowledge:agent.knowledge,setup:{...agent.setup}
 });setScreen("editor");};
 const save=async(nextDraft:AgentDraft=draft)=>{
  if(busy)throw Error("Ya estamos guardando tu agente.");
  if(!nextDraft.name.trim())throw Error("Escribe el nombre del agente.");
  setBusy(true);
  try{
   const before=selected?agents.find(a=>a.id===selected):null;
   // Owner selection does not change an existing agent's business or phone binding.
   const workspaceId=before?.business_id||
    (selectedBusiness?await provisionAiWorkspace(selectedBusiness.id):linkedWorkspaceForNew);
   // Saving after the review step approves the current central profile version;
   // background loads never overwrite an in-progress agent edit.
   const reviewed=selectedBusiness&&before?.business_id===selectedWorkspace?.id?
    {...nextDraft,setup:{...nextDraft.setup,
      central_source_updated_at:selectedBusiness.updated_at}}:nextDraft;
   const saved=await storeAgent(reviewed,before?.revision?before:null,workspaceId||undefined);
   try{sessionStorage.removeItem("vmv-ai-unsaved-wizard-v1");}catch{/* storage unavailable */}
   // The insert response confirms the write. A secondary phone lookup must not
   // turn a successful save into a misleading failure.
   setAgents(old=>[saved,...old.filter(a=>a.id!==saved.id)]);
   setAuthenticated(true);
   let assigned=true;
   if(!before&&workspaceId){
    try{
     await choosePrincipalAgent(workspaceId,saved.id,null);
     setWorkspaces(old=>old.map(w=>w.id===workspaceId?{...w,primary_agent_id:saved.id}:w));
    }catch{assigned=false;}
   }
   setNotice(assigned?"Agente principal guardado. Sus capacidades requieren permisos y pruebas independientes.":
    "Agente guardado, pero otra sesión cambió el principal. Revisa tu selección.");
   if(assigned&&pendingKind){const chosen=pendingKind;setPendingKind(null);openFor(chosen,saved);}
   else{setPendingKind(null);setScreen("home");}
   void reload().catch(()=>{/* saved record already returned by Supabase */});
  }catch(e){
   const message=e instanceof Error?e.message:"No se pudo guardar el agente.";
   setNotice(message);
   throw Error(message);
  }finally{setBusy(false);}
 };
 const demo=()=>{
  const schedule=Object.fromEntries(["mon","tue","wed","thu","fri","sat","sun"].flatMap(day=>[
   ["h_"+day+"_active","Sí"],["h_"+day+"_open","09:00"],["h_"+day+"_close","17:00"]]));
  const sample:Agent={
   id:"example-taxi",revision:0,business_id:"",owner_id:"",updated_at:"",status:"draft",name:"Luna · Ejemplo",kind:"bookings",
   purpose:"Orientar sobre viajes y preparar solicitudes que un conductor confirmará.",
   personality:"Amable y profesional",language:"Español",instructions:"",
   knowledge:"",setup:{
    business_name:"Taxi Aurora (empresa ficticia)",industry:"Servicio de taxi",
    country:"Estados Unidos",city:"Columbus",state:"Georgia",hours_mode:"Todos los días · 9–5",
    contact:"Contacto ficticio, sin línea activa",policy_type:"Sí, tengo reglas",
    policies:"Cancelación hasta una hora antes; ningún viaje se confirma automáticamente.",
    booking_service_type:"Viajes dentro de la ciudad",booking_lead:"1 hora",
    booking_cancel:"1 hora antes",booking_confirmation:"Después de que yo la confirme",
    booking_staff:"Solo yo",human_review:"Reconocerlo y derivar a un humano",
    data_scope:"Ninguno",restrictions:"No cobrar, confirmar viajes ni dar precios no autorizados.",
    ...schedule
   }
  };
  setAgents(current=>current.some(a=>a.id===sample.id)?current:[sample,...current]);
  setNotice("Ejemplo ficticio cargado solo en tu navegador. Puedes abrir Calidad y probar el diseño.");
 };
 const test=(agent:Agent)=>{setSelected(agent.id);setScreen("test");setMessage("");setMessageNotice("");};
 const quality=(agent:Agent)=>{setSelected(agent.id);setScreen("quality");};
 const toggleStatus=async(agent:Agent)=>{
  if(busy)return;
  if(!agent.revision){setNotice("Guarda el ejemplo en tu cuenta antes de activarlo.");return;}
  if(agent.status!=="active"&&staleAgents.some(x=>x.id===agent.id)){
   setNotice("El perfil central cambió. Revisa y guarda las instrucciones del agente antes de activarlo.");
   edit(agent);return;
  }
  if(agent.status!=="active"&&!inspectAgent(agent).requiredPassed){
   setNotice("Completa los requisitos antes de activar en estudio.");quality(agent);return;
  }
  setBusy(true);
  try{
   await setStudyStatus(agent,agent.status==="active"?"paused":"active");
   await reload();
   setNotice("Estado de estudio guardado. Esto no cambia la recepción de llamadas.");
  }catch(e){setNotice(e instanceof Error?e.message:"No fue posible cambiar el estado.");}
  finally{setBusy(false);}
 };
 const checkPilot=async()=>{
  if(pilotChecking)return;
  setPilotChecking(true);setPilotChecks(null);
  try{
   const client=getSupabase();
   const {data}=client?await client.auth.getSession():{data:{session:null}};
   const token=data.session?.access_token;
   if(!token)throw Error("Inicia sesión para comprobar tu línea.");
   const response=await fetch("/api/vmv/ai-agents/pilot-status",{
    headers:{Authorization:"Bearer "+token},cache:"no-store"
   });
   const status=await response.json() as {
    checks?:{key:string;label:string;ok:boolean}[];error?:string
   };
   if(!response.ok||!status.checks)throw Error(status.error||"No se pudo comprobar la línea.");
   setPilotChecks(status.checks);
   setNotice(status.checks.every(c=>c.ok)?
     "El piloto tiene sus requisitos configurados. Aún falta la prueba real y verificar el webhook de Twilio.":
     "Hay requisitos pendientes. Consulta la lista de verificación telefónica.");
  }catch(e){setNotice(e instanceof Error?e.message:"No se pudo comprobar la conexión.");}
  finally{setPilotChecking(false);}
 };
 const linkPilot=async()=>{
  if(!selectedBusiness||unlinked.length!==1||linkBusy)return;
  const legacy=unlinked[0];
  if(!window.confirm('¿Vincular el espacio «'+legacy.name+'» con «'+selectedBusiness.name+'»? Se conservarán sus agentes, llamadas y pedidos. Esta acción no cambia la línea telefónica.'))return;
  setLinkBusy(true);
  try{
   await linkLegacyWorkspace(legacy.id,selectedBusiness.id);
   await reload();
   setNotice("Negocio vinculado. Los agentes y las llamadas anteriores se conservaron.");
  }catch(e){setNotice(e instanceof Error?e.message:"No se pudo vincular el negocio.");}
  finally{setLinkBusy(false);}
 };
 const select=async(agent:Agent|null)=>{
  if(!phone||busy)return;
  if(agent&&!agent.revision){setNotice("Guarda primero un agente real.");return;}
  if(agent&&selectedWorkspace&&agent.id!==principal?.id){
    setNotice("Selecciona este agente como principal antes de asignarlo a la línea. La selección no cambia tu número automáticamente.");
    return;
  }
  setBusy(true);
  try{
   await selectPhoneAgent(phone.routeId,agent);
   await reload();
   setNotice(agent?"Agente seleccionado para tu línea de prueba. La conexión con Twilio sigue pendiente de verificación.":"Selección telefónica retirada.");
  }catch(e){setNotice(e instanceof Error?e.message:"No fue posible guardar el agente seleccionado.");}
  finally{setBusy(false);}
 };
 const back=()=>{setScreen("home");setMessageNotice("");};
 const patch=(key:keyof AgentDraft,value:string)=>setDraft(prev=>({...prev,[key]:value}));
 return <main className={styles.canvas}>
  <div className={styles.layout}>
   <div className={styles.externalHeader}>
    <a href="/vista-app" className={styles.returnLink}><ArrowLeft size={17}/> VMV Business</a>
    <span className={styles.previewBadge}>PREVIEW · AI AGENTS</span>
   </div>
   <section className={styles.phone} aria-label="Vista previa de AI Agents para iPhone">
    <div className={styles.phoneTop}>
     <b>VMV</b><span className={styles.dynamicIsland}/><span className={styles.phoneSignal}>◢ ▰</span>
    </div>
    <div className={styles.appHeader}>
     <button type="button" className={styles.backIcon} onClick={screen==="home"?()=>{window.location.href="/vista-app";}:back}
      aria-label={screen==="home"?"Volver a VMV":"Volver a AI Agents"}><ArrowLeft size={20}/></button>
     <div className={styles.appTitle}><small>VMV BUSINESS</small><strong>AI Agents<span>.</span></strong></div>
     <span className={styles.sparkleBadge}><Sparkles size={21}/></span>
    </div>
    <div className={styles.scroller}>
     {loading?<div className={styles.info} role="status">Cargando tu espacio de trabajo…</div>:null}
     {!loading&&!authenticated?<div className={styles.info} role="alert">
      <ShieldCheck size={17}/> No pudimos cargar tu cuenta.
      <button type="button" className={styles.buttonSecondary}
       onClick={()=>{setNotice("");setLoading(true);setRetryAccount(n=>n+1);}}>
       Reintentar</button>
     </div>:null}
     {authenticated?<>
     {screen!=="home"&&notice?<div role="status" className={styles.info}><ShieldCheck size={17}/>{notice}</div>:null}
     {screen==="home"?<>
      <div className={styles.hero}>
       <div className={styles.heroEyebrow}><span>UN AGENTE POR NEGOCIO</span><Sparkles size={22}/></div>
       <h1>Un agente.<br/>Todas tus funciones.</h1>
       <div className={styles.heroPills}><span>{principal?"Principal: "+principal.name:proposal?"Elige tu agente":"Sin configurar"}</span></div>
      </div>
      {notice?<div role="status" className={styles.info}><ShieldCheck size={17}/>{notice}</div>:null}
      <div className={styles.sectionHeading}><div><h2>Tu agente: {principal?.name||proposal?.name||"Sin configurar"}</h2>
       <p>{selectedBusiness?.name||"Selecciona tu negocio"}</p></div></div>
      <div className={styles.sectionHeading}><div><h2>Capacidades de tu agente</h2>
       </div></div>
      <div className={styles.tiles}>
       {types.map(type=>{const label=({
        calls:"Llamadas",support:"Chat web",sales:"Ventas",bookings:"Reservas",
        inventory:"Catálogo e inventario",operations:"Actividad",custom:"Identidad"
       } as Record<Kind,string>)[type.id];
       const configured=principal?.setup||{};
       const status=!principal?"Sin configurar":
        type.id==="calls"?(phone?.agentId===principal.id&&phone.serverEnrolled?
         "Lista para probar":phone?.agentId===principal.id?"Requiere atención":"Sin configurar"):
        type.id==="support"?"Requiere atención":
        type.id==="inventory"?(configured.cap_catalog==="Sí"?"Requiere atención":"Sin configurar"):
        type.id==="sales"?(configured.cap_sales==="Sí"?"Requiere atención":"Sin configurar"):
        type.id==="bookings"?(configured.cap_bookings==="Sí"?"Requiere atención":"Sin configurar"):
        "Lista para probar";
       const detail=({
        calls:"Número, horarios y traducción; falta prueba real",
        support:"Chat público pendiente · prueba privada disponible",
        sales:"Precios, permisos y pagos por verificar",
        bookings:"Agenda y disponibilidad por comprobar",
        inventory:"Catálogo y existencias autorizadas",
        operations:"Historial y calidad del mismo agente",
        custom:"Nombre, voz, idioma y personalidad"
       } as Record<Kind,string>)[type.id];
       return <button type="button" key={type.id} className={styles.tile}
          style={{background:type.bg,color:type.fg}} onClick={()=>void start(type.id)} aria-label={label+" · "+status+". "+detail}>
          <span className={styles.tileIcon}><type.Icon size={24}/></span>
          <strong>{label}</strong><small>{status}</small>
       </button>})}
      </div>
      <div className={styles.sectionHeading}><h2>Agentes existentes {principal?"y principal":""}</h2><span className={styles.agentCounter}>{visibleAgents.length}</span></div>
      {visibleAgents.length===0?<div className={styles.empty}>
       <Bot size={30}/><strong>Aquí vivirán tus agentes</strong>
       
       <button type="button" className={styles.demoButton} onClick={demo}><Sparkles size={16}/> Explorar ejemplo de taxi</button>
      </div>:<div className={styles.agents}>
       {visibleAgents.map(a=>{const t=typeInfo(a.kind);return <article className={styles.agent} key={a.id}>
        <div className={styles.agentTop}><span style={{background:t.bg,color:t.fg}} className={styles.agentIcon}><t.Icon size={21}/></span>
         <span className={styles.agentMeta}><strong>{a.name}</strong><small>{t.title} · {a.language}</small></span>
         <span className={styles.agentState}>{principal?.id===a.id?"Principal":a.status==="paused"?"Pausado":phone?.agentId===a.id?"Seleccionado":a.status==="active"?"Activo en estudio":inspectAgent(a).requiredPassed?"Listo para configurar":"Borrador"}</span>
        </div>
        <p>{a.purpose}</p>
        <div className={styles.readinessMini}>
         <span className={styles.readinessText}>Configuración: {inspectAgent(a).percent}%</span>
         <span className={styles.readinessTrack}><span style={{width:inspectAgent(a).percent+"%"}}/></span>
        </div>
        <div className={styles.agentButtons}>
         <button type="button" className={styles.buttonPrimary} onClick={()=>test(a)}><MessageCircle size={15}/> Probar</button>
         {phone&&a.revision>0&&(!selectedWorkspace||principal?.id===a.id)?<button type="button" disabled={busy} className={styles.buttonSecondary}
           onClick={()=>void select(a)}><PhoneCall size={15}/>{phone.agentId===a.id?"Elegido para la línea":"Elegir para teléfono"}</button>:null}
         <button type="button" className={styles.buttonSecondary} onClick={()=>quality(a)}><BookCheck size={15}/> Calidad</button>
         {!principal||principal.id!==a.id?<button type="button" className={styles.buttonSecondary}
          disabled={!selectedWorkspace||busy||!a.revision}
          onClick={()=>void designate(a).catch(e=>setNotice(e instanceof Error?e.message:"No se pudo elegir."))}>
          <Bot size={15}/> Hacer principal</button>:null}
         <button type="button" className={styles.buttonSecondary} onClick={()=>edit(a)}><ClipboardList size={15}/> Editar identidad</button>
         {a.revision>0&&(a.kind==="sales"||a.setup.cap_sales==="Sí"||phone?.agentId===a.id)?
          <button type="button" className={styles.buttonSecondary}
           onClick={()=>{setSelected(a.id);setScreen("commerce");}}>
           <ShoppingBag size={15}/> Preparar ventas</button>:null}
         <button type="button" className={styles.buttonSecondary} onClick={()=>void toggleStatus(a)}>
          {a.status==="active"?<PauseCircle size={15}/>:<PlayCircle size={15}/>} {a.status==="active"?"Pausar":"Activar en estudio"}
         </button>
        </div>
       </article>})}
      </div>}
      <div className={styles.disclaimer}><ShieldCheck size={16}/> Los agentes se guardan en tu cuenta. Elegir uno no conecta Twilio ni autoriza pagos. El ejemplo ficticio es temporal.</div>
     </>:null}
     {businessDialog?<BusinessProfileDialog businessId={selectedBusiness?.id} initialName={workspaces.find(w=>w.id===legacyId)?.name}
      legacy={selectedWorkspace?[]:unlinked} initialLegacyId={legacyId} onClose={()=>{setBusinessDialog(false);setPendingKind(null);}} onSaved={businessSaved}/>:null}
     {screen==="editor"?<AgentSetupWizard key={(selected||draft.kind)+"-"+editStep+"-"+draft.setup.central_source_updated_at}
      initial={draft} workspaceId={active?.business_id||selectedWorkspace?.id} onReviewBusiness={current=>{setDraft(current);setBusinessDialog(true);}} initialStep={editStep} saving={busy} isPreview={false} authRequired={!authenticated} recoverDraft={!selected} onCancel={back}
      onSave={async updated=>{setDraft(updated);await save(updated);}}/>:null}
     {screen==="quality"&&active?<AgentQualityLab agent={active} onClose={back} onEdit={step=>edit(active,step)}/>:null}
     {screen==="bookings"&&active?<BookingStudio agent={active} onClose={back}
      onAgentUpdated={updated=>setAgents(old=>old.map(a=>a.id===updated.id?updated:a))}/>:null}
     {screen==="phone"?<CallControl onBack={back}/>:null}
     {screen==="commerce"?<CommerceStudio centralBusinessId={selectedBusiness?.id||""} agents={visibleAgents.filter(a=>a.revision>0)}
      initialAgentId={principal?.id||selected||""} initialTab={commerceTab}
      phoneConnection={phone} onManageCalls={()=>setScreen("phone")}
      onAgentUpdated={updated=>setAgents(prev=>prev.map(a=>a.id===updated.id?updated:a))}
      onClose={()=>{void reload().catch(()=>{});back();}}/>:null}
     {screen==="test"&&active?<AgentLiveTest agent={active}
      onClose={back} onEdit={()=>edit(active)}
      onAgentUpdated={updated=>setAgents(old=>old.map(a=>a.id===updated.id?updated:a))}/>:null}
     </>:null}
    </div>
    <div className={styles.phoneFooter}><div className={styles.footerBrand}><Bot size={17}/> AI Agents</div>
     <span>VMV Business <Sparkles size={12}/></span></div>
   </section>
   <div className={styles.externalFooter}>
    <span><ShieldCheck size={16}/> Módulo aislado · No modifica Smart Call</span>
    <a href="/vista-app">Volver a VMV <ArrowUpRight size={15}/></a>
   </div>
  </div>
 </main>;
}
