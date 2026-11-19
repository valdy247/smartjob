"use client";
import {useState} from "react";
import {ArrowLeft,Check,LoaderCircle,Search,ShieldCheck} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import css from "./SmartCallLineRequest.module.css";
type NumberOption={phone:string;location:string;region:string};
type Props={businessId:string;choice:"different"|"new";onReturn:()=>void;onClose:()=>void};
export default function SmartCallLineRequest({businessId,choice,onReturn,onClose}:Props){
 const [phone,setPhone]=useState(""),[area,setArea]=useState("706");
 const [results,setResults]=useState<NumberOption[]>([]),[selected,setSelected]=useState("");
 const [busy,setBusy]=useState(""),[error,setError]=useState(""),[saved,setSaved]=useState(false);
 const valid=choice==="different"?/^\+[1-9]\d{7,14}$/.test(phone):/^[2-9]\d{2}$/.test(area);
 const session=async()=>{
  const db=getSupabase();if(!db)throw Error("No se pudo abrir la sesión.");
  const {data:{user},error:authError}=await db.auth.getUser();
  const {data:{session}}=await db.auth.getSession();
  if(authError||!user||user.is_anonymous||!session?.access_token)throw Error("Inicia sesión para continuar.");
  return {db,user,token:session.access_token};
 };
 const search=async()=>{
  setBusy("search");setError("");setResults([]);setSelected("");
  try{
   const {token}=await session();
   const response=await fetch("/api/vmv/ai-agents/available-numbers?area="+encodeURIComponent(area),{
    headers:{"Authorization":"Bearer "+token},cache:"no-store"});
   const data=await response.json();
   if(!response.ok)throw Error(String(data.error||"No se pudo consultar Twilio."));
   setResults((data.numbers||[]) as NumberOption[]);
  }catch(e){setError(e instanceof Error?e.message:"No se pudo buscar números.");}
  finally{setBusy("");}
 };
 const submit=async()=>{
  if(!valid||busy||saved)return;
  if(!window.confirm(choice==="different"?
   "¿Enviar la solicitud para verificar este número? No cambiaremos tu línea actual.":
   "¿Guardar esta solicitud de número? No se reservará ni comprará todavía."))return;
  setBusy("save");setError("");
  try{
   const {db,user}=await session();
   const {error:insertError}=await db.from("vmv_smart_call_line_requests").insert({
    owner_id:user.id,business_id:businessId,kind:choice==="different"?"existing":"new",
    existing_phone:choice==="different"?phone.trim():null,
    country:"US",area_code:choice==="new"?area:"",
    candidate_number:choice==="new"&&selected?selected:null,status:"pending"
   });
   if(insertError)throw Error("No se pudo registrar la solicitud. Verifica que el negocio pertenezca a tu cuenta.");
   setSaved(true);
  }catch(e){setError(e instanceof Error?e.message:"No se pudo guardar.");}
  finally{setBusy("");}
 };
 return <div className={css.root}>
  {saved?<div className={css.success}><Check size={25}/>
   <strong>Solicitud registrada</strong>
   <p>{choice==="different"?"Falta verificar que el número te pertenece.":"Falta confirmar el precio y disponibilidad antes de comprar."}
    Mientras tanto, tu número VMV actual permanece sin cambios.</p>
   <button type="button" className={css.primary} onClick={onReturn}>Usar línea actual mientras tanto</button>
   <button type="button" className={css.secondary} onClick={onClose}>Volver a AI Agents</button>
  </div>:<>
   <p className={css.intro}>{choice==="different"?
    "Indica el número que ya tienes. El agente registrará la solicitud y se deberá verificar tu titularidad antes de cambiar la ruta.":
    "Busca un número local disponible. La disponibilidad no es una reserva y el precio se confirmará antes de la compra."}</p>
   {choice==="different"?<label className={css.field}>Número que deseas conectar
    <input type="tel" inputMode="tel" placeholder="+17065551234" maxLength={16}
     value={phone} onChange={e=>setPhone(e.target.value.trim())}/>
    <small>Formato internacional, por ejemplo +17065551234. No se enviará un SMS sin tu autorización.</small>
   </label>:<div className={css.search}>
    <label className={css.field}>Código de área de Estados Unidos
     <input inputMode="numeric" maxLength={3} placeholder="706" value={area}
      onChange={e=>{setArea(e.target.value.replace(/[^0-9]/g,"").slice(0,3));setResults([]);setSelected("");}}/>
    </label>
    <button type="button" className={css.secondary} onClick={()=>void search()}
     disabled={busy!==""||!/^[2-9]\d{2}$/.test(area)}><Search size={15}/> {busy==="search"?"Buscando…":"Buscar en Twilio"}</button>
    {results.length?<div className={css.numbers}>{results.map(n=><label key={n.phone} className={css.number}>
     <input type="radio" checked={selected===n.phone} onChange={()=>setSelected(n.phone)}/>
     <span><strong>{n.phone}</strong><small>{[n.location,n.region].filter(Boolean).join(", ")}</small></span>
    </label>)}</div>:null}
    {!results.length&&!busy?<small>Si no encuentras un número, puedes solicitar uno sin seleccionarlo.</small>:null}
   </div>}
   {error?<p className={css.error} role="alert">{error}</p>:null}
   <div className={css.notice}><ShieldCheck size={17}/>
    <span>Una solicitud no es una activación. No se compra, reserva ni cambia una línea de Twilio.</span>
   </div>
   <button type="button" className={css.primary} onClick={()=>void submit()} disabled={!valid||busy!==""}>
    {busy==="save"?<LoaderCircle size={17}/>:<Check size={17}/>}
    {busy==="save"?"Guardando…":"Enviar solicitud para revisión"}</button>
   <button type="button" className={css.secondary} onClick={onReturn}><ArrowLeft size={17}/> Regresar a las opciones</button>
  </>}
 </div>;
}
