"use client";
import {useEffect,useState} from "react";
import type {SupabaseClient} from "@supabase/supabase-js";
import {ArrowLeft,ArrowRight,CheckCircle2,CreditCard,Phone,ShieldCheck,Smartphone} from "lucide-react";
import {Brand} from "./Brand";
import type {Profile} from "@/lib/types";

type PlanCode="starter"|"pro"|"premium";
type Plan={id:PlanCode;name:string;priceCents:number;minutes:number};
type Overview={plans:Plan[];subscriptionActive:boolean;canCheckout:boolean;billingMode:string;note:string};
type Phase="plans"|"setup"|"done";
const carriers=[["verizon","Verizon"],["att","AT&T"],["tmobile","T-Mobile"],["xfinity","Xfinity Mobile"],
 ["spectrum","Spectrum Mobile"],["cricket","Cricket Wireless"],["metro","Metro by T-Mobile"],
 ["boost","Boost Mobile"],["googlefi","Google Fi"],["visible","Visible"],["mint","Mint Mobile"],
 ["straighttalk","Straight Talk"],["other","Otro operador"]] as const;
export function ActivationFlow({profile,supabase,onSaved,onExit}:{profile:Profile;supabase:SupabaseClient;onSaved:(p:Profile)=>void;onExit:()=>void}){
 const [phase,setPhase]=useState<Phase>(profile.plan_prompt_seen?"setup":"plans"),[step,setStep]=useState(0);
 const [overview,setOverview]=useState<Overview|null>(null),[loading,setLoading]=useState(true);
 const [chosen,setChosen]=useState<PlanCode|null>(profile.preferred_plan||null);
 const [lineChoice,setLineChoice]=useState<"keep"|"new">(profile.line_choice||"keep");
 const [ownerLanguage,setOwnerLanguage]=useState(profile.owner_language==="en"?"en":"es");
 const [assistant,setAssistant]=useState(profile.assistant_name||"Juan"),[carrier,setCarrier]=useState("other");
 const [confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
 useEffect(()=>{
  let alive=true;
  (async()=>{
   try{
    const {data}=await supabase.auth.getSession();
    if(!data.session)throw Error("Inicia sesión de nuevo.");
    const res=await fetch("/api/billing/overview",{headers:{Authorization:"Bearer "+data.session.access_token},cache:"no-store"});
    if(!res.ok)throw Error("No se pudieron consultar los planes.");
    if(alive)setOverview(await res.json() as Overview);
   }catch(e){if(alive)setError(e instanceof Error?e.message:"Los planes no están disponibles.");}
   finally{if(alive)setLoading(false);}
  })();
  return()=>{alive=false;};
 },[supabase,profile.id]);
 const persist=async(values:Record<string,unknown>)=>{
  const {data,error:saveError}=await supabase.from("smartjob_profiles")
   .update({...values,updated_at:new Date().toISOString()}).eq("id",profile.id).select("*").single();
  if(saveError||!data)throw Error("No se pudo guardar. Intenta otra vez.");
  onSaved(data as Profile);return data as Profile;
 };
 const skip=async()=>{
  if(busy)return;setBusy(true);setError("");
  try{await persist({plan_prompt_seen:true,preferred_plan:null,line_setup_completed:false});onExit();}
  catch(e){setError(e instanceof Error?e.message:"No se pudo omitir.");}finally{setBusy(false);}
 };
 const finish=async()=>{
  if(!chosen){setError("Selecciona un plan.");return;}
  if(!assistant.trim()||assistant.trim().length>40){setError("Introduce el nombre del asistente.");return;}
  if(!confirmed){setError("Confirma el proceso de activación.");return;}
  setBusy(true);setError("");
  try{
   // Save non-billable settings only. No provider APIs, forwarding or number purchase.
   const {error:settingsError}=await supabase.from("smartjob_call_settings").upsert({
    user_id:profile.id,existing_phone:profile.phone,forwarding_enabled:false,
    desired_language:ownerLanguage,caller_language:ownerLanguage==="es"?"en":"es",
    assistant_name:assistant.trim(),updated_at:new Date().toISOString()
   },{onConflict:"user_id"});
   if(settingsError)throw Error("No pudimos guardar las preferencias de llamadas.");
   await persist({line_choice:lineChoice,preferred_plan:chosen,plan_prompt_seen:true,
    line_setup_completed:true,assistant_name:assistant.trim(),owner_language:ownerLanguage,
    customer_language:ownerLanguage==="es"?"en":"es"});
   setPhase("done");
  }catch(e){setError(e instanceof Error?e.message:"No se pudo guardar.");}
  finally{setBusy(false);}
 };
 const checkout=async()=>{
  if(!chosen||!overview?.canCheckout||busy)return;
  setBusy(true);setError("");
  try{
   const {data}=await supabase.auth.getSession();if(!data.session)throw Error("Sesión vencida.");
   const res=await fetch("/api/billing/checkout",{method:"POST",headers:{
    Authorization:"Bearer "+data.session.access_token,"Content-Type":"application/json"
   },body:JSON.stringify({plan:chosen})});
   const result=await res.json();
   if(!res.ok||typeof result.url!=="string"||!result.url.startsWith("https://checkout.stripe.com/"))
    throw Error("Stripe de prueba no está disponible.");
   window.location.assign(result.url);
  }catch(e){setError(e instanceof Error?e.message:"No se pudo abrir Stripe.");setBusy(false);}
 };
 const planName=overview?.plans.find(p=>p.id===chosen)?.name||chosen||"";
 return <main className="vmv-activation-shell">
  <header className="vmv-activation-header"><Brand/><span><ShieldCheck size={17}/> Configuración segura</span></header>
  <section className="vmv-activation-card">
   {phase==="plans"?<>
    <p className="vmv-activation-eyebrow">PRIMER ACCESO · 1 DE 2</p>
    <h1>Elige tu plan<span>.</span></h1><p className="vmv-activation-subtitle">Puedes elegir un plan o continuar sin activar llamadas.</p>
    {loading?<p>Cargando planes…</p>:overview?<div className="vmv-activation-plans">
     {overview.plans.map(plan=><button type="button" key={plan.id} className="vmv-activation-plan"
      onClick={()=>{setChosen(plan.id);setPhase("setup");setStep(0);setError("");}}>
      <div className="vmv-activation-between"><strong>{plan.name}</strong><span>{"$"}{(plan.priceCents/100).toFixed(2)} <small>/mes</small></span></div>
      <p><Phone size={16}/> {plan.minutes} min de traducción</p>
      <span className="vmv-activation-plan-button">Elegir plan <ArrowRight size={16}/></span>
     </button>)}
    </div>:<p role="status">No hay planes disponibles. Puedes omitir y volver luego desde Ajustes.</p>}
    <p className="vmv-activation-warning"><ShieldCheck size={17}/> Precios de referencia: Stripe está en modo de prueba. Una selección no equivale a un pago real.</p>
    <button type="button" className="vmv-activation-skip" onClick={()=>void skip()} disabled={busy}>
     {busy?"Guardando…":"Omitir por ahora"} <ArrowRight size={17}/></button>
    <small>Sin un plan real confirmado, la recepción de llamadas y las funciones de IA de pago estarán bloqueadas.</small>
   </>:phase==="setup"?<>
    <div className="vmv-activation-between">
     <button type="button" className="vmv-activation-back" onClick={()=>{setError("");if(step===0)setPhase("plans");else setStep(step-1);}}><ArrowLeft size={17}/> Atrás</button>
     <span className="vmv-activation-eyebrow">PLAN {planName.toUpperCase()}</span>
    </div>
    <div className="vmv-activation-progress"><span style={{width:(step+1)/3*100+"%"}}/></div>
    <p className="vmv-activation-eyebrow">CONFIGURACIÓN · {step+1} DE 3</p>
    {step===0&&<>
     <h1>Tu número<span>.</span></h1><p className="vmv-activation-subtitle">¿Cómo quieres recibir llamadas?</p>
     <div className="vmv-activation-line-picks">
      <button type="button" aria-pressed={lineChoice==="keep"} className={lineChoice==="keep"?"selected":""} onClick={()=>setLineChoice("keep")}>
       <Phone size={23}/><strong>Conservar mi número</strong><small>Conectarlo con tu operador mediante desvío, después de verificar.</small></button>
      <button type="button" aria-pressed={lineChoice==="new"} className={lineChoice==="new"?"selected":""} onClick={()=>setLineChoice("new")}>
       <Smartphone size={23}/><strong>Solicitar número nuevo</strong><small>Asignación revisada después de confirmar el pago.</small></button>
     </div>
     <p className="vmv-activation-subtitle">Tu teléfono de contacto: <strong>{profile.phone}</strong></p>
    </>}
    {step===1&&<>
     <h1>Tu conversación<span>.</span></h1><p className="vmv-activation-subtitle">Elige cómo escucharás a tus clientes.</p>
     <div className="vmv-activation-fields">
      <label htmlFor="vmv-setup-language">Idioma principal</label>
      <select id="vmv-setup-language" value={ownerLanguage} onChange={e=>setOwnerLanguage(e.target.value==="en"?"en":"es")}>
       <option value="es">🇪🇸 Español ↔ 🇺🇸 English</option><option value="en">🇺🇸 English ↔ 🇪🇸 Español</option></select>
      <label htmlFor="vmv-setup-name">Nombre del asistente</label>
      <input id="vmv-setup-name" maxLength={40} value={assistant} onChange={e=>setAssistant(e.target.value)}/>
      {lineChoice==="keep"&&<><label htmlFor="vmv-setup-carrier">Operador</label>
       <select id="vmv-setup-carrier" value={carrier} onChange={e=>setCarrier(e.target.value)}>
        {carriers.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></>}
     </div>
     <p className="vmv-activation-subtitle">Recibirás llamadas en la app de iPhone cuando se apruebe la línea. No activaremos desvíos desde aquí.</p>
    </>}
    {step===2&&<>
     <h1>Revisa todo<span>.</span></h1>
     <div className="vmv-activation-review">
      <p><Phone size={18}/>{lineChoice==="keep"?"Conservar mi número":"Solicitar número nuevo"}</p>
      <p><Smartphone size={18}/>Recepción en app iPhone</p>
      <p><CreditCard size={18}/>{planName} · aún sin cobro real</p>
     </div>
     <label className="vmv-activation-consent"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>
      <span>Comprendo que la recepción requiere pago real confirmado, verificación y aprobación. No se compra un número automáticamente.</span>
     </label>
    </>}
    <button type="button" className="vmv-activation-primary" disabled={busy||step===2&&!confirmed}
     onClick={()=>{setError("");if(step<2)setStep(step+1);else void finish();}}>
     {busy?"Guardando…":step===2?"Guardar configuración":"Siguiente"} <ArrowRight size={18}/></button>
   </>:<>
    <div className="vmv-activation-finished"><CheckCircle2 size={44}/>
     <h1>Preferencias listas<span>.</span></h1>
     <p>Elegiste {planName}. La línea sigue desactivada hasta verificar un pago real.</p>
     {overview?.canCheckout&&<button type="button" className="vmv-activation-primary" onClick={()=>void checkout()} disabled={busy}>
      {busy?"Abriendo…":"Simular pago con Stripe TEST"} <ArrowRight size={17}/></button>}
     <button type="button" className="vmv-activation-skip" onClick={onExit}>Ir a mi espacio <ArrowRight size={17}/></button>
    </div>
   </>}
   {error&&<p role="alert" className="vmv-activation-error">{error}</p>}
  </section>
 </main>;
}
