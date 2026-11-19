"use client";
import {useEffect,useState} from "react";
import {Check,LoaderCircle,Package,Pencil,Plus,RefreshCw,X} from "lucide-react";
import {listCatalog,saveCatalogItem,formatUsd,type CatalogItem} from "./commerceStore";
import styles from "./AgentWebCatalogEditor.module.css";

type Form={
 name:string;sku:string;description:string;price:string;
 stock_mode:CatalogItem["stock_mode"];available_qty:string;approved:boolean;active:boolean;
};
const blank:Form={name:"",sku:"",description:"",price:"",stock_mode:"manual",
 available_qty:"",approved:false,active:true};
export default function AgentWebCatalogEditor({workspaceId,onChange}:{
 workspaceId:string;onChange:(items:CatalogItem[])=>void;
}){
 const [items,setItems]=useState<CatalogItem[]>([]);
 const [form,setForm]=useState<Form>(blank);
 const [editing,setEditing]=useState<CatalogItem|null>(null);
 const [visible,setVisible]=useState(false);
 const [busy,setBusy]=useState("");
 const [error,setError]=useState("");
 const [loaded,setLoaded]=useState(false);
 const [confirmed,setConfirmed]=useState(false);
 const refresh=async()=>{
  const catalog=await listCatalog(workspaceId);
  setItems(catalog);onChange(catalog);setLoaded(true);
 };
 useEffect(()=>{let active=true;
  void listCatalog(workspaceId).then(data=>{if(active){setItems(data);onChange(data);setLoaded(true);}})
   .catch(()=>{if(active){setError("No se pudo cargar el inventario.");setLoaded(true);}});
  return()=>{active=false;};
 },[workspaceId]);
 const open=(item:CatalogItem|null)=>{
  setEditing(item);setForm(item?{name:item.name,sku:item.sku,
   description:item.description||"",price:(item.price_cents/100).toFixed(2),
   stock_mode:item.stock_mode,available_qty:item.available_qty===null?"":String(item.available_qty),
   approved:item.approved,active:item.active}:blank);
  setConfirmed(false);setVisible(true);setError("");
 };
 const save=async()=>{
  if(busy||!confirmed)return;
  setBusy("save");setError("");
  try{
   await saveCatalogItem(form,editing,workspaceId);
   await refresh();setEditing(null);setVisible(false);setConfirmed(false);setForm(blank);
  }catch(err){setError(err instanceof Error?err.message:"No se pudo guardar el producto.");}
  finally{setBusy("");}
 };
 return <section className={styles.root}>
  <header className={styles.header}><div><strong>Inventario de tu negocio</strong>
   <small>{items.filter(x=>x.approved&&x.active).length} aprobado(s) · {items.length} producto(s)</small></div>
   <button type="button" disabled={Boolean(busy)} onClick={()=>void refresh().catch(()=>setError("No se pudo actualizar."))}
    aria-label="Actualizar inventario"><RefreshCw size={17}/></button></header>
  <p className={styles.note}>Los cambios se guardan en el inventario real de AI Agents. Tu web mostrará únicamente productos activos y aprobados.</p>
  {!loaded?<p className={styles.note} role="status"><LoaderCircle size={17}/> Cargando productos…</p>:
   <div className={styles.list}>{items.map(item=><div className={styles.item} key={item.id}>
    <Package size={18}/><div><strong>{item.name}</strong>
     <small>{formatUsd(item.price_cents)} · {item.approved&&item.active?"Aprobado":"No visible"}
      {item.stock_mode==="tracked"?" · Existencias: "+(item.available_qty||0):""}</small></div>
    <button type="button" aria-label={"Editar "+item.name} title="Editar producto"
     onClick={()=>open(item)}><Pencil size={17}/></button>
   </div>)}</div>}
  <button type="button" className={styles.add} onClick={()=>open(null)}>
   <Plus size={17}/> Añadir nuevo producto</button>
  {visible?<div className={styles.modal} role="presentation"
   onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setVisible(false);}}>
   <div role="dialog" aria-modal="true" aria-label={editing?"Editar producto":"Nuevo producto"}
    className={styles.dialog}>
    <header><strong>{editing?"Editar producto":"Añadir producto"}</strong>
     <button type="button" aria-label="Cerrar" onClick={()=>setVisible(false)}><X size={18}/></button></header>
    <div className={styles.fields}>
     <label>Nombre aprobado<input maxLength={120} value={form.name}
      onChange={e=>setForm(p=>({...p,name:e.target.value}))}/></label>
     <label>SKU único<input maxLength={45} value={form.sku}
      onChange={e=>setForm(p=>({...p,sku:e.target.value.toUpperCase()}))}/></label>
     <label>Precio USD<input inputMode="decimal" value={form.price}
      placeholder="25.00" onChange={e=>setForm(p=>({...p,price:e.target.value}))}/></label>
     <label>Descripción<textarea rows={3} maxLength={700} value={form.description}
      onChange={e=>setForm(p=>({...p,description:e.target.value}))}/></label>
     <label>Existencias<select value={form.stock_mode}
      onChange={e=>setForm(p=>({...p,stock_mode:e.target.value as CatalogItem["stock_mode"]}))}>
       <option value="manual">Confirmación manual</option>
       <option value="tracked">Cantidad verificada</option>
       <option value="unlimited">Sin límite</option>
      </select></label>
     {form.stock_mode==="tracked"?<label>Unidades disponibles<input inputMode="numeric" type="number"
      min={0} max={1000000} value={form.available_qty}
      onChange={e=>setForm(p=>({...p,available_qty:e.target.value}))}/></label>:null}
     <label className={styles.check}><input type="checkbox" checked={form.active}
      onChange={e=>setForm(p=>({...p,active:e.target.checked}))}/> Producto activo</label>
     <label className={styles.check}><input type="checkbox" checked={form.approved}
      onChange={e=>setForm(p=>({...p,approved:e.target.checked}))}/> Aprobar para mostrar en la web</label>
     <label className={styles.check}><input type="checkbox" checked={confirmed}
      onChange={e=>setConfirmed(e.target.checked)}/>
      Confirmo el precio y los datos reales de este producto.</label>
    </div>
    {error?<p role="alert" className={styles.error}>{error}</p>:null}
    <button type="button" className={styles.save} disabled={Boolean(busy)||!confirmed||!form.name.trim()||!form.sku.trim()}
     onClick={()=>void save()}>{busy?<LoaderCircle size={17}/>:<Check size={17}/>} Guardar en Inventario</button>
   </div>
  </div>:null}
  {!visible&&error?<p role="alert" className={styles.error}>{error}</p>:null}
 </section>;
}
