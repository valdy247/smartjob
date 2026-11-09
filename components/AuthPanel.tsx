"use client";
import {useState,type FormEvent} from "react";
import {ArrowRight,Mail,LockKeyhole} from "lucide-react";
import type {SupabaseClient} from "@supabase/supabase-js";
import {Brand} from "./Brand";
import {SignupWizard} from "./SignupWizard";

type Mode="login"|"signup"|"forgot";
export function AuthPanel({supabase}:{supabase:SupabaseClient}){
 const [mode,setMode]=useState<Mode>("login");
 const [busy,setBusy]=useState(false),[email,setEmail]=useState(""),[password,setPassword]=useState("");
 const [error,setError]=useState(""),[success,setSuccess]=useState("");
 if(mode==="signup")return <SignupWizard supabase={supabase} onBack={()=>{setMode("login");setError("");setSuccess("");}}/>;
 const handle=async(event:FormEvent)=>{
  event.preventDefault();setError("");setSuccess("");setBusy(true);
  try{
   if(mode==="forgot"){
    const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin});
    if(error)throw error;
    setSuccess("Enviamos un enlace para recuperar tu contraseña. Revisa tu correo.");
    return;
   }
   const {error}=await supabase.auth.signInWithPassword({email,password});
   if(error)throw error;
  }catch(err){setError(err instanceof Error?err.message:"No se pudo iniciar sesión.");}
  finally{setBusy(false);}
 };
 return <div className="auth-wrap">
  <aside className="auth-side">
   <Brand/>
   <div style={{position:"relative",zIndex:1,marginTop:50}}>
    <p className="eyebrow">VMV CALL</p>
    <h1 className="auth-head">Habla sin fronteras.<br/><span style={{color:"#08b990"}}>Conecta mejor.</span></h1>
   </div>
  </aside>
  <main className="auth-right">
   <form className="auth-card" onSubmit={handle}>
    <p className="eyebrow">{mode==="forgot"?"RECUPERA EL ACCESO":"BIENVENIDO DE NUEVO"}</p>
    <h1>{mode==="forgot"?"Recuperar contraseña":"Iniciar sesión"}</h1>
    <div className="field-group"><label htmlFor="login-email" className="label">Correo electrónico</label>
     <input id="login-email" className="field" autoComplete="email" type="email" required value={email}
      placeholder="tu@correo.com" onChange={e=>setEmail(e.target.value)}/></div>
    {mode==="login"&&<div className="field-group">
     <div className="row between"><label htmlFor="login-password" className="label">Contraseña</label>
      <button type="button" className="linkbutton small" onClick={()=>{setMode("forgot");setError("");setSuccess("");}}>¿La olvidaste?</button></div>
     <input id="login-password" className="field" type="password" required autoComplete="current-password" value={password}
      placeholder="••••••••" onChange={e=>setPassword(e.target.value)}/></div>}
    {error&&<div role="alert" className="notice danger" style={{marginBottom:14}}>{error}</div>}
    {success&&<div role="status" className="notice" style={{marginBottom:14}}>{success}</div>}
    <button className="btn primary block" type="submit" disabled={busy}>{busy?"Procesando…":mode==="forgot"?"Enviar enlace":"Iniciar sesión"} <ArrowRight size={17}/></button>
    <div className="divider"/>
    <div className="small muted" style={{textAlign:"center"}}>
     {mode==="login"?"¿Nuevo en VMV Call?":"¿Recordaste tu contraseña?"}{" "}
     <button type="button" className="linkbutton" onClick={()=>{setMode(mode==="forgot"?"login":"signup");setError("");setSuccess("");}}>
      {mode==="login"?"Crear cuenta":"Iniciar sesión"}
     </button>
    </div>
   </form>
  </main>
 </div>;
}
