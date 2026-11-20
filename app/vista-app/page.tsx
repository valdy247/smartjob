"use client";
import {useEffect,useState,type FormEvent} from "react";
import {House,LayoutGrid,PhoneCall,Languages,UserRound,ArrowUpRight,ChevronLeft,Clock3,ContactRound,UserRoundPlus,
 ShieldCheck,Mic,Package,CalendarDays,Users,BarChart3,Workflow,Globe,Bot,Video,
 RefreshCw,Settings2,LoaderCircle,LogOut,LockKeyhole,PhoneForwarded,MessageCircle,Monitor,Cpu,TrendingUp,Search,Bell,Rocket,Megaphone,FileText} from "lucide-react";
import {LivePanel} from "@/components/LivePanel";
import InitialServiceCard from "@/components/InitialServiceCard";
import dynamic from "next/dynamic";
const AccountBusinessAgent=dynamic(()=>import("./AccountBusinessAgent"));
import ContactBook from "./ContactBook";
import DialPad from "./DialPad";
import BusinessServicesPreview from "./BusinessServicesPreview";
import BusinessDiagnostic from "./BusinessDiagnostic";
import {DIAGNOSTIC_METADATA_KEY,getDiagnosticRecommendations,makeDiagnosticRecord,readDiagnosticRecord,type DiagnosticAnswers,type DiagnosticRecord,type DiagnosticService} from "@/lib/business-diagnostic";
import {useSmartCallAccount,type Tab,type Panel,type CallSettings,type CallRecord,type Voice} from "./useSmartCallAccount";
import styles from "./vista-app.module.css";
import {InterfaceLanguagePicker} from "@/components/InterfaceLanguagePicker";
import {useInterfaceLanguage} from "@/lib/i18n-web";
import type {MessageKey} from "@/lib/i18n";

const modules=[
 {name:"AI Agents",Icon:Bot},{name:"Inventory",Icon:Package},
 {name:"Scheduling",Icon:CalendarDays},{name:"CRM & Leads",Icon:Users},
 {name:"Web Services",Icon:Globe},{name:"Business Management",Icon:Settings2},
 {name:"Marketing & Analytics",Icon:BarChart3},{name:"Automations",Icon:Workflow}
];
const nav:[Tab,"common.home"|"common.services"|"common.calls"|"common.translator"|"common.account",typeof House][]=[
 ["home","common.home",House],["services","common.services",LayoutGrid],
 ["calls","common.calls",PhoneCall],["translator","common.translator",Languages],["account","common.account",UserRound]
];
const lang=(value:string|null|undefined)=>value==="es"?"Español":value==="en"?"English":value||"—";
const num=(value:number|null|undefined)=>typeof value==="number"&&Number.isFinite(value)?value.toLocaleString("es-US"):"—";
const date=(value:string|null|undefined)=>value&&Number.isFinite(Date.parse(value))?
 new Date(value).toLocaleDateString("es-US",{year:"numeric",month:"short",day:"numeric"}):"—";
const callStatusKeys:Record<string,MessageKey>={
 completed:"services.history.status.completed","in-progress":"services.history.status.inProgress",
 ringing:"services.history.status.ringing",initiated:"services.history.status.initiated",
 failed:"services.history.status.failed",busy:"services.history.status.busy",
 "no-answer":"services.history.status.noAnswer",canceled:"services.history.status.canceled"
};
const choices:{value:Voice;label:string}[]=[
 {value:"default",label:"Estándar"},{value:"bright",label:"Clara"},{value:"calm",label:"Serena"}
];
function Row({label,value}:{label:string;value:string}){
 return <div className={styles.setting}><div><strong>{label}</strong></div><span>{value}</span></div>;
}
type SegmentedOption<T extends string>={value:T;label:string};
function SegmentedSelect<T extends string>({label,value,options,onChange,disabled=false}:{
 label:string;value:T;options:SegmentedOption<T>[];onChange:(next:T)=>void;disabled?:boolean;
}){
 return <div className={styles.segmentedField}>
  <span className={styles.segmentedLabel}>{label}</span>
  <div className={styles.segmentedTrack} role="group" aria-label={label}>
   {options.map(option=><button key={option.value} type="button"
    className={option.value===value?styles.segmentedActive:styles.segmentedOption}
    aria-pressed={option.value===value} disabled={disabled}
    onClick={()=>onChange(option.value)}>{option.label}</button>)}
  </div>
 </div>;
}
function History({calls,onSave,onCallBack,onLookup,canCallBack=false,callingSid=null,lookupSid=null}:{calls:CallRecord[];onSave?:(phone:string)=>void;onCallBack?:(sid:string)=>void;onLookup?:(sid:string)=>void;canCallBack?:boolean;callingSid?:string|null;lookupSid?:string|null}){
 const {language,translate}=useInterfaceLanguage();
 return calls.length?<div className={styles.realHistory}>{calls.map(item=><div key={item.bridge_sid} className={styles.historyItem}>
  <PhoneCall size={16}/><div><strong>{translate(item.call_mode==="translated"?"services.history.translated":"services.history.direct")}</strong>
  <small>{new Date(item.started_at).toLocaleString(language==="es"?"es-US":"en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})} · {callStatusKeys[item.status]?translate(callStatusKeys[item.status]):item.status}</small>{item.caller_phone?<small>{item.caller_phone}</small>:null}</div>
  <span className={styles.historySide}><span className={styles.historyDuration}>{item.duration_seconds===null?"—":Math.ceil(Math.max(0,item.duration_seconds)/60)+" min"}</span>
  {onLookup&&!item.caller_phone?<button className={styles.saveFromCall} type="button"
   disabled={!canCallBack||Boolean(lookupSid)} onClick={()=>onLookup(item.bridge_sid)}>
   <PhoneCall size={13}/>{lookupSid===item.bridge_sid?translate("services.history.searching"):translate("services.history.recoverNumber")}</button>:null}
  {onCallBack&&item.caller_phone?<button className={styles.callBackAction} type="button"
   disabled={!canCallBack||Boolean(callingSid)} title={!canCallBack?translate("services.history.callbackUnavailable"):undefined}
   onClick={()=>onCallBack(item.bridge_sid)}><PhoneCall size={13}/>{callingSid===item.bridge_sid?translate("services.history.connecting"):translate("services.history.callBack")}</button>:null}
  {onSave?<button className={styles.saveFromCall} type="button" onClick={()=>onSave(item.caller_phone||"")}>
   <UserRoundPlus size={13}/>{item.caller_phone?translate("services.history.saveContact"):translate("services.history.addContact")}</button>:null}</span>
 </div>)}</div>:<div className={styles.emptyHistory}><Clock3 size={28}/><strong>{translate("services.history.empty")}</strong></div>;
}
export default function VMVMobilePreview(){
 const {translate,language}=useInterfaceLanguage();
 const localizedVoiceChoices=choices.map(c=>({...c,label:translate(c.value==="default"?"services.call.voiceStandard":c.value==="bright"?"services.call.voiceBright":"services.call.voiceCalm")}));
 const account=useSmartCallAccount();
 const {client,user,phase,profile,settings,route,provisioning,calls,summary,preferences,setPreferences,
  loading,working,error,notice,setError,setNotice,refresh,signIn,signOut,saveBasic,savePremium}=account;
 const [tab,setTab]=useState<Tab>("home");
 const [diagnosticOpen,setDiagnosticOpen]=useState(false);
 const [diagnosticSaved,setDiagnosticSaved]=useState<DiagnosticRecord|null>(null);
 useEffect(()=>{const requestedTab=new URLSearchParams(window.location.search).get("tab");
   // The creation wizard can return directly to the Services screen.
   if(requestedTab==="account"||requestedTab==="services")setTab(requestedTab);
  },[]);
 const [open,setOpen]=useState(false);
 const [serviceFocus,setServiceFocus]=useState<"all"|"web">("all");
 const [catalogQuery,setCatalogQuery]=useState("");
 const [catalogGroup,setCatalogGroup]=useState<"all"|"communication"|"digital"|"growth">("all");
 const [panel,setPanel]=useState<Panel>("overview");
 const [callsView,setCallsView]=useState<"dial"|"history"|"contacts">("dial");
 const [callFilter,setCallFilter]=useState<"all"|"direct"|"translated">("all");
 const [contactStartForm,setContactStartForm]=useState(false);
 const [contactPhone,setContactPhone]=useState("");
 const [dialTarget,setDialTarget]=useState<{phone:string;name:string}|null>(null);
 const [draft,setDraft]=useState<CallSettings|null>(null);
 const [email,setEmail]=useState("");
 const [password,setPassword]=useState("");
 const [apiStatus,setApiStatus]=useState<Record<string,boolean>>({});
 const [topupBusy,setTopupBusy]=useState(false);
 const [topupMessage,setTopupMessage]=useState("");
 const [callbackAvailable,setCallbackAvailable]=useState(false);
 const [callbackBusy,setCallbackBusy]=useState<string|null>(null);
 const [callbackConfirmSid,setCallbackConfirmSid]=useState<string|null>(null);
 const [lookupBusy,setLookupBusy]=useState<string|null>(null);
 const [callbackMessage,setCallbackMessage]=useState("");
 useEffect(()=>{setDraft(settings?{...settings,caller_language:settings.desired_language===settings.caller_language?(settings.desired_language==="en"?"es":"en"):settings.caller_language}:null);},[settings]);
 const ready=phase==="signed_in"&&!!profile;
 useEffect(()=>{
  // Redirect only to allow-listed, same-origin modules after authenticated access.
  // Web Studio does not require a Smart Call profile; a signed-in account is enough.
  const destination=new URLSearchParams(window.location.search).get("returnTo");
  if(destination==="web-studio"&&phase==="signed_in"&&user){
   window.location.replace("/web-studio");
   return;
  }
  if(ready&&destination==="marketing")window.location.replace("/vista-app/marketing");
 },[ready,phase,user]);
 useEffect(()=>{
  if(!ready)return;
  let mounted=true;
  fetch("/api/status",{cache:"no-store"}).then(r=>r.json())
   .then(data=>{if(mounted)setApiStatus(data as Record<string,boolean>);}).catch(()=>{});
  return()=>{mounted=false;};
 },[ready]);
 useEffect(()=>{
  if(!ready||!client||!user){setCallbackAvailable(false);return;}
  let mounted=true;
  void (async()=>{
   try{
    const {data:session}=await client.auth.getSession();
    if(!session.session||session.session.user.id!==user.id)return;
    const response=await fetch("/api/vista-app/callback",{
     method:"GET",cache:"no-store",headers:{Authorization:"Bearer "+session.session.access_token}
    });
    const result=await response.json().catch(()=>null);
    if(mounted)setCallbackAvailable(response.ok&&result?.available===true);
   }catch{if(mounted)setCallbackAvailable(false);}
  })();
  return()=>{mounted=false;};
 },[ready,user?.id,client]);
 const billing=summary?.billing.ok?summary.billing.data:null;
 const line=summary?.line.ok?summary.line.data:null;
 const premium=summary?.preferences.ok?summary.preferences.data:null;
 const minuteData=billing?.minutes;
 const available=minuteData?.available;
 const name=profile?.first_name||"bienvenido";
 const business=profile?.business_name?.trim()||profile?.first_name||"Mi negocio";
 const diagnostic=diagnosticSaved?.businessId===profile?.id?diagnosticSaved:readDiagnosticRecord(user?.user_metadata,profile?.id||"");
 const homeRecommendations=diagnostic?getDiagnosticRecommendations(diagnostic.answers):null;
 const showHomeOffer=(service:DiagnosticService)=>!homeRecommendations||homeRecommendations.some(item=>item.id===service);
 const lineNumber=line?.twilioPhone||route?.twilio_number||translate("services.call.noAssignedNumber");
 const lineState=line?.connectedToApp?translate("services.call.iphoneRoute"):line?.verified?translate("services.call.numberVerifiedValue"):route?.enabled?translate("services.call.routeRegistered"):translate("services.call.activationPending");
 const go=(next:Tab)=>{setDiagnosticOpen(false);if(next!=="account"){const url=new URL(window.location.href);if(url.searchParams.get("tab")==="account"){url.searchParams.delete("tab");url.searchParams.delete("setup");window.history.replaceState(null,"",url.pathname+url.search+url.hash);}}setServiceFocus("all");setCallbackConfirmSid(null);setTab(next);if(next!=="services")setOpen(false);if(next==="calls"){setCallsView("dial");setDialTarget(null);setCallFilter("all");}setError("");setNotice("");};
 const showCall=(next:Panel="overview")=>{setDiagnosticOpen(false);setTab("services");setOpen(true);setPanel(next);setError("");setNotice("");};
 const saveNeedsAssessment=async(answers:DiagnosticAnswers)=>{
  if(!client||!user||!profile)throw new Error("Not signed in");
  const {data:identity,error:authError}=await client.auth.getUser();
  if(authError||identity.user?.id!==user.id)throw new Error("Session expired");
  const next=makeDiagnosticRecord(profile.id,answers);
  const {error:saveError}=await client.auth.updateUser({data:{[DIAGNOSTIC_METADATA_KEY]:next}});
  if(saveError)throw saveError;
  setDiagnosticSaved(next);
 };
 const exploreDiagnosticService=(service:DiagnosticService)=>{
  setDiagnosticOpen(false);
  if(service==="smart-call"){showCall("overview");return;}
  if(service==="web-services"){setOpen(false);setServiceFocus("web");setTab("services");return;}
  window.location.assign(service==="ai-agents"?"/vista-app/ai-agents":"/vista-app/marketing");
 };
 // Services are discoverable products; Home uses authenticated operational data instead.
 const catalogItems=[
  {id:"smart-call",name:"Smart Call",search:"calls llamadas teléfono",group:"communication",Icon:PhoneCall,tone:styles.catalogViolet,state:translate("home.pilot"),action:()=>window.location.assign("/vista-app/ai-agents?service=call")},
  {id:"translator",name:translate("common.translator"),search:"translator intérprete traducción",group:"communication",Icon:Languages,tone:styles.catalogMint,state:translate("catalog.open"),action:()=>go("translator")},
  {id:"web",name:"Web Services",search:"web sitios páginas",group:"digital",Icon:Globe,tone:styles.catalogYellow,state:translate("catalog.open"),action:()=>{setOpen(false);setServiceFocus("web");setTab("services");}},
  {id:"agents",name:"AI Agents",search:"ia inteligencia artificial agentes",group:"digital",Icon:Bot,tone:styles.catalogSky,state:translate("catalog.beta"),action:()=>window.location.assign("/vista-app/ai-agents")},
  {id:"video-generator",name:"Video Generator",search:"video videos generador creator studio inteligencia artificial",group:"digital",Icon:Video,tone:styles.catalogViolet,state:translate("catalog.beta"),action:()=>window.location.assign("/vista-app/ai-agents?service=video")},
  {id:"instagram-connect",name:"Instagram Connect",search:"instagram conectar mensajes dm directos comentarios inteligentes meta respuestas automáticas ventas",group:"communication",Icon:MessageCircle,tone:styles.catalogPink,state:translate("services.comingSoon"),action:()=>{}},
  {id:"smart-quote",name:"Smart Quote",search:"cotizaciones presupuestos presupuestar facturas pagos depósito propuestas cobranza ventas inteligencia artificial",group:"growth",Icon:FileText,tone:styles.catalogMint,state:translate("catalog.beta"),action:()=>window.location.assign("/vista-app/ai-agents?service=quote")},
  {id:"marketing",name:"Marketing",search:"marketing publicidad reputación",group:"growth",Icon:BarChart3,tone:styles.catalogPink,state:translate("catalog.beta"),action:()=>window.location.assign("/vista-app/marketing")},
  {id:"ads-studio",name:"Ads Studio",search:"ads anuncios campañas publicidad meta facebook instagram marketing generador anuncios inteligencia artificial",group:"growth",Icon:Megaphone,tone:styles.catalogPink,state:translate("catalog.beta"),action:()=>window.location.assign("/vista-app/marketing/ads")}
 ] as const;
 const catalogSearch=catalogQuery.trim().normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase();
 const filteredCatalog=catalogItems.filter(item=>(catalogGroup==="all"||item.group===catalogGroup)&&
  (!catalogSearch||(item.name+" "+item.search).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase().includes(catalogSearch)));
 const openContacts=(number="",startInForm=false)=>{setContactPhone(number);setContactStartForm(startInForm);setCallsView("contacts");setTab("calls");setError("");setNotice("");};
 const dialContact=(phone:string,name:string)=>{setDialTarget({phone,name});setCallsView("dial");setContactPhone("");setContactStartForm(false);setTab("calls");};
 async function login(e:FormEvent<HTMLFormElement>){e.preventDefault();await signIn(email,password);setPassword("");}
 async function saveSettings(e:FormEvent<HTMLFormElement>){e.preventDefault();if(draft)await saveBasic(draft);}
 async function saveVoices(e:FormEvent<HTMLFormElement>){e.preventDefault();await savePremium(preferences);}
 async function requestTranslationTopup(){
  if(!client||!user||!billing||billing.billingMode!=="test"||
    !billing.topup?.available||billing.topup.plan!==billing.plan||topupBusy)return;
  setTopupBusy(true);setTopupMessage("");
  try{
   const {data:identity,error:authError}=await client.auth.getUser();
   const {data:session}=await client.auth.getSession();
   if(authError||identity.user?.id!==user.id||!session.session||session.session.user.id!==user.id)
    throw new Error("Tu sesión expiró. Inicia sesión de nuevo.");
   const response=await fetch("/api/vista-app/topup",{
    method:"POST",cache:"no-store",
    headers:{Authorization:"Bearer "+session.session.access_token,"Content-Type":"application/json"},
    body:JSON.stringify({service:"translated",plan:billing.plan})
   });
   const result=await response.json().catch(()=>null);
   if(!response.ok||result?.mode!=="test")
    throw new Error(response.status===403?"Tu plan ya no permite esta recarga. Actualiza los datos.":"La recarga no está disponible por ahora.");
   const url=new URL(String(result.url||""));
   if(url.protocol!=="https:"||url.hostname!=="checkout.stripe.com")
    throw new Error("No pudimos confirmar el enlace seguro de Stripe.");
   window.location.assign(url.href);
  }catch(e){setTopupMessage(e instanceof Error?e.message:"Error al iniciar la recarga.");setTopupBusy(false);}
 }
 async function lookupCustomer(sid:string){
  if(!client||!user||!callbackAvailable||lookupBusy)return;
  setLookupBusy(sid);setCallbackMessage("");
  try{
   const {data:identity}=await client.auth.getUser();
   const {data:session}=await client.auth.getSession();
   if(identity.user?.id!==user.id||!session.session)throw Error("Vuelve a iniciar sesión.");
   const response=await fetch("/api/vista-app/callback/lookup",{
    method:"POST",cache:"no-store",
    headers:{Authorization:"Bearer "+session.session.access_token,"Content-Type":"application/json"},
    body:JSON.stringify({bridgeSid:sid})
   });
   const data=await response.json().catch(()=>null);
   if(!response.ok||data?.verified!==true)throw Error("Twilio no tiene un número verificable para esta llamada.");
   await refresh();
   setCallbackMessage("Número recuperado de Twilio: "+data.phone+". Ya puedes pulsar Devolver llamada.");
  }catch(e){setCallbackMessage(e instanceof Error?e.message:"No se pudo recuperar el número.");}
  finally{setLookupBusy(null);}
 }
 async function returnBusinessCall(sid:string){
  if(!client||!user||!callbackAvailable||callbackBusy)return;
  const entry=calls.find(item=>item.bridge_sid===sid);
  if(!entry?.caller_phone)return;
  
  setCallbackBusy(sid);setCallbackMessage("");
  try{
   const {data:identity}=await client.auth.getUser();
   const {data:session}=await client.auth.getSession();
   if(identity.user?.id!==user.id||!session.session)throw Error("Vuelve a iniciar sesión.");
   const response=await fetch("/api/vista-app/callback",{
    method:"POST",cache:"no-store",
    headers:{Authorization:"Bearer "+session.session.access_token,"Content-Type":"application/json"},
    body:JSON.stringify({bridgeSid:sid})
   });
   const result=await response.json().catch(()=>null);
   if(!response.ok||result?.started!==true){
    const messages:Record<string,string>={
     callback_in_progress:"Ya tienes una devolución en curso.",
     callback_rate_limited:"Has alcanzado el límite de devoluciones de prueba.",
     verified_caller_or_line_missing:"Esta llamada no tiene un número verificado o la línea no está lista.",
     callback_not_enabled:"La devolución todavía no está habilitada en el piloto.",
     active_plan_required:"Necesitas tener habilitado Smart Call."
    };
    throw Error(messages[result?.error]||"No se pudo iniciar la devolución. Inténtalo más tarde.");
   }
   setCallbackMessage("VMV está llamando a tu iPhone. Contesta para conectar con "+entry.caller_phone+".");
  }catch(e){setCallbackMessage(e instanceof Error?e.message:"Error al conectar la devolución.");}
  finally{setCallbackBusy(null);}
 }
 const filteredCalls=callFilter==="all"?calls:calls.filter(item=>item.call_mode===callFilter);
 const refreshButton=<button className={styles.secondaryAction} disabled={loading||working}
  onClick={()=>void refresh()}><RefreshCw size={15}/>{loading?translate("services.history.refreshing"):translate("services.history.refreshData")}</button>;
 const confirmingEntry=callbackConfirmSid?calls.find(item=>item.bridge_sid===callbackConfirmSid):null;
 return <main className={styles.stage}>
  {ready&&confirmingEntry?.caller_phone?<div className={styles.callbackConfirmBackdrop}>
   <div className={styles.callbackConfirmCard} role="dialog" aria-modal="true" aria-labelledby="callback-confirm-title">
    <span className={styles.smallKicker}>{translate("services.history.businessCall")}</span>
    <h3 id="callback-confirm-title">{translate("services.history.callBack")}</h3>
    <p>{translate("services.history.callbackInstructions")}</p>
    <strong>{confirmingEntry.caller_phone}</strong>
    <p>{translate("services.history.callbackDisclaimer")}</p>
    <button type="button" className={styles.mainAction} onClick={()=>{
      const sid=confirmingEntry.bridge_sid;setCallbackConfirmSid(null);void returnBusinessCall(sid);
    }}>{translate("services.history.callbackConfirm")} →</button>
    <button type="button" className={styles.secondaryAction} onClick={()=>setCallbackConfirmSid(null)}>{translate("services.history.cancel")}</button>
   </div>
  </div>:null}
  <header className={styles.pageHeader}>
   <a href="/" className={styles.wordmark}>VMV<span> BUSINESS</span></a>
   <span className={styles.previewTag}>{translate("native.previewAccountLabel")}</span>
   <a className={styles.webLink} href="https://vmv-business-design-git-feat-vm-073e13-valdys-projects-b97fc7a6.vercel.app/es/workspace/smart-call/" target="_blank" rel="noopener noreferrer">{translate("native.webPanel")} <ArrowUpRight size={15}/></a>
  </header>
  <div className={styles.layout}>
   <aside className={styles.intro}>
    <span className={styles.kicker}>VMV BUSINESS / SMART CALL</span>
    <h1>{translate("native.introBusiness")}<br/><em>{translate("native.introPocket")}</em></h1>
    <div className={styles.disclaimer}><ShieldCheck size={17}/><span>{translate("native.introDisclaimer")}</span></div>
   </aside>
   <div className={styles.phoneFrame}>
    <div className={styles.device}>
     <div className={styles.statusBar}><span>VMV</span><div className={styles.dynamicIsland}/><span>◢ ▰</span></div>
     <div className={ready&&tab==="home"?styles.homeTopHidden:styles.appTop}>
      <div className={styles.appHeaderIdentity}>
       <div className={styles.appLogo}><span className={styles.mark}>▥</span><b>VMV<span> BUSINESS</span></b></div>
       <div className={styles.appHeaderLanguage}><InterfaceLanguagePicker compact/></div>
      </div>
      {user?<button aria-label={translate("native.accountButton")} onClick={()=>go("account")}><UserRound size={18}/></button>:<LockKeyhole size={18} aria-hidden="true"/>}
     </div>
     <div className={styles.scrollArea} key={ready?tab+(open?"details":"list"):"login"}>
      {phase==="checking"?<div className={styles.loadingScreen}><LoaderCircle className={styles.spin}/><p>{translate("native.checkingSession")}</p></div>:null}
      {phase==="unconfigured"?<div className={styles.loadingScreen}><LockKeyhole/><p>{translate("native.supabaseMissing")}</p></div>:null}
      {phase==="signed_out"?<div className={styles.signinScreen}>
       <span className={styles.screenEyebrow}>{translate("native.secureAccess")}</span><h2>{translate("native.welcome")}<span className={styles.mint}>.</span></h2>
       <p className={styles.screenLead}>{translate("native.signInExplanation")}</p>
       <form className={styles.signinForm} onSubmit={login}>
        <label htmlFor="login-email">{translate("common.email")}</label><input required type="email" id="login-email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder={translate("native.emailPlaceholder")}/>
        <label htmlFor="login-password">{translate("common.password")}</label><input required type="password" id="login-password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder={translate("native.passwordPlaceholder")}/>
        <button type="submit" className={styles.mainAction} disabled={working}>{translate(working?"common.signingIn":"common.signIn")} <ArrowUpRight size={16}/></button>
       </form>
       <div className={styles.privacyNote}><ShieldCheck size={16}/><span>{translate("native.signInPrivacy")}</span></div>
       <a href="/registro" className={styles.registerLink}>{translate("native.registerPrompt")} ↗</a>
       {error?<p className={styles.errorText} role="alert">{translate("common.loginError")}</p>:null}
      </div>:null}
      {phase==="signed_in"&&!profile?<div className={styles.loadingScreen}>
       {loading?<LoaderCircle className={styles.spin}/>:<LockKeyhole/>}
       <h3>{translate(loading?"native.profileLoading":"native.profileError")}</h3>
       <p>{translate(loading?"native.profileLoadingHint":"native.profileMissingHint")}</p>
       {!loading?<><button className={styles.mainAction} onClick={()=>void refresh()}>{translate("common.retry")}</button><a className={styles.registerLink} href="/registro">{translate("native.finishRegistration")}</a><button className={styles.logoutLink} onClick={()=>void signOut()}>{translate("common.signOut")}</button></>:null}
      </div>:null}
      {ready&&tab==="home"&&diagnosticOpen?<BusinessDiagnostic key={user?.id||"account"} language={language==="en"?"en":"es"}
       businessName={business} record={diagnostic} onSave={saveNeedsAssessment}
       onClose={()=>setDiagnosticOpen(false)} onExplore={exploreDiagnosticService}/>:null}
      {ready&&tab==="home"&&!diagnosticOpen?<div className={`${styles.screen} ${styles.homeV2} ${styles.homeConcept}`}>
       <header className={styles.homeIdentity}>
        <span className={styles.homeIdentityBrand}><span className={styles.homeIdentityV} aria-hidden="true">V</span><strong>VMV Business</strong></span>
        <span className={styles.homeIdentityActions}><InterfaceLanguagePicker compact/><span className={styles.homeBell} aria-hidden="true"><Bell size={21}/></span></span>
       </header>
       <div className={styles.homeHello}>
        <h2>{language==="en"?"Hi":"Hola"}, {name} 👋</h2>
        <p>{language==="en"?"Your whole business, in one place.":"Todo tu negocio, en un solo lugar."}</p>
       </div>
       <section className={styles.homeGrowHero} aria-label={language==="en"?"Grow your business":"Haz crecer tu negocio"}>
        <div className={styles.homeGrowCopy}>
         <h3>{language==="en"?"Grow your\nbusiness":"Haz crecer\ntu negocio"}</h3>
         <p>{language==="en"?"Tools, services and AI for entrepreneurs.":"Herramientas, servicios y IA para emprendedores."}</p>
         <button type="button" className={styles.homeGrowStart} onClick={()=>setDiagnosticOpen(true)}>{language==="en"?(diagnostic?"Update needs":"Get started"):(diagnostic?"Actualizar necesidades":"Comenzar")} <ArrowUpRight size={18} aria-hidden="true"/></button>
        </div>
        <div className={styles.homeRocketArt} aria-hidden="true"><span className={styles.homeRocketHalo}/><Rocket size={104} strokeWidth={1.35}/><span className={styles.homeRocketCloud}/></div>
       </section>
       <div className={styles.homeServiceTiles}>
        {showHomeOffer("smart-call")?<button type="button" className={styles.homeTileMint} onClick={()=>showCall(summary?.billing.ok&&billing?.subscriptionActive===false?"minutes":"overview")}><PhoneCall size={31}/><strong>Smart Call</strong></button>:null}
        {showHomeOffer("web-services")?<button type="button" className={styles.homeTilePink} onClick={()=>{setOpen(false);setServiceFocus("web");setTab("services");}}><Monitor size={31}/><strong>Web Services</strong></button>:null}
        <button type="button" className={styles.homeTileLavender} onClick={()=>window.location.assign("/vista-app/ai-agents")}><Bot size={31}/><strong>AI Agents</strong></button>
        {showHomeOffer("marketing")?<button type="button" className={styles.homeTileGreen} onClick={()=>window.location.assign("/vista-app/marketing")}><Megaphone size={31}/><strong>Marketing</strong></button>:null}
        {homeRecommendations?.some(item=>item.id==="google-business")?<button type="button" className={styles.homeTileLavender} onClick={()=>window.location.assign("/vista-app/marketing")}><Globe size={31}/><strong>Google Business</strong></button>:null}
        {homeRecommendations?.length===0?<button type="button" className={styles.homeTileLavender} onClick={()=>go("services")}><LayoutGrid size={31}/><strong>{language==="en"?"All services":"Todos los servicios"}</strong></button>:null}
       </div>
       <section className={styles.homeBusinessArea}>
        <h3>{language==="en"?"My Business":"Mi Negocio"}</h3>
        <button type="button" className={styles.homeSummaryCard} onClick={()=>go("account")}>
         <span className={styles.homeSummaryIcon}><TrendingUp size={24}/></span>
         <span><strong>{language==="en"?"Overview":"Resumen"}</strong><small>{language==="en"?"Activity and results":"Actividad y resultados"}</small></span>
         <ChevronLeft size={21} className={styles.homeSummaryChevron} aria-hidden="true"/>
        </button>
        <details className={styles.homeLiveDetails}>
         <summary>{language==="en"?"See live activity":"Ver actividad real"}</summary>
         <div className={styles.dashboardHeading}><h3>{translate("dashboard.quickActions")}</h3></div>
         <button className={styles.dashboardCallCard} type="button" onClick={()=>showCall("overview")}>
          <strong>{translate("dashboard.callCenter")}</strong>
          <span className={styles.dashboardLineState}>{translate("dashboard.lineStatus")}: {summary?.line.ok?lineState:translate("dashboard.unavailable")}</span>
          <span className={styles.dashboardMetrics}>
           <span><b>{summary?.billing.ok?num(available):"—"}</b><small>{translate("dashboard.minutes")}</small></span>
           <span><b>{summary?.line.ok?num(summary.line.data?.usage.directCalls):"—"}</b><small>{translate("dashboard.calls")}</small></span>
          </span>
         </button>
         <section className={styles.dashboardActivity}>
          <div className={styles.dashboardActivityHeading}><h3>{translate("dashboard.activity")}</h3></div>
          {calls.length?<div className={styles.dashboardActivityList}>{calls.slice(0,2).map(item=>
           <div className={styles.dashboardActivityItem} key={item.bridge_sid}>
            <span className={styles.dashboardActivityIcon}><PhoneCall size={16}/></span>
            <span><strong>{translate(item.call_mode==="translated"?"services.history.translated":"services.history.direct")}</strong>
             <small>{new Date(item.started_at).toLocaleDateString(language==="es"?"es-US":"en-US",{month:"short",day:"numeric"})}</small></span>
           </div>)}</div>:<p className={styles.dashboardEmpty}>{translate("dashboard.emptyActivity")}</p>}
         </section>
        </details>
       </section>
      </div>:null}
      {ready&&tab==="services"&&!open?<div className={`${styles.screen} ${styles.servicesV3}`}>
       {serviceFocus==="web"?<>
        <button type="button" className={styles.back} onClick={()=>setServiceFocus("all")}><ChevronLeft size={17}/> {translate("native.totalServices")}</button>
        {user?<BusinessServicesPreview userId={user.id} focus="web"/>:null}
       </>:<>
        <h2 className={styles.servicesTitle}>{translate("common.services")}<span className={styles.mint}>.</span></h2>
        <label className={styles.catalogSearch}>
         <span className={styles.srOnly}>{translate("catalog.searchLabel")}</span>
         <Search size={18} aria-hidden="true"/>
         <input value={catalogQuery} onChange={event=>setCatalogQuery(event.target.value)}
          type="search" placeholder={translate("catalog.search")} autoComplete="off"/>
        </label>
        <div className={styles.catalogFilters} role="group" aria-label={translate("catalog.mainTools")}>
         {(["all","communication","digital","growth"] as const).map(group=>
          <button key={group} type="button" aria-pressed={catalogGroup===group}
           className={catalogGroup===group?styles.catalogFilterActive:styles.catalogFilter}
           onClick={()=>setCatalogGroup(group)}>{translate(group==="all"?"catalog.all":group==="communication"?"catalog.communication":group==="digital"?"catalog.digital":"catalog.growth")}</button>)}
        </div>
        <div className={styles.catalogGrid}>
         {filteredCatalog.map(item=><button type="button" key={item.id} disabled={item.id==="instagram-connect"}
          style={item.id==="instagram-connect"?{cursor:"default",opacity:1}:undefined}
          className={`${styles.catalogCard} ${item.tone}`} onClick={item.action}
          aria-label={item.name+" · "+item.state}>
          <span className={styles.catalogIcon}><item.Icon size={26}/></span>
          <span className={styles.catalogCardCopy}><strong>{item.name}</strong><small>{item.state}</small></span>
         </button>)}
        </div>
        {!filteredCatalog.length&&(catalogGroup!=="all"||!catalogSearch)?<p className={styles.catalogEmpty}>{translate("catalog.noResults")}</p>:null}
        {catalogGroup==="all"?catalogSearch?
         <section className={styles.catalogMoreResults} aria-label={translate("settings.otherServices")}>
          {user?<BusinessServicesPreview userId={user.id} excludeFeatured searchTerm={catalogQuery} primaryHasMatches={filteredCatalog.length>0}/>:null}
         </section>:
         <details className={styles.servicesMoreCatalog}>
          <summary>{translate("settings.otherServices")} <ChevronLeft size={18} aria-hidden="true"/></summary>
          {user?<BusinessServicesPreview userId={user.id} excludeFeatured/>:null}
         </details>:null}
       </>}
      </div>:null}
      {ready&&tab==="services"&&open?<div className={styles.smartScreen}>
       <button className={styles.back} onClick={()=>setOpen(false)}><ChevronLeft size={17}/> {translate("native.totalServices")}</button>
       <header className={styles.smartHeading}>
        <h2>Smart Call<span>.</span></h2>
        <p className={styles.smartLineStatus}><span aria-hidden="true"/>{lineState}</p>
       </header>
       <div className={styles.switcher}>{([{id:"overview",label:translate("services.call.overview")},{id:"minutes",label:translate("common.minutes")},{id:"settings",label:translate("common.settings")},{id:"activity",label:translate("services.call.activity")}] as const).map(item=><button key={item.id} onClick={()=>setPanel(item.id)} className={panel===item.id?styles.selected:""}>{item.label}</button>)}</div>
       {panel==="overview"?<>
        <div className={styles.smartCard}>
         <span className={styles.smallKicker}>{translate("services.call.yourNumber")}</span>
         <h3>{lineNumber}</h3>
         <p>{line?.connectedToApp?translate("services.call.connectedToIphone"):line?.verified?translate("services.call.verifiedCheckIphone"):translate("services.call.linePending")}</p>
         <div className={styles.rule}/>
         <Row label={translate("services.call.languages")} value={lang(settings?.caller_language)+" → "+lang(settings?.desired_language)}/>
         <Row label={translate("services.call.assistant")} value={settings?.assistant_name||translate("services.call.notConfigured")}/>
         <button className={styles.mainAction} onClick={()=>setPanel("settings")}>{translate("services.call.changeSettings")} →</button>
         <details className={styles.minuteDetails}>
          <summary>{translate("services.call.lineDetails")}</summary>
          <div className={styles.minuteBreakdown}>
           <Row label={translate("services.call.lineStatus")} value={lineState}/>
           <Row label={translate("services.call.numberVerified")} value={line?.verified?translate("services.call.yes"):translate("services.call.pending")}/>
           <Row label={translate("services.call.contactNumber")} value={line?.publicPhone||translate("services.call.notConfigured")}/>
           <Row label={translate("services.call.carrier")} value={(!line?.carrier||line.carrier==="other")&&(!provisioning?.carrier||provisioning.carrier==="other")?translate("services.call.notSpecified"):line?.carrier||provisioning?.carrier||translate("services.call.notSpecified")}/>
           <Row label={translate("services.call.request")} value={({activated:translate("services.call.activated"),approved:translate("services.call.approved"),pending:translate("services.call.pending"),contacted:translate("services.call.underReview"),rejected:translate("services.call.rejected")} as Record<string,string>)[provisioning?.status||""]||translate("services.call.noRequest")}/>
           <Row label={translate("services.call.receiving")} value={route?.receive_method==="ios_app"?"App iPhone":route?.receive_method==="pstn"?translate("services.call.otherLine"):translate("services.call.notConfigured")}/>
           <Row label={translate("services.call.forwarding")} value={route?.forwarding_mode==="none"?translate("services.call.notConfigured"):route?.forwarding_mode==="conditional"?translate("services.call.conditional"):route?.forwarding_mode==="all_calls"?translate("services.call.allCalls"):translate("services.call.notAvailable")}/>
           <Row label={translate("services.call.bilingualMenu")} value={line?.menuPrepared?translate("services.call.preparedForTests"):translate("services.call.unverified")}/>
           
          </div>
         </details>
        </div>
        <div className={styles.miniCards}><div><strong>{num(available)}</strong><small>{translate("services.call.minutesToTranslate")}</small></div><div><strong>{line?.usage.calls??"—"}</strong><small>{translate("services.call.registeredCalls30")}</small></div></div>
        {refreshButton}
       </>:null}
       {panel==="minutes"?<>
        <div className={styles.smartCard}>
         <div className={styles.balanceTitle}>
          <span className={styles.balanceServiceIcon}><PhoneCall size={19}/></span>
          <div><h3>{translate("services.call.normalCalls")}</h3></div>
         </div>
         {billing?.national?.enabled?
          <>
           <strong className={styles.directServiceStatus}>{billing.national.available} {translate("services.call.minutesAvailable")}</strong>
           <Row label={translate("services.call.included")} value={billing.national.included+" min"}/>
           <Row label={translate("services.call.used")} value={billing.national.used+" min"}/>
           {billing.national.reserved>0?<Row label={translate("services.call.inCall")} value={billing.national.reserved+" min"}/>:null}
           {billing.national.available===0?<p className={styles.testNote}>{translate("services.call.noNationalMinutes")}</p>:null}
          </>:
          <>
           <strong className={styles.directServiceStatus}>{billing?.subscriptionActive?translate("services.call.includedInPlan"):translate("services.call.notAvailablePlural")}</strong>
           {billing?.plan==="starter"?<Row label={translate("services.call.starterExpected")} value={"150 "+translate("services.call.nationalMinutes")}/>:null}
          </>}
         <Row label={translate("services.call.calls30")} value={num(line?.usage.directCalls)}/>
        </div>
        <div className={styles.minuteHero}>
         <span className={styles.smallKicker}>{translate("services.call.translatedCalls")}</span>
         <strong>{num(available)}<small> min</small></strong>
         <p>{available==null?translate("services.call.balanceUnavailable"):available===0?translate("services.call.noMinutes"):translate("services.call.available")}</p>
        </div>
        <div className={styles.smartCard}>
         <Row label={translate("common.plan")} value={billing?.plan&&billing.plan!=="none"?billing.plan.charAt(0).toUpperCase()+billing.plan.slice(1):"—"}/>
         <a className={styles.plansLink} href="https://vmv-business-design-git-feat-vm-073e13-valdys-projects-b97fc7a6.vercel.app/es/planes/" target="_blank" rel="noopener noreferrer">{translate("services.call.viewPlans")} <ArrowUpRight size={15}/></a>
         <Row label={translate("services.call.included")} value={num(minuteData?.included)+" min"}/>
         <Row label={translate("services.call.used")} value={num(minuteData?.used)+" min"}/>
         <Row label={translate("services.call.renewal")} value={billing?.periodEnd?new Intl.DateTimeFormat(language==="es"?"es-US":"en-US",{year:"numeric",month:"short",day:"numeric"}).format(new Date(billing.periodEnd)):"—"}/>
         {billing?.topup?.available&&billing.billingMode==="test"?<div className={styles.topupOffer}>
          <div className={styles.topupOfferLine}>
           <strong>+{billing.topup.minutes} min</strong>
           <span>{"$"+(billing.topup.priceCents/100).toFixed(2)} USD · {translate("services.call.testTag")}</span>
          </div>
          <button type="button" className={styles.mainAction} disabled={topupBusy}
           onClick={()=>void requestTranslationTopup()}>{topupBusy?translate("services.call.openStripe"):translate("services.call.topup")}</button>
          <p className={styles.minuteExplanation}>{translate("services.call.testPayment")}</p>
          {topupMessage?<p role="alert" className={styles.errorText}>{translate("services.call.topupError")}</p>:null}
         </div>:null}
         {billing?.billingMode==="test"&&!billing.topup?.available?<p className={styles.testNote}>{translate("services.call.testAccount")}</p>:null}
         <details className={styles.minuteDetails}>
          <summary>{translate("services.call.usageDetails")}</summary>
          <div className={styles.minuteBreakdown}>
           <Row label={translate("services.call.topups")} value={num(minuteData?.topup)+" min"}/>
           <Row label={translate("services.call.rollover")} value={num(minuteData?.rollover)+" min"}/>
           <Row label={translate("services.call.reserved")} value={num(minuteData?.reserved)+" min"}/>
           <Row label={translate("services.call.temporaryHold")} value={num(minuteData?.temporaryHold)+" min"}/>
          </div>
         </details>
         {refreshButton}
        </div>
       </>:null}
       {panel==="settings"?<>
        <form className={styles.smartCard} onSubmit={saveSettings}><span className={styles.smallKicker}>{translate("services.call.accountSettings")}</span><h3>{translate("services.call.languagesAndAssistant")}</h3>
         <SegmentedSelect label={translate("services.call.yourLanguage")} value={draft?.desired_language||"es"} options={[{value:"es",label:"Español"},{value:"en",label:"English"}]} disabled={!draft||working} onChange={value=>setDraft(v=>v?{...v,desired_language:value,caller_language:value==="es"?"en":"es"}:null)}/>
         <SegmentedSelect label={translate("services.call.customerLanguage")} value={draft?.caller_language||"en"} options={[{value:"en",label:"English"},{value:"es",label:"Español"}]} disabled={!draft||working} onChange={value=>setDraft(v=>v?{...v,caller_language:value,desired_language:value==="es"?"en":"es"}:null)}/>
         <label htmlFor="my-assistant">{translate("services.call.assistantName")}</label><input id="my-assistant" disabled={!draft||working} maxLength={40} required value={draft?.assistant_name||""} onChange={e=>setDraft(v=>v?{...v,assistant_name:e.target.value}:null)}/>
         
         {!draft?<div className={styles.testNote}>{translate("services.call.activateFirst")}</div>:null}
         <button type="submit" disabled={!draft||working} className={styles.mainAction}>{working?translate("common.saving"):translate("services.call.savePreferences")} →</button>
        </form>
        <form className={styles.smartCard} onSubmit={saveVoices}><span className={styles.smallKicker}>{translate("services.call.personalization")}</span><h3>{translate("services.call.voicesGreetings")}</h3>
         <p>{premium?.editable===true?translate("services.call.premiumEnabled"):translate("services.call.premiumUnavailable")}</p>
         <fieldset className={styles.voiceFields} disabled={premium?.editable!==true||working}>
          <SegmentedSelect label={translate("services.call.customerVoice")} value={preferences.voice_customer} options={localizedVoiceChoices} disabled={premium?.editable!==true||working} onChange={value=>setPreferences({...preferences,voice_customer:value})}/>
          <SegmentedSelect label={translate("services.call.yourVoice")} value={preferences.voice_owner} options={localizedVoiceChoices} disabled={premium?.editable!==true||working} onChange={value=>setPreferences({...preferences,voice_owner:value})}/>
          <label htmlFor="greeting-customer">{translate("services.call.customerGreeting")}</label><textarea id="greeting-customer" maxLength={180} rows={3} value={preferences.greeting_customer} onChange={e=>setPreferences({...preferences,greeting_customer:e.target.value})} placeholder={translate("services.call.greetingCustomerPlaceholder")}/>
          <label htmlFor="greeting-owner">{translate("services.call.yourGreeting")}</label><textarea id="greeting-owner" maxLength={180} rows={3} value={preferences.greeting_owner} onChange={e=>setPreferences({...preferences,greeting_owner:e.target.value})} placeholder={translate("services.call.greetingOwnerPlaceholder")}/>
         </fieldset>
         <p>{preferences.greeting_customer.length}/180 · {preferences.greeting_owner.length}/180 {translate("services.call.characters")}</p>
         <button type="submit" disabled={premium?.editable!==true||working} className={styles.mainAction}>{working?translate("common.saving"):translate("services.call.saveVoices")} →</button>
         {premium?.editable!==true?<div className={styles.testNote}>{translate("services.call.premiumRequired")}</div>:null}
        </form>
       </>:null}
       {panel==="activity"?<div className={styles.smartCard}><span className={styles.smallKicker}>{translate("services.call.realHistory")}</span><h3>{translate("services.call.recentCalls")}</h3>
        
        <History calls={calls} onSave={phone=>openContacts(phone,true)} onCallBack={sid=>setCallbackConfirmSid(sid)} onLookup={sid=>void lookupCustomer(sid)}
         canCallBack={callbackAvailable} callingSid={callbackBusy} lookupSid={lookupBusy}/>
        {callbackMessage?<p className={styles.callbackFeedback} role="status">{translate("services.call.callbackFeedback")}</p>:null}{refreshButton}
       </div>:null}
      </div>:null}
      {ready&&tab==="calls"?<section className={styles.screen}>
       <div className={styles.callViewTabs} role="tablist" aria-label="Secciones de llamadas">
        {([{id:"dial",emoji:"⌨️",key:"native.dialpad"},{id:"history",emoji:"🕘",key:"common.history"},{id:"contacts",emoji:"👥",key:"native.contacts"}] as const).map(item=>
         <button type="button" key={item.id} role="tab" aria-label={translate(item.key)} title={translate(item.key)}
          aria-selected={callsView===item.id}
          className={callsView===item.id?styles.callViewTabActive:styles.callViewTab}
          onClick={()=>{setCallsView(item.id);if(item.id==="contacts"){setContactPhone("");setContactStartForm(false);}if(item.id==="dial")setDialTarget(null);}}>
          <span className={styles.callTabEmoji} aria-hidden="true">{item.emoji}</span>
          <small className={styles.callTabLabel}>{translate(item.key)}</small>
         </button>)}
       </div>
       {callsView==="dial"&&client&&user?<DialPad client={client} ownerId={user.id} initialPhone={dialTarget?.phone||""} contactName={dialTarget?.name||""}/>:null}
       {callsView==="history"?<div role="tabpanel" aria-label="Historial de llamadas">
        <div className={styles.callHistoryToolbar}>
         <div className={styles.callFilters} role="group" aria-label="Filtrar llamadas">
          {([{id:"all",label:"Todas"},{id:"direct",label:"Directas"},{id:"translated",label:"Traducidas"}] as const).map(item=><button key={item.id} type="button" aria-pressed={callFilter===item.id} className={callFilter===item.id?styles.callFilterActive:styles.callFilter} onClick={()=>setCallFilter(item.id)}>{item.label}</button>)}
         </div>
         <button type="button" className={styles.callRefresh} disabled={loading||working} aria-label="Actualizar historial" onClick={()=>void refresh()}><RefreshCw size={17}/></button>
        </div>
        <div className={styles.smartCard}>
         <History calls={filteredCalls} onSave={phone=>openContacts(phone,true)}
          onCallBack={sid=>setCallbackConfirmSid(sid)} onLookup={sid=>void lookupCustomer(sid)}
          canCallBack={callbackAvailable} callingSid={callbackBusy} lookupSid={lookupBusy}/>
         {callbackMessage?<p className={styles.callbackFeedback} role="status">{callbackMessage}</p>:null}
        </div>
       </div>:null}
       {callsView==="contacts"&&client&&user?<div role="tabpanel" aria-label="Agenda de contactos">
        <ContactBook key={user.id+":"+contactPhone+":"+contactStartForm}
         client={client} ownerId={user.id} initialPhone={contactPhone}
         startInForm={contactStartForm} embedded onCall={dialContact} onClose={()=>setCallsView("dial")}/>
       </div>:null}
      </section>:null}
      {ready&&tab==="translator"?<div className={`${styles.screen} ${styles.translatorV3}`}>
       {client&&profile?<div className={styles.interpreterWrap}><LivePanel supabase={client} profile={profile} apiStatus={apiStatus}/></div>:null}
      </div>:null}
      {ready&&tab==="account"?<div className={`${styles.screen} ${styles.accountV3}`}>
       <h2>{translate("home.viewAccount")}<span className={styles.mint}>.</span></h2>
       {/* Interface language is already available from the shared app header; do not duplicate it here. */}
       <div className={styles.accountHero}><span className={styles.accountHeroAvatar}><UserRound size={29}/></span>
        <span className={styles.accountHeroInfo}><strong>{business}</strong><small>{user?.email||"—"}</small></span>
        <span className={styles.accountHeroSpark} aria-hidden="true">✦</span>
       </div>
       {user?<AccountBusinessAgent key={user.id} ownerId={user.id} initialName={profile?.business_name||""}/>:null}
       <div className={styles.accountStatGrid}>
        <button type="button" className={styles.accountStatTile} onClick={()=>showCall("minutes")}>
         <span><Clock3 size={19}/></span><strong>{num(available)} min</strong><small>{translate("home.minutesToTranslate")}</small>
        </button>
        <button type="button" className={styles.accountStatTile} onClick={()=>showCall("minutes")}>
         <span><ShieldCheck size={19}/></span><strong>{billing?.plan?.toUpperCase()||"—"}</strong><small>{translate("common.plan")}</small>
        </button>
       </div>
       <div className={styles.smartCard}>
        <Row label={translate("common.status")} value={billing?.status||"—"}/><Row label={translate("common.phone")} value={profile?.phone||"—"}/>
        <button className={styles.mainAction} onClick={()=>showCall("minutes")}>{translate("common.viewPlan")} <ArrowUpRight size={16}/></button>
        {refreshButton}
       </div>
       <div className={styles.smartCard}><a href="/vista-app/soporte" style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,padding:"13px 8px",textDecoration:"none",color:"inherit",fontWeight:800,fontSize:13}}><span style={{display:"inline-flex",gap:10,alignItems:"center"}}><MessageCircle size={20}/>{language==="en"?"Contact VMV Support":"Contactar soporte VMV"}</span><ArrowUpRight size={17}/></a></div>
       <button className={styles.logoutLink} disabled={working} onClick={()=>void signOut()}><LogOut size={15}/> {translate("common.signOut")}</button>
      </div>:null}
      {ready&&(error||notice||summary&&!summary.billing.ok)?<div className={styles.feedbackArea} aria-live="polite" role="status">
       {error?<p className={styles.errorText}>{error}</p>:null}
       {notice?<p className={styles.successText}>{notice}</p>:null}
       {summary&&!summary.billing.ok?<p className={styles.errorText}>El balance está temporalmente no disponible. No se muestra un saldo simulado.</p>:null}
      </div>:null}
     </div>
     {ready?<nav className={styles.bottomNav} aria-label={translate("home.primaryNavigation")}>
      {nav.map(([id,labelKey,Icon])=><button key={id} type="button" className={[tab===id?styles.activeNav:"",id==="calls"?styles.navCallAction:""].filter(Boolean).join(" ")} onClick={()=>go(id)} aria-label={translate(labelKey)} title={translate(labelKey)} aria-pressed={tab===id}><span aria-hidden="true"><Icon size={id==="calls"?25:22}/></span><small>{translate(labelKey)}</small></button>)}
     </nav>:null}
    </div>
   </div>
  </div>
 </main>;
}