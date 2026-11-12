"use client";
import {useEffect,useMemo,useRef,useState,type FormEvent,type KeyboardEvent} from "react";
import type {SupabaseClient} from "@supabase/supabase-js";
import {ArrowLeft,ArrowRight,BriefcaseBusiness,Check,CheckCircle2,ChevronRight,Eye,EyeOff,
 Globe2,Mail,Palette,Phone,Search,ShieldCheck,UserRound} from "lucide-react";
import {Brand} from "./Brand";
import {InterfaceLanguagePicker} from "./InterfaceLanguagePicker";
import {useInterfaceLanguage} from "@/lib/i18n-web";
import {CountryDialPicker} from "./CountryDialPicker";
import {DIAL_COUNTRIES,US_STATES,OCCUPATION_ALIASES,normalize} from "@/lib/registration/options";

type AccountType="personal"|"business";
type Accent="mint"|"blue"|"violet";
type FontScale="small"|"normal"|"large";
type Appearance="light"|"dark"|"system";
type Job={code:string;title:string};
type PickOption={value:string;label:string;description?:string};
const smsErrors:Record<string,string>={
 sms_unavailable:"La verificación por SMS no está disponible ahora. Podrás hacerlo después.",
 sms_rate_limit:"Límite de intentos. Vuelve a probar más tarde.",
 sms_delivery_failed:"No se pudo enviar el SMS. Revisa tu número.",
 incorrect_or_expired_code:"El código es incorrecto o ha caducado.",
 invalid_code:"Introduce el código completo.",
 invalid_phone:"Revisa el prefijo y el número.",
 verification_save_failed:"El SMS fue confirmado, pero no pudimos guardar la verificación.",
 invalid_origin:"No pudimos validar esta solicitud."
};
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const choices=[["daily","Vida diaria"],["family","Familia y amigos"],["travel","Viajes"],["study","Estudios"]];
const colorChoices=[["mint","Menta","#08b99b"],["blue","Azul","#4686eb"],["violet","Violeta","#895eea"]] as const;

function Searchable({id,label,value,onChange,items,onSelect,placeholder,helper,disabled=false}:{
 id:string;label:string;value:string;onChange:(value:string)=>void;items:PickOption[];
 onSelect:(item:PickOption)=>void;placeholder:string;helper?:string;disabled?:boolean
}){
 const [opened,setOpened]=useState(false),[focusIndex,setFocusIndex]=useState(0);
 const listId=id+"-list";
 const shown=items.slice(0,8);
 const onKeyDown=(event:KeyboardEvent<HTMLInputElement>)=>{
  if(!opened||!shown.length)return;
  if(event.key==="ArrowDown"){event.preventDefault();setFocusIndex(v=>(v+1)%shown.length);}
  if(event.key==="ArrowUp"){event.preventDefault();setFocusIndex(v=>(v-1+shown.length)%shown.length);}
  if(event.key==="Enter"){event.preventDefault();onSelect(shown[focusIndex]||shown[0]);setOpened(false);}
  if(event.key==="Escape"){setOpened(false);}
 };
 return <div className="vmv-signup-field vmv-signup-autocomplete"
  onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setOpened(false);}}>
  <label htmlFor={id}>{label}</label>
  <div className="vmv-signup-input-icon"><Search size={17}/>
   <input id={id} value={value} autoComplete="off" disabled={disabled} placeholder={placeholder}
    role="combobox" aria-autocomplete="list" aria-expanded={opened&&shown.length>0} aria-controls={listId}
    onChange={e=>{onChange(e.target.value);setFocusIndex(0);setOpened(true);}}
    onFocus={()=>setOpened(true)} onKeyDown={onKeyDown}/>
  </div>
  {helper&&<small className="vmv-signup-help">{helper}</small>}
  {opened&&shown.length>0&&<div className="vmv-signup-suggestions" role="listbox" id={listId}>
   {shown.map((item,index)=><button key={item.value} type="button" role="option"
    aria-selected={index===focusIndex} className={index===focusIndex?"is-focused":""}
    onMouseDown={e=>e.preventDefault()} onClick={()=>{onSelect(item);setOpened(false);}}>
    <span>{item.label}</span>{item.description&&<small>{item.description}</small>}
   </button>)}
  </div>}
 </div>;
}
export function SignupWizard({supabase,onBack}:{supabase:SupabaseClient;onBack:()=>void}){
 const {language,translate}=useInterfaceLanguage();
 const steps=[
  {tag:translate("signup.personalTag"),title:translate("signup.personalTitle"),description:translate("signup.personalDesc")},
  {tag:translate("signup.useTag"),title:translate("signup.useTitle"),description:translate("signup.useDesc")},
  {tag:translate("signup.styleTag"),title:translate("signup.styleTitle"),description:translate("signup.styleDesc")},
  {tag:translate("signup.securityTag"),title:translate("signup.securityTitle"),description:translate("signup.securityDesc")}
 ];

 const [step,setStep]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const [complete,setComplete]=useState(false),[hasSession,setHasSession]=useState(false);
 const [first,setFirst]=useState(""),[last,setLast]=useState("");
 const [dialCountry,setDialCountry]=useState("US"),[nationalPhone,setNationalPhone]=useState("");
 const [lineChoice,setLineChoice]=useState<"keep"|"new">("keep");
 const [smsEnabled,setSmsEnabled]=useState<boolean|null>(null),[smsBusy,setSmsBusy]=useState(false);
 const [smsSent,setSmsSent]=useState(false),[smsVerified,setSmsVerified]=useState(false);
 const [smsMessage,setSmsMessage]=useState(""),[smsCode,setSmsCode]=useState(""),[smsTicket,setSmsTicket]=useState("");
 const [email,setEmail]=useState(""),[emailAction,setEmailAction]=useState<"now"|"later">("now");
 const [accountType,setAccountType]=useState<AccountType>("personal"),[useCase,setUseCase]=useState("");
 const [businessName,setBusinessName]=useState(""),[occupation,setOccupation]=useState(""),[occupationCode,setOccupationCode]=useState("");
 const [jobs,setJobs]=useState<Job[]>([]),[jobsLoaded,setJobsLoaded]=useState(false);
 const [state,setState]=useState(""),[stateCode,setStateCode]=useState(""),[city,setCity]=useState("");
 const [places,setPlaces]=useState<string[]>([]),[website,setWebsite]=useState("");
 const [ownerLanguage,setOwnerLanguage]=useState<"es"|"en">("es");
 const [accent,setAccent]=useState<Accent>("mint"),[fontScale,setFontScale]=useState<FontScale>("normal");
 const [appearance,setAppearance]=useState<Appearance>("light"),[reduceMotion,setReduceMotion]=useState(false);
 const [password,setPassword]=useState(""),[repeatPassword,setRepeatPassword]=useState(""),[showPassword,setShowPassword]=useState(false);
 const scrollRef=useRef<HTMLElement>(null);
 const selectedCountry=DIAL_COUNTRIES.find(x=>x.country===dialCountry)||DIAL_COUNTRIES[0];
 const digits=nationalPhone.replace(/\D/g,"");
 const phone=selectedCountry.code+digits;
 const validNumber=/^\+[1-9][0-9]{7,14}$/.test(phone)&&(!["+1"].includes(selectedCountry.code)||digits.length===10);
 const websiteUrl=website.trim()?(/^https?:\/\//i.test(website.trim())?website.trim():"https://"+website.trim()):"";
 useEffect(()=>{
  fetch("/api/signup/phone",{cache:"no-store"}).then(r=>r.json())
   .then(x=>setSmsEnabled(x.available===true)).catch(()=>setSmsEnabled(false));
 },[]);
 useEffect(()=>{
  if(step!==1||accountType!=="business"||jobsLoaded)return;
  let live=true;fetch("/vmv-data/occupations.json").then(r=>{if(!r.ok)throw Error();return r.json();})
   .then((v:Job[])=>{if(live){setJobs(v);setJobsLoaded(true);}})
   .catch(()=>{if(live)setJobsLoaded(true);});
  return()=>{live=false;};
 },[step,accountType,jobsLoaded]);
 useEffect(()=>{
  if(step!==1||!stateCode){setPlaces([]);return;}
  let live=true;
  fetch("/vmv-data/places-"+stateCode+".json").then(r=>{if(!r.ok)throw Error();return r.json();})
   .then((v:string[])=>{if(live)setPlaces(v);}).catch(()=>{if(live)setPlaces([]);});
  return()=>{live=false;};
 },[step,stateCode]);
 useEffect(()=>{
  scrollRef.current?.scrollIntoView({behavior:"instant",block:"start"});
 },[step]);
 const jobResults=useMemo(()=>{
  const q=normalize(occupation);if(q.length<2)return [];
  return jobs.map(job=>{
   const normalized=normalize(job.title);
   const aliases=Object.entries(OCCUPATION_ALIASES).find(([name])=>normalize(name)===normalized)?.[1]||[];
   const related=aliases.map(normalize);
   const score=normalized.startsWith(q)?0:normalized.split(/\s+/).some(v=>v.startsWith(q))?1:
    related.some(v=>v.startsWith(q))?2:normalized.includes(q)?3:related.some(v=>v.includes(q))?4:99;
   return {job,score};
  }).filter(v=>v.score<99).sort((a,b)=>a.score-b.score||a.job.title.localeCompare(b.job.title)).slice(0,8)
   .map(v=>({value:v.job.code,label:v.job.title,description:"O*NET · "+v.job.code}));
 },[jobs,occupation]);
 const states=useMemo(()=>{
  const q=normalize(state);
  if(q.length===0)return [];
  return US_STATES.filter(v=>normalize(v.name).includes(q)||v.code.toLowerCase().startsWith(q)).slice(0,8)
   .map(v=>({value:v.code,label:v.name,description:v.code}));
 },[state]);
 const cities=useMemo(()=>{
  const q=normalize(city);if(q.length<2)return [];
  return places.filter(v=>normalize(v).includes(q)).sort((a,b)=>
   Number(normalize(b).startsWith(q))-Number(normalize(a).startsWith(q))||a.localeCompare(b)).slice(0,8)
   .map(v=>({value:v,label:v}));
 },[city,places]);
 const clearVerification=()=>{setSmsSent(false);setSmsVerified(false);setSmsCode("");setSmsTicket("");setSmsMessage("");};
 const requestSMS=async()=>{
  setSmsMessage("");
  if(!validNumber){setSmsMessage("Introduce un número válido.");return;}
  if(smsEnabled===false){setSmsMessage(smsErrors.sms_unavailable);return;}
  setSmsBusy(true);
  try{
   const r=await fetch("/api/signup/phone/send",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({phone})});
   const data=await r.json();
   if(!r.ok)throw Error(smsErrors[data.error]||"No pudimos enviar el SMS.");
   setSmsSent(true);setSmsMessage("Te enviamos un código por SMS.");
  }catch(e){setSmsMessage(e instanceof Error?e.message:"Error al enviar SMS.");}
  finally{setSmsBusy(false);}
 };
 const checkSMS=async()=>{
  setSmsBusy(true);setSmsMessage("");
  try{
   const r=await fetch("/api/signup/phone/check",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({phone,code:smsCode})});
   const data=await r.json();
   if(!r.ok||!data.verified||typeof data.ticket!=="string")
    throw Error(smsErrors[data.error]||"No pudimos confirmar el código.");
   setSmsVerified(true);setSmsSent(false);setSmsCode("");setSmsTicket(data.ticket);
   setSmsMessage("");
  }catch(e){setSmsMessage(e instanceof Error?e.message:"Error al verificar el SMS.");}
  finally{setSmsBusy(false);}
 };
 const validate=(current:number)=>{
  setError("");
  if(current===0){
   if(!first.trim()||!last.trim()){setError(translate("signup.firstError"));return false;}
   if(!validNumber){setError(translate("signup.phoneError"));return false;}
   if(!emailPattern.test(email.trim())){setError(translate("signup.emailError"));return false;}
  }
  if(current===1){
   if(state.trim()&&!stateCode){setError("Selecciona el estado de la lista.");return false;}
   if(websiteUrl){try{const u=new URL(websiteUrl);if(!["https:","http:"].includes(u.protocol)||!u.hostname.includes("."))throw Error();}
    catch{setError("Revisa la dirección de tu página web.");return false;}}
  }
  if(current===3){
   if(password.length<8){setError(translate("signup.passwordError"));return false;}
   if(password!==repeatPassword){setError(translate("signup.passwordMismatch"));return false;}
  }
  return true;
 };
 const next=()=>{if(validate(step))setStep(v=>Math.min(v+1,3));};
 const back=()=>{setError("");step===0?onBack():setStep(v=>v-1);};
 const skip=()=>{setError("");if(step===1){setBusinessName("");setOccupation("");setOccupationCode("");setState("");setStateCode("");setCity("");setWebsite("");setUseCase("");}
  if(step===2){setAccent("mint");setFontScale("normal");setAppearance("light");setReduceMotion(false);}
  setStep(v=>Math.min(v+1,3));
 };
 const submit=async(event:FormEvent)=>{
  event.preventDefault();
  if(!validate(0)||!validate(1)||!validate(3))return;
  setBusy(true);
  const values={
   first_name:first.trim(),last_name:last.trim(),phone,occupation:accountType==="personal"?"Uso personal":occupation.trim()||"Negocio",
   occupation_code:accountType==="business"?occupationCode:"",
   account_type:accountType,use_case:accountType==="personal"?useCase:"",
   business_name:accountType==="business"?businessName.trim():"",
   website_url:websiteUrl,city:city.trim(),state:stateCode,country:dialCountry,
   assistant_name:"Juan",owner_language:ownerLanguage,customer_language:ownerLanguage==="es"?"en":"es",
   line_choice:lineChoice,preferred_plan:null,plan_prompt_seen:false,line_setup_completed:false,
   theme_color:accent,font_scale:fontScale,appearance,reduce_motion:reduceMotion,
   signup_wizard_completed:true,email_verify_preference:emailAction,
   ui_language:language
  };
  try{
   const {data,error:authError}=await supabase.auth.signUp({
    email:email.trim().toLowerCase(),password,
    options:{emailRedirectTo:window.location.origin,data:values}
   });
   if(authError)throw authError;
   if(smsVerified&&smsTicket&&data.user){
    const pending={phone,ticket:smsTicket,createdAt:Date.now(),email:email.trim().toLowerCase()};
    try{localStorage.setItem("vmv_signup_verified_phone",JSON.stringify(pending));}catch{}
    if(data.session){
     const linked=await fetch("/api/signup/phone/claim",{
      method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+data.session.access_token},
      body:JSON.stringify({phone,ticket:smsTicket})
     });
     if(linked.ok)try{localStorage.removeItem("vmv_signup_verified_phone");}catch{}
    }
   }
   setHasSession(Boolean(data.session));setComplete(true);
  }catch(e){setError(translate("signup.registerError"));}
  finally{setBusy(false);}
 };
 if(complete)return <main className="vmv-signup-shell"><section className="vmv-signup-finish">
  <Brand/><span className="vmv-signup-finish-icon"><CheckCircle2 size={44}/></span>
  <h1>{translate(hasSession?"signup.created":"signup.welcome")}</h1>
  <p>{translate(hasSession?"signup.startNow":"signup.confirmEmail")}</p>
  {smsVerified&&<span className="vmv-signup-success"><Check size={17}/> Teléfono validado por SMS</span>}
  <button type="button" className="vmv-signup-mainbtn" onClick={onBack}>{translate("signup.goLogin")} <ArrowRight size={18}/></button>
 </section></main>;
 return <main className="vmv-signup-shell">
  <header className="vmv-signup-header" ref={scrollRef}><Brand/><InterfaceLanguagePicker compact/>
   <button type="button" onClick={onBack}>{translate("signup.haveAccount")}</button>
  </header>
  <div className="vmv-signup-layout">
   <aside className="vmv-signup-sidebar">
    <div className="vmv-signup-sidebar-icon"><ShieldCheck size={27}/></div>
    <h2>{translate("auth.tagline")}</h2>
    <p>{translate("signup.intro")}</p>
    <ol>{steps.map((item,index)=><li key={item.tag} className={step===index?"selected":step>index?"complete":""}>
     <span>{step>index?<Check size={15}/>:index+1}</span>
     <strong>{[translate("signup.yourInfo"),translate("signup.yourActivity"),translate("signup.yourStyle"),translate("signup.yourAccess")][index]}</strong>
    </li>)}</ol>
   </aside>
   <section className="vmv-signup-card">
    <div className="vmv-signup-progress-head"><span>{translate("signup.step",{step:step+1})}</span><span>{Math.floor((step+1)*25)}%</span></div>
    <div className="vmv-signup-progress"><span style={{width:(step+1)*25+"%"}}/></div>
    <div className="vmv-signup-title"><span>{steps[step].tag}</span><h1>{steps[step].title}</h1><p>{steps[step].description}</p></div>

    {step===0&&<div className="vmv-signup-fields">
     <div className="vmv-signup-two">
      <div className="vmv-signup-field"><label htmlFor="reg-first">Nombre *</label><input id="reg-first" autoComplete="given-name" maxLength={60} placeholder="Nombre" value={first} onChange={e=>setFirst(e.target.value)}/></div>
      <div className="vmv-signup-field"><label htmlFor="reg-last">Apellidos *</label><input id="reg-last" autoComplete="family-name" maxLength={80} placeholder="Apellido" value={last} onChange={e=>setLast(e.target.value)}/></div>
     </div>
     <div className="vmv-signup-field">
      <div className="vmv-signup-label-line"><label htmlFor="reg-phone">Teléfono *</label>
       {smsVerified&&<span className="vmv-signup-success"><CheckCircle2 size={17}/> Verificado</span>}
      </div>
      <div className="vmv-signup-phone">
       <CountryDialPicker value={dialCountry} onChange={country=>{if(country!==dialCountry){setDialCountry(country);clearVerification();}}}/>
       <input id="reg-phone" type="tel" autoComplete="tel-national" inputMode="tel"
        maxLength={22} placeholder="Tu número" value={nationalPhone} onChange={e=>{setNationalPhone(e.target.value);clearVerification();}}/>
      </div>
      {!smsVerified&&smsEnabled===true&&<div className="vmv-signup-sms-action">
       <button type="button" disabled={smsBusy} onClick={()=>void requestSMS()}>
        <Phone size={16}/>{smsBusy?"Enviando…":smsSent?"Reenviar código":"Enviar código"}
       </button>
       <small>Opcional · Puedes continuar sin verificarlo</small>
      </div>}
      {smsSent&&!smsVerified&&<div className="vmv-signup-code">
       <label htmlFor="reg-code">Código de verificación</label>
       <div><input id="reg-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*"
        maxLength={10} placeholder="000000" value={smsCode} onChange={e=>setSmsCode(e.target.value.replace(/\D/g,""))}/>
        <button type="button" disabled={smsBusy||smsCode.length<4} onClick={()=>void checkSMS()}>Verificar</button></div>
       <small>iPhone puede sugerir automáticamente el código recibido.</small>
      </div>}
      {smsMessage&&<small className="vmv-signup-help" role="status">{smsMessage}</small>}
      {smsEnabled===false&&<small className="vmv-signup-help">Verificaremos tu número cuando tengas un plan pagado y estés configurando la línea.</small>}
     </div>
     <div className="vmv-signup-field">
      <label>¿Cómo quieres recibir llamadas más adelante?</label>
      <div className="vmv-signup-line-options" role="group" aria-label="Elegir tipo de línea">
       <button type="button" aria-pressed={lineChoice==="keep"} className={lineChoice==="keep"?"selected":""} onClick={()=>setLineChoice("keep")}>
        <Phone size={20}/><strong>Conservar mi número</strong>
        <small>Conexión con tu operador, sin portarlo.</small>
       </button>
       <button type="button" aria-pressed={lineChoice==="new"} className={lineChoice==="new"?"selected":""} onClick={()=>setLineChoice("new")}>
        <Phone size={20}/><strong>Un número nuevo</strong>
        <small>Se solicita después del plan y la configuración.</small>
       </button>
      </div>
      <small className="vmv-signup-help">Este teléfono es tu contacto. Elegir una opción no activa desvíos ni compra un número.</small>
     </div>
     <div className="vmv-signup-field">
      <label htmlFor="reg-email">Correo electrónico *</label>
      <input id="reg-email" type="email" autoComplete="email" maxLength={254} placeholder="tu@correo.com" value={email} onChange={e=>setEmail(e.target.value)}/>
      <div className="vmv-signup-inline" role="group" aria-label="Cuándo verificar el correo">
       <button type="button" className={emailAction==="now"?"selected":""} onClick={()=>setEmailAction("now")}><Mail size={15}/> Verificar ahora</button>
       <button type="button" className={emailAction==="later"?"selected":""} onClick={()=>setEmailAction("later")}>Más tarde</button>
      </div>
      <small className="vmv-signup-help">Al crear la cuenta te enviaremos un enlace. Puedes verificarlo después, pero podría ser necesario para iniciar sesión.</small>
     </div>
    </div>}

    {step===1&&<div className="vmv-signup-fields">
     <div className="vmv-signup-account-type" role="group" aria-label="Tipo de cuenta">
      <button type="button" className={accountType==="personal"?"selected":""} onClick={()=>setAccountType("personal")}>
       <UserRound size={24}/><strong>Personal</strong><small>Vida diaria</small>
      </button>
      <button type="button" className={accountType==="business"?"selected":""} onClick={()=>setAccountType("business")}>
       <BriefcaseBusiness size={24}/><strong>Negocio</strong><small>Clientes y trabajos</small>
      </button>
     </div>
     {accountType==="personal"?<div className="vmv-signup-field"><label>¿Para qué lo usarás? <em>(opcional)</em></label>
      <div className="vmv-signup-chips">{choices.map(([key,text])=><button type="button" key={key} aria-pressed={useCase===key} className={useCase===key?"selected":""} onClick={()=>setUseCase(useCase===key?"":key)}>{text}</button>)}</div>
     </div>:<>
      <div className="vmv-signup-field"><label htmlFor="reg-business">Nombre del negocio <em>(opcional)</em></label>
       <input id="reg-business" value={businessName} onChange={e=>setBusinessName(e.target.value)} maxLength={120} placeholder="Mi empresa"/></div>
      <Searchable id="reg-occupation" label="Ocupación o profesión" value={occupation}
       onChange={v=>{setOccupation(v);setOccupationCode("");}} items={jobResults}
       onSelect={item=>{setOccupation(item.label);setOccupationCode(item.value);}}
       placeholder="Carpintería, electricidad, limpieza…"
       helper={jobsLoaded?"Catálogo de ocupaciones de EE. UU.; también puedes escribir tu propio oficio.":"Cargando profesiones…"}/>
     </>}
     <div className="vmv-signup-two">
      <Searchable id="reg-state" label="Estado (EE. UU.)" value={state} items={states}
       onChange={v=>{setState(v);setStateCode("");setCity("");}}
       onSelect={x=>{setState(x.label);setStateCode(x.value);setCity("");}} placeholder="Busca tu estado"/>
      <Searchable id="reg-city" label="Ciudad" value={city} items={cities} onChange={setCity}
       onSelect={x=>setCity(x.value)} placeholder={stateCode?"Busca tu ciudad":"Elige un estado"} disabled={!stateCode}
       helper="Puedes escribirla aunque no aparezca en la lista."/>
     </div>
     <div className="vmv-signup-field"><label htmlFor="reg-website">¿Tienes un website? <em>(opcional)</em></label>
      <div className="vmv-signup-input-icon"><Globe2 size={17}/><input id="reg-website" type="text" inputMode="url" maxLength={250}
       value={website} onChange={e=>setWebsite(e.target.value)} placeholder="www.tunegocio.com"/></div>
     </div>
     <div className="vmv-signup-field"><label>{translate("signup.spokenLanguage")}</label>
      <div className="vmv-signup-lang-pair">
       <button type="button" className={ownerLanguage==="es"?"selected":""} onClick={()=>setOwnerLanguage("es")}>🇪🇸 Español</button>
       <button type="button" className={ownerLanguage==="en"?"selected":""} onClick={()=>setOwnerLanguage("en")}>🇺🇸 English</button>
      </div>
      <small className="vmv-signup-help">{translate("signup.customerLanguage",{language:ownerLanguage==="es"?"English":"Español"})}</small>
     </div>
    </div>}

    {step===2&&<div className="vmv-signup-fields">
     <div className="vmv-signup-field"><label>{translate("signup.styleColor")}</label>
      <div className="vmv-signup-colors">{colorChoices.map(([key,title,color])=><button type="button" key={key} aria-pressed={accent===key}
       className={accent===key?"selected":""} onClick={()=>setAccent(key)}><span style={{background:color}}/>{title}{accent===key&&<Check size={17}/>}</button>)}</div>
     </div>
     <div className="vmv-signup-field"><label>{translate("signup.styleText")}</label>
      <div className="vmv-signup-segments">{([["small","Pequeña"],["normal","Normal"],["large","Grande"]] as const).map(([key,title])=>
       <button type="button" key={key} aria-pressed={fontScale===key} className={fontScale===key?"selected":""} onClick={()=>setFontScale(key)}>{title}</button>)}</div>
     </div>
     <div className="vmv-signup-field"><label>{translate("signup.styleAppearance")}</label>
      <div className="vmv-signup-segments">{([["light","Claro"],["dark","Oscuro"],["system","Sistema"]] as const).map(([key,title])=>
       <button type="button" key={key} aria-pressed={appearance===key} className={appearance===key?"selected":""} onClick={()=>setAppearance(key)}>{title}</button>)}</div>
     </div>
     <label className="vmv-signup-toggle"><span><strong>{translate("signup.reduceMotion")}</strong><small>{translate("signup.styleHint")}</small></span>
      <input type="checkbox" checked={reduceMotion} onChange={e=>setReduceMotion(e.target.checked)}/></label>
     <div className="vmv-signup-preview" data-color={accent} data-text={fontScale} data-appearance={appearance}>
      <span><Palette size={17}/> VISTA DE TU ESPACIO</span>
      <strong>Hola, bienvenido<span>.</span></strong>
      <p>Tu app, a tu manera.</p>
     </div>
    </div>}

    {step===3&&<form className="vmv-signup-fields" id="vmv-reg-final" onSubmit={submit}>
     <div className="vmv-signup-security"><ShieldCheck size={23}/><span>Tu cuenta estará protegida con contraseña. No compartas tus códigos.</span></div>
     <div className="vmv-signup-field"><label htmlFor="reg-password">{translate("signup.wizardPassword")}</label>
      <div className="vmv-signup-password"><input id="reg-password" type={showPassword?"text":"password"}
       autoComplete="new-password" minLength={8} maxLength={128} placeholder={translate("signup.minPassword")} value={password} onChange={e=>setPassword(e.target.value)}/>
       <button type="button" aria-label={showPassword?"Ocultar contraseña":"Mostrar contraseña"} onClick={()=>setShowPassword(!showPassword)}>{showPassword?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></div>
     <div className="vmv-signup-field"><label htmlFor="reg-repeat">{translate("signup.passwordConfirm")}</label>
      <input id="reg-repeat" type={showPassword?"text":"password"} autoComplete="new-password" minLength={8} maxLength={128} value={repeatPassword}
       placeholder={translate("signup.passwordRepeat")} onChange={e=>setRepeatPassword(e.target.value)}/></div>
     <div className="vmv-signup-review">
      <p><CheckCircle2 size={17}/> {first||"Tu nombre"} {last}</p>
      <p><CheckCircle2 size={17}/> {accountType==="personal"?"Uso personal":"Uso para negocio"}</p>
      <p><Mail size={16}/> {email||"Tu correo"}</p>
     </div>
    </form>}
    {error&&<div role="alert" className="vmv-signup-error">{error}</div>}
    <footer className="vmv-signup-actions">
     <button type="button" className="vmv-signup-back" onClick={back}><ArrowLeft size={17}/> {translate("common.back")}</button>
     <div>{(step===1||step===2)&&<button type="button" className="vmv-signup-skip" onClick={skip}>{translate("common.skip")}</button>}
      {step<3?<button type="button" className="vmv-signup-mainbtn" onClick={next}>{translate("common.next")} <ArrowRight size={18}/></button>:
       <button type="submit" form="vmv-reg-final" disabled={busy} className="vmv-signup-mainbtn">{translate(busy?"signup.creating":"signup.createMine")} <ArrowRight size={18}/></button>}
     </div>
    </footer>
   </section>
  </div>
 </main>;
}
