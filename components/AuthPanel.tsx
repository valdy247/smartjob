"use client";
import {useState,type FormEvent} from "react";
import {ArrowRight} from "lucide-react";
import type {SupabaseClient} from "@supabase/supabase-js";
import {Brand} from "./Brand";
import {SignupWizard} from "./SignupWizard";

type Mode="login"|"signup"|"forgot";
export function AuthPanel({supabase}:{supabase:SupabaseClient}){
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
    setSuccess("Te enviamos un enlace de recuperación. Revisa tu correo.");
   }else{
    const {error}=await supabase.auth.signInWithPassword({email:email.trim(),password});
    if(error)throw error;
   }
  }catch(e){setError(e instanceof Error?e.message:"No pudimos completar la solicitud.");}
  finally{setBusy(false);}
 };
 // Crear cuenta now opens the four-step wizard; the legacy one-page signup is removed.
 if(mode==="signup")return <SignupWizard supabase={supabase} onBack={()=>navigate("login")}/>;
 return <div className="auth-wrap">
  <section className="auth-side">
   <Brand/>
   <div style={{position:"relative",zIndex:1,marginTop:50}}>
    <p className="eyebrow">VMV CALL</p>
    <h1 className="auth-head">Habla sin fronteras.<br/><span style={{color:"var(--lime)"}}>Conecta mejor.</span></h1>
   </div>
  </section>
  <main className="auth-right">
   <form className="auth-card" onSubmit={handle}>
    <p className="eyebrow">{mode==="forgot"?"RECUPERA EL ACCESO":"BIENVENIDO DE NUEVO"}</p>
    <h1>{mode==="forgot"?"Recuperar contraseña":"Iniciar sesión"}</h1>
    <div className="field-group">
     <label htmlFor="login-email" className="label">Correo electrónico</label>
     <input id="login-email" className="field" type="email" autoComplete="email" required value={email}
      onChange={e=>setEmail(e.target.value)} placeholder="tu@correo.com"/>
    </div>
    {mode==="login"&&<div className="field-group">
     <div className="row between"><label htmlFor="login-password" className="label">Contraseña</label>
      <button className="linkbutton small" type="button" onClick={()=>navigate("forgot")}>¿Olvidaste tu contraseña?</button>
     </div>
     <input id="login-password" className="field" type="password" autoComplete="current-password" required
      value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••"/>
    </div>}
    {error&&<div role="alert" className="notice danger" style={{marginBottom:14}}>{error}</div>}
    {success&&<div role="status" className="notice" style={{marginBottom:14}}>{success}</div>}
    <button className="btn primary block" disabled={busy} type="submit">
     {busy?"Procesando…":mode==="forgot"?"Enviar enlace":"Iniciar sesión"}<ArrowRight size={17}/>
    </button>
    <div className="divider"/>
    <div className="small muted" style={{textAlign:"center"}}>
     {mode==="login"?"¿Nuevo en VMV Call? ":"¿Recordaste tu contraseña? "}
     <button type="button" className="linkbutton" onClick={()=>navigate(mode==="login"?"signup":"login")}>
      {mode==="login"?"Crear cuenta":"Iniciar sesión"}
     </button>
    </div>
   </form>
  </main>
 </div>;
}
