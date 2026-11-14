"use client";
import {useState,type FormEvent} from "react";
import {ArrowRight} from "lucide-react";
import type {SupabaseClient} from "@supabase/supabase-js";
import {InterfaceLanguagePicker as LanguageSelector} from "./InterfaceLanguagePicker";
import {useInterfaceLanguage} from "@/lib/i18n-web";
import type {MessageKey} from "@/lib/i18n";
import {authErrorKey} from "@/lib/i18n";
import {Brand} from "./Brand";
import {SignupWizard} from "./SignupWizard";

type Mode="login"|"signup"|"forgot";
export function AuthPanel({supabase}:{supabase:SupabaseClient}){
 const {translate:t}=useInterfaceLanguage();
 const [mode,setMode]=useState<Mode>("login");
 const [busy,setBusy]=useState(false);
 const [email,setEmail]=useState(""),[password,setPassword]=useState("");
 const [error,setError]=useState(""),[success,setSuccess]=useState("");
 const navigate=(target:Mode)=>{setMode(target);setError("");setSuccess("");setPassword("");};
 const handle=async(event:FormEvent)=>{
  event.preventDefault();setBusy(true);setError("");setSuccess("");
  try{
   if(mode==="forgot"){
    const {error}=await supabase.auth.resetPasswordForEmail(email.trim(),{redirectTo:window.location.origin});
    if(error)throw error;
    setSuccess("auth.recoverySent");
   }else{
    const {error}=await supabase.auth.signInWithPassword({email:email.trim(),password});
    if(error)throw error;
   }
  }catch(e){setError(authErrorKey(e));}
  finally{setBusy(false);}
 };
 // Crear cuenta now opens the four-step wizard; the legacy one-page signup is removed.
 if(mode==="signup")return <SignupWizard supabase={supabase} onBack={()=>navigate("login")}/>;
 return <div className="auth-wrap">
  <section className="auth-side">
   <Brand/>
   <div style={{position:"relative",zIndex:1,marginTop:50}}>
    <p className="eyebrow">VMV Business</p>
    <h1 className="auth-head">{t("auth.tagline")}<br/><span style={{color:"var(--lime)"}}>{t("auth.connect")}</span></h1>
   </div>
  </section>
  <main className="auth-right">
   <form className="auth-card" onSubmit={handle}>
    <LanguageSelector/>
    <p className="eyebrow">{mode==="forgot"?t("auth.recoverHeading"):t("auth.welcomeBack")}</p>
    <h1>{mode==="forgot"?t("auth.resetPassword"):t("common.signIn")}</h1>
    <div className="field-group">
     <label htmlFor="login-email" className="label">{t("common.email")}</label>
     <input id="login-email" className="field" type="email" autoComplete="email" required value={email}
      onChange={e=>setEmail(e.target.value)} placeholder="tu@correo.com"/>
    </div>
    {mode==="login"&&<div className="field-group">
     <div className="row between"><label htmlFor="login-password" className="label">{t("common.password")}</label>
      <button className="linkbutton small" type="button" onClick={()=>navigate("forgot")}>{t("auth.forgotPassword")}</button>
     </div>
     <input id="login-password" className="field" type="password" autoComplete="current-password" required
      value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••"/>
    </div>}
    {error&&<div role="alert" className="notice danger" style={{marginBottom:14}}>{t(error as MessageKey)}</div>}
    {success&&<div role="status" className="notice" style={{marginBottom:14}}>{t(success as MessageKey)}</div>}
    <button className="btn primary block" disabled={busy} type="submit">
     {busy?t("common.processing"):mode==="forgot"?t("auth.sendLink"):t("common.signIn")}<ArrowRight size={17}/>
    </button>
    <div className="divider"/>
    <div className="small muted" style={{textAlign:"center"}}>
     {mode==="login"?t("auth.newHere"):t("auth.rememberPassword")}
     <button type="button" className="linkbutton" onClick={()=>navigate(mode==="login"?"signup":"login")}>
      {mode==="login"?t("auth.createAccount"):t("common.signIn")}
     </button>
    </div>
   </form>
  </main>
 </div>;
}
