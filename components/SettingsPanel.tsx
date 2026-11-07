"use client";
import { useState,type FormEvent } from "react";
import { BadgeCheck,LogOut,Save,Shield,SlidersHorizontal } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile } from "@/lib/types";
export function SettingsPanel({profile,supabase,onChange,onLogout,status}:{profile:Profile,supabase:SupabaseClient,onChange:(p:Profile)=>void,onLogout:()=>void,status:Record<string,boolean>}){
  const [form,setForm]=useState(profile),[saving,setSaving]=useState(false),[message,setMessage]=useState("");
  const save=async(e:FormEvent)=>{e.preventDefault();setSaving(true);setMessage("");
    const {error}=await supabase.from("smartjob_profiles").upsert({...form,updated_at:new Date().toISOString()});
    if(error)setMessage(error.message);else{onChange(form);setMessage("Perfil guardado.");}setSaving(false);
  };
  return <div><div className="hero"><div><h1>Mi <em>perfil.</em></h1></div></div>
  <div className="gridmain">
    <form className="card" onSubmit={save}><div className="card-head"><h2>Datos profesionales</h2><SlidersHorizontal size={18} color="var(--lime)"/></div>
      <div className="form-grid">
        <div className="field-group"><label className="label">Nombre</label><input className="field" required value={form.first_name} onChange={e=>setForm({...form,first_name:e.target.value})}/></div>
        <div className="field-group"><label className="label">Apellidos</label><input className="field" required value={form.last_name} onChange={e=>setForm({...form,last_name:e.target.value})}/></div>
        <div className="field-group full"><label className="label">Teléfono</label><input className="field" type="tel" required value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></div>
        <div className="field-group full"><label className="label">Ocupación</label><input className="field" required value={form.occupation} onChange={e=>setForm({...form,occupation:e.target.value})}/></div>
        <div className="field-group"><label className="label">Ciudad</label><input className="field" value={form.city} onChange={e=>setForm({...form,city:e.target.value})}/></div>
        <div className="field-group"><label className="label">Estado</label><input className="field" value={form.state} onChange={e=>setForm({...form,state:e.target.value})}/></div>
        <div className="field-group full"><label className="label">Nombre de tu asistente</label><input className="field" maxLength={40} required value={form.assistant_name} onChange={e=>setForm({...form,assistant_name:e.target.value})}/></div>
        <div className="field-group"><label className="label">Tu idioma</label><select className="field" value={form.owner_language} onChange={e=>setForm({...form,owner_language:e.target.value})}><option value="es">Español</option><option value="en">English</option><option value="pt">Português</option><option value="fr">Français</option></select></div>
        <div className="field-group"><label className="label">Idioma del cliente</label><select className="field" value={form.customer_language} onChange={e=>setForm({...form,customer_language:e.target.value})}><option value="en">English</option><option value="es">Español</option><option value="pt">Português</option><option value="fr">Français</option></select></div>
      </div>
      {message&&<div role="status" className="notice" style={{marginBottom:14}}>{message}</div>}
      <button className="btn primary block" type="submit" disabled={saving}><Save size={16}/>{saving?"Guardando…":"Guardar cambios"}</button>
    </form>
    <aside><div className="card">
      <div className="card-head"><h2>Integraciones</h2><Shield size={18} color="var(--lime)"/></div>
      {[["Supabase Auth","auth"],["OpenAI · asistente","ai"],["ElevenLabs · voz","speech"],["Voces configuradas","voices"],["Telefonía","telephone"]].map(([label,key])=><div key={key} className="row between" style={{marginBottom:14}}><span className="small">{label}</span><span className={"pill "+(status[key]?"":"off")}><BadgeCheck size={12}/>{status[key]?"Activo":"Pendiente"}</span></div>)}
      <div className="divider"/>
      <button type="button" className="btn danger block" onClick={onLogout}><LogOut size={16}/>Cerrar sesión</button>
    </div></aside>
  </div></div>;
}
