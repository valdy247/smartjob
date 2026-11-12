"use client";
import {useState,type FormEvent} from "react";
import {ArrowRight} from "lucide-react";
import type {SupabaseClient} from "@supabase/supabase-js";
import {Brand} from "./Brand";
import {SignupWizard} from "./SignupWizard";
import {InterfaceLanguagePicker} from "./InterfaceLanguagePicker";
import {useInterfaceLanguage} from "@/lib/i18n-web";

type Mode="login"|"signup"|"forgot";
export function AuthPanel({supabase}:{supabase:SupabaseClient}){
 const {translate}=useInterfaceLanguage();
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
    setSuccess(translate("auth.resetSent"));
   }else{
    const {error}=await supabase.auth.signInWithPassword({email:email.trim(),password});
    if(error)throw error;
   }
  }catch(e){setError(mode==="forgot"?translate("common.accessError"):translate("common.loginError"));}
  finally{setBusy(false);}
 };
 // Crear cuenta now opens the four-step wizard; the legacy one-page signup is removed.
 if(mode==="signup")return <SignupWizard supabase={supabase} onBack={()=>navigate("login")}/>;
 return <div className="auth-wrap">
  <section className="auth-side">
   <Brand/>
   <div style={{position:"relative",zIndex:1,marginTop:50}}>
    <p className="eyebrow">VMV CALL</p>
    <h1 className="auth-head">{translate("auth.tagline")}<br/><span style={{color:"var(--lime)"}}>{translate("auth.connect")}</span></h1>
   </div>
  </section>
  <main className="auth-right">
   <div style={{width:"100%",maxWidth:400,margin:"0 auto"}}><InterfaceLanguagePicker compact/></div>
   <form className="auth-card" onSubmit={handle}>
    <p className="eyebrow">{translate(mode==="forgot"?"auth.recoveryKicker":"auth.welcomeBack")}</p>
    <h1>{translate(mode==="forgot"?"auth.resetPassword":"common.signIn")}</h1>
    <div className="field-group">
     <label htmlFor="login-email" className="label">{translate("common.email")}</label>
     <input id="login-email" className="field" type="email" autoComplete="email" required value={email}
      onChange={e=>setEmail(e.target.value)} placeholder={translate("auth.emailPlaceholder")}/>
    </div>
    {mode==="login"&&<div className="field-group">
     <div className="row between"><label htmlFor="login-password" className="label">{translate("common.password")}</label>
      <button className="linkbutton small" type="button" onClick={()=>navigate("forgot")}>{translate("auth.forgotPassword")}</button>
     </div>
     <input id="login-password" className="field" type="password" autoComplete="current-password" required
      value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••"/>
    </div>}
    {error&&<div role="alert" className="notice danger" style={{marginBottom:14}}>{error}</div>}
    {success&&<div role="status" className="notice" style={{marginBottom:14}}>{success}</div>}
    <button className="btn primary block" disabled={busy} type="submit">
     {busy?translate("common.loading"):translate(mode==="forgot"?"auth.resetLink":"common.signIn")}<ArrowRight size={17}/>
    </button>
    <div className="divider"/>
    <div className="small muted" style={{textAlign:"center"}}>
     {translate(mode==="login"?"auth.newHere":"auth.rememberPassword")+" "}
     <button type="button" className="linkbutton" onClick={()=>navigate(mode==="login"?"signup":"login")}>
      {translate(mode==="login"?"auth.createAccount":"common.signIn")}
     </button>
    </div>
   </form>
  </main>
 </div>;
}
