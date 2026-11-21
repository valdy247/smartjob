"use client";
import {useEffect,useState} from "react";
import {
 ArrowLeft,ArrowUpRight,Bot,BookOpen,BookCheck,BriefcaseBusiness,CalendarDays,Check,
 ChevronRight,ClipboardList,Headphones,MessageCircle,Package,PauseCircle,
 PhoneCall,PlayCircle,ShieldCheck,ShoppingBag,Sparkles,WandSparkles,Megaphone,Globe2,Video,FileText,Plus,Workflow
} from "lucide-react";
import type {LucideIcon} from "lucide-react";
import styles from "./page.module.css";
import {useInterfaceLanguage} from "@/lib/i18n-web";
import {InterfaceLanguagePicker} from "@/components/InterfaceLanguagePicker";
import type {MessageKey} from "@/lib/i18n";
import BusinessProfileDialog from "./BusinessProfileDialog";
import AgentSetupWizard,{type WizardDraft} from "./AgentSetupWizard";
import AgentQualityLab from "./AgentQualityLab";
import CommerceStudio from "./CommerceStudio";
import BookingStudio,{type BookingTab} from "./BookingStudio";
import CallControl from "./CallControl";
import AgentLiveTest from "./AgentLiveTest";
import ChatWebHub from "./ChatWebHub";
import AutomaticAdWizard from "./AutomaticAdWizard";
import AutomaticWebWizard from "./AutomaticWebWizard";
import AutomaticVideoWizard from "./AutomaticVideoWizard";
import AutomaticCallWizard from "./AutomaticCallWizard";
import AutomaticQuoteWizard from "./AutomaticQuoteWizard";
import quoteStyles from "./AutomaticQuoteWizard.module.css";
import AutomaticCommerceWizard from "./AutomaticCommerceWizard";
import AutomaticBookingWizard from "./AutomaticBookingWizard";
import {inspectAgent} from "./agentQuality";
import {getSupabase} from "@/lib/supabase";
import {centralPrefill,businessMissing,choosePrincipalAgent,linkLegacyWorkspace,loadBusinessChoices,provisionAiWorkspace,type CentralBusiness,type AiWorkspace} from "./centralBusiness";
import {loadAgents,loadPhoneSelection,selectPhoneAgent,setStudyStatus,storeAgent,type PersistedAgent,type PhoneSelection} from "./agentStore";

type Kind="calls"|"support"|"sales"|"bookings"|"inventory"|"operations"|"custom";
type Status="draft"|"active"|"paused";
type Screen="videoEntry"|"home"|"editor"|"test"|"quality"|"commerce"|"commerceWizard"|"phone"|"bookings"|"bookingsWizard"|"ads"|"web"|"video"|"call"|"quote"|"quoteEntry"|"chatWeb";
type AgentDraft=WizardDraft;
type Agent=PersistedAgent;
const types:{id:Kind;title:string;sub:string;Icon:LucideIcon;bg:string;fg:string;purpose:string}[]=[
 {id:"calls",title:"Llamadas",sub:"Atención telefónica",Icon:PhoneCall,bg:"#ede2ff",fg:"#7143c7",purpose:"Orientar a quien llama y derivar a una persona cuando sea necesario."},
 {id:"support",title:"Clientes",sub:"Atención y consultas",Icon:Headphones,bg:"#c8f3e4",fg:"#17624f",purpose:"Responder preguntas habituales sobre productos, servicios y horarios."},
 {id:"bookings",title:"Reservas",sub:"Citas y disponibilidad",Icon:CalendarDays,bg:"#bfe4ff",fg:"#2c6086",purpose:"Informar sobre horarios y ayudar a los clientes a solicitar citas."},
 {id:"inventory",title:"Productos/Pedidos",sub:"Catálogo y pedidos",Icon:Package,bg:"#ffd4e6",fg:"#9b4776",purpose:"Gestionar productos aprobados, imágenes y pedidos del negocio."},
 {id:"operations",title:"Administración",sub:"Solicitudes y procesos",Icon:BriefcaseBusiness,bg:"#d7ecff",fg:"#416995",purpose:"Orientar y organizar solicitudes administrativas de forma segura."},
 {id:"custom",title:"A mi medida",sub:"Tu propio objetivo",Icon:WandSparkles,bg:"#e7dfff",fg:"#6b45bb",purpose:"Ayudar con el propósito personalizado del negocio."}
];
function blank(kind:Kind):AgentDraft{
 const item=types.find(t=>t.id===kind)||types.find(t=>t.id==="custom")!;
 return {kind,name:kind==="custom"?"Mi agente":"Agente de "+item.title,
  purpose:item.purpose,personality:"Amable y profesional",language:"Español",
  instructions:"",knowledge:"",setup:{}};
}
export default function AIAgentsPreview(){
 const {language,translate}=useInterfaceLanguage();
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
 const [bookingTab,setBookingTab]=useState<BookingTab>("services");
 const [resumeBooking,setResumeBooking]=useState(false);
 const [phone,setPhone]=useState<PhoneSelection|null>(null);
 const [pilotChecks,setPilotChecks]=useState<{key:string;label:string;ok:boolean}[]|null>(null);
 const [pilotChecking,setPilotChecking]=useState(false);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [authenticated,setAuthenticated]=useState(false);
 const [testFromChatWeb,setTestFromChatWeb]=useState(false);
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
 // Switching UI locale only clears transient interface feedback; agent drafts and saved content remain unchanged.
 useEffect(()=>{setNotice("");},[language]);
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

 const typeInfo=(kind:Kind)=>types.find(t=>t.id===kind)||
  types.find(t=>t.id===(kind==="sales"?"inventory":"custom"))!;
 const label=(kind:Kind)=>translate(("agents.capability."+kind) as MessageKey);
 const description=(kind:Kind)=>translate(("agents.capabilityDetail."+kind) as MessageKey);
 const agentKind=(kind:Kind)=>translate(("agents.type."+kind) as MessageKey);
 const principal=visibleAgents.find(a=>a.id===selectedWorkspace?.primary_agent_id)||null;
 const proposal=principal?null:
  (visibleAgents.find(a=>a.id===phone?.agentId)|| (visibleAgents.length===1?visibleAgents[0]:null));
 const designate=async(agent:Agent)=>{
  if(!selectedWorkspace||!agent.revision||agent.business_id!==selectedWorkspace.id)
   throw Error(translate("agents.notice.linkBusinessFirst"));
  await choosePrincipalAgent(selectedWorkspace.id,agent.id,selectedWorkspace.primary_agent_id||null);
  setWorkspaces(old=>old.map(w=>w.id===selectedWorkspace.id?{...w,primary_agent_id:agent.id}:w));
  setNotice(translate("agents.notice.principalSavedPhoneSame"));
 };
 const openFor=(kind:Kind,agent:Agent)=>{
  setSelected(agent.id);
  if(kind==="sales"||kind==="inventory"){
   setCommerceTab("catalog");setNotice("");
   setScreen(commerceNeedsSetup(agent)?"commerceWizard":"commerce");
  }else if(kind==="calls"){
   setScreen("call");
   setNotice(phone?.agentId===agent.id?"":translate("agents.notice.configureCalls"));
  }else if(kind==="bookings"){
   setResumeBooking(false);setScreen("bookingsWizard");setNotice("");
  }else if(kind==="support"){
   setSelected(agent.id);setScreen("chatWeb");setNotice("");
  }else if(kind==="operations"){
   quality(agent);setNotice(translate("agents.notice.activityInfo"));
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
   setNotice(translate("agents.notice.selectOrLinkBusiness"));
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
    setNotice(translate("agents.notice.chooseExistingPrincipal"));
    return;
   }
   if(!workspace&&profile.workspaces.some(w=>!w.central_business_id)){
    setPendingKind(kind);setBusinessDialog(true);
    setNotice(translate("agents.notice.linkLegacyWorkspace"));
    return;
   }
   // Only a genuinely empty workspace may start the one-time identity wizard.
   setPendingKind(kind);
   setDraft(centralPrefill(selectedBusiness,blank("support")));
   setSelected(null);setEditStep(0);setScreen("editor");setNotice("");
  }catch(e){
   setNotice(translate("agents.notice.verifyAgentError"));
  }
 };
 const businessSaved=async(id:string)=>{
  const [list,profile]=await Promise.all([loadAgents(),loadBusinessChoices()]);
  setAgents(list);setBusinesses(profile.businesses);setWorkspaces(profile.workspaces);setChosenBusiness(id);
  const saved=profile.businesses.find(b=>b.id===id);
  if(!saved)throw Error(translate("agents.notice.businessListError"));
  if(screen==="editor")setDraft(current=>centralPrefill(saved,current));
  setBusinessDialog(false);setNotice(translate("agents.notice.businessSaved"));
  if(pendingKind){
   const match=profile.workspaces.find(w=>w.central_business_id===id);
   const candidate=list.find(a=>a.id===match?.primary_agent_id);
   if(candidate){setPendingKind(null);openFor(pendingKind,candidate);}
   else if(match&&list.filter(a=>a.business_id===match.id).length>0){
    setNotice(translate("agents.notice.choosePrincipalAfterLink"));setPendingKind(null);
   }else{setDraft(centralPrefill(saved,blank("support")));setSelected(null);setEditStep(0);setScreen("editor");}
  }
 };
 const edit=(agent:Agent,step:0|1|2|3=0)=>{setSelected(agent.id);setEditStep(step);setDraft(selectedBusiness?centralPrefill(selectedBusiness,{...agent,setup:{...agent.setup}}):{
  name:agent.name,kind:agent.kind,purpose:agent.purpose,personality:agent.personality,
  language:agent.language,instructions:agent.instructions,knowledge:agent.knowledge,setup:{...agent.setup}
 });setScreen("editor");};
 const save=async(nextDraft:AgentDraft=draft)=>{
  if(busy)throw Error(translate("agents.notice.alreadySaving"));
  if(!nextDraft.name.trim())throw Error(translate("agents.notice.agentNameRequired"));
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
   setNotice(assigned?translate("agents.notice.agentSaved"):
    translate("agents.notice.primaryChanged"));
   if(assigned&&pendingKind){const chosen=pendingKind;setPendingKind(null);openFor(chosen,saved);}
   else{setPendingKind(null);setScreen("home");}
   void reload().catch(()=>{/* saved record already returned by Supabase */});
  }catch(e){
   const message=translate("agents.notice.saveFailed");
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
  setNotice(translate("agents.notice.demoLoaded"));
 };
 const test=(agent:Agent)=>{setTestFromChatWeb(false);setSelected(agent.id);setScreen("test");setMessage("");setMessageNotice("");};
 const quality=(agent:Agent)=>{setSelected(agent.id);setScreen("quality");};
 const toggleStatus=async(agent:Agent)=>{
  if(busy)return;
  if(!agent.revision){setNotice(translate("agents.notice.saveExampleFirst"));return;}
  if(agent.status!=="active"&&staleAgents.some(x=>x.id===agent.id)){
   setNotice(translate("agents.notice.centralChanged"));
   edit(agent);return;
  }
  if(agent.status!=="active"&&!inspectAgent(agent).requiredPassed){
   setNotice(translate("agents.notice.completeRequirements"));quality(agent);return;
  }
  setBusy(true);
  try{
   await setStudyStatus(agent,agent.status==="active"?"paused":"active");
   await reload();
   setNotice(translate("agents.notice.studyStatusSaved"));
  }catch(e){setNotice(translate("agents.notice.studyStatusError"));}
  finally{setBusy(false);}
 };
 const checkPilot=async()=>{
  if(pilotChecking)return;
  setPilotChecking(true);setPilotChecks(null);
  try{
   const client=getSupabase();
   const {data}=client?await client.auth.getSession():{data:{session:null}};
   const token=data.session?.access_token;
   if(!token)throw Error(translate("agents.notice.signInForCheck"));
   const response=await fetch("/api/vmv/ai-agents/pilot-status",{
    headers:{Authorization:"Bearer "+token},cache:"no-store"
   });
   const status=await response.json() as {
    checks?:{key:string;label:string;ok:boolean}[];error?:string
   };
   if(!response.ok||!status.checks)throw Error(translate("agents.notice.phoneCheckError"));
   setPilotChecks(status.checks);
   setNotice(status.checks.every(c=>c.ok)?
     translate("agents.notice.pilotReady"):
     translate("agents.notice.pilotPending"));
  }catch(e){setNotice(translate("agents.notice.connectionError"));}
  finally{setPilotChecking(false);}
 };
 const linkPilot=async()=>{
  if(!selectedBusiness||unlinked.length!==1||linkBusy)return;
  const legacy=unlinked[0];
  if(!window.confirm(translate("agents.notice.linkConfirm",{space:legacy.name,business:selectedBusiness.name})))return;
  setLinkBusy(true);
  try{
   await linkLegacyWorkspace(legacy.id,selectedBusiness.id);
   await reload();
   setNotice(translate("agents.notice.linked"));
  }catch(e){setNotice(translate("agents.notice.linkError"));}
  finally{setLinkBusy(false);}
 };
 const select=async(agent:Agent|null)=>{
  if(!phone||busy)return;
  if(agent&&!agent.revision){setNotice(translate("agents.notice.saveRealFirst"));return;}
  if(agent&&selectedWorkspace&&agent.id!==principal?.id){
    setNotice(translate("agents.notice.makePrimaryFirst"));
    return;
  }
  setBusy(true);
  try{
   await selectPhoneAgent(phone.routeId,agent);
   await reload();
   setNotice(agent?translate("agents.notice.phoneAssigned"):translate("agents.notice.phoneUnassigned"));
  }catch(e){setNotice(translate("agents.notice.phoneSaveError"));}
  finally{setBusy(false);}
 };
 const back=()=>{setScreen("home");setMessageNotice("");};
 const commerceNeedsSetup=(agent:Agent)=>agent.setup.commerce_onboarded!=="Sí"&&
  agent.setup.cap_catalog!=="Sí"&&agent.setup.cap_catalog!=="No";
 const patch=(key:keyof AgentDraft,value:string)=>setDraft(prev=>({...prev,[key]:value}));
 const immersive=screen==="ads"||screen==="web"||screen==="video"||screen==="videoEntry"||screen==="call"||screen==="quote"||screen==="quoteEntry"||screen==="commerceWizard"||screen==="bookingsWizard";
 useEffect(()=>{
  if(loading||!authenticated)return;
  const url=new URL(window.location.href);
  const service=url.searchParams.get("service");
  if(!["web","video","call","quote","inventory","sales","bookings"].includes(String(service)))return;
  if(service!=="video"&&(!principal||!selectedBusiness||!selectedWorkspace))return;
  url.searchParams.delete("service");
  window.history.replaceState(null,"",url.pathname+url.search+url.hash);
  if(service==="video"){setScreen("videoEntry");setNotice("");return;}
  if(!principal)return;
  setSelected(principal.id);
  if(service==="inventory"||service==="sales"){
   setCommerceTab("catalog");setScreen(commerceNeedsSetup(principal)?"commerceWizard":"commerce");
  }else {
   if(service==="bookings")setResumeBooking(false);
   setScreen(service==="web"?"web":service==="call"?"call":service==="quote"?"quoteEntry":service==="bookings"?"bookingsWizard":"videoEntry");
  }
  setNotice("");
 },[loading,authenticated,principal?.id,selectedBusiness?.id,selectedWorkspace?.id]);
 return <main className={immersive?styles.adsCanvas:styles.canvas}>
  <div className={immersive?styles.adsLayout:styles.layout}>
   {!immersive?<div className={styles.externalHeader}>
    <a href="/vista-app" className={styles.returnLink}><ArrowLeft size={17}/> VMV Business</a><InterfaceLanguagePicker compact/>
    <span className={styles.previewBadge}>PREVIEW · AI AGENTS</span>
   </div>:null}
   <section className={immersive?styles.adsPhone:styles.phone} aria-label={translate("agents.phonePreview")}>
    {!immersive?<div className={styles.phoneTop}>
     <b>VMV</b><span className={styles.dynamicIsland}/><span className={styles.phoneSignal}>◢ ▰</span>
    </div>:null}
    {!immersive?<div className={styles.appHeader}>
     <button type="button" className={styles.backIcon} onClick={screen==="home"?()=>{window.location.href="/vista-app";}:back}
      aria-label={screen==="home"?translate("agents.backVMV"):translate("agents.backAgents")}><ArrowLeft size={20}/></button>
     <div className={styles.appTitle}><small>VMV BUSINESS</small><strong>AI Agents<span>.</span></strong></div>
     <InterfaceLanguagePicker compact/>
    </div>:null}
    <div className={immersive?styles.adsScroller:styles.scroller}>
     {loading?<div className={styles.info} role="status">{translate("agents.loadingWorkspace")}</div>:null}
     {!loading&&!authenticated?<div className={styles.info} role="alert">
      <ShieldCheck size={17}/> {translate("agents.accountError")}
      <button type="button" className={styles.buttonSecondary}
       onClick={()=>{setNotice("");setLoading(true);setRetryAccount(n=>n+1);}}>
       {translate("common.retry")}</button>
     </div>:null}
     {authenticated?<>
     {screen!=="home"&&notice?<div role="status" className={styles.info}><ShieldCheck size={17}/>{notice}</div>:null}
     {screen==="home"?<>
      <div className={styles.hero}>
       <div className={styles.heroEyebrow}><span>{translate("agents.onePerBusiness")}</span><Sparkles size={22}/></div>
       <h1>{translate("agents.oneAgent")}<br/>{translate("agents.allFunctions")}</h1>
       <div className={styles.heroPills}><span>{principal?translate("agents.principalPrefix")+": "+principal.name:proposal?translate("agents.chooseAgent"):translate("agents.notConfigured")}</span></div>
      </div>
      {notice?<div role="status" className={styles.info}><ShieldCheck size={17}/>{notice}</div>:null}
      <div className={styles.sectionHeading}><div><h2>{translate("agents.yourAgent")}: {principal?.name||proposal?.name||translate("agents.notConfigured")}</h2>
       <p>{selectedBusiness?.name||translate("agents.selectBusiness")}</p></div></div>
      <div className={styles.sectionHeading}><div><h2>{translate("agents.capabilities")}</h2>
       </div></div>
      <div className={styles.tiles}>
       {types.map(type=>{const title=label(type.id);
       const configured=principal?.setup||{};
       const status=!principal?translate("agents.status.notConfigured"):
        type.id==="calls"?(phone?.agentId===principal.id&&phone.serverEnrolled?
         translate("agents.status.readyToTest"):phone?.agentId===principal.id?translate("agents.status.needsAttention"):translate("agents.status.notConfigured")):
        type.id==="support"?(language==="en"?"Manage chat":"Gestionar chat"):
        type.id==="inventory"?(configured.cap_catalog==="Sí"?translate("agents.status.needsAttention"):translate("agents.status.notConfigured")):
        type.id==="sales"?(configured.cap_sales==="Sí"?translate("agents.status.needsAttention"):translate("agents.status.notConfigured")):
        type.id==="bookings"?(configured.cap_bookings==="Sí"?translate("agents.status.needsAttention"):translate("agents.status.notConfigured")):
        translate("agents.status.readyToTest");
       const detail=description(type.id);
       return <button type="button" key={type.id} className={styles.tile}
          style={{background:type.bg,color:type.fg}} onClick={()=>void start(type.id)} aria-label={title+" · "+status+". "+detail}>
          <span className={styles.tileIcon}><type.Icon size={24}/></span>
          <strong>{title}</strong><small>{status}</small>
       </button>})}
       <button type="button" className={styles.tile} style={{background:"#dff4ec",color:"#226956"}}
        onClick={()=>{
         if(principal&&selectedBusiness&&selectedWorkspace){
          setSelected(principal.id);setScreen("web");setNotice("");
         }else setNotice("Selecciona el negocio y su agente principal para preparar tu página web.");
        }} aria-label="Crear sitio web con tu agente">
        <span className={styles.tileIcon}><Globe2 size={24}/></span>
        <strong>Web Services</strong><small>Crear web con tu agente</small>
       </button>
       <button type="button" className={styles.tile} style={{background:"#d9ece9",color:"#29695a"}}
        onClick={()=>{
         if(principal&&selectedBusiness&&selectedWorkspace){
          setSelected(principal.id);setScreen("quoteEntry");setNotice("");
         }else setNotice("Selecciona tu negocio y el agente principal para preparar una cotización.");
        }} aria-label="Smart Quote guiado por Mi agente">
        <span className={styles.tileIcon}><FileText size={24}/></span>
        <strong>Smart Quote</strong><small>Cotizar con tu agente</small>
       </button>
       <button type="button" className={styles.tile} style={{background:"#f8ddec",color:"#893d73"}}
        onClick={()=>{setScreen("videoEntry");setNotice("");}} aria-label="Video Generator con tu agente">
        <span className={styles.tileIcon}><Video size={24}/></span>
        <strong>Video Generator</strong><small>Crear video con tu agente</small>
       </button>
       <button type="button" className={styles.tile} style={{background:"#e4dcff",color:"#6245a7"}}
        onClick={()=>{
         if(principal&&selectedBusiness&&selectedWorkspace){
          setSelected(principal.id);setScreen("ads");setNotice("");
         }else setNotice("Selecciona tu negocio y su agente principal para preparar un anuncio.");
        }} aria-label="Anuncio automático con tu agente">
        <span className={styles.tileIcon}><Megaphone size={24}/></span>
        <strong>Anuncio automático</strong><small>Tu agente prepara el anuncio</small>
       </button>
      </div>
      <div className={styles.sectionHeading}><h2>{translate("agents.existing")}{principal?" "+translate("agents.andPrincipal"):""}</h2><span className={styles.agentCounter}>{visibleAgents.length}</span></div>
      {visibleAgents.length===0?<div className={styles.empty}>
       <Bot size={30}/><strong>{translate("agents.emptyTitle")}</strong>
       
       <button type="button" className={styles.demoButton} onClick={demo}><Sparkles size={16}/> {translate("agents.exploreTaxi")}</button>
      </div>:<div className={styles.agents}>
       {visibleAgents.map(a=>{const t=typeInfo(a.kind);return <article className={styles.agent} key={a.id}>
        <div className={styles.agentTop}><span style={{background:t.bg,color:t.fg}} className={styles.agentIcon}><t.Icon size={21}/></span>
         <span className={styles.agentMeta}><strong>{a.name}</strong><small>{agentKind(a.kind)} · {a.language}</small></span>
         <span className={styles.agentState}>{principal?.id===a.id?translate("agents.state.principal"):a.status==="paused"?translate("agents.state.paused"):phone?.agentId===a.id?translate("agents.state.selected"):a.status==="active"?translate("agents.state.activeStudio"):inspectAgent(a).requiredPassed?translate("agents.state.readyToConfigure"):translate("agents.state.draft")}</span>
        </div>
        <p>{a.purpose}</p>
        <div className={styles.readinessMini}>
         <span className={styles.readinessText}>{translate("agents.readiness")}: {inspectAgent(a).percent}%</span>
         <span className={styles.readinessTrack}><span style={{width:inspectAgent(a).percent+"%"}}/></span>
        </div>
        <div className={styles.agentButtons}>
         <button type="button" className={styles.buttonPrimary} onClick={()=>test(a)}><MessageCircle size={15}/> {translate("agents.test")}</button>
         {phone&&a.revision>0&&(!selectedWorkspace||principal?.id===a.id)?<button type="button" disabled={busy} className={styles.buttonSecondary}
           onClick={()=>void select(a)}><PhoneCall size={15}/>{phone.agentId===a.id?translate("agents.phoneSelected"):translate("agents.chooseForPhone")}</button>:null}
         <button type="button" className={styles.buttonSecondary} onClick={()=>quality(a)}><BookCheck size={15}/> {translate("agents.quality")}</button>
         {!principal||principal.id!==a.id?<button type="button" className={styles.buttonSecondary}
          disabled={!selectedWorkspace||busy||!a.revision}
          onClick={()=>void designate(a).catch(e=>setNotice(translate("agents.notice.designateError")))}>
          <Bot size={15}/> {translate("agents.makePrincipal")}</button>:null}
         <button type="button" className={styles.buttonSecondary} onClick={()=>edit(a)}><ClipboardList size={15}/> {translate("agents.editIdentity")}</button>
         <button type="button" className={styles.buttonSecondary} onClick={()=>void toggleStatus(a)}>
          {a.status==="active"?<PauseCircle size={15}/>:<PlayCircle size={15}/>} {a.status==="active"?translate("agents.pause"):translate("agents.activateStudio")}
         </button>
        </div>
       </article>})}
      </div>}
      <div className={styles.disclaimer}><ShieldCheck size={16}/> {translate("agents.disclaimer")}</div>
     </>:null}
     {businessDialog?<BusinessProfileDialog businessId={selectedBusiness?.id} initialName={workspaces.find(w=>w.id===legacyId)?.name}
      legacy={selectedWorkspace?[]:unlinked} initialLegacyId={legacyId} onClose={()=>{setBusinessDialog(false);setPendingKind(null);}} onSaved={businessSaved}/>:null}
     {screen==="editor"?<AgentSetupWizard key={(selected||draft.kind)+"-"+editStep+"-"+draft.setup.central_source_updated_at}
      initial={draft} workspaceId={active?.business_id||selectedWorkspace?.id} onReviewBusiness={current=>{setDraft(current);setBusinessDialog(true);}} initialStep={editStep} saving={busy} isPreview={false} authRequired={!authenticated} recoverDraft={!selected} onCancel={back}
      onSave={async updated=>{setDraft(updated);await save(updated);}}/>:null}
     {screen==="quality"&&active?<AgentQualityLab agent={active} onClose={back} onEdit={step=>edit(active,step)}/>:null}
     {screen==="bookings"&&active?<BookingStudio agent={active} initialTab={bookingTab}
      onClose={()=>setScreen("bookingsWizard")}
      onAgentUpdated={updated=>setAgents(old=>old.map(a=>a.id===updated.id?updated:a))}/>:null}
     {screen==="ads"&&principal&&selectedBusiness&&selectedWorkspace?
      <AutomaticAdWizard key={selectedBusiness.id+principal.id} business={selectedBusiness}
       workspaceId={selectedWorkspace.id} agent={principal} onClose={back}/>:null}
     {screen==="web"&&principal&&selectedBusiness&&selectedWorkspace?
      <AutomaticWebWizard key={selectedBusiness.id+principal.id} business={selectedBusiness}
       workspaceId={selectedWorkspace.id} agent={principal} onClose={back}/>:null}
     {screen==="videoEntry"&&authenticated?
      <section style={{padding:"24px 18px",display:"grid",gap:18,alignContent:"start",minHeight:"100%",background:"#faf8fd",color:"#25213a"}}>
       <button type="button" onClick={back} style={{border:0,background:"transparent",display:"flex",alignItems:"center",gap:8,justifySelf:"start",fontWeight:700,color:"#59457f"}}><ArrowLeft size={18}/> Volver</button>
       <div style={{textAlign:"center",padding:"16px 8px"}}>
        <Video size={32} style={{margin:"0 auto 12px",color:"#8945a2"}}/>
        <h2 style={{fontSize:23,fontWeight:800,margin:"0 0 8px"}}>Video Generator</h2>
        <p style={{fontSize:13,color:"#6d637c",margin:0}}>¿Qué quieres hacer?</p>
       </div>
       <button type="button" onClick={()=>setScreen("video")} style={{textAlign:"left",display:"flex",alignItems:"center",gap:16,padding:19,borderRadius:18,border:"1px solid #e9d9ed",background:"#fff",color:"#332346",cursor:"pointer"}}>
        <WandSparkles size={25} color="#8144ad"/><span style={{display:"grid",gap:4}}><strong>Generar video</strong><small>Crear con tu agente IA</small></span><ChevronRight size={18} style={{marginLeft:"auto"}}/>
       </button>
       <a href="/vista-app/video-generator?setup=autopilot" style={{textDecoration:"none",textAlign:"left",display:"flex",alignItems:"center",gap:16,padding:19,borderRadius:18,border:"1.5px solid #cfb9ee",background:"linear-gradient(120deg,#f1e9ff,#e7f8f0)",color:"#332346"}}>
         <Workflow size={27} color="#7444b3"/><span style={{display:"grid",gap:4}}><strong>Piloto automático</strong><small>Tu contenido, paso a paso</small></span><ChevronRight size={18} style={{marginLeft:"auto",color:"#7444b3"}}/>
        </a>
        <a href="/vista-app/video-generator?view=library" style={{textDecoration:"none",textAlign:"left",display:"flex",alignItems:"center",gap:16,padding:19,borderRadius:18,border:"1px solid #e9d9ed",background:"#fff",color:"#332346"}}>
        <PlayCircle size={25} color="#8144ad"/><span style={{display:"grid",gap:4}}><strong>Historial</strong><small>Reproducir y descargar</small></span><ChevronRight size={18} style={{marginLeft:"auto"}}/>
       </a>
      </section>:null}
     {screen==="video"&&authenticated?
      <AutomaticVideoWizard onClose={()=>setScreen("videoEntry")}/>:null}
     {screen==="call"&&principal&&selectedBusiness&&selectedWorkspace?
      <AutomaticCallWizard key={selectedBusiness.id+principal.id} business={selectedBusiness}
       workspaceId={selectedWorkspace.id} agent={principal} onClose={back}
       onAdvanced={()=>setScreen("phone")} businesses={businesses}
       onAgentUpdated={updated=>setAgents(current=>current.map(a=>a.id===updated.id?updated:a))}
       onChooseBusiness={id=>{
        const nextWorkspace=workspaces.find(w=>w.central_business_id===id);
        const nextAgent=agents.find(a=>a.id===nextWorkspace?.primary_agent_id);
        setChosenBusiness(id);
        if(nextWorkspace&&nextAgent){
         setSelected(nextAgent.id);setNotice("");
        }else{
         setScreen("home");
         setNotice("Para configurar las llamadas de ese negocio, primero prepara su agente principal.");
        }
       }}/>:null}
     {screen==="quoteEntry"?<section className={quoteStyles.entry} aria-label="Smart Quote">
      <header className={quoteStyles.entryTop}>
       <button type="button" onClick={back} aria-label="Volver"><ArrowLeft size={19}/></button>
       <span>Smart Quote · VMV Business</span>
      </header>
      <div className={quoteStyles.entryHero}><FileText size={34}/><h1>¿Qué quieres hacer?</h1>
       <p>Prepara una cotización con Mi agente o consulta las que ya guardaste.</p></div>
      <div className={quoteStyles.entryActions}>
       <button type="button" onClick={()=>{
        if(!principal||!selectedBusiness||!selectedWorkspace){
         setNotice("Prepara el agente principal del negocio antes de crear una cotización.");setScreen("home");return;
        }
        setScreen("quote");setNotice("");
       }}><span className={quoteStyles.entryIcon}><Plus size={24}/></span>
        <span><strong>Crear nueva cotización</strong><small>El asistente te guía paso a paso</small></span>
        <ChevronRight size={19}/></button>
       <a href="/vista-app/smart-quote"><span className={quoteStyles.entryIcon}><BookOpen size={24}/></span>
        <span><strong>Mis cotizaciones</strong><small>Historial, borradores, PDF y envíos</small></span>
        <ChevronRight size={19}/></a>
      </div>
     </section>:null}
     {screen==="quote"&&principal&&selectedBusiness&&selectedWorkspace?
      <AutomaticQuoteWizard key={selectedBusiness.id+principal.id} business={selectedBusiness}
       workspaceId={selectedWorkspace.id} agent={principal} onClose={()=>setScreen("quoteEntry")}
       businesses={businesses} onChooseBusiness={id=>{
        if(!businesses.some(b=>b.id===id))return;
        const nextWorkspace=workspaces.find(w=>w.central_business_id===id);
        const nextAgent=agents.find(a=>a.id===nextWorkspace?.primary_agent_id);
        setChosenBusiness(id);
        if(nextWorkspace&&nextAgent&&nextAgent.revision>0){
         setSelected(nextAgent.id);setNotice("");
        }else{
         setScreen("home");
         setNotice("Para cotizar con ese negocio, primero configura su agente principal.");
        }
       }}/>:null}
     {screen==="commerceWizard"&&principal&&selectedBusiness&&selectedWorkspace?
      <AutomaticCommerceWizard key={selectedBusiness.id+principal.id+commerceTab} business={selectedBusiness}
       agent={principal}
       onAgentUpdated={updated=>{setAgents(list=>list.map(a=>a.id===updated.id?updated:a));}}
       onOpenStudio={()=>setScreen("commerce")} onClose={back}/>:null}
     {screen==="bookingsWizard"&&principal&&selectedBusiness&&selectedWorkspace?
      <AutomaticBookingWizard key={selectedBusiness.id+principal.id+(resumeBooking?"-resume":"-new")}
       business={selectedBusiness} agent={principal} initialStep={resumeBooking?"goal":"business"}
       onClose={back}
       onAgentUpdated={updated=>{setAgents(list=>list.map(a=>a.id===updated.id?updated:a));}}
       onOpenStudio={section=>{setBookingTab(section);setResumeBooking(true);setScreen("bookings");}}/>:null}
     {screen==="phone"?<CallControl onBack={()=>setScreen("call")}/>:null}
     {screen==="commerce"?<CommerceStudio centralBusinessId={selectedBusiness?.id||""} agents={principal?[principal]:visibleAgents.filter(a=>a.revision>0)}
      initialAgentId={principal?.id||selected||""} initialTab={commerceTab}
      onConfigure={()=>setScreen("commerceWizard")} onAgentUpdated={updated=>
       setAgents(prev=>prev.map(a=>a.id===updated.id?updated:a))}
      onClose={()=>{void reload().catch(()=>{});back();}}/>:null}
     {screen==="chatWeb"&&active?<ChatWebHub key={active.id} agent={active}
      businessName={selectedBusiness?.name||""} onBack={back}
      onTest={()=>{test(active);setTestFromChatWeb(true);}}
      onAgentUpdated={updated=>setAgents(old=>old.map(a=>a.id===updated.id?updated:a))}/>:null}
     {screen==="test"&&active?<AgentLiveTest agent={active} webMode={testFromChatWeb}
      onClose={()=>{if(testFromChatWeb){setScreen("chatWeb");setTestFromChatWeb(false);}else back();}} onEdit={()=>edit(active)}
      onAgentUpdated={updated=>setAgents(old=>old.map(a=>a.id===updated.id?updated:a))}/>:null}
     </>:null}
    </div>
    {!immersive?<div className={styles.phoneFooter}><div className={styles.footerBrand}><Bot size={17}/> AI Agents</div>
     <span>VMV Business <Sparkles size={12}/></span></div>:null}
   </section>
   {!immersive?<div className={styles.externalFooter}>
    <span><ShieldCheck size={16}/> {translate("agents.isolationNotice")}</span>
    <a href="/vista-app">{translate("agents.backVMV")} <ArrowUpRight size={15}/></a>
   </div>:null}
  </div>
 </main>;
}
