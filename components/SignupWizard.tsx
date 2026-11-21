"use client";
import {useEffect,useMemo,useRef,useState,type FormEvent} from "react";
import type {SupabaseClient} from "@supabase/supabase-js";
import {ArrowLeft,ArrowRight,Bot,Check,CheckCircle2,Eye,EyeOff,
 Mail,RefreshCw,ShieldCheck,Sparkles} from "lucide-react";
import {InterfaceLanguagePicker} from "./InterfaceLanguagePicker";
import {useInterfaceLanguage} from "@/lib/i18n-web";
import {blueprintForSignup,completeSignup} from "@/lib/vmv-signup-complete";
import {signupQuestions,signupValidation,type SignupAnswer} from "@/lib/vmv-signup-flow";
import styles from "./SignupExperience.module.css";
import service from "@/app/vista-app/ai-agents/AutomaticWebWizard.module.css";
import theme from "@/app/vista-app/ai-agents/AgentServiceFlow.module.css";

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
    setPhase("ready");
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
  <section className={service.root+" "+theme.flow+" "+styles.wizard} aria-label={es?"Crear cuenta VMV":"Create VMV account"}>
   <header className={service.top}>
    <button type="button" disabled={busy||phase==="ready"} onClick={back} aria-label={es?"Volver":"Back"}>
     <ArrowLeft size={19}/>
    </button>
    <span>{phase==="questions"?current.section:es?"Tu cuenta":"Your account"}</span>
    <div className={styles.topRight}>
     <InterfaceLanguagePicker compact/>
     <span>{phase==="questions"?(index+1)+"/"+steps.length:"VMV"}</span>
    </div>
   </header>
   <div className={service.track} aria-label={es?"Progreso del registro":"Signup progress"} role="progressbar"
    aria-valuemin={0} aria-valuemax={100} aria-valuenow={phase==="questions"?progress:100}>
    <span className={theme.agentProgress} style={{width:(phase==="questions"?progress:100)+"%"}}/>
   </div>
   <div className={styles.screenContent} ref={scrollRef}>
    <div className={service.robot+" "+theme.agentRobot}>
     {phase==="email"?<Mail size={35}/>:phase==="ready"?<CheckCircle2 size={35}/>:
      phase==="failed"?<ShieldCheck size={35}/>:<Bot size={35}/>}
     <Sparkles size={16}/>
    </div>
    {phase==="questions"?<>
     <h1 key={current.id} className={service.question+" "+theme.agentHeading}>{es?current.es:current.en}</h1>
     <form className={service.panel} id="vmv-signup-question" onSubmit={next}>
      {current.kind==="choice"||current.kind==="multi"?
       <div role={current.kind==="multi"?"group":"radiogroup"} aria-label={es?current.es:current.en}
        className={service.optionsVertical+" "+styles.choiceList}>
        {options.map(o=><button type="button" key={o.value}
         role={current.kind==="multi"?"checkbox":"radio"} aria-checked={isSelected(o.value)}
         className={isSelected(o.value)?service.optionActive:service.option}
         onClick={()=>choice(o.value)}>
         {isSelected(o.value)?<Check size={17}/>:null}
         {es?o.es:o.en}
        </button>)}
       </div>:
       current.kind==="textarea"?
        <div className={service.field}>
         <textarea value={answer} rows={4} maxLength={current.max}
          placeholder={ph(current.id,es)} onChange={e=>setAnswer(e.target.value)}
          aria-label={es?current.es:current.en}/>
        </div>:
        <div className={service.field}>
         <div className={styles.inputRow}>
          <input ref={inputRef} aria-label={es?current.es:current.en}
           type={current.kind==="password"&&!showPassword?"password":current.kind==="email"?"email":
            current.kind==="tel"?"tel":current.kind==="date"?"date":current.kind==="time"?"time":"text"}
           min={current.kind==="date"?new Date().toISOString().slice(0,10):undefined}
           inputMode={current.kind==="number"?"decimal":current.kind==="tel"?"tel":undefined}
           autoComplete={current.kind==="password"?"new-password":
            current.kind==="email"?"email":current.id==="first"?"given-name":
            current.id==="last"?"family-name":current.id==="user_phone"?"tel":"off"}
           value={answer} maxLength={current.max}
           placeholder={ph(current.id,es)} onChange={e=>setAnswer(e.target.value)}/>
          {current.kind==="password"?<button type="button" className={styles.eye}
           aria-label={showPassword?(es?"Ocultar contraseña":"Hide password"):(es?"Mostrar contraseña":"Show password")}
           onClick={()=>setShowPassword(v=>!v)}>{showPassword?<EyeOff size={18}/>:<Eye size={18}/>}</button>:null}
         </div>
        </div>}
      {current.optional?<small className={styles.optional}>{es?"Opcional":"Optional"}</small>:null}
      {error?<p className={service.error} role="alert">{error}</p>:null}
     </form>
     <footer className={service.footer}>
      <button type="submit" form="vmv-signup-question"
       className={service.primary+" "+theme.agentButton} disabled={busy}>
       {busy?(es?"Creando cuenta…":"Creating account…"):
        index===steps.length-1?(es?"Crear cuenta":"Create account"):
         (es?"Continuar":"Continue")}
       <ArrowRight size={17}/>
      </button>
     </footer>
    </>:phase==="email"?<>
     <h1 className={service.question+" "+theme.agentHeading}>{es?"Confirma tu cuenta por email":"Confirm your account by email"}</h1>
     <div className={service.panel}>
      <p className={service.note}>{es?"Te enviamos un enlace a":"We sent a link to"} <strong>{answers.email||"tu correo"}</strong>. {es?"Confírmalo para continuar.":"Confirm it to continue."}</p>
      <label className={service.field}>{es?"Contraseña":"Password"}
       <input type="password" autoComplete="current-password" value={confirmationPassword}
        placeholder="••••••••" onChange={e=>setConfirmationPassword(e.target.value)}/>
      </label>
      {notice?<p className={styles.success} role="status">{notice}</p>:null}
      {error?<p className={service.error} role="alert">{error}</p>:null}
      <button className={service.primary+" "+theme.agentButton} type="button" disabled={busy}
       onClick={()=>void verify()}>
       <CheckCircle2 size={17}/>{busy?(es?"Verificando…":"Verifying…"):
        (es?"Ya confirmé mi correo":"I've confirmed my email")}
      </button>
      <button className={service.option} type="button" disabled={busy} onClick={()=>void resend()}>
       <RefreshCw size={15}/>{es?"Reenviar correo":"Resend email"}
      </button>
     </div>
    </>:phase==="saving"?<>
     <h1 className={service.question+" "+theme.agentHeading}>{es?"Preparando tu cuenta":"Setting up your account"}</h1>
     <p className={service.note} role="status">{es?"Guardando la configuración…":"Saving your settings…"}</p>
    </>:phase==="failed"?<>
     <h1 className={service.question+" "+theme.agentHeading}>{es?"Terminemos tu configuración":"Finish your setup"}</h1>
     <div className={service.panel}>
      {error?<p role="alert" className={service.error}>{error}</p>:null}
      <button type="button" disabled={busy} className={service.primary+" "+theme.agentButton}
       onClick={()=>void verify()}>{es?"Reintentar":"Try again"}<ArrowRight size={17}/></button>
     </div>
    </>:<>
     <h1 className={service.question+" "+theme.agentHeading}>{es?"¡Todo listo, "+(friendlyName||"bienvenido")+"!":
      "You're all set, "+(friendlyName||"friend")+"!"}</h1>
     <div className={service.panel}>
      <p className={service.note}>{es?"Cuenta verificada.":"Account verified."}</p>
      <button className={service.primary+" "+theme.agentButton} type="button"
       onClick={()=>window.location.replace("/vista-app")}>
       {es?"Ir a Home":"Go to Home"}<ArrowRight size={17}/>
      </button>
     </div>
    </>}
   </div>
  </section>
 </main>;
}
