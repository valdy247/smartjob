"use client";
import {useEffect,useState} from "react";
import {CheckCircle2,Search,AlertCircle} from "lucide-react";
import type {GoogleData} from "@/lib/google-profile-request";
import {useInterfaceLanguage} from "@/lib/i18n-web";
import styles from "./GoogleCategoryLookup.module.css";
type Result={id:string;label:string};
export default function GoogleCategoryLookup({data,onData}:{data:GoogleData;onData:(next:GoogleData)=>void}){
 const {language}=useInterfaceLanguage(),en=language==="en";
 const [query,setQuery]=useState(data.googleCategory||"");
 const [items,setItems]=useState<Result[]>([]);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 useEffect(()=>{if(data.googleCategoryId&&data.googleCategory!==query)setQuery(data.googleCategory);},[data.googleCategoryId,data.googleCategory]);
 useEffect(()=>{
  if(query.trim().length<2||data.googleCategoryId&&query===data.googleCategory){setItems([]);return;}
  let cancelled=false;
  const controller=new AbortController();
  const timer=setTimeout(async()=>{
   setBusy(true);setError("");
   try{
    const r=await fetch("/api/marketing/google-categories?q="+encodeURIComponent(query.trim())+"&country="+encodeURIComponent(data.country||"US")+"&lang="+language,{signal:controller.signal,cache:"no-store"});
    const j=await r.json() as {categories?:Result[];error?:string};
    if(cancelled)return;
    if(!r.ok){setItems([]);setError(en?"Google categories unavailable. VMV can review manually.":"Categorías de Google no disponibles. VMV puede revisarlas.");return;}
    setItems(j.categories||[]);
   }catch{if(!cancelled){setItems([]);setError(en?"Google category search is temporarily unavailable.":"La búsqueda de Google no está disponible ahora.");}}
   finally{if(!cancelled)setBusy(false);}
  },350);
  return()=>{cancelled=true;clearTimeout(timer);controller.abort();};
 },[query,data.country,language,data.googleCategoryId,data.googleCategory,en]);
 const select=(item:Result)=>{setQuery(item.label);setItems([]);setError("");onData({...data,googleCategory:item.label,googleCategoryId:item.id,googleCategorySource:"customer",categoryPendingReview:false,otherCategories:""});};
 return <div className={styles.root}>
  <label className={styles.label}>{en?"Official Google category":"Categoría oficial de Google"}
   <div className={styles.search}><Search size={17}/><input value={query} maxLength={80} autoComplete="off"
    placeholder={en?"Search Google categories…":"Buscar categorías de Google…"}
    onChange={e=>{setQuery(e.target.value);setItems([]);onData({...data,googleCategory:"",googleCategoryId:"",categoryPendingReview:false,otherCategories:""});}} /></div>
  </label>
  {busy?<p role="status" className={styles.hint}>{en?"Checking Google…":"Consultando Google…"}</p>:null}
  {items.length>0?<div className={styles.results} role="listbox" aria-label={en?"Official Google categories":"Categorías oficiales de Google"}>{items.map(item=><button key={item.id} type="button" role="option" aria-selected={data.googleCategoryId===item.id} onClick={()=>select(item)}>{item.label}</button>)}</div>:null}
  {data.googleCategoryId&&data.googleCategory?<p className={styles.verified}><CheckCircle2 size={15}/>{en?"Google category selected":"Categoría de Google seleccionada"}</p>:null}
  {error?<p className={styles.warning}><AlertCircle size={14}/>{error}</p>:null}
  {!data.googleCategoryId?<div className={styles.pending}>
   <button type="button" aria-pressed={!!data.categoryPendingReview} onClick={()=>onData({...data,googleCategory:"",googleCategoryId:"",categoryPendingReview:true,otherCategories:""})}>
    {en?"Request manual review":"Solicitar revisión manual"}
   </button>
   {data.categoryPendingReview?<small>{en?"Not yet verified":"Sin verificar"}</small>:null}
  </div>:null}
 </div>;
}
