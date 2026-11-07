"use client";
import { useEffect,useState,type FormEvent } from "react";
import { Check, PhoneCall, PhoneForwarded, ShieldAlert, Globe2,Settings2,ArrowRight,Info } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile,CallSettings } from "@/lib/types";
const blank:CallSettings={existing_phone:"",forwarding_enabled:false,desired_language:"es",caller_language:"en",assistant_name:"Juan"};
export function CallsPanel({supabase,profile,apiStatus}:{supabase:SupabaseClient,profile:Profile,apiStatus:Record<string,boolean>}){
  const [form,setForm]=useState<CallSettings>(blank),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
  useEffect(()=>{let live=true;supabase.from("smartjob_call_settings").select("*").eq("user_id",profile.id).maybeSingle().then(({data})=>{
    if(live)setForm(data?{...blank,...data}:{...blank,existing_phone:profile.phone,desired_language:profile.owner_language,caller_language:profile.customer_language,assistant_name:profile.assistant_name});
  });return()=>{live=false};},[supabase,profile.id,profile.phone,profile.owner_language,profile.customer_language,profile.assistant_name]);
  const save=async(e:FormEvent)=>{e.preventDefault();setBusy(true);setError("");setMessage("");
    const {error}=await supabase.from("smartjob_call_settings").upsert({
      user_id:profile.id,existing_phone:form.existing_phone,forwarding_enabled:false,desired_language:form.desired_language,
      caller_language:form.caller_language,assistant_name:form.assistant_name,updated_at:new Date().toISOString()
    });
    if(error)setError(error.message);else setMessage("Preferencias guardadas. Todavía NO se ha activado el desvío ni la traducción telefónica.");
    setBusy(false);
  };
  return <div>
    <div className="hero"><div><p className="eyebrow">COMUNICACIÓN SIN FRONTERAS</p><h1>Llamadas <em>sin barreras.</em></h1><p className="muted">Conserva tu número habitual y prepara conversaciones en cualquier idioma.</p></div></div>
    <div className="gridmain">
      <div>
        <div className="call-hero row" style={{marginBottom:19}}>
          <div className="brandmark" style={{height:56,width:56,borderRadius:17}}><PhoneCall size={25}/></div>
          <div className="flex1"><strong>Traducción telefónica</strong><p className="small muted" style={{margin:"4px 0 0"}}>Se habilitará cuando esté conectado el puente telefónico.</p></div>
          <span className="pill warning"><span className="dot"/> NO ACTIVA</span>
        </div>
        <form className="card" onSubmit={save}>
          <div className="card-head"><h2>Configura tu línea</h2><Settings2 size={18} color="#9dacb7"/></div>
          <div className="field-group"><label className="label">Tu número de teléfono actual</label><input type="tel" required className="field" maxLength={25} value={form.existing_phone} onChange={e=>setForm({...form,existing_phone:e.target.value})} placeholder="+1 (706) 000-0000"/></div>
          <div className="form-grid">
            <div className="field-group"><label className="label">Idioma del profesional</label><select className="field" value={form.desired_language} onChange={e=>setForm({...form,desired_language:e.target.value})}><option value="es">Español</option><option value="en">English</option><option value="pt">Português</option><option value="fr">Français</option></select></div>
            <div className="field-group"><label className="label">Idioma del cliente</label><select className="field" value={form.caller_language} onChange={e=>setForm({...form,caller_language:e.target.value})}><option value="en">English</option><option value="es">Español</option><option value="pt">Português</option><option value="fr">Français</option></select></div>
          </div>
          <div className="field-group"><label className="label">Nombre del asistente</label><input className="field" maxLength={40} value={form.assistant_name} onChange={e=>setForm({...form,assistant_name:e.target.value})}/></div>
          <div className="notice info" style={{marginBottom:18}}><ShieldAlert size={17} style={{verticalAlign:"middle",marginRight:7}}/>Guardar este número no activa automáticamente las llamadas. No configuraremos un desvío que pueda interrumpir las llamadas actuales.</div>
          {message&&<div className="notice" style={{marginBottom:13}}>{message}</div>}{error&&<div className="notice danger" style={{marginBottom:13}}>{error}</div>}
          <button className="btn primary block" type="submit" disabled={busy}><Check size={16}/>{busy?"Guardando…":"Guardar preferencias"}</button>
        </form>
      </div>
      <aside>
        <div className="card">
          <div className="card-head"><h2>Cómo funcionará</h2><Globe2 size={18} color="var(--lime)"/></div>
          <div className="steps">
            <div className="step"><span className="num">01</span><div><strong>Tu cliente llama</strong><p className="muted small" style={{margin:"5px 0 0"}}>Marca tu número normal. No necesita instalar una app.</p></div></div>
            <div className="step"><span className="num">02</span><div><strong>Se conecta el puente</strong><p className="muted small" style={{margin:"5px 0 0"}}>Un proveedor telefónico desvía y conecta ambas voces.</p></div></div>
            <div className="step"><span className="num">03</span><div><strong>Cada uno escucha su idioma</strong><p className="muted small" style={{margin:"5px 0 0"}}>La IA interpreta en ambas direcciones con un pequeño retraso.</p></div></div>
          </div>
        </div>
        <div className="card">
          <h2 style={{marginBottom:14}}>Estado de integración</h2>
          <div className="row between small" style={{marginBottom:12}}><span>Supabase (usuarios)</span><span className="pill">{apiStatus.auth?"CONECTADO":"PENDIENTE"}</span></div>
          <div className="row between small" style={{marginBottom:12}}><span>Motor de traducción</span><span className={"pill "+(apiStatus.ai?"":"off")}>{apiStatus.ai?"CONECTADO":"PENDIENTE"}</span></div>
          <div className="row between small"><span>Telefonía bidireccional</span><span className="pill warning">PENDIENTE</span></div>
          <div className="divider"/>
          <p className="helper"><Info size={16} style={{flexShrink:0}}/>La app web no puede interceptar directamente llamadas celulares de iPhone o Android. Se necesita desvío o portabilidad y un servidor de audio de baja latencia.</p>
        </div>
        <a className="btn ghost block" href="https://www.twilio.com/docs/voice/media-streams" target="_blank" rel="noreferrer">Documentación de telefonía <ArrowRight size={16}/></a>
      </aside>
    </div>
  </div>;
}
