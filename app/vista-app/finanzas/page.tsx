"use client";
import {useCallback,useEffect,useState} from "react";
import {ArrowLeft,ArrowUpRight,BadgeCheck,Building2,CheckCircle2,Clock3,Landmark,LoaderCircle,LockKeyhole,RefreshCw,Wallet} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {loadBusinessChoices,type CentralBusiness} from "../ai-agents/centralBusiness";
import styles from "./finanzas.module.css";

type Payout={id:string;amountCents:number;status:string;arrivalDate:number;currency:string};
type FinanceStatus={
 business?:string;configured:boolean;connected:boolean;ready?:boolean;
 chargesEnabled?:boolean;payoutsEnabled?:boolean;detailsSubmitted?:boolean;
 pendingRequirements?:number;needsAttention?:boolean;mode:"test";
 availableCents?:number|null;pendingCents?:number|null;payouts?:Payout[];
 message?:string;error?:string;
};
const money=(cents:number|null|undefined)=>typeof cents==="number"&&Number.isFinite(cents)?
 new Intl.NumberFormat("es-US",{style:"currency",currency:"USD"}).format(cents/100):"—";
const date=(unix:number)=>Number.isFinite(unix)?
 new Date(unix*1000).toLocaleDateString("es-US",{month:"short",day:"numeric",year:"numeric"}):"—";

export default function VMVFinanzas(){
 const [businesses,setBusinesses]=useState<CentralBusiness[]>([]);
 const [businessId,setBusinessId]=useState("");
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [status,setStatus]=useState<FinanceStatus|null>(null);
 const [error,setError]=useState("");
 const authFetch=useCallback(async(path:string,options?:{method?:"POST",body?:string})=>{
  const client=getSupabase();if(!client)throw Error("Inicia sesión en VMV Business.");
  const {data:{session},error:authError}=await client.auth.getSession();
  if(authError||!session?.access_token)throw Error("Inicia sesión nuevamente.");
  const response=await fetch(path,{method:options?.method||"GET",cache:"no-store",
   headers:{Authorization:"Bearer "+session.access_token,
    ...(options?.method?{"Content-Type":"application/json"}:{})},
   body:options?.body});
  const payload=await response.json() as Record<string,unknown>;
  if(!response.ok)throw Error(String(payload.error||"No se pudo comunicar con Finanzas."));
  return payload;
 },[]);
 const refresh=useCallback(async(id:string)=>{
  if(!id){setStatus(null);setLoading(false);return;}
  setLoading(true);setError("");
  try{
   const payload=await authFetch("/api/vmv/finanzas/status?businessId="+encodeURIComponent(id));
   setStatus(payload as FinanceStatus);
  }catch(e){setError(e instanceof Error?e.message:"No se pudo cargar Finanzas.");setStatus(null);}
  finally{setLoading(false);}
 },[authFetch]);
 useEffect(()=>{
  let alive=true;
  void loadBusinessChoices().then(result=>{
   if(!alive)return;
   setBusinesses(result.businesses);
   const requested=new URLSearchParams(window.location.search).get("business")||"";
   const id=result.businesses.find(b=>b.id===requested)?.id||result.businesses[0]?.id||"";
   setBusinessId(id);
   if(!id)setLoading(false);
  }).catch(e=>{if(alive){setError(e instanceof Error?e.message:"No se pudieron cargar tus negocios.");setLoading(false);}});
  return()=>{alive=false;};
 },[]);
 useEffect(()=>{void refresh(businessId);},[businessId,refresh]);
 async function go(action:"onboard"|"dashboard"){
  if(!businessId||busy)return;
  setBusy(true);setError("");
  try{
   const result=await authFetch("/api/vmv/finanzas/connect",{
    method:"POST",body:JSON.stringify({businessId,action})
   });
   const url=String(result.url||"");
   const parsed=new URL(url);
   if(parsed.protocol!=="https:"||parsed.hostname!=="connect.stripe.com")
    throw Error("Stripe devolvió un enlace no válido.");
   window.location.assign(url);
  }catch(e){setError(e instanceof Error?e.message:"No se pudo abrir Stripe.");setBusy(false);}
 }
 return <main className={styles.root}>
  <div className={styles.shell}>
   <a href="/vista-app" className={styles.back}><ArrowLeft size={17}/> VMV Business</a>
   <header className={styles.heading}>
    <div className={styles.logo}><Wallet size={25}/></div>
    <div><h1>Finanzas</h1></div>
   </header>
   {businesses.length>1?<label className={styles.selectLabel}>Negocio
    <select value={businessId} onChange={e=>{setBusinessId(e.target.value);setStatus(null);}}>
     {businesses.map(b=><option value={b.id} key={b.id}>{b.name}</option>)}
    </select></label>:null}
   {businesses.length===1?<div className={styles.business}><Building2 size={18}/>{businesses[0].name}</div>:null}
   {!businessId&&!loading?<div className={styles.card}>Primero registra tu negocio desde Cuenta.</div>:null}
   {error?<p className={styles.error} role="alert">{error}</p>:null}
   {loading?<p className={styles.loading}><LoaderCircle size={17}/> Consultando Stripe…</p>:null}
   {businessId&&status&&!loading?<>
    <section className={styles.card}>
     <div className={styles.cardHead}>
      <div><h2>Stripe Connect</h2></div>
      <span className={status.ready?styles.ready:styles.pending}>
       {status.ready?"Lista para pruebas":status.connected?"Verificación pendiente":"Sin conectar"}
      </span>
     </div>
     <div className={styles.stripeMeta}><LockKeyhole size={16}/>
      <span>{status.configured?"Entorno de prueba · Sin dinero real":
       "Pruebas pendientes de configuración técnica"}</span>
     </div>
     {!status.connected?<p className={styles.note}>Stripe verificará tu identidad y banco.</p>:null}
     <button type="button" className={styles.cta} disabled={busy||!status.configured}
      onClick={()=>void go(status.ready?"dashboard":"onboard")}>
      {busy?<LoaderCircle size={17}/>:status.ready?<ArrowUpRight size={17}/>:<LockKeyhole size={17}/>}
      {busy?"Abriendo…":!status.configured?"Pendiente de activar entorno de prueba":
       status.ready?"Abrir Stripe":status.connected?"Continuar verificación":"Conectar Stripe"}
     </button>
     {status.connected&&!status.ready&&status.configured?
      <button type="button" className={styles.secondary} disabled={loading||busy}
       onClick={()=>void refresh(businessId)}><RefreshCw size={15}/> Actualizar estado</button>:null}
    </section>
    <section className={styles.grid}>
     <div className={styles.balance}><Landmark size={20}/><small>Disponible en Stripe</small>
      <strong>{money(status.availableCents)}</strong></div>
     <div className={styles.balance}><Clock3 size={20}/><small>Pendiente de liberar</small>
      <strong>{money(status.pendingCents)}</strong></div>
    </section>
    <section className={styles.card}>
     <div className={styles.cardHead}><h2>Depósitos bancarios</h2>
      {status.ready?<CheckCircle2 size={20}/>:<BadgeCheck size={20}/>}</div>
     {status.payouts?.length?
      <div className={styles.list}>{status.payouts.map(p=><div className={styles.payout} key={p.id}>
       <span>{date(p.arrivalDate)}<small>{p.status==="paid"?"Depositado":p.status==="pending"?"En camino":p.status}</small></span>
       <strong>{p.currency==="usd"?money(p.amountCents):"—"}</strong>
      </div>)}</div>:
      <p className={styles.note}>Aquí aparecerán los depósitos verificados por Stripe.</p>}
    </section>
   </>:null}
   <p className={styles.footnote}>Stripe procesa pagos y depósitos. VMV no custodia fondos.</p>
  </div>
 </main>;
}
