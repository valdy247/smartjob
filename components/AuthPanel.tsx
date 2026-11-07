"use client";
import { useState, type FormEvent } from "react";
import { ArrowRight, BriefcaseBusiness, Languages, LockKeyhole, Mail, ShieldCheck, Sparkles } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Brand } from "./Brand";

type Mode = "login"|"signup"|"forgot";
export function AuthPanel({supabase}:{supabase:SupabaseClient}) {
  const [mode,setMode]=useState<Mode>("login"),[busy,setBusy]=useState(false);
  const [email,setEmail]=useState(""),[password,setPassword]=useState("");
  const [first,setFirst]=useState(""),[last,setLast]=useState(""),[phone,setPhone]=useState(""),[occupation,setOccupation]=useState(""),[city,setCity]=useState(""),[state,setState]=useState("");
  const [assistantName,setAssistantName]=useState("Juan");
  const [error,setError]=useState(""),[success,setSuccess]=useState("");
  const handle=async(e:FormEvent)=>{
    e.preventDefault();setError("");setSuccess("");setBusy(true);
    try{
      if(mode==="forgot"){
        const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin});
        if(error)throw error;setSuccess("Enviamos un enlace para recuperar tu contraseña. Revisa tu correo.");return;
      }
      if(mode==="login"){
        const {error}=await supabase.auth.signInWithPassword({email,password});
        if(error)throw error;return;
      }
      if(password.length<8)throw new Error("La contraseña debe tener al menos 8 caracteres.");
      const {error,data}=await supabase.auth.signUp({
        email,password,
        options:{emailRedirectTo:window.location.origin,data:{
          first_name:first.trim(),last_name:last.trim(),phone:phone.trim(),
          occupation:occupation.trim(),city:city.trim(),state:state.trim(),
          assistant_name:assistantName.trim()||"Juan",owner_language:"es",customer_language:"en"
        }}
      });
      if(error)throw error;
      if(data.user && !data.session) setSuccess("¡Cuenta creada! Revisa tu correo y confirma tu email antes de entrar.");
      else setSuccess("Cuenta creada. Preparando tu asistente…");
    }catch(err){setError(err instanceof Error?err.message:"Algo salió mal. Inténtalo de nuevo.");}
    finally{setBusy(false);}
  };
  return <div className="auth-wrap">
    <section className="auth-side">
      <Brand/>
      <div style={{position:"relative",zIndex:1,marginTop:50}}>
        <p className="eyebrow">SMART JOB</p>
        <h1 className="auth-head">Habla sin límites.<br/><span style={{color:"var(--lime)"}}>Trabaja mejor.</span></h1>
        

      </div>

    </section>
    <main className="auth-right">
      <form className="auth-card" onSubmit={handle}>
        <p className="eyebrow">{mode==="signup"?"CREA TU CUENTA":mode==="forgot"?"RECUPERA EL ACCESO":"BIENVENIDO DE NUEVO"}</p>
        <h1>{mode==="signup"?"Crear cuenta":mode==="forgot"?"Recuperar contraseña":"Iniciar sesión"}</h1>
        
        {mode==="signup"&&<div className="form-grid">
          <div className="field-group"><label className="label">Nombre *</label><input className="field" required maxLength={60} value={first} onChange={e=>setFirst(e.target.value)} placeholder="Valdy"/></div>
          <div className="field-group"><label className="label">Apellidos *</label><input className="field" required maxLength={80} value={last} onChange={e=>setLast(e.target.value)} placeholder="Mena"/></div>
          <div className="field-group full"><label className="label">Teléfono *</label><input className="field" type="tel" required maxLength={25} value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+1 (706) 000-0000"/></div>
          <div className="field-group full"><label className="label">Ocupación *</label><input className="field" required maxLength={100} value={occupation} onChange={e=>setOccupation(e.target.value)} placeholder="Electricista, contratista, carpintero…"/></div>
          <div className="field-group"><label className="label">Ciudad</label><input className="field" maxLength={90} value={city} onChange={e=>setCity(e.target.value)} placeholder="Columbus"/></div>
          <div className="field-group"><label className="label">Estado</label><input className="field" maxLength={90} value={state} onChange={e=>setState(e.target.value)} placeholder="Georgia"/></div>
          <div className="field-group full"><label className="label">¿Cómo quieres llamar a tu asistente?</label><input className="field" maxLength={40} value={assistantName} onChange={e=>setAssistantName(e.target.value)} placeholder="Juan"/></div>
        </div>}
        <div className="field-group"><label className="label">Correo electrónico</label><input className="field" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="tu@correo.com"/></div>
        {mode!=="forgot"&&<div className="field-group"><div className="row between"><label className="label">Contraseña</label>{mode==="login"&&<button className="linkbutton small" type="button" onClick={()=>{setMode("forgot");setError("");setSuccess("");}}>¿Olvidaste tu contraseña?</button>}</div><input className="field" type="password" minLength={mode==="signup"?8:1} autoComplete={mode==="login"?"current-password":"new-password"} required value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••"/></div>}
        {error&&<div role="alert" className="notice danger" style={{marginBottom:14}}>{error}</div>}
        {success&&<div role="status" className="notice" style={{marginBottom:14}}>{success}</div>}
        <button className="btn primary block" disabled={busy} type="submit">{busy?"Procesando…":mode==="signup"?"Crear mi cuenta":mode==="forgot"?"Enviar enlace":"Iniciar sesión"}<ArrowRight size={17}/></button>
        <div className="divider"/>
        <div className="small muted" style={{textAlign:"center"}}>
          {mode==="signup"?"¿Ya tienes cuenta?":mode==="login"?"¿Nuevo en Smart Job?":"¿Recordaste tu contraseña?"}{" "}
          <button type="button" className="linkbutton" onClick={()=>{setMode(mode==="signup"||mode==="forgot"?"login":"signup");setError("");setSuccess("");}}>
            {mode==="signup"||mode==="forgot"?"Inicia sesión":"Crear una cuenta"}
          </button>
        </div>
        
      </form>
    </main>
  </div>;
}
