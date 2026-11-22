"use client";
import {useState,type FormEvent} from "react";
import type {SupabaseClient} from "@supabase/supabase-js";
import {ArrowRight,Bot,Eye,EyeOff,LockKeyhole,Mail,ShieldCheck} from "lucide-react";
import {InterfaceLanguagePicker} from "./InterfaceLanguagePicker";
import {useInterfaceLanguage} from "@/lib/i18n-web";
import styles from "./VMVAuthGateway.module.css";

export default function VMVAuthGateway({supabase,compact=false,returnTo}:{
 supabase:SupabaseClient;compact?:boolean;returnTo?:string
}){
 const {language}=useInterfaceLanguage(),es=language!=="en";
 const destination=returnTo&&[
  "/vista-app/video-generator/quick",
  "/vista-app/vmv-pilot/stickman-lab"
 ].some(path=>returnTo===path||returnTo.startsWith(path+"?"))?returnTo:"/vista-app";
 const [email,setEmail]=useState(""),[password,setPassword]=useState("");
 const [forgot,setForgot]=useState(false),[visible,setVisible]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const signIn=async(e:FormEvent)=>{
  e.preventDefault();if(busy)return;
  setBusy(true);setError("");setNotice("");
  try{
   if(forgot){
    const {error:problem}=await supabase.auth.resetPasswordForEmail(email.trim(),{
     redirectTo:window.location.origin+"/?type=recovery"
    });
    if(problem)throw problem;
    setNotice(es?"Si existe una cuenta, recibirás un enlace para recuperar el acceso.":"If the account exists, you'll receive a recovery link.");
   }else{
    const {error:problem}=await supabase.auth.signInWithPassword({email:email.trim(),password});
    if(problem)throw problem;
    window.location.assign(destination);
   }
  }catch(e){setError(e instanceof Error?e.message:(es?"No pudimos iniciar sesión.":"We couldn't sign you in."));}
  finally{setBusy(false);}
 };
 const social=async(provider:"google"|"apple")=>{
  if(busy)return;setBusy(true);setError("");
  try{
   const {error:problem}=await supabase.auth.signInWithOAuth({
    provider,options:{redirectTo:window.location.origin+destination}
   });
   if(problem)throw problem;
  }catch(e){
   setError((e instanceof Error?e.message:"OAuth no disponible")+
    (es?" Comprueba que el proveedor esté habilitado en VMV.":" Check that the provider is enabled for VMV."));
   setBusy(false);
  }
 };
 return <section className={compact?styles.compact:styles.page}>
  <div className={styles.container}>
   <header className={styles.top}><div className={styles.logo}>
    <span className={styles.logoIcon}><Bot size={25}/></span>
    <span>VMV <b>BUSINESS</b></span>
   </div><InterfaceLanguagePicker compact/></header>
   <div className={styles.welcome}><span className={styles.label}>{es?"BIENVENIDO DE NUEVO":"WELCOME BACK"}</span>
    <h1>{forgot?(es?"Recupera tu cuenta":"Recover your account"):
     (es?"Tu negocio te espera.":"Your business awaits.")}</h1>
    <p>{forgot?(es?"Te enviaremos un enlace seguro.":"We'll send you a secure link."):
     (es?"Ingresa a tu espacio personal.":"Sign in to your workspace.")}</p>
   </div>
   {!forgot?<div className={styles.social}>
    <button type="button" disabled={busy} onClick={()=>void social("google")}>
     <span className={styles.google} aria-hidden="true">G</span>{es?"Continuar con Google":"Continue with Google"}
    </button>
    <button type="button" disabled={busy} onClick={()=>void social("apple")}>
     <span className={styles.apple} aria-hidden="true">A</span>{es?"Continuar con Apple":"Continue with Apple"}
    </button>
   </div>:null}
   {!forgot?<div className={styles.or}><span/>{es?"o con tu correo":"or with your email"}<span/></div>:null}
   <form className={styles.form} onSubmit={e=>void signIn(e)}>
    <label htmlFor={compact?"vmv-app-email":"vmv-auth-email"}>{es?"Correo electrónico":"Email address"}</label>
    <div className={styles.inputWrap}><Mail size={17}/><input required id={compact?"vmv-app-email":"vmv-auth-email"} type="email"
     autoComplete="email" value={email} maxLength={254} onChange={e=>setEmail(e.target.value)}
     placeholder="tu@correo.com"/></div>
    {!forgot?<><div className={styles.labelRow}><label htmlFor={compact?"vmv-app-password":"vmv-auth-password"}>{es?"Contraseña":"Password"}</label>
     <button type="button" onClick={()=>{setForgot(true);setError("");setNotice("");}}>{es?"¿La olvidaste?":"Forgot?"}</button></div>
     <div className={styles.inputWrap}><LockKeyhole size={17}/><input required id={compact?"vmv-app-password":"vmv-auth-password"}
       type={visible?"text":"password"} autoComplete="current-password" value={password}
       onChange={e=>setPassword(e.target.value)} placeholder="••••••••••"/>
      <button className={styles.eye} type="button" aria-label={visible?"Ocultar contraseña":"Mostrar contraseña"} onClick={()=>setVisible(v=>!v)}>
       {visible?<EyeOff size={16}/>:<Eye size={16}/>}</button></div>
    </>:null}
    {error?<p role="alert" className={styles.error}>{error}</p>:null}
    {notice?<p role="status" className={styles.notice}>{notice}</p>:null}
    <button className={styles.submit} type="submit" disabled={busy}>{busy?(es?"Procesando…":"Processing…"):
     forgot?(es?"Enviar enlace":"Send link"):(es?"Iniciar sesión":"Sign in")}<ArrowRight size={18}/></button>
   </form>
   {forgot?<button type="button" className={styles.loginLink} onClick={()=>{setForgot(false);setError("");setNotice("");}}>
    {es?"Volver a entrar":"Back to sign in"}</button>:
    <div className={styles.bottomLink}><span>{es?"¿Eres nuevo en VMV?":"New to VMV?"}</span>
     <a href="/registro">{es?"Crear cuenta":"Create an account"}</a></div>}
   <p className={styles.security}><ShieldCheck size={15}/>{es?"Acceso cifrado y sesión protegida.":"Encrypted access and a protected session."}</p>
  </div>
 </section>;
}
