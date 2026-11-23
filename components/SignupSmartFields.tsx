"use client";
import {useEffect,useMemo,useState} from "react";
import {Check,Search,MapPin,LoaderCircle} from "lucide-react";
import {searchBusinessCategories} from "@/lib/business-category-search";
import type {SignupAnswer} from "@/lib/vmv-signup-flow";
import styles from "./SignupExperience.module.css";
type Patch=(values:SignupAnswer)=>void;
type Result={id:string;label:string;secondary?:string};
const countryOf=(a:SignupAnswer)=>String(a.country==="other"?(a.country_code||""):(a.country||"US")).toUpperCase();
async function jsonPost(url:string,payload:object,signal?:AbortSignal){
 const r=await fetch(url,{method:"POST",cache:"no-store",signal,
  headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
 const data=await r.json() as Record<string,unknown>;
 if(!r.ok)throw Error(String(data.error||"unavailable"));
 return data;
}
export function SignupCategoryLookup({answers,onPatch,en}:{answers:SignupAnswer;onPatch:Patch;en:boolean}){
 const [query,setQuery]=useState(answers.google_category_name||answers.category_label||"");
 const [results,setResults]=useState<Result[]>([]),[busy,setBusy]=useState(false);
 const [connected,setConnected]=useState(true);
 const country=countryOf(answers);
 useEffect(()=>{
  if(query.trim().length<2||answers.google_category_name===query||answers.category_label===query){
   setResults([]);return;
  }
  let active=true;const controller=new AbortController();
  const timer=setTimeout(async()=>{
   setBusy(true);
   try{
    const r=await fetch("/api/marketing/google-categories?q="+encodeURIComponent(query.trim())+
     "&country="+encodeURIComponent(country)+"&lang="+(en?"en":"es"),
     {signal:controller.signal,cache:"no-store"});
    const d=await r.json() as {categories?:Result[]};
    if(!active)return;
    setConnected(r.ok);setResults(r.ok?(d.categories||[]):[]);
   }catch{if(active){setConnected(false);setResults([]);}}
   finally{if(active)setBusy(false);}
  },400);
  return()=>{active=false;clearTimeout(timer);controller.abort();};
 },[query,country,en,answers.google_category_name,answers.category_label]);
 const local=useMemo(()=>searchBusinessCategories(query).slice(0,8),[query]);
 function pickGoogle(p:Result){
  const guess=searchBusinessCategories(p.label)[0];
  onPatch({category:guess?.id||"other",google_category_id:p.id,google_category_name:p.label,
   category_label:p.label,category_source:"verified"});
  setQuery(p.label);setResults([]);
 }
 function pickVmv(item:{id:string;label:string}){
  onPatch({category:item.id,category_label:item.label,google_category_id:"",
   google_category_name:"",category_source:"pending"});
  setQuery(item.label);setResults([]);
 }
 return <div className={styles.smartField}>
  <label className={styles.searchInput}><Search size={17}/>
   <input value={query} type="search" autoComplete="off" maxLength={80}
    placeholder={en?"Search your business activity":"Busca tu actividad"}
    onChange={e=>{
     setQuery(e.target.value);onPatch({category:"",category_label:"",google_category_id:"",
      google_category_name:"",category_source:""});setResults([]);
    }}/>
  </label>
  {busy?<p className={styles.smartHint}><LoaderCircle size={14}/>{en?"Searching Google…":"Buscando en Google…"}</p>:null}
  {results.length>0?<div className={styles.searchResults} role="listbox" aria-label="Google Business Profile">
   {results.map(p=><button type="button" key={p.id} role="option" aria-selected={answers.google_category_id===p.id}
    onClick={()=>pickGoogle(p)}><Check size={15}/><span>{p.label}</span></button>)}
  </div>:null}
  {!results.length&&query.trim().length>=2&&query!==answers.category_label&&query!==answers.google_category_name?<div className={styles.searchResults} role="listbox">
   {local.map(item=><button type="button" key={item.id} role="option" aria-selected={answers.category===item.id}
    onClick={()=>pickVmv(item)}><span>{item.label}</span></button>)}
  </div>:null}
  {answers.category_source==="verified"?<p className={styles.smartGood}>
   <Check size={14}/>{en?"Official Google category":"Categoría oficial de Google"}</p>:
   answers.category_source==="pending"?<p className={styles.smartHint}>
    {en?"VMV category selected · Google confirmation pending":"Categoría VMV seleccionada · pendiente de validar en Google"}</p>:
   !connected?<p className={styles.smartHint}>
    {en?"Google categories not connected. VMV categories can be reviewed later.":
     "Categorías de Google sin conectar. Puedes elegir una categoría VMV para revisión."}</p>:null}
 </div>;
}
export function SignupLocationLookup({kind,answers,onPatch,en}:{kind:"region"|"city";answers:SignupAnswer;onPatch:Patch;en:boolean}){
 const region=kind==="region",field=region?"region":"city",pid=region?"region_place_id":"city_place_id";
 const [query,setQuery]=useState(answers[field]||"");
 const [items,setItems]=useState<Result[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const country=countryOf(answers),state=answers.region||"";
 useEffect(()=>{
  setQuery(answers[field]||"");setItems([]);setError("");
 },[country,region?country:state,kind]);
 useEffect(()=>{
  if(query.trim().length<2||answers[field]===query&&answers[pid]){
   setItems([]);return;
  }
  if(!region&&!state)return;
  let active=true;const controller=new AbortController();
  const timer=setTimeout(async()=>{
   setBusy(true);setError("");
   try{
    const result=await jsonPost("/api/vmv/signup-geo",
     {action:region?"searchRegion":"searchCity",input:query,country,region:state,lang:en?"en":"es"},controller.signal);
    if(active)setItems((result.results||[]) as Result[]);
   }catch(e){if(active){setItems([]);setError(en?"Google Places unavailable. Try again.":"No pudimos consultar Google. Inténtalo de nuevo.");}}
   finally{if(active)setBusy(false);}
  },380);
  return()=>{active=false;clearTimeout(timer);controller.abort();};
 },[query,country,state,region,kind,answers[field],answers[pid],en]);
 async function pick(item:Result){
  setBusy(true);setError("");
  try{
   const result=await jsonPost("/api/vmv/signup-geo",{
    action:region?"detailsRegion":"detailsCity",country,region:state,
    ...(region?{regionPlaceId:item.id}:{cityPlaceId:item.id})
   });
   if(result.verified!==true)throw Error("not_verified");
   if(region){
    onPatch({region:String(result.region),region_place_id:String(result.placeId),
     city:"",city_place_id:""});setQuery(String(result.region));
   }else{
    onPatch({city:String(result.city),city_place_id:String(result.placeId)});setQuery(String(result.city));
   }
   setItems([]);
  }catch{setError(en?"That location could not be verified.":"No pudimos verificar esa ubicación.");}
  finally{setBusy(false);}
 }
 return <div className={styles.smartField}>
  <label className={styles.searchInput}><MapPin size={17}/>
   <input type="search" autoComplete="off" maxLength={80} value={query}
    placeholder={region?(en?"Search state or province":"Busca tu estado o provincia"):
     (en?"Search city":"Busca tu ciudad")}
    onChange={e=>{
     setQuery(e.target.value);setItems([]);
     if(region)onPatch({region:"",region_place_id:"",city:"",city_place_id:""});
     else onPatch({city:"",city_place_id:""});
    }}/>
  </label>
  {busy?<p className={styles.smartHint}><LoaderCircle size={14}/>{en?"Checking Google…":"Consultando Google…"}</p>:null}
  {items.length>0?<div className={styles.searchResults} role="listbox">
   {items.map(item=><button type="button" key={item.id} role="option" aria-selected={false}
    onClick={()=>void pick(item)}><MapPin size={14}/><span>{item.label}<small>{item.secondary}</small></span></button>)}
  </div>:null}
  {answers[pid]&&answers[field]?<p className={styles.smartGood}><Check size={14}/>
   {en?"Location verified with Google":"Ubicación validada con Google"}</p>:null}
  {error?<p className={styles.smartError} role="alert">{error}</p>:null}
  {!region&&state?<p className={styles.smartHint}>{state}</p>:null}
 </div>;
}
type Hour={closed:boolean;start:string;end:string};
const namesEs=["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];
const namesEn=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const startDefault:Hour={closed:true,start:"09:00",end:"17:00"};
const times=Array.from({length:96},(_,i)=>String(Math.floor(i/4)).padStart(2,"0")+":"+String((i%4)*15).padStart(2,"0"));
export function SignupHoursReview({source,en,onApprove,onClose}:{source:string;en:boolean;
 onApprove:(hours:Hour[])=>void;onClose:()=>void}){
 const [hours,setHours]=useState<Hour[]>(Array.from({length:7},()=>({...startDefault})));
 const [loading,setLoading]=useState(true),[message,setMessage]=useState(""),[invalid,setInvalid]=useState("");
 useEffect(()=>{
  let active=true;const controller=new AbortController();
  void jsonPost("/api/vmv/signup-hours",{text:source},controller.signal).then(result=>{
   if(active&&Array.isArray(result.hours)&&result.hours.length===7)setHours(result.hours as Hour[]);
  }).catch(()=>{if(active)setMessage(en?"Adjust your hours below.":"Ajusta tus horarios aquí.");})
   .finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;controller.abort();};
 },[source,en]);
 const patch=(index:number,update:Partial<Hour>)=>setHours(old=>old.map((h,i)=>i===index?{...h,...update}:h));
 const approve=()=>{
  if(hours.every(h=>h.closed)){setInvalid(en?"Open at least one day.":"Indica al menos un día abierto.");return;}
  if(hours.some(h=>!h.closed&&h.start>=h.end)){setInvalid(en?"Check opening and closing times.":"Revisa las horas de apertura y cierre.");return;}
  onApprove(hours);
 };
 return <div className={styles.modalBackdrop} role="presentation">
  <section className={styles.hoursModal} role="dialog" aria-modal="true" aria-labelledby="hours-modal-title">
   <h2 id="hours-modal-title">{en?"Confirm your schedule":"Confirma tu horario"}</h2>
   <p>{loading?(en?"Preparing…":"Preparando…"):message}</p>
   <div className={styles.hoursRows}>
    {hours.map((h,i)=><div className={styles.hoursRow} key={i}>
     <label className={styles.daySwitch}>
      <input type="checkbox" checked={!h.closed} disabled={loading}
       onChange={e=>patch(i,{closed:!e.target.checked})}/>
      <span>{(en?namesEn:namesEs)[i]}</span>
     </label>
     {h.closed?<small>{en?"Closed":"Cerrado"}</small>:<div className={styles.timePickers}>
      <select aria-label={(en?"Opens ":"Abre ")+(en?namesEn:namesEs)[i]} value={h.start}
       onChange={e=>patch(i,{start:e.target.value})}>
       {times.map(t=><option value={t} key={t}>{t}</option>)}
      </select>
      <span>–</span>
      <select aria-label={(en?"Closes ":"Cierra ")+(en?namesEn:namesEs)[i]} value={h.end}
       onChange={e=>patch(i,{end:e.target.value})}>
       {times.map(t=><option value={t} key={t}>{t}</option>)}
      </select>
     </div>}
    </div>)}
   </div>
   {invalid?<p className={styles.smartError} role="alert">{invalid}</p>:null}
   <div className={styles.modalActions}>
    <button type="button" onClick={onClose}>{en?"Edit text":"Cambiar texto"}</button>
    <button type="button" disabled={loading} onClick={approve}>{en?"Approve":"Aprobar"}<Check size={16}/></button>
   </div>
  </section>
 </div>;
}
