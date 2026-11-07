"use client";
import { useState,type FormEvent } from "react";
import { ArrowRight,Sparkles } from "lucide-react";
import type { User,SupabaseClient } from "@supabase/supabase-js";
import type { Profile } from "@/lib/types";
import { Brand } from "./Brand";
export function Onboarding({user,supabase,onSaved}:{user:User,supabase:SupabaseClient,onSaved:(p:Profile)=>void}){
  const m=user.user_metadata||{};
  const [first,setFirst]=useState(String(m.first_name||"")),[last,setLast]=useState(String(m.last_name||""));
  const [phone,setPhone]=useState(String(m.phone||"")),[occupation,setOccupation]=useState(String(m.occupation||""));
  const [city,setCity]=useState(String(m.city||"")),[state,setState]=useState(String(m.state||""));
  const [name,setName]=useState("Juan"),[owner,setOwner]=useState("es"),[customer,setCustomer]=useState("en");
  const [saving,setSaving]=useState(false),[error,setError]=useState("");
  const submit=async(e:FormEvent)=>{e.preventDefault();setSaving(true);setError("");
    const profile:Profile={id:user.id,first_name:first.trim(),last_name:last.trim(),phone:phone.trim(),occupation:occupation.trim(),
      city:city.trim(),state:state.trim(),country:"US",assistant_name:name.trim()||"Juan",owner_language:owner,customer_language:customer};
    const {error}=await supabase.from("smartjob_profiles").upsert(profile);
    if(error)setError(error.message);else onSaved(profile);setSaving(false);
  };
  return <main className="shell" style={{maxWidth:710,paddingTop:35}}>
    <Brand/><div style={{margin:"45px 0 24px"}}><p className="eyebrow">CONFIGURACIÓN</p><h1>Tu <em>asistente.</em></h1></div>
    <form className="card" onSubmit={submit}>
      <div className="form-grid">
        <div className="field-group"><label className="label">Nombre</label><input className="field" required value={first} onChange={e=>setFirst(e.target.value)}/></div>
        <div className="field-group"><label className="label">Apellidos</label><input className="field" required value={last} onChange={e=>setLast(e.target.value)}/></div>
        <div className="field-group"><label className="label">Teléfono</label><input className="field" type="tel" required value={phone} onChange={e=>setPhone(e.target.value)}/></div>
        <div className="field-group"><label className="label">Ocupación</label><input className="field" required value={occupation} onChange={e=>setOccupation(e.target.value)} placeholder="Carpintero"/></div>
        <div className="field-group"><label className="label">Ciudad</label><input className="field" value={city} onChange={e=>setCity(e.target.value)}/></div>
        <div className="field-group"><label className="label">Estado</label><input className="field" value={state} onChange={e=>setState(e.target.value)}/></div>
        <div className="field-group full"><label className="label">Nombre del asistente</label><input className="field" value={name} onChange={e=>setName(e.target.value)} maxLength={40} required placeholder="Juan"/></div>
        <div className="field-group"><label className="label">Tu idioma</label><select className="field" value={owner} onChange={e=>setOwner(e.target.value)}><option value="es">Español</option><option value="en">English</option><option value="pt">Português</option><option value="fr">Français</option></select></div>
        <div className="field-group"><label className="label">Idioma del cliente</label><select className="field" value={customer} onChange={e=>setCustomer(e.target.value)}><option value="en">English</option><option value="es">Español</option><option value="pt">Português</option><option value="fr">Français</option></select></div>
      </div>
      {error&&<div className="notice danger">{error}</div>}
      <button type="submit" disabled={saving} className="btn primary block"><Sparkles size={17}/>{saving?"Guardando…":"Empezar con "+(name||"mi asistente")}<ArrowRight size={17}/></button>
    </form>
  </main>;
}
