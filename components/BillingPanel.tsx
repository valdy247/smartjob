"use client";
import {useEffect,useState} from "react";
import type {SupabaseClient} from "@supabase/supabase-js";
import {ArrowRight,Check,ChevronDown,CreditCard,RefreshCw,Volume2} from "lucide-react";
type Plan={id:"starter"|"pro"|"premium";name:string;priceCents:number;minutes:number;topupCentsPerMinute:number;rolloverCap:number;customVoice:boolean;customGreeting:boolean};
type Overview={plans:Plan[];plan:string;status:string;subscriptionActive:boolean;periodEnd:string|null;minutes:{included:number;used:number;available:number;rollover:number;topup:number;reserved:number;temporaryHold:number;holdUntil:string|null};topup:{plan:string;minutes:number;priceCents:number;available:boolean}|null;billingMode:string;canCheckout:boolean;hasPortal:boolean;note:string};
type Preferences={editable:boolean;settings:{voice_customer:string;voice_owner:string;greeting_customer:string;greeting_owner:string}};
const defaultPrefs={voice_customer:"default",voice_owner:"default",greeting_customer:"",greeting_owner:""};
export function BillingPanel({supabase,userId,mode="full"}:{supabase:SupabaseClient;userId:string;mode?:"full"|"greetings"}){
 const [overview,setOverview]=useState<Overview|null>(null),[prefs,setPrefs]=useState<Preferences|null>(null);
 const [edit,setEdit]=useState(defaultPrefs),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const [message,setMessage]=useState(""),[showPlans,setShowPlans]=useState(false);
 const authHeaders=async()=>{const {data}=await supabase.auth.getSession();return data.session?{Authorization:"Bearer "+data.session.access_token}:null;};
 const refresh=async(preserveMessage=false)=>{
  setLoading(true);if(!preserveMessage)setMessage("");
  try{
   const h=await authHeaders();if(!h)throw new Error("Inicia sesión de nuevo.");
   const [a,b]=await Promise.all([
    fetch("/api/billing/overview",{headers:h,cache:"no-store"}),
    fetch("/api/billing/preferences",{headers:h,cache:"no-store"})
   ]);
   if(!a.ok)throw new Error("No se pudo cargar el plan.");
   setOverview(await a.json() as Overview);
   if(b.ok){const p=await b.json() as Preferences;setPrefs(p);setEdit(p.settings);}
  }catch(e){setMessage(e instanceof Error?e.message:"No se pudo cargar.");}
  finally{setLoading(false);}
 };
 useEffect(()=>{void refresh();},[userId]);
 const action=async(path:string,plan?:string)=>{
  setBusy(true);setMessage("");
  try{
   const h=await authHeaders();if(!h)throw new Error("Inicia sesión de nuevo.");
   const res=await fetch(path,{method:"POST",headers:{...h,"Content-Type":"application/json"},body:JSON.stringify(plan?{plan}:{})});
   const data=await res.json() as {url?:string};
   if(!res.ok||typeof data.url!=="string")throw new Error("No disponible en esta cuenta.");
   window.location.assign(data.url);
  }catch(e){setMessage(e instanceof Error?e.message:"No disponible.");setBusy(false);}
 };
 const save=async()=>{
  setBusy(true);setMessage("");
  try{
   const h=await authHeaders();if(!h)throw new Error("Inicia sesión de nuevo.");
   const r=await fetch("/api/billing/preferences",{method:"POST",headers:{...h,"Content-Type":"application/json"},body:JSON.stringify(edit)});
   if(!r.ok)throw new Error("No se pudo guardar.");
   await refresh(true);setMessage("Guardado.");
  }catch(e){setMessage(e instanceof Error?e.message:"No disponible.");}
  finally{setBusy(false);}
 };
 return <div className="vmv-billing">
  {mode==="full"&&<><div className="vmv-compact-card">
   <div className="vmv-between"><span className="vmv-small-label"><CreditCard size={19}/> Mi plan</span><span className="vmv-tag is-pending">{overview?.status==="active"?"Activo":"Prueba"}</span></div>
   <div className="vmv-billing-top"><div><strong>{overview?.plan==="none"?"Sin plan":overview?.plan?.toUpperCase()||"—"}</strong><small>Plan actual</small></div><div><strong>{overview?overview.minutes.available:"—"}</strong><small>Minutos restantes</small></div></div>
   <div className="vmv-billing-minutes"><span>Usados: {overview?overview.minutes.used:"—"}</span><span>Incluidos: {overview?overview.minutes.included:"—"}</span></div>
   <button className="vmv-secondary-cta" type="button" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={15}/> {loading?"Cargando…":"Actualizar"}</button>
  </div>
  <div className="vmv-compact-card">
   <button type="button" className="vmv-accordion-trigger" aria-expanded={showPlans} onClick={()=>setShowPlans(!showPlans)}><span>Planes</span><ChevronDown size={19}/></button>
   {showPlans&&<div className="vmv-billing-plans">
    {overview?.plans.map(plan=><div key={plan.id} className="vmv-billing-plan">
      <div className="vmv-between"><strong>{plan.name}</strong><strong>${(plan.priceCents/100).toFixed(2)} <small>/mes</small></strong></div>
      <p>{plan.minutes} min incluidos</p>
      <button className="vmv-secondary-cta" type="button" disabled={busy||!overview.canCheckout||overview.subscriptionActive} onClick={()=>void action("/api/billing/checkout",plan.id)}>
       {overview.subscriptionActive?"Plan vigente":overview.canCheckout?"Probar plan":"No disponible"} <ArrowRight size={15}/>
      </button>
    </div>)}
    <p className="vmv-tiny-disclaimer">Stripe en modo de prueba. Sin cargos reales.</p>
   </div>}
   {overview?.hasPortal&&<button type="button" className="vmv-secondary-cta" disabled={busy} onClick={()=>void action("/api/billing/portal")}>Gestionar suscripción <ArrowRight size={15}/></button>}
   {overview?.topup&&<button type="button" className="vmv-secondary-cta" disabled={busy||!overview.topup.available} onClick={()=>void action("/api/billing/topup",overview.topup!.plan)}>Recargar {overview.topup.minutes} min · ${(overview.topup.priceCents/100).toFixed(2)}</button>}
  </div></>}
  <details open={mode==="greetings"?true:undefined} className="vmv-compact-card vmv-voice-prefs">
   <summary><Volume2 size={19}/> Voces y saludos <ChevronDown size={17}/></summary>
   <p className="vmv-muted vmv-greeting-explainer">Todos los planes incluyen selección de idioma. El saludo personalizado se reproduce antes del menú.</p>
   {prefs?<><div className="form-grid">
    <div><label className="label" htmlFor="vmv-voice-owner">Tu voz</label><select id="vmv-voice-owner" className="field" value={edit.voice_owner} disabled={!prefs.editable||busy} onChange={e=>setEdit({...edit,voice_owner:e.target.value})}><option value="default">Estándar</option><option value="bright">Clara</option><option value="calm">Serena</option></select></div>
    <div><label className="label" htmlFor="vmv-voice-customer">Voz del cliente</label><select id="vmv-voice-customer" className="field" value={edit.voice_customer} disabled={!prefs.editable||busy} onChange={e=>setEdit({...edit,voice_customer:e.target.value})}><option value="default">Estándar</option><option value="bright">Clara</option><option value="calm">Serena</option></select></div>
   </div>
   <label className="label" htmlFor="vmv-greeting-owner">Mensaje para ti al traducir</label><textarea id="vmv-greeting-owner" className="field" rows={2} maxLength={180} value={edit.greeting_owner} disabled={!prefs.editable||busy} onChange={e=>setEdit({...edit,greeting_owner:e.target.value})}/>
   <label className="label" htmlFor="vmv-greeting-customer">Saludo inicial (antes de elegir idioma)</label><textarea id="vmv-greeting-customer" className="field" rows={3} maxLength={180} placeholder="Gracias por llamar. Para continuar..." value={edit.greeting_customer} disabled={!prefs.editable||busy} onChange={e=>setEdit({...edit,greeting_customer:e.target.value})}/><p className="vmv-tiny-disclaimer">{edit.greeting_customer.length}/180 caracteres</p>
   <button type="button" className="btn primary block" disabled={!prefs.editable||busy} onClick={()=>void save()}><Check size={16}/> Guardar</button>
   {!prefs.editable&&<p className="vmv-tiny-disclaimer">Personalización disponible en Pro y Premium activos.</p>}
   </>:<p className="vmv-muted">No disponible.</p>}
  </details>
  {message&&<p role="status" className="notice info vmv-inline-feedback">{message}</p>}
 </div>;
}
