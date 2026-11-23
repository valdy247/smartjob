"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {Check,Plus,RefreshCw,X} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {safeWebImageUrl} from "@/lib/web-services-site";
import {listCatalog,parseUsd,type CatalogItem} from "@/app/vista-app/ai-agents/commerceStore";
import BuilderImageField from "./BuilderImageField";
type Product=CatalogItem&{image_path?:string|null};
type Form={
 name:string;sku:string;description:string;price:string;image:string;
 stock_mode:CatalogItem["stock_mode"];available_qty:string;
 approved:boolean;active:boolean;confirmed:boolean;
};
const blank:Form={name:"",sku:"",description:"",price:"",image:"",
 stock_mode:"manual",available_qty:"",approved:true,active:true,confirmed:false};
const money=(c:number)=>"$"+(c/100).toFixed(2);
export default function ConnectedProductsEditor({workspaceId,onChange}:{
 workspaceId:string;onChange:(items:Product[])=>void;
}){
 const [items,setItems]=useState<Product[]>([]);
 const [form,setForm]=useState<Form>(blank);
 const [editing,setEditing]=useState<Product|null>(null);
 const [open,setOpen]=useState(false);
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const liveRef=useRef(true);
 useEffect(()=>{liveRef.current=true;return()=>{liveRef.current=false};},[]);
 const refresh=useCallback(async()=>{
  const data=await listCatalog(workspaceId) as Product[];
  if(!liveRef.current)return;
  setItems(data);onChange(data);setError("");
 },[workspaceId,onChange]);
 useEffect(()=>{
  let active=true;
  setLoading(true);setItems([]);onChange([]);
  void refresh().catch(e=>{if(active)setError(e instanceof Error?e.message:"No se pudo cargar el inventario.")})
   .finally(()=>{if(active)setLoading(false)});
  const onFocus=()=>{if(document.visibilityState==="visible")void refresh().catch(()=>{})};
  window.addEventListener("focus",onFocus);document.addEventListener("visibilitychange",onFocus);
  return()=>{active=false;window.removeEventListener("focus",onFocus);
   document.removeEventListener("visibilitychange",onFocus)};
 },[refresh,onChange]);
 function edit(product:Product|null){
  setEditing(product);setForm(product?{
   name:product.name,sku:product.sku,description:product.description||"",
   price:(product.price_cents/100).toFixed(2),image:product.image_path||"",
   stock_mode:product.stock_mode,
   available_qty:product.available_qty===null?"":String(product.available_qty),
   approved:product.approved,active:product.active,confirmed:false
  }:blank);
  setError("");setOpen(true);
 }
 async function save(){
  if(busy||!form.confirmed)return;
  setBusy(true);setError("");
  try{
   const name=form.name.trim(),sku=form.sku.trim().toUpperCase().slice(0,45);
   if(name.length<2||name.length>120||!sku||sku.length>45)
    throw Error("Indica un nombre (2–120 caracteres) y un SKU único.");
   if(!/^[A-Z0-9_-]{2,45}$/.test(sku))
    throw Error("SKU: utiliza letras, números, guiones o guion bajo.");
   const price_cents=parseUsd(form.price);
   if(price_cents===null)throw Error("Indica un precio real en USD entre $0.01 y $100,000.");
   const tracked=form.stock_mode==="tracked";
   const qty=tracked?Number(form.available_qty):null;
   if(tracked&&(!Number.isSafeInteger(qty)||qty===null||qty<0||qty>1000000))
    throw Error("Las existencias deben ser un número válido de unidades.");
   const db=getSupabase();if(!db)throw Error("VMV no está disponible.");
   const {data:{user},error:authError}=await db.auth.getUser();
   if(authError||!user||user.is_anonymous)throw Error("Inicia sesión de nuevo.");
   const {data:workspace,error:workspaceError}=await db.from("vmv_ai_businesses")
    .select("id").eq("id",workspaceId).eq("owner_id",user.id).maybeSingle();
   if(workspaceError||!workspace)throw Error("No tienes acceso al inventario de este negocio.");
   const image=form.image?safeWebImageUrl(form.image):null;
   if(form.image&&!image)throw Error("La fotografía no pertenece a la biblioteca de Web Services.");
   if(image&&!image.includes("/smartjob-web-images/"+user.id+"/"))
    throw Error("Utiliza una fotografía de tu propia biblioteca.");
   const values={owner_id:user.id,business_id:workspaceId,
    name,sku,description:form.description.trim().slice(0,700),
    price_cents,currency:"usd",stock_mode:form.stock_mode,
    available_qty:qty,approved:form.approved,active:form.active,
    image_path:image||null,updated_at:new Date().toISOString()};
   if(editing){
    const {data,error}=await db.from("vmv_ai_catalog_items").update(values)
     .eq("id",editing.id).eq("owner_id",user.id)
     .eq("business_id",workspaceId).eq("updated_at",editing.updated_at)
     .select("id").maybeSingle();
    if(error||!data)throw Error("El producto cambió en otra pestaña. Actualiza antes de volver a guardar.");
   }else{
    const {error}=await db.from("vmv_ai_catalog_items").insert(values);
    if(error)throw Error("No se pudo crear el producto. Comprueba que el SKU no esté repetido.");
   }
   await refresh();setOpen(false);setEditing(null);setForm(blank);
  }catch(e){setError(e instanceof Error?e.message:"Error al guardar el producto.");}
  finally{setBusy(false);}
 }
 return <section className="vmv-connected-products">
  <header><strong>Inventario real de AI Agents</strong>
   <button type="button" disabled={busy} onClick={()=>void refresh().catch(e=>setError(e.message))}
    aria-label="Actualizar inventario"><RefreshCw size={16}/></button>
  </header>
  <p>Los productos de este negocio se sincronizan con su web. Solo los activos y aprobados serán públicos.</p>
  {loading?<p role="status">Cargando productos…</p>:
   <div className="vmv-connected-items">{items.map(item=><div key={item.id}>
    <span><strong>{item.name}</strong>
     <small>{money(item.price_cents)} · {item.approved&&item.active?"Visible":"No visible"}
      {item.image_path?" · Foto asignada":""}</small></span>
    <button type="button" onClick={()=>edit(item)} aria-label={"Editar "+item.name}>Editar</button>
   </div>)}</div>}
  <button type="button" className="vmv-connected-add" onClick={()=>edit(null)}>
   <Plus size={16}/> Añadir producto
  </button>
  {open?<div className="vmv-connected-overlay" role="presentation"
   onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setOpen(false)}}>
   <div className="vmv-connected-modal" role="dialog" aria-modal="true"
    aria-label={editing?"Editar producto":"Añadir producto"}>
    <header><strong>{editing?"Editar producto":"Nuevo producto"}</strong>
     <button type="button" aria-label="Cerrar" disabled={busy} onClick={()=>setOpen(false)}><X size={18}/></button></header>
    <label>Nombre<input maxLength={120} value={form.name}
     onChange={e=>setForm(p=>({...p,name:e.target.value}))}/></label>
    <label>SKU único<input maxLength={45} value={form.sku} placeholder="Ej. CHOCOFLAN-01"
     onChange={e=>setForm(p=>({...p,sku:e.target.value.toUpperCase()}))}/></label>
    <label>Precio USD<input inputMode="decimal" placeholder="Ej. 25.00" value={form.price}
     onChange={e=>setForm(p=>({...p,price:e.target.value}))}/></label>
    <label>Descripción<textarea rows={3} maxLength={700} value={form.description}
     onChange={e=>setForm(p=>({...p,description:e.target.value}))}/></label>
    <div><strong style={{fontSize:12}}>Foto del producto (opcional)</strong>
     <BuilderImageField value={form.image} onChange={url=>setForm(p=>({...p,image:url}))}/></div>
    <label>Existencias<select value={form.stock_mode}
     onChange={e=>setForm(p=>({...p,stock_mode:e.target.value as CatalogItem["stock_mode"]}))}>
      <option value="manual">Confirmación manual</option>
      <option value="tracked">Cantidad verificada</option>
      <option value="unlimited">Sin límite</option>
     </select></label>
    {form.stock_mode==="tracked"?<label>Unidades disponibles<input type="number" min={0}
     max={1000000} value={form.available_qty}
     onChange={e=>setForm(p=>({...p,available_qty:e.target.value}))}/></label>:null}
    <label className="vmv-connected-check"><input type="checkbox" checked={form.active}
     onChange={e=>setForm(p=>({...p,active:e.target.checked}))}/> Producto activo</label>
    <label className="vmv-connected-check"><input type="checkbox" checked={form.approved}
     onChange={e=>setForm(p=>({...p,approved:e.target.checked}))}/> Aprobar para mostrar en la web</label>
    <label className="vmv-connected-check"><input type="checkbox" checked={form.confirmed}
     onChange={e=>setForm(p=>({...p,confirmed:e.target.checked}))}/>
     Confirmo que los datos y el precio del producto son correctos</label>
    {error?<p role="alert">{error}</p>:null}
    <button type="button" disabled={busy||!form.confirmed||!form.name.trim()||!form.sku.trim()}
     onClick={()=>void save()}><Check size={16}/>
     {busy?"Guardando…":"Añadir al inventario del negocio"}</button>
   </div>
  </div>:null}
  {!open&&error?<p role="alert">{error}</p>:null}
 </section>;
}
