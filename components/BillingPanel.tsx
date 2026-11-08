"use client";
import {useEffect,useState} from "react";
import type {SupabaseClient} from "@supabase/supabase-js";
import {BadgeCheck,CreditCard,Languages,Volume2} from "lucide-react";

type Plan={id:"starter"|"pro"|"premium";name:string;priceCents:number;minutes:number;
 topupCentsPerMinute:number;rolloverCap:number;customVoice:boolean;customGreeting:boolean};
type Overview={plans:Plan[];plan:string;status:string;subscriptionActive:boolean;
 periodEnd:string|null;minutes:{included:number;used:number;available:number;rollover:number;topup:number;reserved:number};
 topup:{plan:string;minutes:number;priceCents:number;available:boolean}|null;
 billingMode:string;canCheckout:boolean;hasPortal:boolean;note:string};
type Preferences={editable:boolean;settings:{voice_customer:string;voice_owner:string;
 greeting_customer:string;greeting_owner:string}};
const defaultPrefs={voice_customer:"default",voice_owner:"default",greeting_customer:"",greeting_owner:""};
export function BillingPanel({supabase,userId}:{supabase:SupabaseClient;userId:string}){
 const [overview,setOverview]=useState<Overview|null>(null);
 const [prefs,setPrefs]=useState<Preferences|null>(null);
 const [edit,setEdit]=useState(defaultPrefs);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const headers=async()=>{
  const {data}=await supabase.auth.getSession();
  return data.session?{Authorization:"Bearer "+data.session.access_token}:null;
 };
 const refresh=async()=>{
  const h=await headers();if(!h)return;
  const [a,b]=await Promise.all([
   fetch("/api/billing/overview",{headers:h,cache:"no-store"}),
   fetch("/api/billing/preferences",{headers:h,cache:"no-store"})
  ]);
  if(a.ok)setOverview(await a.json());
  if(b.ok){const p=await b.json() as Preferences;setPrefs(p);setEdit(p.settings);}
 };
 useEffect(()=>{void refresh();},[userId]);
 const action=async(path:string,plan?:string)=>{
  setBusy(true);setMessage("");
  try{
   const h=await headers();
   if(!h)throw new Error("Inicia sesión nuevamente.");
   const res=await fetch(path,{method:"POST",headers:{...h,"Content-Type":"application/json"},
    body:JSON.stringify(plan?{plan}:{})});
   const data=await res.json();
   if(!res.ok||typeof data.url!=="string")throw new Error("La facturación aún no está configurada.");
   window.location.assign(data.url);
  }catch(e){setMessage(e instanceof Error?e.message:"No disponible.");setBusy(false);}
 };
 const save=async()=>{
  setBusy(true);setMessage("");
  try{
   const h=await headers();if(!h)throw new Error("Inicia sesión nuevamente.");
   const res=await fetch("/api/billing/preferences",{method:"POST",
    headers:{...h,"Content-Type":"application/json"},body:JSON.stringify(edit)});
   if(!res.ok)throw new Error("No se pudieron guardar las preferencias.");
   setMessage("Preferencias guardadas. Se aplicarán a las siguientes llamadas.");
   await refresh();
  }catch(e){setMessage(e instanceof Error?e.message:"No disponible.");}
  finally{setBusy(false);}
 };
 return <section className="card" style={{marginTop:20}}>
  <div className="card-head"><h2>Planes y minutos · VMV Call</h2><CreditCard size={18} color="var(--lime)"/></div>
  <p className="small muted">Los planes son una vista previa. Stripe solo está conectado en modo de prueba; no se emitirán cargos reales.</p>
  {overview?<div>
   <div className="row between small" style={{marginTop:16}}>
    <span>Tu plan</span><strong>{overview.plan==="none"?"Sin suscripción":overview.plan.toUpperCase()} · {overview.status}</strong>
   </div>
   <div className="row between small" style={{marginTop:11}}>
    <span>Minutos disponibles</span><strong>{overview.minutes.available}</strong>
   </div>
   <div className="row between small" style={{marginTop:11}}>
    <span>Consumidos este ciclo</span><strong>{overview.minutes.used}</strong>
   </div>
   <div className="form-grid" style={{marginTop:20}}>
    {overview.plans.map(plan=><div key={plan.id} className="card" style={{padding:16}}>
      <strong>{plan.name}</strong>
      <h3 style={{margin:"10px 0"}}>${(plan.priceCents/100).toFixed(2)}<span className="small muted"> / mes</span></h3>
      <p className="small muted">{plan.minutes} minutos, recargas a ${(plan.topupCentsPerMinute/100).toFixed(2)}/min</p>
      {plan.customVoice?<p className="small muted"><BadgeCheck size={13}/> Voces y saludos personalizados</p>:null}
      {plan.rolloverCap?<p className="small muted">Acumulación limitada: {plan.rolloverCap} min</p>:null}
      <button className="btn primary block" type="button" style={{marginTop:12}}
       disabled={busy||!overview.canCheckout||overview.subscriptionActive}
       onClick={()=>void action("/api/billing/checkout",plan.id)}>
       {overview.subscriptionActive?"Gestiona tu plan":overview.canCheckout?"Probar suscripción":"Próximamente"}
      </button>
    </div>)}
   </div>
   {overview.topup?<div className="notice info" style={{marginTop:16}}>
     <strong>Recargar minutos</strong>
     <p className="small muted" style={{marginTop:7}}>
       {overview.topup.minutes} minutos adicionales por ${(overview.topup.priceCents/100).toFixed(2)}. Se suman a tu saldo disponible.
     </p>
     <button className="btn primary block" type="button" style={{marginTop:12}}
      disabled={busy||!overview.topup.available}
      onClick={()=>void action("/api/billing/topup",overview.topup!.plan)}>
      {overview.topup.available?"Comprar minutos de prueba":"Recargas próximamente"}
     </button>
   </div>:null}
   {overview.hasPortal?<button className="btn primary block" type="button"
    disabled={busy} style={{marginTop:16}} onClick={()=>void action("/api/billing/portal")}>
    Gestionar suscripción en Stripe
   </button>:null}
   <p className="small muted" style={{marginTop:12}}>{overview.note}</p>
  </div>:<p className="small muted" style={{marginTop:14}}>Cargando el estado de tu suscripción…</p>}
  <div className="divider" style={{margin:"22px 0"}}/>
  <div className="card-head"><h2>Personalización de voz</h2><Volume2 size={18} color="var(--lime)"/></div>
  <p className="small muted">Pro y Premium pueden elegir voces de catálogo y cambiar el mensaje inicial. No clonamos voces.</p>
  {prefs?<div style={{marginTop:15}}>
   <div className="form-grid">
    <div className="field-group"><label className="label">Voz del cliente (inglés)</label>
     <select className="field" value={edit.voice_customer} disabled={!prefs.editable||busy}
      onChange={e=>setEdit({...edit,voice_customer:e.target.value})}>
      <option value="default">Estándar</option><option value="bright">Clara</option><option value="calm">Serena</option>
     </select>
    </div>
    <div className="field-group"><label className="label">Voz para ti (español)</label>
     <select className="field" value={edit.voice_owner} disabled={!prefs.editable||busy}
      onChange={e=>setEdit({...edit,voice_owner:e.target.value})}>
      <option value="default">Estándar</option><option value="bright">Clara</option><option value="calm">Serena</option>
     </select>
    </div>
    <div className="field-group full"><label className="label">Saludo inicial para clientes en inglés</label>
     <input className="field" maxLength={180} value={edit.greeting_customer}
      placeholder="Welcome! This call is translated by AI."
      disabled={!prefs.editable||busy}
      onChange={e=>setEdit({...edit,greeting_customer:e.target.value})}/>
    </div>
    <div className="field-group full"><label className="label">Saludo inicial para ti en español</label>
     <input className="field" maxLength={180} value={edit.greeting_owner}
      placeholder="Esta llamada cuenta con traducción por IA."
      disabled={!prefs.editable||busy}
      onChange={e=>setEdit({...edit,greeting_owner:e.target.value})}/>
    </div>
   </div>
   <button className="btn primary block" type="button" disabled={!prefs.editable||busy}
    onClick={()=>void save()} style={{marginTop:12}}><Languages size={16}/>Guardar personalización</button>
   {!prefs.editable?<p className="small muted" style={{marginTop:12}}>
    Disponible al tener una suscripción Pro o Premium activa.
   </p>:null}
  </div>:null}
  {message?<div role="status" className="notice info" style={{marginTop:12}}>{message}</div>:null}
 </section>;
}
