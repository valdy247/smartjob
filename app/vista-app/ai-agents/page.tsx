"use client";
import {useEffect,useState} from "react";
import {
 ArrowLeft,ArrowUpRight,Bot,BookOpen,BookCheck,BriefcaseBusiness,CalendarDays,Check,
 ChevronRight,ClipboardList,Headphones,MessageCircle,Package,PauseCircle,
 PhoneCall,PlayCircle,ShieldCheck,ShoppingBag,Sparkles,WandSparkles
} from "lucide-react";
import type {LucideIcon} from "lucide-react";
import styles from "./page.module.css";
import AgentSetupWizard,{type WizardDraft} from "./AgentSetupWizard";
import AgentQualityLab from "./AgentQualityLab";
import CommerceStudio from "./CommerceStudio";
import CallControl from "./CallControl";
import AgentLiveTest from "./AgentLiveTest";
import {inspectAgent} from "./agentQuality";
import {getSupabase} from "@/lib/supabase";
import {loadAgents,loadPhoneSelection,selectPhoneAgent,setStudyStatus,storeAgent,type PersistedAgent,type PhoneSelection} from "./agentStore";

type Kind="calls"|"support"|"sales"|"bookings"|"inventory"|"operations"|"custom";
type Status="draft"|"active"|"paused";
type Screen="home"|"editor"|"test"|"quality"|"commerce"|"phone";
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
 const [phone,setPhone]=useState<PhoneSelection|null>(null);
 const [pilotChecks,setPilotChecks]=useState<{key:string;label:string;ok:boolean}[]|null>(null);
 const [pilotChecking,setPilotChecking]=useState(false);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [authenticated,setAuthenticated]=useState(false);
 const [retryAccount,setRetryAccount]=useState(0);
 useEffect(()=>{let live=true;
  // Phone enrollment is optional: a missing/unauthorized phone number must never
  // prevent loading and saving agents from this account.
  void loadAgents()
   .then(list=>{if(!live)return;setAgents(list);setAuthenticated(true);
     void loadPhoneSelection().then(selection=>{if(live)setPhone(selection);})
       .catch(()=>{if(live)setPhone(null);});
   })
   .catch(()=>{if(!live)return;setAuthenticated(false);setNotice("");})
   .finally(()=>{if(live)setLoading(false);});
  return ()=>{live=false;};
 },[retryAccount]);
 async function reload(){
  const list=await loadAgents();
  setAgents(list);setAuthenticated(true);
  void loadPhoneSelection().then(setPhone).catch(()=>setPhone(null));
 }
 const [selected,setSelected]=useState<string|null>(null);
 const [message,setMessage]=useState("");
 const [messageNotice,setMessageNotice]=useState("");
 const [notice,setNotice]=useState("");
 const active=agents.find(a=>a.id===selected)||null;
 const typeInfo=(kind:Kind)=>types.find(t=>t.id===kind)||types[6];
 const start=(kind:Kind)=>{setDraft(blank(kind));setSelected(null);setEditStep(0);setScreen("editor");setNotice("");};
 const edit=(agent:Agent,step:0|1|2|3=0)=>{setSelected(agent.id);setEditStep(step);setDraft({
  name:agent.name,kind:agent.kind,purpose:agent.purpose,personality:agent.personality,
  language:agent.language,instructions:agent.instructions,knowledge:agent.knowledge,setup:{...agent.setup}
 });setScreen("editor");};
 const save=async(nextDraft:AgentDraft=draft)=>{
  if(busy)throw Error("Ya estamos guardando tu agente.");
  if(!nextDraft.name.trim())throw Error("Escribe el nombre del agente.");
  setBusy(true);
  try{
   const before=selected?agents.find(a=>a.id===selected):null;
   const saved=await storeAgent(nextDraft,before?.revision?before:null);
   try{sessionStorage.removeItem("vmv-ai-unsaved-wizard-v1");}catch{/* storage unavailable */}
   // The insert response confirms the write. A secondary phone lookup must not
   // turn a successful save into a misleading failure.
   setAgents(old=>[saved,...old.filter(a=>a.id!==saved.id)]);
   setAuthenticated(true);
   setNotice("Agente guardado en tu cuenta VMV. Puedes encontrarlo en Mis agentes.");
   setScreen("home");
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
 const select=async(agent:Agent|null)=>{
  if(!phone||busy)return;
  if(agent&&!agent.revision){setNotice("Guarda primero un agente real.");return;}
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
       <div className={styles.heroEyebrow}><span>TU EQUIPO INTELIGENTE</span><Sparkles size={22}/></div>
       <h1>Crea agentes.<br/>Haz más con VMV.</h1>
       <p>Configúralos, enséñales tu negocio y pruébalos desde aquí.</p>
       <div className={styles.heroPills}><span>{agents.length} agentes guardados</span><span>{agents.filter(a=>a.status==="active").length} activos en estudio</span></div>
      </div>
      {notice?<div role="status" className={styles.info}><ShieldCheck size={17}/>{notice}</div>:null}
      {phone&&authenticated?<button type="button" className={styles.commerceLaunch}
       onClick={()=>setScreen("phone")}>
        <PhoneCall size={21}/><span><strong>Atención de llamadas</strong>
         <small>Agente, traducción, horarios y prueba de configuración</small></span>
         <ChevronRight size={16}/>
      </button>:null}
      {authenticated&&agents.length>0?<button type="button" className={styles.commerceLaunch} onClick={()=>setScreen("commerce")}>
       <ShoppingBag size={21}/><span><strong>Catálogo y pedidos</strong><small>Precios aprobados, pedidos y pruebas comerciales</small></span><ArrowUpRight size={19}/>
      </button>:null}
      {phone?<div className={styles.info}>
       <PhoneCall size={17}/> Línea de prueba {phone.maskedNumber} ·
       {phone.agentId?" Agente seleccionado. Comprobar conexión.":" Sin agente seleccionado."}
       {phone.agentId?<button type="button" className={styles.buttonSecondary}
        onClick={()=>void checkPilot()} disabled={pilotChecking}>
         {pilotChecking?"Comprobando…":"Verificar piloto"}</button>:null}
       {phone.agentId?<button type="button" className={styles.buttonSecondary}
        onClick={()=>void select(null)} disabled={busy}>Quitar selección</button>:null}
      </div>:null}
      {pilotChecks?<div className={styles.info} role="status">
       <ShieldCheck size={17}/> Comprobaciones internas · No sustituyen una llamada real.
       <div>{pilotChecks.map(c=><p key={c.key} style={{margin:"4px 0"}}>
        {c.ok?"✓":"✕"} {c.label}</p>)}</div>
      </div>:null}
      <div className={styles.sectionHeading}><div><h2>¿Qué quieres automatizar?</h2><p>Selecciona una función para tu agente.</p></div></div>
      <div className={styles.tiles}>
       {types.map(type=><button type="button" key={type.id} className={styles.tile}
          style={{background:type.bg,color:type.fg}} onClick={()=>start(type.id)}>
          <span className={styles.tileIcon}><type.Icon size={24}/></span>
          <ArrowUpRight className={styles.tileArrow} size={20}/>
          <strong>{type.title}</strong><small>{type.sub}</small>
       </button>)}
      </div>
      <div className={styles.sectionHeading}><h2>Mis agentes</h2><span className={styles.agentCounter}>{agents.length}</span></div>
      {agents.length===0?<div className={styles.empty}>
       <Bot size={30}/><strong>Aquí vivirán tus agentes</strong>
       <p>Elige una tarjeta para crear el primero.</p>
       <button type="button" className={styles.demoButton} onClick={demo}><Sparkles size={16}/> Explorar ejemplo de taxi</button>
      </div>:<div className={styles.agents}>
       {agents.map(a=>{const t=typeInfo(a.kind);return <article className={styles.agent} key={a.id}>
        <div className={styles.agentTop}><span style={{background:t.bg,color:t.fg}} className={styles.agentIcon}><t.Icon size={21}/></span>
         <span className={styles.agentMeta}><strong>{a.name}</strong><small>{t.title} · {a.language}</small></span>
         <span className={styles.agentState}>{a.status==="paused"?"Pausado":phone?.agentId===a.id?"Seleccionado":a.status==="active"?"Activo en estudio":inspectAgent(a).requiredPassed?"Listo para configurar":"Borrador"}</span>
        </div>
        <p>{a.purpose}</p>
        <div className={styles.readinessMini}>
         <span className={styles.readinessText}>Configuración: {inspectAgent(a).percent}%</span>
         <span className={styles.readinessTrack}><span style={{width:inspectAgent(a).percent+"%"}}/></span>
        </div>
        <div className={styles.agentButtons}>
         <button type="button" className={styles.buttonPrimary} onClick={()=>test(a)}><MessageCircle size={15}/> Probar</button>
         {phone&&a.revision>0?<button type="button" disabled={busy} className={styles.buttonSecondary}
           onClick={()=>void select(a)}><PhoneCall size={15}/>{phone.agentId===a.id?"Elegido para la línea":"Elegir para teléfono"}</button>:null}
         <button type="button" className={styles.buttonSecondary} onClick={()=>quality(a)}><BookCheck size={15}/> Calidad</button>
         <button type="button" className={styles.buttonSecondary} onClick={()=>edit(a)}><ClipboardList size={15}/> Editar</button>
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
     {screen==="editor"?<AgentSetupWizard key={(selected||draft.kind)+"-"+editStep}
      initial={draft} initialStep={editStep} saving={busy} isPreview={false} authRequired={!authenticated} recoverDraft={!selected} onCancel={back}
      onSave={async updated=>{setDraft(updated);await save(updated);}}/>:null}
     {screen==="quality"&&active?<AgentQualityLab agent={active} onClose={back} onEdit={step=>edit(active,step)}/>:null}
     {screen==="phone"?<CallControl onBack={back}/>:null}
     {screen==="commerce"?<CommerceStudio agents={agents.filter(a=>a.revision>0)}
      initialAgentId={selected||phone?.agentId||""} onAgentUpdated={updated=>
       setAgents(prev=>prev.map(a=>a.id===updated.id?updated:a))}
      onClose={()=>{void reload().catch(()=>{});back();}}/>:null}
     {screen==="test"&&active?<AgentLiveTest agent={active}
      onClose={back} onEdit={()=>edit(active)}/>:null}
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
