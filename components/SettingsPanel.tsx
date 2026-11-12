"use client";
import {useState,type FormEvent} from "react";
import {Check,ChevronDown,UserRound} from "lucide-react";
import type {SupabaseClient} from "@supabase/supabase-js";
import type {Profile} from "@/lib/types";
import {useInterfaceLanguage} from "@/lib/i18n-web";
export function SettingsPanel({profile,supabase,onChange}:{profile:Profile;supabase:SupabaseClient;onChange:(p:Profile)=>void;onLogout:()=>void;status:Record<string,boolean>}){
 const {translate}=useInterfaceLanguage();
 const [form,setForm]=useState(profile),[saving,setSaving]=useState(false),[message,setMessage]=useState("");
 const save=async(e:FormEvent)=>{
  e.preventDefault();setSaving(true);setMessage("");
  const {error}=await supabase.from("smartjob_profiles").upsert({...form,updated_at:new Date().toISOString()});
  if(error)setMessage(translate("common.saveError"));else{onChange(form);setMessage(translate("common.saved"));}
  setSaving(false);
 };
 return <form className="vmv-profile-form vmv-compact-card" onSubmit={save}>
  <div className="vmv-between"><h2><UserRound size={19}/> {translate("settings.personalDetails")}</h2></div>
  <div className="form-grid">
   <div><label className="label" htmlFor="vmv-first-name">{translate("common.firstName")}</label><input id="vmv-first-name" className="field" required value={form.first_name} onChange={e=>setForm({...form,first_name:e.target.value})}/></div>
   <div><label className="label" htmlFor="vmv-last-name">{translate("common.lastName")}</label><input id="vmv-last-name" className="field" required value={form.last_name} onChange={e=>setForm({...form,last_name:e.target.value})}/></div>
  </div>
  <label className="label" htmlFor="vmv-profile-phone">{translate("common.phone")}</label><input id="vmv-profile-phone" className="field" required type="tel" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/>
  <details className="vmv-profile-details">
   <summary><span>{translate("settings.professionalDetails")}</span><ChevronDown size={18}/></summary>
   <label className="label" htmlFor="vmv-occupation">{translate("common.occupation")}</label><input id="vmv-occupation" className="field" value={form.occupation} onChange={e=>setForm({...form,occupation:e.target.value})}/>
   <div className="form-grid"><div><label className="label" htmlFor="vmv-city">{translate("common.city")}</label><input id="vmv-city" className="field" value={form.city} onChange={e=>setForm({...form,city:e.target.value})}/></div><div><label className="label" htmlFor="vmv-state">{translate("common.state")}</label><input id="vmv-state" className="field" value={form.state} onChange={e=>setForm({...form,state:e.target.value})}/></div></div>
   <label className="label" htmlFor="vmv-assistant">{translate("common.assistant")}</label><input id="vmv-assistant" className="field" required maxLength={40} value={form.assistant_name} onChange={e=>setForm({...form,assistant_name:e.target.value})}/>
  </details>
  <details className="vmv-profile-details">
   <summary><span>{translate("settings.callLanguages")}</span><ChevronDown size={18}/></summary>
   <div className="form-grid"><div><label className="label">{translate("settings.spokenYourLanguage")}</label><select className="field" value={form.owner_language} onChange={e=>setForm({...form,owner_language:e.target.value})}><option value="es">Español</option><option value="en">English</option><option value="pt">Português</option><option value="fr">Français</option></select></div>
   <div><label className="label">{translate("settings.spokenCustomer")}</label><select className="field" value={form.customer_language} onChange={e=>setForm({...form,customer_language:e.target.value})}><option value="en">English</option><option value="es">Español</option><option value="pt">Português</option><option value="fr">Français</option></select></div></div>
  </details>
  <button className="btn primary block" disabled={saving} type="submit"><Check size={17}/>{translate(saving?"common.saving":"common.save")}</button>
  {message&&<p role="status" className="vmv-muted">{message}</p>}
 </form>;
}
