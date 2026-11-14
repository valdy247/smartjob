"use client";
import {useEffect,useState,type FormEvent} from "react";
import {House,LayoutGrid,PhoneCall,Languages,UserRound,ArrowUpRight,ChevronLeft,Clock3,ContactRound,UserRoundPlus,
 ShieldCheck,Mic,Package,CalendarDays,Users,BarChart3,Workflow,Globe,Bot,
 RefreshCw,Settings2,LoaderCircle,LogOut,LockKeyhole,PhoneForwarded,MessageCircle,Monitor,Cpu,TrendingUp} from "lucide-react";
import {LivePanel} from "@/components/LivePanel";
import ContactBook from "./ContactBook";
import DialPad from "./DialPad";
import BusinessServicesPreview from "./BusinessServicesPreview";
import {useSmartCallAccount,type Tab,type Panel,type CallSettings,type CallRecord,type Voice} from "./useSmartCallAccount";
import styles from "./vista-app.module.css";
import {InterfaceLanguagePicker} from "@/components/InterfaceLanguagePicker";
import {useInterfaceLanguage} from "@/lib/i18n-web";

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
const statuses:Record<string,string>={
 completed:"Finalizada","in-progress":"En curso",ringing:"Sonando",initiated:"Iniciando",
 failed:"Fallida",busy:"Ocupada","no-answer":"Sin respuesta",canceled:"Cancelada"
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
 return calls.length?<div className={styles.realHistory}>{calls.map(item=><div key={item.bridge_sid} className={styles.historyItem}>
  <PhoneCall size={16}/><div><strong>{item.call_mode==="translated"?"Llamada traducida":"Llamada directa"}</strong>
  <small>{new Date(item.started_at).toLocaleString("es-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})} · {statuses[item.status]||item.status}</small>{item.caller_phone?<small>{item.caller_phone}</small>:null}</div>
  <span className={styles.historySide}><span className={styles.historyDuration}>{item.duration_seconds===null?"—":Math.ceil(Math.max(0,item.duration_seconds)/60)+" min"}</span>
  {onLookup&&!item.caller_phone?<button className={styles.saveFromCall} type="button"
   disabled={!canCallBack||Boolean(lookupSid)} onClick={()=>onLookup(item.bridge_sid)}>
   <PhoneCall size={13}/>{lookupSid===item.bridge_sid?"Buscando…":"Recuperar número"}</button>:null}
  {onCallBack&&item.caller_phone?<button className={styles.callBackAction} type="button"
   disabled={!canCallBack||Boolean(callingSid)} title={!canCallBack?"Devolución no disponible en esta cuenta":undefined}
   onClick={()=>onCallBack(item.bridge_sid)}><PhoneCall size={13}/>{callingSid===item.bridge_sid?"Conectando…":"Devolver llamada"}</button>:null}
  {onSave?<button className={styles.saveFromCall} type="button" onClick={()=>onSave(item.caller_phone||"")}>
   <UserRoundPlus size={13}/>{item.caller_phone?"Guardar contacto":"Añadir contacto"}</button>:null}</span>
 </div>)}</div>:<div className={styles.emptyHistory}><Clock3 size={28}/><strong>Sin llamadas registradas</strong><p>Tu actividad aparecerá aquí después de las primeras llamadas.</p></div>;
}
export default function VMVMobilePreview(){
 const {translate,language}=useInterfaceLanguage();
 const account=useSmartCallAccount();
 const {client,user,phase,profile,settings,route,provisioning,calls,summary,preferences,setPreferences,
  loading,working,error,notice,setError,setNotice,refresh,signIn,signOut,saveBasic,savePremium}=account;
 const [tab,setTab]=useState<Tab>("home");
 const [open,setOpen]=useState(false);
 const [serviceFocus,setServiceFocus]=useState<"all"|"web">("all");
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
 const lineNumber=line?.twilioPhone||route?.twilio_number||"Sin número asignado";
 const lineState=line?.connectedToApp?"Ruta iPhone configurada":line?.verified?"Número verificado":route?.enabled?"Ruta registrada":"Pendiente de activación";
 const go=(next:Tab)=>{setServiceFocus("all");setCallbackConfirmSid(null);setTab(next);if(next!=="services")setOpen(false);if(next==="calls"){setCallsView("dial");setDialTarget(null);setCallFilter("all");}setError("");setNotice("");};
 const showCall=(next:Panel="overview")=>{setTab("services");setOpen(true);setPanel(next);setError("");setNotice("");};
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
  onClick={()=>void refresh()}><RefreshCw size={15}/>{loading?"Actualizando…":"Actualizar datos"}</button>;
 const confirmingEntry=callbackConfirmSid?calls.find(item=>item.bridge_sid===callbackConfirmSid):null;
 return <main className={styles.stage}>
  {ready&&confirmingEntry?.caller_phone?<div className={styles.callbackConfirmBackdrop}>
   <div className={styles.callbackConfirmCard} role="dialog" aria-modal="true" aria-labelledby="callback-confirm-title">
    <span className={styles.smallKicker}>LLAMADA EMPRESARIAL</span>
    <h3 id="callback-confirm-title">Devolver llamada</h3>
    <p>VMV llamará primero a tu iPhone. Cuando contestes, conectará con:</p>
    <strong>{confirmingEntry.caller_phone}</strong>
    <p>El cliente verá tu número Twilio empresarial. Esta llamada será normal, sin traducción, y puede generar cargos de voz de Twilio.</p>
    <button type="button" className={styles.mainAction} onClick={()=>{
      const sid=confirmingEntry.bridge_sid;setCallbackConfirmSid(null);void returnBusinessCall(sid);
    }}>Devolver con VMV →</button>
    <button type="button" className={styles.secondaryAction} onClick={()=>setCallbackConfirmSid(null)}>Cancelar</button>
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
    <p>{translate("native.introLead")}</p>
    <div className={styles.feature}><span>01</span><div><strong>{translate("native.introMinutesTitle")}</strong><small>{translate("native.introMinutesBody")}</small></div></div>
    <div className={styles.feature}><span>02</span><div><strong>{translate("native.introSyncTitle")}</strong><small>{translate("native.introSyncBody")}</small></div></div>
    <div className={styles.feature}><span>03</span><div><strong>{translate("native.introLineTitle")}</strong><small>{translate("native.introLineBody")}</small></div></div>
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
      {ready&&tab==="home"?<div className={`${styles.screen} ${styles.homeV2}`}>
       <div className={styles.homeWelcome}>
        <button type="button" className={styles.homeProfile} onClick={()=>go("account")} aria-label="Abrir mi cuenta">
         <span className={styles.homeProfileAvatar}><UserRound size={21}/></span>
         <span><small>BIENVENIDO A VMV</small><strong>{translate("home.hello",{name})}</strong></span>
        </button>
        <span className={styles.homeBrandPill}>BUSINESS <span>✦</span></span>
       </div>
       <button type="button" className={styles.homeSpotlight} onClick={()=>showCall("overview")}
        aria-label="Abrir Smart Call">
        <span className={styles.homeSpotlightKicker}>SMART CALL <span>● EN PILOTO</span></span>
        <strong>{translate("home.businessConnected")}<span>.</span></strong>
        <small>{translate("home.callsAndTranslation")}</small>
        <span className={styles.homeSpotlightMinutes}>{num(available)} min <span>{translate("home.minutesToTranslate")}</span></span>
        <span className={styles.homeSpotlightArt} aria-hidden="true">
         <span className={styles.homeArtRingOne}></span>
         <span className={styles.homeArtRingTwo}></span>
         <span className={styles.homeArtPhone}><PhoneCall size={30} strokeWidth={2.2}/></span>
         <span className={styles.homeArtMiniBubble}><Languages size={17}/></span>
         <span className={styles.homeArtSpark}>✦</span>
        </span>
        <span className={styles.homeSpotlightGo}><ArrowUpRight size={20}/></span>
       </button>
       <div className={styles.homeSectionHeading}>
        <h3>{translate("home.featured")}<span>.</span></h3>
        <button type="button" onClick={()=>go("services")}>{translate("home.seeAll")} <ArrowUpRight size={15}/></button>
       </div>
       <div className={styles.homeProductsGrid}>
        <button className={`${styles.homeProductCard} ${styles.homeProductMint}`}
         onClick={()=>go("translator")} aria-label="Abrir traductor en persona">
         <span className={styles.homeProductIcon}><Languages size={27}/></span>
         <span className={styles.homeProductDecor} aria-hidden="true"><MessageCircle size={75} strokeWidth={1.5}/></span>
         <span className={styles.homeProductBody}><strong>Traductor</strong><small>En persona</small></span>
         <span className={styles.homeProductArrow}>↗</span>
        </button>
        <button type="button" className={`${styles.homeProductCard} ${styles.homeProductYellow}`}
          onClick={()=>{setOpen(false);setServiceFocus("web");setTab("services");}} aria-label="Abrir Web Services">
         <span className={styles.homeProductIcon}><Globe size={27}/></span>
         <span className={styles.homeProductBody}><strong>Web Services</strong><small>Explorar</small></span>
         <span className={styles.homeProductDecor} aria-hidden="true"><Monitor size={83} strokeWidth={1.25}/></span>
         <span className={styles.homeProductArrow}>↗</span>
        </button>
        <button type="button" className={`${styles.homeProductCard} ${styles.homeProductSky}`}
         onClick={()=>window.location.assign("/vista-app/ai-agents")} aria-label={`${translate("home.explore")}: AI Agents`}>
         <span className={styles.homeProductIcon}><Bot size={27}/></span>
         <span className={styles.homeProductBody}><strong>AI Agents</strong><small>Beta</small></span>
         <span className={styles.homeProductDecor} aria-hidden="true"><Cpu size={79} strokeWidth={1.3}/></span>
         <span className={styles.homeProductArrow} aria-hidden="true">↗</span>
        </button>
        <button type="button" className={`${styles.homeProductCard} ${styles.homeProductPink}`}
         onClick={()=>window.location.assign("/vista-app/marketing")} aria-label="Abrir Marketing Studio en beta">
         <span className={styles.homeProductIcon}><BarChart3 size={27}/></span>
         <span className={styles.homeProductBody}><strong>Marketing</strong><small>Explorar beta</small></span>
         <span className={styles.homeProductDecor} aria-hidden="true"><TrendingUp size={82} strokeWidth={1.3}/></span>
         <span className={styles.homeProductArrow}>↗</span>
        </button>
       </div>
       <button className={styles.homeExplore} type="button" onClick={()=>go("services")}>
        <span className={styles.homeExploreCopy}>
         <small>VMV BUSINESS</small>
         <strong>Descubre lo que<br/>viene después.</strong>
         <span>{translate("home.explore")} <ArrowUpRight size={15}/></span>
        </span>
        <span className={styles.homeExploreGraphic} aria-hidden="true">✦</span>
       </button>
      </div>:null}
      {ready&&tab==="services"&&!open?<div className={`${styles.screen} ${styles.servicesV3}`}>
       {serviceFocus==="web"?<>
        <button type="button" className={styles.back} onClick={()=>setServiceFocus("all")}><ChevronLeft size={17}/> Todos los servicios</button>
        {user?<BusinessServicesPreview userId={user.id} focus="web"/>:null}
       </>:<>
       <span className={styles.screenEyebrow}>VMV BUSINESS</span><h2>{translate("home.moreServices")}<span className={styles.mint}>.</span></h2>
       <button type="button" className={styles.serviceHero} onClick={()=>showCall()} aria-label="Abrir Smart Call">
        <span className={styles.serviceHeroTop}><span className={styles.serviceHeroIcon}><PhoneCall size={26}/></span><span className={styles.serviceHeroStatus}>EN PILOTO</span></span>
        <strong>Smart Call<span>.</span></strong>
        <small>{num(available)} min para traducir</small>
        <span className={styles.serviceLink}>Abrir servicio <ArrowUpRight size={17}/></span>
        <span className={styles.serviceHeroDecoration} aria-hidden="true">✦</span>
       </button>
       {user?<BusinessServicesPreview userId={user.id}/>:null}
       </>}
      </div>:null}
      {ready&&tab==="services"&&open?<div className={styles.smartScreen}>
       <button className={styles.back} onClick={()=>setOpen(false)}><ChevronLeft size={17}/> Todos los servicios</button>
       <div className={styles.smartHero}><span>VMV BUSINESS / COMUNICACIÓN</span><h2>Smart Call<span>.</span></h2><div className={styles.smartBadge}><span/>{lineState}</div></div>
       <div className={styles.switcher}>{([{id:"overview",label:"Resumen"},{id:"minutes",label:"Minutos"},{id:"settings",label:"Ajustes"},{id:"activity",label:"Actividad"}] as const).map(item=><button key={item.id} onClick={()=>setPanel(item.id)} className={panel===item.id?styles.selected:""}>{item.label}</button>)}</div>
       {panel==="overview"?<>
        <div className={styles.smartCard}>
         <span className={styles.smallKicker}>TU NÚMERO VMV</span>
         <h3>{lineNumber}</h3>
         <p>{line?.connectedToApp?"Configurado para recibir llamadas en tu iPhone.":line?.verified?"Tu número está verificado. Comprueba la conexión con el iPhone.":"La configuración de tu línea está pendiente."}</p>
         <div className={styles.rule}/>
         <Row label="Idiomas" value={lang(settings?.caller_language)+" → "+lang(settings?.desired_language)}/>
         <Row label="Tu asistente" value={settings?.assistant_name||"Sin configurar"}/>
         <button className={styles.mainAction} onClick={()=>setPanel("settings")}>Cambiar configuración →</button>
         <details className={styles.minuteDetails}>
          <summary>Ver detalles de la línea</summary>
          <div className={styles.minuteBreakdown}>
           <Row label="Estado de la línea" value={lineState}/>
           <Row label="Número verificado" value={line?.verified?"Sí":"Pendiente"}/>
           <Row label="Número de contacto" value={line?.publicPhone||"No configurado"}/>
           <Row label="Operador" value={(!line?.carrier||line.carrier==="other")&&(!provisioning?.carrier||provisioning.carrier==="other")?"No especificado":line?.carrier||provisioning?.carrier||"No especificado"}/>
           <Row label="Solicitud" value={({activated:"Activada",approved:"Aprobada",pending:"Pendiente",contacted:"En revisión",rejected:"Rechazada"} as Record<string,string>)[provisioning?.status||""]||"Sin solicitud"}/>
           <Row label="Recepción" value={route?.receive_method==="ios_app"?"App iPhone":route?.receive_method==="pstn"?"Otra línea":"Sin configurar"}/>
           <Row label="Desvío" value={route?.forwarding_mode==="none"?"No configurado":route?.forwarding_mode==="conditional"?"Condicional":route?.forwarding_mode==="all_calls"?"Todas las llamadas":"No disponible"}/>
           <Row label="Menú bilingüe" value={line?.menuPrepared?"Preparado para pruebas":"No verificado"}/>
           
          </div>
         </details>
        </div>
        <div className={styles.miniCards}><div><strong>{num(available)}</strong><small>Minutos para traducir</small></div><div><strong>{line?.usage.calls??"—"}</strong><small>Llamadas registradas · 30 días</small></div></div>
        {refreshButton}
       </>:null}
       {panel==="minutes"?<>
        <div className={styles.smartCard}>
         <div className={styles.balanceTitle}>
          <span className={styles.balanceServiceIcon}><PhoneCall size={19}/></span>
          <div><h3>Llamadas normales</h3></div>
         </div>
         {billing?.national?.enabled?
          <>
           <strong className={styles.directServiceStatus}>{billing.national.available} min disponibles</strong>
           <Row label="Incluidos" value={billing.national.included+" min"}/>
           <Row label="Usados" value={billing.national.used+" min"}/>
           {billing.national.reserved>0?<Row label="En llamada" value={billing.national.reserved+" min"}/>:null}
           {billing.national.available===0?<p className={styles.testNote}>Sin minutos nacionales</p>:null}
          </>:
          <>
           <strong className={styles.directServiceStatus}>{billing?.subscriptionActive?"Incluidas en tu plan":"No disponibles"}</strong>
           {billing?.plan==="starter"?<Row label="Starter · plan previsto" value="150 min nacionales"/>:null}
          </>}
         <Row label="Llamadas · 30 días" value={num(line?.usage.directCalls)}/>
        </div>
        <div className={styles.minuteHero}>
         <span className={styles.smallKicker}>LLAMADAS CON TRADUCCIÓN</span>
         <strong>{num(available)}<small> min</small></strong>
         <p>{available==null?"Saldo no disponible":available===0?"Sin minutos disponibles":"Disponibles"}</p>
        </div>
        <div className={styles.smartCard}>
         <Row label="Plan" value={billing?.plan&&billing.plan!=="none"?billing.plan.charAt(0).toUpperCase()+billing.plan.slice(1):"—"}/>
         <a className={styles.plansLink} href="https://vmv-business-design-git-feat-vm-073e13-valdys-projects-b97fc7a6.vercel.app/es/planes/" target="_blank" rel="noopener noreferrer">Ver planes <ArrowUpRight size={15}/></a>
         <Row label="Incluidos" value={num(minuteData?.included)+" min"}/>
         <Row label="Usados" value={num(minuteData?.used)+" min"}/>
         <Row label="Renovación" value={date(billing?.periodEnd)}/>
         {billing?.topup?.available&&billing.billingMode==="test"?<div className={styles.topupOffer}>
          <div className={styles.topupOfferLine}>
           <strong>+{billing.topup.minutes} min</strong>
           <span>{"$"+(billing.topup.priceCents/100).toFixed(2)} USD · TEST</span>
          </div>
          <button type="button" className={styles.mainAction} disabled={topupBusy}
           onClick={()=>void requestTranslationTopup()}>{topupBusy?"Abriendo Stripe…":"Recargar traducción →"}</button>
          <p className={styles.minuteExplanation}>Pago de prueba · Sin cargo real</p>
          {topupMessage?<p role="alert" className={styles.errorText}>{topupMessage}</p>:null}
         </div>:null}
         {billing?.billingMode==="test"&&!billing.topup?.available?<p className={styles.testNote}>Cuenta de prueba</p>:null}
         <details className={styles.minuteDetails}>
          <summary>Detalle del consumo</summary>
          <div className={styles.minuteBreakdown}>
           <Row label="Recargas" value={num(minuteData?.topup)+" min"}/>
           <Row label="Transferidos" value={num(minuteData?.rollover)+" min"}/>
           <Row label="Reservados" value={num(minuteData?.reserved)+" min"}/>
           <Row label="Retención temporal" value={num(minuteData?.temporaryHold)+" min"}/>
          </div>
         </details>
         {refreshButton}
        </div>
       </>:null}
       {panel==="settings"?<>
        <form className={styles.smartCard} onSubmit={saveSettings}><span className={styles.smallKicker}>CONFIGURACIÓN DE TU CUENTA</span><h3>Idiomas y asistente</h3>
         <SegmentedSelect label="Tu idioma" value={draft?.desired_language||"es"} options={[{value:"es",label:"Español"},{value:"en",label:"English"}]} disabled={!draft||working} onChange={value=>setDraft(v=>v?{...v,desired_language:value,caller_language:value==="es"?"en":"es"}:null)}/>
         <SegmentedSelect label="Idioma del cliente" value={draft?.caller_language||"en"} options={[{value:"en",label:"English"},{value:"es",label:"Español"}]} disabled={!draft||working} onChange={value=>setDraft(v=>v?{...v,caller_language:value,desired_language:value==="es"?"en":"es"}:null)}/>
         <label htmlFor="my-assistant">Nombre del asistente</label><input id="my-assistant" disabled={!draft||working} maxLength={40} required value={draft?.assistant_name||""} onChange={e=>setDraft(v=>v?{...v,assistant_name:e.target.value}:null)}/>
         
         {!draft?<div className={styles.testNote}>Primero completa la activación de tu línea para crear la configuración inicial.</div>:null}
         <button type="submit" disabled={!draft||working} className={styles.mainAction}>{working?"Guardando…":"Guardar preferencias"} →</button>
        </form>
        <form className={styles.smartCard} onSubmit={saveVoices}><span className={styles.smallKicker}>PERSONALIZACIÓN</span><h3>Voces y saludos</h3>
         <p>{premium?.message||"Sin conexión con la personalización. Requiere Pro o Premium activo."}</p>
         <fieldset className={styles.voiceFields} disabled={premium?.editable!==true||working}>
          <SegmentedSelect label="Voz para cliente" value={preferences.voice_customer} options={choices} disabled={premium?.editable!==true||working} onChange={value=>setPreferences({...preferences,voice_customer:value})}/>
          <SegmentedSelect label="Tu voz" value={preferences.voice_owner} options={choices} disabled={premium?.editable!==true||working} onChange={value=>setPreferences({...preferences,voice_owner:value})}/>
          <label htmlFor="greeting-customer">Saludo para cliente</label><textarea id="greeting-customer" maxLength={180} rows={3} value={preferences.greeting_customer} onChange={e=>setPreferences({...preferences,greeting_customer:e.target.value})} placeholder="Gracias por llamar…"/>
          <label htmlFor="greeting-owner">Saludo para ti</label><textarea id="greeting-owner" maxLength={180} rows={3} value={preferences.greeting_owner} onChange={e=>setPreferences({...preferences,greeting_owner:e.target.value})} placeholder="Tienes una llamada entrante…"/>
         </fieldset>
         <p>{preferences.greeting_customer.length}/180 · {preferences.greeting_owner.length}/180 caracteres</p>
         <button type="submit" disabled={premium?.editable!==true||working} className={styles.mainAction}>{working?"Guardando…":"Guardar voces y saludos"} →</button>
         {premium?.editable!==true?<div className={styles.testNote}>Se necesita un plan Pro o Premium activo para editar estos controles.</div>:null}
        </form>
       </>:null}
       {panel==="activity"?<div className={styles.smartCard}><span className={styles.smallKicker}>HISTORIAL REAL</span><h3>Llamadas recientes</h3>
        
        <History calls={calls} onSave={phone=>openContacts(phone,true)} onCallBack={sid=>setCallbackConfirmSid(sid)} onLookup={sid=>void lookupCustomer(sid)}
         canCallBack={callbackAvailable} callingSid={callbackBusy} lookupSid={lookupBusy}/>
        {callbackMessage?<p className={styles.callbackFeedback} role="status">{callbackMessage}</p>:null}{refreshButton}
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
       <span className={styles.screenEyebrow}>VMV BUSINESS</span><h2>{translate("home.viewAccount")}<span className={styles.mint}>.</span></h2>
       <div className={styles.smartCard}><InterfaceLanguagePicker/></div>
       <div className={styles.smartCard}><a href="/vista-app/soporte" style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,padding:"13px 8px",textDecoration:"none",color:"inherit",fontWeight:800,fontSize:13}}><span style={{display:"inline-flex",gap:10,alignItems:"center"}}><MessageCircle size={20}/>{language==="en"?"Contact VMV Support":"Contactar soporte VMV"}</span><ArrowUpRight size={17}/></a></div>
        <div className={styles.accountHero}><span className={styles.accountHeroAvatar}><UserRound size={29}/></span>
        <span className={styles.accountHeroInfo}><strong>{business}</strong><small>{user?.email||"—"}</small></span>
        <span className={styles.accountHeroSpark} aria-hidden="true">✦</span>
       </div>
       <div className={styles.accountStatGrid}>
        <button type="button" className={styles.accountStatTile} onClick={()=>showCall("minutes")}>
         <span><Clock3 size={19}/></span><strong>{num(available)} min</strong><small>Traducción</small>
        </button>
        <button type="button" className={styles.accountStatTile} onClick={()=>showCall("minutes")}>
         <span><ShieldCheck size={19}/></span><strong>{billing?.plan?.toUpperCase()||"—"}</strong><small>{translate("common.plan")}</small>
        </button>
       </div>
       <div className={styles.smartCard}>
        <Row label={translate("common.status")} value={billing?.status||"—"}/><Row label="Mi teléfono" value={profile?.phone||"—"}/>
        <button className={styles.mainAction} onClick={()=>showCall("minutes")}>{translate("common.viewPlan")} <ArrowUpRight size={16}/></button>
        {refreshButton}
       </div>
       <button className={styles.logoutLink} disabled={working} onClick={()=>void signOut()}><LogOut size={15}/> Cerrar sesión</button>
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