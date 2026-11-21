"use client";
import {useEffect,useMemo,useRef,useState,type FormEvent} from "react";
import type {SupabaseClient} from "@supabase/supabase-js";
import {ArrowLeft,ArrowRight,Bot,Check,CheckCircle2,ChevronRight,Eye,EyeOff,
 LockKeyhole,Mail,RefreshCw,ShieldCheck,Sparkles} from "lucide-react";
import {Brand} from "./Brand";
import {InterfaceLanguagePicker} from "./InterfaceLanguagePicker";
import {useInterfaceLanguage} from "@/lib/i18n-web";
import {authErrorKey} from "@/lib/i18n";
import {blueprintForSignup,completeSignup} from "@/lib/vmv-signup-complete";
import {signupQuestions,signupValidation,type SignupAnswer} from "@/lib/vmv-signup-flow";
import styles from "./SignupExperience.module.css";

type Phase="questions"|"email"|"saving"|"ready"|"failed";
const draftStorage="vmv-signup-questions-v2";
const emailFormat=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const mobile=()=>typeof window!=="undefined"&&window.matchMedia("(max-width:600px)").matches;
const ph=(id:string,es:boolean)=>
 id==="first"?"Ej. Valdy":id==="agent_name"?"Ej. Papi, Luna, Aurora":
 id==="availability_day"?"Elige un día futuro":
 id==="availability_start"||id==="availability_end"?"13:00":
 id==="hours_mon"||id.startsWith("hours_")?"09:00-17:00 o Cerrado":
 id==="user_phone"||id==="business_phone"||id==="call_number"||id==="whatsapp"?"Ej. +1 706 555 0148":
 id==="website"?"https://tusitio.com":id==="instagram"?"@tunegocio":
 id==="service_1_name"?"Ej. Masaje relajante":
 es?"Tu respuesta":"Your answer";

export function SignupWizard({supabase,onBack}:{supabase:SupabaseClient;onBack:()=>void}){
 const {language}=useInterfaceLanguage();const es=language!=="en";
 const [answers,setAnswers]=useState<SignupAnswer>({});
 const [stepId,setStepId]=useState("first"),[phase,setPhase]=useState<Phase>("questions");
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const [notice,setNotice]=useState(""),[showPassword,setShowPassword]=useState(false);
 const [completeAgent,setCompleteAgent]=useState("");
 const [confirmationPassword,setConfirmationPassword]=useState("");
 const submitting=useRef(false);
 const inputRef=useRef<HTMLInputElement|null>(null),scrollRef=useRef<HTMLDivElement|null>(null);
 const steps=useMemo(()=>signupQuestions(answers),[answers]);
 const index=Math.max(0,steps.findIndex(step=>step.id===stepId));
 const current=steps[index]||steps[0];
 const progress=Math.round(((index+1)/steps.length)*100);
 const answer=answers[current.id]||"";
 const setAnswer=(value:string)=>{setAnswers(prev=>({...prev,[current.id]:value}));setError("");};
 useEffect(()=>{
  // Browser-tab recovery only. Passwords are never written to web storage.
  try{
   const raw=sessionStorage.getItem(draftStorage);
   if(!raw)return;
   const parsed=JSON.parse(raw) as {data?:SignupAnswer;step?:string;email?:string};
   if(parsed.data&&typeof parsed.data==="object"){
    const safe=Object.fromEntries(Object.entries(parsed.data).filter(([k,v])=>
     /^[a-z0-9_]{1,55}$/i.test(k)&&typeof v==="string"&&k!=="password"&&k!=="repeat_password"));
    setAnswers(safe);if(parsed.step)setStepId(parsed.step);
   }
  }catch{/* Draft restoration is optional. */}
 },[]);
 useEffect(()=>{
  if(phase!=="questions")return;
  try{sessionStorage.setItem(draftStorage,JSON.stringify({
   data:Object.fromEntries(Object.entries(answers).filter(([key])=>key!=="password"&&key!=="repeat_password")),
   step:stepId
  }));}catch{/* Session-only draft is optional. */}
 },[answers,stepId,phase]);
 useEffect(()=>{scrollRef.current?.scrollTo({top:0,behavior:"instant"});
  if(!mobile())inputRef.current?.focus();
 },[stepId,phase]);
 useEffect(()=>{
  let active=true;
  // Confirmation links can return to this exact wizard with an authenticated session.
  const resume=async()=>{
   const {data}=await supabase.auth.getUser();
   if(!active||!data.user||!data.user.email_confirmed_at||!data.user.user_metadata?.vmv_signup_v2)return;
   setPhase("saving");setBusy(true);
   try{
    const finished=await completeSignup(supabase);
    const marked=await supabase.auth.updateUser({data:{vmv_signup_v2_completed:true}});
    if(marked.error)throw marked.error;
    if(!active)return;
    setCompleteAgent(finished.agent);setPhase("ready");
    try{sessionStorage.removeItem(draftStorage);}catch{}
   }catch(e){if(active){setPhase("failed");setError(e instanceof Error?e.message:"No pudimos terminar de preparar tu cuenta.");}}
   finally{if(active)setBusy(false);}
  };
  void resume();
  // A confirmation link reloads /registro; other tabs can use "Ya confirmé".
  // Do not also provision on SIGNED_IN: it would race the explicit verification path.
  return()=>{active=false;};
 },[supabase]);
 const back=()=>{
  if(busy)return;setError("");
  if(phase!=="questions"){if(phase==="ready")return;setPhase("questions");return;}
  if(index===0){onBack();return;}setStepId(steps[index-1].id);
 };
 const next=(event?:FormEvent)=>{
  event?.preventDefault();
  if(busy)return;
  const result=signupValidation(current,answer,answers);
  if(result){setError(result);return;}
  setError("");
  if(index<steps.length-1){setStepId(steps[index+1].id);}
  else void register();
 };
 async function register(){
  if(submitting.current)return;
  for(const q of steps){
   const fault=signupValidation(q,answers[q.id]||"",answers);
   if(fault){setStepId(q.id);setError(fault);return;}
  }
  if(!emailFormat.test(answers.email||"")){setStepId("email");setError("Comprueba tu correo.");return;}
  submitting.current=true;setBusy(true);setError("");
  try{
   const blueprint=blueprintForSignup(answers);
   // Only public preferences and business input belong in signup metadata.
   // Passwords and payment credentials are excluded.
   const {data,error:signupError}=await supabase.auth.signUp({
    email:answers.email.trim().toLowerCase(),password:answers.password,
    options:{emailRedirectTo:window.location.origin+"/registro?confirmado=1",
     data:{
      first_name:answers.first.trim(),last_name:answers.last.trim(),
      phone:answers.user_phone.trim(),occupation:answers.category||"Emprendedor",
      account_type:answers.business_now==="yes"?"business":"personal",
      business_name:answers.business_now==="yes"?(answers.business_name||""):"",
      assistant_name:answers.agent_name.trim(),
      vmv_signup_v2:blueprint
     }
    }
   });
   if(signupError)throw signupError;
   setPhase("email");
   setNotice(es?"Te enviamos instrucciones a tu correo. Confírmalo para terminar.":"Check your email for the verification link.");
   if(data.session&&data.user?.email_confirmed_at)await verify();
  }catch(e){setError(e instanceof Error?e.message:"No pudimos crear tu cuenta.");}
  finally{setBusy(false);submitting.current=false;}
 }
 async function verify(){
  if(busy&&phase!=="email")return;
  setBusy(true);setError("");
  try{
   let {data:identity}=await supabase.auth.getUser();
   if(!identity.user?.email_confirmed_at){
    const pwd=confirmationPassword||answers.password;
    if(!pwd)throw Error(es?"Confirma el enlace de tu correo y escribe tu contraseña.":"Confirm the email link and enter your password.");
    const {error:loginError}=await supabase.auth.signInWithPassword({
     email:(answers.email||"").trim().toLowerCase(),password:pwd
    });
    if(loginError)throw Error(es?"Confirma el correo antes de iniciar sesión.":"Confirm your email before signing in.");
    identity=(await supabase.auth.getUser()).data;
   }
   if(!identity.user?.email_confirmed_at)throw Error(es?"Todavía falta confirmar tu correo.":"Your email is not verified yet.");
   setPhase("saving");
   const finished=await completeSignup(supabase);
   const marked=await supabase.auth.updateUser({data:{vmv_signup_v2_completed:true}});
   if(marked.error)throw marked.error;
   setCompleteAgent(finished.agent);setPhase("ready");
   try{sessionStorage.removeItem(draftStorage);}catch{}
  }catch(e){setPhase(old=>old==="saving"?"failed":old);setError(e instanceof Error?e.message:"No pudimos comprobar tu correo.");}
  finally{setBusy(false);}
 }
 async function resend(){
  if(busy)return;setBusy(true);setError("");setNotice("");
  try{
   const {error:err}=await supabase.auth.resend({
    type:"signup",email:(answers.email||"").trim().toLowerCase(),
    options:{emailRedirectTo:window.location.origin+"/registro?confirmado=1"}
   });
   if(err)throw err;
   setNotice(es?"Reenviamos el correo. Revisa también Spam.":"Email resent. Check your spam folder too.");
  }catch(e){setError(e instanceof Error?e.message:"No pudimos reenviar el correo.");}
  finally{setBusy(false);}
 }
 const options=current.options||[];
 const focus=()=>inputRef;
 const choice=(value:string)=>{
  if(current.kind==="multi"){
   const selected=new Set(answer.split(",").filter(Boolean));
   if(selected.has(value))selected.delete(value);else selected.add(value);
   setAnswer([...selected].join(","));
  }else setAnswer(value);
 };
 const isSelected=(v:string)=>current.kind==="multi"?answer.split(",").includes(v):answer===v;
 const friendlyName=answers.first?.trim()||"";
 return <main className={styles.outer}>
  <div className={styles.glowOne}/><div className={styles.glowTwo}/>
  <div className={styles.shell}>
   <header className={styles.top}>
    <div className={styles.brand}><span className={styles.brandMark}><Bot size={21}/></span><span>VMV <b>BUSINESS</b></span></div>
    <div className={styles.topActions}><InterfaceLanguagePicker compact/>{phase==="questions"&&<button type="button" onClick={onBack} className={styles.login}>{es?"Ya tengo cuenta":"I have an account"} <ChevronRight size={15}/></button>}</div>
   </header>
   <div className={styles.main} ref={scrollRef}>
    <section className={styles.panel} aria-live="polite">
     {phase==="questions"?<>
      <div className={styles.progressTop}><span>{current.section.toUpperCase()}</span><span>{index+1} / {steps.length}</span></div>
      <div className={styles.track} role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Progreso"><div style={{width:progress+"%"}}/></div>
      <div className={styles.badge}><Sparkles size={15}/>{es?"Una pregunta a la vez":"One question at a time"}</div>
      <h1 key={current.id} className={styles.question}>{es?current.es:current.en}</h1>
      <p className={styles.help}>{current.optional?(es?"Puedes dejarlo vacío.":"You can leave this blank."):
       index===0?(es?"Vamos a crear algo extraordinario juntos.":"Let's build something remarkable together."):
       current.kind==="multi"?(es?"Puedes elegir varias opciones.":"You can choose multiple options."):
       es?"Puedes cambiar tu respuesta antes de terminar.":"You can change your answer before finishing."}</p>
      <form onSubmit={next} className={styles.form}>
       {current.kind==="choice"||current.kind==="multi"?
       <div role={current.kind==="multi"?"group":"radiogroup"} aria-label={es?current.es:current.en} className={styles.choices}>
        {options.map(o=><button type="button" role={current.kind==="multi"?"checkbox":"radio"}
         aria-checked={isSelected(o.value)} className={isSelected(o.value)?styles.choiceActive:styles.choice}
         onClick={()=>choice(o.value)} key={o.value}>
         <span>{es?o.es:o.en}</span><span className={styles.choiceCircle}>{isSelected(o.value)?<Check size={15}/>:null}</span>
        </button>)}
       </div>:
       current.kind==="textarea"?<textarea className={styles.textarea} value={answer} maxLength={current.max}
         placeholder={ph(current.id,es)} rows={4} onChange={e=>setAnswer(e.target.value)}
         aria-label={es?current.es:current.en}/>:
       <div className={styles.inputWrap}>
        <input ref={inputRef} className={styles.input}
         type={current.kind==="password"&&!showPassword?"password":current.kind==="email"?"email":
          current.kind==="tel"?"tel":current.kind==="date"?"date":current.kind==="time"?"time":
          current.kind==="number"?"text":"text"}
         min={current.kind==="date"?new Date().toISOString().slice(0,10):undefined}
         inputMode={current.kind==="number"?"decimal":current.kind==="tel"?"tel":undefined}
         autoComplete={current.kind==="password"?"new-password":
          current.kind==="email"?"email":current.id==="first"?"given-name":
          current.id==="last"?"family-name":current.id==="user_phone"?"tel":"off"}
         value={answer} maxLength={current.max} aria-label={es?current.es:current.en}
         placeholder={ph(current.id,es)} onChange={e=>setAnswer(e.target.value)}/>
        {current.kind==="password"?<button className={styles.eye} type="button" onClick={()=>setShowPassword(v=>!v)}
         aria-label={showPassword?"Ocultar contraseña":"Mostrar contraseña"}>{showPassword?<EyeOff size={18}/>:<Eye size={18}/>}</button>:null}
       </div>}
       {error?<p className={styles.error} role="alert">{error}</p>:null}
       <div className={styles.actions}>
        <button type="button" className={styles.back} onClick={back}><ArrowLeft size={17}/>{es?"Atrás":"Back"}</button>
        <button type="submit" className={styles.next} disabled={busy}>
         {busy?(es?"Creando cuenta…":"Creating account…"):
          index===steps.length-1?(es?"Crear cuenta":"Create account"):(es?"Continuar":"Continue")}
         <ArrowRight size={18}/></button>
       </div>
      </form>
      <div className={styles.footerHint}><ShieldCheck size={15}/>{es?"Tus respuestas se guardan de forma segura al confirmar el correo.":"Your answers are saved securely when your email is verified."}</div>
     </>:phase==="email"?<>
      <div className={styles.bigIcon}><Mail size={31}/></div>
      <div className={styles.badge}><Check size={16}/>{es?"Último paso":"Final step"}</div>
      <h1 className={styles.question}>{es?"Confirma tu cuenta por email":"Confirm your account by email"}</h1>
      <p className={styles.help}>{es?"Enviamos un enlace a":"We sent a link to"} <strong>{answers.email||"tu correo"}</strong>. {es?"Ábrelo para verificar tu dirección y regresa aquí.":"Open it to verify your address, then return here."}</p>
      <label className={styles.verifyLabel}>{es?"Contraseña (si abriste el enlace en otro dispositivo)":"Password (if you opened the email on another device)"}
       <input type="password" autoComplete="current-password" value={confirmationPassword} onChange={e=>setConfirmationPassword(e.target.value)}
        className={styles.input} placeholder="••••••••••"/></label>
      {notice?<p className={styles.success} role="status">{notice}</p>:null}
      {error?<p className={styles.error} role="alert">{error}</p>:null}
      <button className={styles.next} type="button" disabled={busy} onClick={()=>void verify()}>
       <CheckCircle2 size={18}/>{busy?(es?"Verificando…":"Verifying…"):(es?"Ya confirmé mi correo":"I've confirmed my email")}
      </button>
      <button className={styles.resend} type="button" disabled={busy} onClick={()=>void resend()}><RefreshCw size={15}/>{es?"Reenviar correo":"Resend email"}</button>
     </>:phase==="saving"?<>
      <div className={styles.bigIcon}><Sparkles size={30}/></div>
      <h1 className={styles.question}>{es?"Preparando tu espacio":"Setting up your workspace"}</h1>
      <p className={styles.help}>{es?"Guardando tu negocio, tu agente y las preferencias que elegiste.":"Saving your business, agent and chosen preferences."}</p>
      <div className={styles.loadingBar}/>
     </>:phase==="failed"?<>
      <div className={styles.bigIcon}><LockKeyhole size={30}/></div>
      <h1 className={styles.question}>{es?"Necesitamos completar un detalle":"One more thing to finish"}</h1>
      <p className={styles.help}>{es?"Tu correo está confirmado, pero no pudimos terminar toda la configuración. Tus respuestas siguen guardadas.":"Your email is verified, but setup wasn't fully completed. Your answers remain saved."}</p>
      {error?<p role="alert" className={styles.error}>{error}</p>:null}
      <button type="button" disabled={busy} className={styles.next} onClick={()=>void verify()}>{es?"Reintentar configuración":"Retry setup"}<ArrowRight size={18}/></button>
     </>:<>
      <div className={styles.bigIcon}><CheckCircle2 size={31}/></div>
      <div className={styles.badge}><Sparkles size={15}/>{es?"Todo preparado":"You're all set"}</div>
      <h1 className={styles.question}>{es?`¡Bienvenido a VMV, ${friendlyName||"bienvenido"}!`:`Welcome to VMV, ${friendlyName||"friend"}!`}</h1>
      <p className={styles.help}>{es?`Tu cuenta está verificada y ${completeAgent||"tu agente"} ya tiene su identidad guardada.`:
       `Your account is verified, and ${completeAgent||"your agent"} has its identity saved.`}</p>
      <div className={styles.readyPill}><ShieldCheck size={17}/>{es?"Sesión segura iniciada":"Secure session active"}</div>
      <button className={styles.next} type="button" onClick={()=>window.location.replace("/vista-app")}>
       {es?"Ir a Home":"Go to Home"}<ArrowRight size={19}/></button>
     </>}
    </section>
    <aside className={styles.story}><div className={styles.orb}><div className={styles.orbEye}/><div className={styles.orbEye}/><div className={styles.orbSmile}/></div>
     <span>{es?"TU NEGOCIO, TU IA":"YOUR BUSINESS, YOUR AI"}</span>
     <h2>{es?"Conoce al agente que crecerá contigo.":"Meet the agent that will grow with you."}</h2>
     <p>{es?"Configuramos su identidad desde el principio, para que tus herramientas trabajen conectadas desde un solo lugar.":"We'll set up its identity from day one, keeping your tools connected in one place."}</p>
     <div className={styles.storyCard}><Bot size={22}/><div><small>{es?"NOMBRE DE TU AGENTE":"YOUR AGENT'S NAME"}</small><strong>{answers.agent_name||"Tu agente"}</strong></div><CheckCircle2 size={18}/></div>
    </aside>
   </div>
   <footer className={styles.bottom}><span>VMV BUSINESS</span><span>{es?"Una experiencia para ti.":"Built around you."}</span></footer>
  </div>
 </main>;
}
