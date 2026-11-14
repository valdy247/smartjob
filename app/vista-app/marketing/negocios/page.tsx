"use client";
import {useEffect,useRef,useState} from "react";
import {ArrowLeft,Building2,CheckCircle2,ExternalLink,LoaderCircle,ShieldCheck} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {useInterfaceLanguage} from "@/lib/i18n-web";
import {googlePhotoKey} from "@/lib/google-profile-request";
import {centralBusinessDefaults,centralBusinessWritePayload,validCentralBusiness,type CentralBusiness} from "@/lib/vmv-central-business";
import CentralBusinessEditor,{emptyBusinessFiles,type CentralBusinessFiles} from "../CentralBusinessEditor";
import styles from "./page.module.css";

function errorMessage(value:unknown,en:boolean){
 const msg=value&&typeof value==="object"&&"message" in value?String(value.message):"";
 if(msg.includes("additional_businesses_pending_plan_definition"))
  return en?"Additional businesses are pending the plan limits. Your existing business stays available.":"Los negocios adicionales dependen de límites de plan todavía no definidos. Tu negocio existente sigue disponible.";
 if(msg.includes("duplicate key"))
  return en?"This business is already saved. Reload and select it.":"Este negocio ya está guardado. Actualiza y selecciónalo.";
 return en?"We couldn't save the business. Try again.":"No se pudo guardar el negocio. Inténtalo nuevamente.";
}
export default function MyBusinessesPage(){
 const {language}=useInterfaceLanguage(),en=language==="en";
 const [status,setStatus]=useState<"checking"|"signed_out"|"ready"|"error">("checking");
 const [userId,setUserId]=useState("");
 const [list,setList]=useState<CentralBusiness[]>([]);
 const [active,setActive]=useState("");
 const [data,setData]=useState<CentralBusiness>({id:"",owner_id:"",...centralBusinessDefaults()});
 const [files,setFiles]=useState<CentralBusinessFiles>(emptyBusinessFiles);
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(""),[error,setError]=useState("");
 const generatedId=useRef("");
 const dirty=useRef(false),currentUser=useRef("");
 const [onboarding,setOnboarding]=useState<{name:string;website_url:string|null;category:string}|null>(null);
 useEffect(()=>{
  const client=getSupabase();if(!client){setStatus("error");return;}
  let alive=true;
  const refresh=async()=>{
   const {data:auth,error:authError}=await client.auth.getUser();
   if(!alive)return;
   const uid=!authError&&!auth.user?.is_anonymous?auth.user?.id:null;
   if(!uid){currentUser.current="";setUserId("");setList([]);setStatus("signed_out");return;}
   if(currentUser.current!==uid){currentUser.current=uid;dirty.current=false;setActive("");setFiles(emptyBusinessFiles);}
   setUserId(uid);
   const [rows,p,category]=await Promise.all([
    client.from("vmv_marketing_businesses").select("*").eq("owner_id",uid).order("created_at",{ascending:true}),
    client.from("smartjob_profiles").select("business_name,website_url").eq("id",uid).maybeSingle(),
    client.from("smartjob_business_category_preferences").select("category_id").eq("owner_id",uid).maybeSingle()
   ]);
   if(!alive)return;
   if(rows.error){setStatus("error");return;}
   const items=(rows.data||[]) as CentralBusiness[];
   setList(items);setOnboarding(p.data?.business_name?{name:p.data.business_name,website_url:p.data.website_url||null,category:category.data?.category_id||"other"}:null);
   if(!dirty.current){
    if(items.length===1){setActive(items[0].id);setData({...items[0]});}
    else if(items.length===0){
     setActive("");setData({id:"",owner_id:uid,...centralBusinessDefaults(p.data?.business_name||"",category.data?.category_id||"other",p.data?.website_url||null)});
    }
   }
   setStatus("ready");
  };
  const {data:listener}=client.auth.onAuthStateChange(()=>queueMicrotask(()=>{if(alive)void refresh();}));
  void refresh();
  return()=>{alive=false;listener.subscription.unsubscribe();};
 },[]);
 const select=(id:string)=>{
  const next=list.find(x=>x.id===id);
  if(!next)return;
  dirty.current=false;setActive(id);setData({...next});setFiles(emptyBusinessFiles);setNotice("");setError("");
 };
 const save=async()=>{
  const client=getSupabase();if(!client||!userId)return;
  const issue=validCentralBusiness(data);
  if(issue){setError(issue);return;}
  setError("");setNotice("");setBusy(true);
  try{
   // A deterministic ID handles retried creations; the database owns the
   // concurrency-safe account limit and the owner-scoped RLS policy.
   const id=active||generatedId.current||crypto.randomUUID();
   generatedId.current=id;
   const payload=centralBusinessWritePayload(data);
   let saved:CentralBusiness|null=null;
   if(active){
    const result=await client.from("vmv_marketing_businesses")
     .update(payload).eq("id",active).eq("owner_id",userId).select("*").single();
    if(result.error)throw result.error;
    saved=result.data as CentralBusiness;
   }else{
    const result=await client.from("vmv_marketing_businesses")
     .insert({...payload,id,owner_id:userId}).select("*").single();
    if(result.error){
     const existing=await client.from("vmv_marketing_businesses")
      .select("*").eq("id",id).eq("owner_id",userId).maybeSingle();
     if(!existing.data)throw result.error;
     saved=existing.data as CentralBusiness;
    }else saved=result.data as CentralBusiness;
   }
   if(!saved)throw Error("Business not found");
   if(files.logo||files.cover||files.gallery.length){
    const updated:{logo_path?:string;cover_path?:string;gallery_paths?:string[]}={};
    const chosen=[
     ...(files.logo?[["logo",files.logo] as const]:[]),
     ...(files.cover?[["cover",files.cover] as const]:[]),
     ...files.gallery.map((f,i)=>["gallery-"+i,f] as const)
    ];
    const gallery:string[]=[];
    for(const [kind,file] of chosen){
     if(!["image/png","image/jpeg"].includes(file.type)||file.size<10240||file.size>5242880)
      throw Error(en?"Use JPG/PNG images between 10 KB and 5 MB.":"Utiliza fotos JPG/PNG entre 10 KB y 5 MB.");
     const path=userId+"/"+saved.id+"/"+kind+"-"+(await googlePhotoKey(file))+"."+(file.type==="image/png"?"png":"jpg");
     const upload=await client.storage.from("vmv-business-media").upload(path,file,{contentType:file.type,upsert:false});
     if(upload.error&&!upload.error.message?.toLowerCase().includes("already exists"))throw upload.error;
     if(kind==="logo")updated.logo_path=path;
     else if(kind==="cover")updated.cover_path=path;
     else gallery.push(path);
    }
    if(gallery.length)updated.gallery_paths=gallery;
    const result=await client.from("vmv_marketing_businesses")
     .update(updated).eq("id",saved.id).eq("owner_id",userId).select("*").single();
    if(result.error)throw result.error;
    saved=result.data as CentralBusiness;
   }
   dirty.current=false;setActive(saved.id);setData(saved);setFiles(emptyBusinessFiles);
   setList(v=>v.some(x=>x.id===saved!.id)?v.map(x=>x.id===saved!.id?saved!:x):[...v,saved!]);
   setNotice(en?"Business saved privately. Past requests and published services are unchanged.":"Negocio guardado en privado. Las solicitudes anteriores y servicios publicados no cambiaron.");
  }catch(e){setError(errorMessage(e,en));}
  finally{setBusy(false);}
 };
 const openPhoto=async(path:string)=>{
  const client=getSupabase();if(!client)return;
  const r=await client.storage.from("vmv-business-media").createSignedUrl(path,90);
  if(r.error||!r.data?.signedUrl){setError(en?"Photo unavailable.":"Foto no disponible.");return;}
  window.open(r.data.signedUrl,"_blank","noopener,noreferrer");
 };
 return <main className={styles.root}>
  <a className={styles.back} href="/vista-app/marketing"><ArrowLeft size={16}/>{en?"Marketing":"Marketing"}</a>
  <header className={styles.header}><Building2 size={22}/><div><h1>{en?"My businesses":"Mis negocios"}</h1><p>{en?"Save your business details once. Reuse them in every VMV request.":"Guarda los datos una vez y reutilízalos en tus solicitudes."}</p></div></header>
  {status==="checking"?<p role="status"><LoaderCircle size={16}/>{en?"Checking account…":"Comprobando tu cuenta…"}</p>:
   status==="signed_out"?<div className={styles.panel}><p>{en?"Sign in to manage your businesses.":"Inicia sesión para administrar tus negocios."}</p><a href="/vista-app?returnTo=marketing">{en?"Sign in":"Iniciar sesión"}</a></div>:
   status==="error"?<div role="alert" className={styles.panel}><p>{en?"We couldn't load your businesses.":"No pudimos cargar tus negocios."}</p><button onClick={()=>window.location.reload()}>{en?"Retry":"Reintentar"}</button></div>:
   <div className={styles.panel}>
    {list.length>0?<label className={styles.select}>{en?"Selected business":"Negocio seleccionado"}<select value={active} onChange={e=>select(e.target.value)}>{list.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>:null}
    <div className={styles.heading}><strong>{active?(en?"Edit business":"Editar negocio"):(en?"Create your first business":"Crear tu primer negocio")}</strong><span>{en?"Private profile":"Perfil privado"}</span></div>
    <label className={styles.field}>{en?"Business name":"Nombre comercial"}<input maxLength={150} value={data.name} onChange={e=>{dirty.current=true;setData(v=>({...v,name:e.target.value}));}} placeholder={onboarding?.name||(en?"My business":"Mi negocio")}/></label>
    <label className={styles.field}>{en?"Website (optional)":"Sitio web (opcional)"}<input value={data.website_url||""} onChange={e=>{dirty.current=true;setData(v=>({...v,website_url:e.target.value}));}} inputMode="url" placeholder={en?"yourbusiness.com":"tunegocio.com"}/></label>
    <CentralBusinessEditor business={data} onChange={v=>{dirty.current=true;setData(v);}} files={files} onFiles={v=>{dirty.current=true;setFiles(v);}}/>
    {[data.logo_path,data.cover_path,...data.gallery_paths].filter((v):v is string=>Boolean(v)).length>0?<div className={styles.photos}><strong>{en?"Saved private photos":"Fotos privadas guardadas"}</strong><div>{[data.logo_path,data.cover_path,...data.gallery_paths].filter((v):v is string=>Boolean(v)).map((path,i)=><button key={path} onClick={()=>void openPhoto(path)} type="button">{en?"View image ":"Ver imagen "}{i+1} <ExternalLink size={13}/></button>)}</div></div>:null}
    {error?<p role="alert" className={styles.error}>{error}</p>:null}
    {notice?<p role="status" className={styles.notice}><CheckCircle2 size={16}/>{notice}</p>:null}
    <button className={styles.primary} type="button" disabled={busy} onClick={()=>void save()}>{busy?(en?"Saving…":"Guardando…"):(en?"Save business":"Guardar negocio")}</button>
    <p className={styles.note}><ShieldCheck size={16}/>{en?"Creating more businesses depends on your plan limits, which are still pending definition. Existing businesses are never deleted when plans change.":"Crear negocios adicionales depende de límites comerciales aún pendientes. Los negocios existentes no se eliminan al cambiar de plan."}</p>
   </div>}
 </main>;
}
