"use client";
import {useEffect,useRef,useState} from "react";
import {MapPin,Search,LoaderCircle} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {useInterfaceLanguage} from "@/lib/i18n-web";
import styles from "./PlaceAddressLookup.module.css";
type Suggestion={placeId:string;description:string;main:string;secondary:string};
export type SelectedAddress={street:string;city:string;region:string;postal:string;country:string;formatted:string};
export default function PlaceAddressLookup({country,onPick}:{country:string;onPick:(address:SelectedAddress)=>void}){
 const {language}=useInterfaceLanguage(),en=language==="en";
 const [value,setValue]=useState(""),[choices,setChoices]=useState<Suggestion[]>([]),[loading,setLoading]=useState(false),[notice,setNotice]=useState("");
 const [connected,setConnected]=useState(true),[show,setShow]=useState(false);
 const session=useRef("");
 const revision=useRef(0);
 if(!session.current&&typeof crypto!=="undefined")session.current=crypto.randomUUID();
 useEffect(()=>{setValue("");setChoices([]);setNotice("");setConnected(true);session.current=crypto.randomUUID();revision.current++;},[country]);
 useEffect(()=>{
  if(!show||value.trim().length<4||!connected){setChoices([]);setLoading(false);return;}
  const current=++revision.current;
  const controller=new AbortController();
  const timer=window.setTimeout(async()=>{
   setLoading(true);
   const client=getSupabase();
   const {data:{session:auth}}=await client!.auth.getSession();
   if(!auth?.access_token){if(current===revision.current){setNotice(en?"Sign in to search addresses.":"Inicia sesión para buscar direcciones.");setLoading(false);}return;}
   try{
    const response=await fetch("/api/marketing/place-address",{
     method:"POST",signal:controller.signal,cache:"no-store",
     headers:{"Content-Type":"application/json",Authorization:"Bearer "+auth.access_token},
     body:JSON.stringify({action:"search",input:value.trim(),country,language,sessionToken:session.current})
    });
    const result=await response.json() as {results?:Suggestion[];error?:string};
    if(current!==revision.current)return;
    if(response.ok){setChoices(result.results||[]);setNotice("");}
    else{
     setChoices([]);
     if(result.error==="places_not_connected"){setConnected(false);setNotice(en?"Address suggestions aren't connected yet. Enter the address manually.":"Las sugerencias todavía no están conectadas. Puedes escribir la dirección manualmente.");}
     else setNotice(en?"Suggestions unavailable. Enter the address manually.":"La búsqueda no está disponible. Escribe la dirección manualmente.");
    }
   }catch{if(current===revision.current&&!controller.signal.aborted)setNotice(en?"Suggestions unavailable.":"Sugerencias no disponibles.");}
   finally{if(current===revision.current)setLoading(false);}
  },500);
  return()=>{window.clearTimeout(timer);controller.abort();};
 },[value,country,language,connected,show,en]);
 const choose=async(item:Suggestion)=>{
  setChoices([]);setLoading(true);setNotice("");revision.current++;
  const client=getSupabase();
  const {data:{session:auth}}=await client!.auth.getSession();
  if(!auth?.access_token){setLoading(false);return;}
  try{
   const response=await fetch("/api/marketing/place-address",{
    method:"POST",cache:"no-store",headers:{"Content-Type":"application/json",Authorization:"Bearer "+auth.access_token},
    body:JSON.stringify({action:"details",placeId:item.placeId,country,language,sessionToken:session.current})
   });
   const result=await response.json() as {address?:SelectedAddress};
   if(!response.ok||!result.address){setNotice(en?"Google couldn't confirm this address. Enter it manually.":"Google no pudo confirmar esta dirección. Escríbela manualmente.");return;}
   onPick(result.address);setValue(result.address.formatted);setShow(false);
   session.current=crypto.randomUUID();
   setNotice(en?"Address details filled in. Verify the suite or unit separately.":"Dirección completada. Verifica el local o apartamento por separado.");
  }catch{setNotice(en?"Could not load the selected address.":"No se pudo cargar la dirección seleccionada.");}
  finally{setLoading(false);}
 };
 return <div className={styles.root}>
  <label className={styles.label}><Search size={15}/>{en?"Find an address with Google":"Buscar dirección con Google"}
   <input type="search" autoComplete="off" value={value} onFocus={()=>setShow(true)} onChange={e=>{setValue(e.target.value);setShow(true);setNotice("");}}
    placeholder={en?"Start typing a street address…":"Escribe la calle y el número…"} maxLength={120}/>
  </label>
  {loading?<p className={styles.message}><LoaderCircle size={14}/>{en?"Searching…":"Buscando…"}</p>:null}
  {show&&choices.length>0?<div className={styles.choices} role="listbox" aria-label={en?"Google address suggestions":"Direcciones sugeridas de Google"}>
   {choices.map(c=><button type="button" role="option" aria-selected={false} key={c.placeId} onClick={()=>void choose(c)}>
    <MapPin size={16}/><span><strong>{c.main}</strong><small>{c.secondary}</small></span>
   </button>)}
   <small className={styles.attribution}>Google Maps</small>
  </div>:null}
  {notice?<p role="status" className={styles.message}>{notice}</p>:null}
  <p className={styles.helper}>{en?"Optional. You can always fill the fields manually.":"Opcional. También puedes completar los campos manualmente."}</p>
 </div>;
}
