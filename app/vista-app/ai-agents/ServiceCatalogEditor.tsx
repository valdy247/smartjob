"use client";

import {useEffect,useState} from "react";
import {CheckCircle2,ImagePlus,Plus,RefreshCw,Store} from "lucide-react";
import CatalogProductImageField,{catalogImageUrl} from "./CatalogProductImageField";
import {formatUsd} from "./commerceStore";
import {listBusinessServices,saveBusinessService,type BusinessService,type ServiceDraft} from "./serviceStore";
import styles from "./CommerceStudio.module.css";

const blank:ServiceDraft={name:"",description:"",price:"",image_path:"",approved:false,active:true};
export default function ServiceCatalogEditor({businessId}:{businessId:string}){
 const [items,setItems]=useState<BusinessService[]>([]);
 const [editing,setEditing]=useState<BusinessService|null>(null);
 const [form,setForm]=useState<ServiceDraft>(blank);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [uploading,setUploading]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 async function load(){
  setLoading(true);
  try{const result=await listBusinessServices(businessId);setItems(result);setError("");}
  catch(e){setError(e instanceof Error?e.message:"No se pudieron cargar los servicios.");}
  finally{setLoading(false);}
 }
 useEffect(()=>{
  let live=true;setLoading(true);
  void listBusinessServices(businessId).then(rows=>{if(live){setItems(rows);setError("");}})
   .catch(e=>{if(live)setError(e instanceof Error?e.message:"No se pudieron cargar los servicios.");})
   .finally(()=>{if(live)setLoading(false);});
  return()=>{live=false;};
 },[businessId]);
 function edit(item:BusinessService){
  setEditing(item);setForm({name:item.name,description:item.description,
   price:item.price_cents===null?"":(item.price_cents/100).toFixed(2),
   image_path:item.image_path||"",approved:item.approved,active:item.active});
  setError("");setNotice("");
 }
 function patch<K extends keyof ServiceDraft>(key:K,value:ServiceDraft[K]){
  setForm(old=>({...old,[key]:value}));
 }
 async function save(){
  if(busy||uploading||!form.name.trim())return;
  setBusy(true);setNotice("");setError("");
  try{
   await saveBusinessService(businessId,form,editing);
   await load();setEditing(null);setForm(blank);
   setNotice("Servicio guardado. Aparecerá en la web conectada cuando esté aprobado y activo.");
  }catch(e){setError(e instanceof Error?e.message:"No se pudo guardar.");}
  finally{setBusy(false);}
 }
 return <section className={styles.servicesStudio} aria-label="Catálogo de servicios">
  <div className={styles.heading}><h2>Mis servicios</h2>
   <button type="button" disabled={loading||busy} onClick={()=>void load()}>
    <RefreshCw size={14}/> Actualizar</button>
  </div>
  {loading?<p className={styles.hint}>Cargando servicios…</p>:null}
  {error?<p className={styles.servicesError} role="alert">{error}</p>:null}
  {notice?<p className={styles.notice} role="status">{notice}</p>:null}
  <div className={styles.items}>
   {items.length===0&&!loading?<div className={styles.empty}>
    <Store size={25}/><p>Agrega tus servicios para conectarlos con Web Studio.</p></div>:null}
   {items.map(item=><article key={item.id} className={styles.item}>
    {item.image_path&&catalogImageUrl(item.image_path)?
     <img className={styles.catalogThumb} src={catalogImageUrl(item.image_path)}
      alt={"Foto de "+item.name} loading="lazy"/>:null}
    <div><strong>{item.name}</strong>
     <small>{item.price_cents===null?"Precio a consultar":formatUsd(item.price_cents)}</small>
     <small>{item.approved&&item.active?"Aprobado · Visible":"No visible en la web"}</small>
    </div>
    <button type="button" disabled={busy} onClick={()=>edit(item)}>Editar</button>
   </article>)}
  </div>
  <div className={styles.heading}><h2>{editing?"Editar servicio":"Añadir servicio"}</h2>
   {editing?<button type="button" onClick={()=>{setEditing(null);setForm(blank);}}>Cancelar</button>:null}
  </div>
  <div className={styles.form}>
   <CatalogProductImageField businessId={businessId} kind="servicio"
    value={form.image_path} onChange={value=>patch("image_path",value)}
    onBusy={setUploading} disabled={busy}/>
   <label>Nombre del servicio
    <input maxLength={120} value={form.name} placeholder="Ej. Pasteles personalizados"
     onChange={e=>patch("name",e.target.value)}/></label>
   <label>Precio en USD (opcional)
    <input inputMode="decimal" placeholder="A consultar"
     value={form.price} onChange={e=>patch("price",e.target.value)}/></label>
   <label>Descripción
    <textarea rows={3} maxLength={700} value={form.description}
     placeholder="¿Qué incluye este servicio?"
     onChange={e=>patch("description",e.target.value)}/></label>
   <label className={styles.check}>
    <input type="checkbox" checked={form.approved}
     onChange={e=>patch("approved",e.target.checked)}/>
    <span>Apruebo la información y la fotografía para mi web.</span>
   </label>
   <label className={styles.check}>
    <input type="checkbox" checked={form.active}
     onChange={e=>patch("active",e.target.checked)}/>
    <span>Servicio disponible</span>
   </label>
   <button type="button" className={styles.primary}
    disabled={busy||uploading||!form.name.trim()} onClick={()=>void save()}>
    {editing?<CheckCircle2 size={16}/>:<Plus size={16}/>}
    {busy?"Guardando…":editing?"Guardar cambios":"Añadir servicio"}
   </button>
  </div>
  <p className={styles.hint}><ImagePlus size={13}/> Las fotos originales no se modifican con IA. Sin cobros ni reservas automáticas.</p>
 </section>;
}
