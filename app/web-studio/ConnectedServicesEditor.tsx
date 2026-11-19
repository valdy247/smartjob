"use client";
import {useCallback,useEffect,useState} from "react";
import {Check,Plus,RefreshCw,X} from "lucide-react";
import {getSupabase} from "@/lib/supabase";

export type ConnectedService={
 id:string;name:string;description:string;price_cents:number|null;
 duration_minutes:number;approved:boolean;active:boolean;updated_at:string;
};
type Form={name:string;description:string;price:string;duration:string;approved:boolean;active:boolean;confirmed:boolean};
const empty:Form={name:"",description:"",price:"",duration:"60",approved:true,active:true,confirmed:false};
const money=(c:number|null)=>c===null?"Precio por confirmar":"$"+(c/100).toFixed(2);
export default function ConnectedServicesEditor({workspaceId,onChange}:{
 workspaceId:string;onChange:(items:ConnectedService[])=>void;
}){
 const [items,setItems]=useState<ConnectedService[]>([]);
 const [form,setForm]=useState<Form>(empty);
 const [editing,setEditing]=useState<ConnectedService|null>(null);
 const [show,setShow]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const [loading,setLoading]=useState(true);
 const refresh=useCallback(async()=>{
  const db=getSupabase();if(!db)throw Error("No se pudo acceder a VMV.");
  const {data:{user},error:authError}=await db.auth.getUser();
  if(authError||!user||user.is_anonymous)throw Error("Inicia sesión para consultar tus servicios.");
  const {data,error}=await db.from("vmv_ai_booking_services")
   .select("id,name,description,price_cents,duration_minutes,approved,active,updated_at")
   .eq("owner_id",user.id).eq("business_id",workspaceId)
   .order("name",{ascending:true}).limit(100);
  if(error)throw Error("No se pudieron cargar los servicios de AI Agents.");
  const services=(data||[]) as ConnectedService[];
  setItems(services);onChange(services);setError("");
 },[workspaceId,onChange]);
 useEffect(()=>{
  let active=true;
  setLoading(true);setItems([]);onChange([]);
  void refresh().catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)});
  const onFocus=()=>{if(document.visibilityState==="visible")void refresh().catch(()=>{});};
  window.addEventListener("focus",onFocus);
  document.addEventListener("visibilitychange",onFocus);
  return()=>{active=false;window.removeEventListener("focus",onFocus);
   document.removeEventListener("visibilitychange",onFocus);};
 },[refresh,onChange]);
 function open(item:ConnectedService|null){
  setEditing(item);setForm(item?{name:item.name,description:item.description,
   price:item.price_cents===null?"":(item.price_cents/100).toFixed(2),
   duration:String(item.duration_minutes),approved:item.approved,active:item.active,
   confirmed:false}:empty);
  setShow(true);setError("");
 }
 async function save(){
  if(busy||!form.confirmed)return;
  setBusy(true);setError("");
  try{
   const name=form.name.trim(),description=form.description.trim();
   if(name.length<2||name.length>120)throw Error("Escribe el nombre del servicio.");
   const duration=Number(form.duration);
   if(!Number.isInteger(duration)||duration<15||duration>240)throw Error("Duración: entre 15 y 240 minutos.");
   if(form.price.trim()&&!/^(0|[1-9]\d{0,4})(\.\d{1,2})?$/.test(form.price.trim()))
    throw Error("El precio debe ser un importe USD válido.");
   const price_cents=form.price.trim()?Math.round(Number(form.price)*100):null;
   const db=getSupabase();if(!db)throw Error("VMV no está disponible.");
   const {data:{user},error:authError}=await db.auth.getUser();
   if(authError||!user||user.is_anonymous)throw Error("Inicia sesión.");
   const {data:workspace,error:workError}=await db.from("vmv_ai_businesses")
    .select("id").eq("id",workspaceId).eq("owner_id",user.id).maybeSingle();
   if(workError||!workspace)throw Error("El negocio seleccionado no está disponible.");
   const value={name,description:description.slice(0,700),
    price_cents,duration_minutes:duration,approved:form.approved,
    active:form.active,currency:"usd",owner_id:user.id,
    business_id:workspaceId,
    updated_at:new Date().toISOString()};
   if(editing){
    const {data,error}=await db.from("vmv_ai_booking_services").update(value)
     .eq("id",editing.id).eq("owner_id",user.id).eq("business_id",workspaceId)
     .eq("updated_at",editing.updated_at).select("id").maybeSingle();
    if(error||!data)throw Error("El servicio cambió en otro dispositivo. Actualiza para evitar sobrescribirlo.");
   }else{
    const {error}=await db.from("vmv_ai_booking_services").insert(value);
    if(error)throw Error("No se pudo añadir el servicio a AI Agents.");
   }
   await refresh();setShow(false);setEditing(null);setForm(empty);
  }catch(e){setError(e instanceof Error?e.message:"No se pudo guardar el servicio.");}
  finally{setBusy(false);}
 }
 return <section className="vmv-connected-services">
  <header><strong>Servicios de AI Agents</strong>
   <button type="button" disabled={busy} onClick={()=>void refresh().catch(e=>setError(e.message))}
    aria-label="Actualizar servicios"><RefreshCw size={16}/></button>
  </header>
  <p>Siempre se leen del negocio seleccionado. Solo los activos y aprobados se mostrarán en la web pública.</p>
  {loading?<p role="status">Cargando servicios…</p>:
   <div className="vmv-connected-items">{items.map(item=><div key={item.id}>
    <span><strong>{item.name}</strong>
     <small>{money(item.price_cents)} · {item.approved&&item.active?"Visible":"No visible"}
      {" · "+item.duration_minutes+" min"}</small></span>
    <button type="button" onClick={()=>open(item)} aria-label={"Editar "+item.name}>Editar</button>
   </div>)}</div>}
  <button type="button" className="vmv-connected-add" onClick={()=>open(null)}>
   <Plus size={16}/> Añadir servicio
  </button>
  {show?<div className="vmv-connected-overlay" role="presentation"
   onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setShow(false)}}>
   <div className="vmv-connected-modal" role="dialog" aria-modal="true"
    aria-label={editing?"Editar servicio":"Añadir servicio"}>
    <header><strong>{editing?"Editar servicio":"Nuevo servicio"}</strong>
     <button type="button" aria-label="Cerrar" disabled={busy} onClick={()=>setShow(false)}><X size={18}/></button></header>
    <label>Nombre del servicio<input maxLength={120} value={form.name}
     onChange={e=>setForm(p=>({...p,name:e.target.value}))}/></label>
    <label>Descripción<textarea rows={3} maxLength={700} value={form.description}
     onChange={e=>setForm(p=>({...p,description:e.target.value}))}/></label>
    <label>Duración (minutos)<input type="number" min={15} max={240} value={form.duration}
     onChange={e=>setForm(p=>({...p,duration:e.target.value}))}/></label>
    <label>Precio USD (opcional)<input inputMode="decimal" placeholder="Ej. 35.00"
     value={form.price} onChange={e=>setForm(p=>({...p,price:e.target.value}))}/></label>
    <label className="vmv-connected-check"><input type="checkbox" checked={form.active}
     onChange={e=>setForm(p=>({...p,active:e.target.checked}))}/> Servicio activo</label>
    <label className="vmv-connected-check"><input type="checkbox" checked={form.approved}
     onChange={e=>setForm(p=>({...p,approved:e.target.checked}))}/> Aprobar para mostrar en la web</label>
    <label className="vmv-connected-check"><input type="checkbox" checked={form.confirmed}
     onChange={e=>setForm(p=>({...p,confirmed:e.target.checked}))}/> Confirmo que los datos y precios son correctos</label>
    {error?<p role="alert">{error}</p>:null}
    <button type="button" disabled={busy||!form.confirmed||form.name.trim().length<2}
     onClick={()=>void save()}><Check size={16}/> {busy?"Guardando…":"Añadir al catálogo de servicios del negocio"}</button>
   </div>
  </div>:null}
  {!show&&error?<p role="alert">{error}</p>:null}
 </section>;
}
