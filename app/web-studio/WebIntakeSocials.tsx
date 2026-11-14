"use client";
import {useEffect,useRef,useState} from "react";
import {Facebook,Instagram,Info,Share2, X, Youtube} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {EMPTY_SOCIAL_LINKS,SOCIAL_PLATFORMS,normalizeSocialUrl,type BusinessSocialLinks,type SocialPlatform} from "@/lib/web-builder-social";
import styles from "./WebIntakeSocials.module.css";

export type SocialSaveStatus="loading"|"saving"|"saved"|"error";
type Props={ownerId:string;links:BusinessSocialLinks;onChange:(links:BusinessSocialLinks)=>void;onStatusChange:(status:SocialSaveStatus)=>void};
const Icons={instagram:Instagram,facebook:Facebook,tiktok:Share2,youtube:Youtube};
function rawLinks(value:unknown):BusinessSocialLinks{
 const source=value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
 return {
  instagram:typeof source.instagram==="string"?source.instagram.slice(0,500):"",
  facebook:typeof source.facebook==="string"?source.facebook.slice(0,500):"",
  tiktok:typeof source.tiktok==="string"?source.tiktok.slice(0,500):"",
  youtube:typeof source.youtube==="string"?source.youtube.slice(0,500):""
 };
}
export default function WebIntakeSocials({ownerId,links,onChange,onStatusChange}:Props){
 const [ready,setReady]=useState(false);
 const [dirty,setDirty]=useState(false);
 const [error,setError]=useState("");
 const [retry,setRetry]=useState(0);
 const [showHelp,setShowHelp]=useState(false);
 const [touched,setTouched]=useState<SocialPlatform|null>(null);
 const helpShown=useRef(false);
 const focusInput=useRef<HTMLInputElement|null>(null);
 const revision=useRef(0);
 const queue=useRef<Promise<void>>(Promise.resolve());
 const alive=useRef(true);
 useEffect(()=>{
  alive.current=true;let current=true;
  setReady(false);setError("");onStatusChange("loading");
  void(async()=>{
   try{
    const client=getSupabase();if(!client)throw new Error("No se pudo conectar con redes sociales.");
    const {data:auth,error:authError}=await client.auth.getUser();
    if(authError||auth.user?.id!==ownerId||auth.user.is_anonymous)
     throw new Error("Inicia sesión para recuperar tus redes sociales.");
    const {data,error:readError}=await client.from("smartjob_web_intake_socials")
     .select("links").eq("owner_id",ownerId).maybeSingle();
    if(readError)throw new Error("No se pudieron recuperar los enlaces guardados.");
    if(!current)return;
    onChange(rawLinks(data?.links));setDirty(false);setReady(true);onStatusChange("saved");
   }catch(e){if(!current)return;setError(e instanceof Error?e.message:"No se pudieron cargar las redes.");onStatusChange("error");}
  })();
  return()=>{current=false;alive.current=false;};
 },[ownerId,onChange,onStatusChange]);
 function edit(id:SocialPlatform,value:string){
  revision.current++;
  onChange({...links,[id]:value.slice(0,500)});
  setDirty(true);setError("");onStatusChange("saving");
 }
 useEffect(()=>{
  if(!ready||!dirty)return;
  const version=revision.current;
  const snapshot=rawLinks(links);
  const timer=window.setTimeout(()=>{
   queue.current=queue.current.catch(()=>{}).then(async()=>{
    try{
     const client=getSupabase();if(!client)throw new Error("No hay conexión.");
     const {error:saveError}=await client.from("smartjob_web_intake_socials").upsert({
      owner_id:ownerId,links:snapshot,updated_at:new Date().toISOString()
     },{onConflict:"owner_id"});
     if(saveError)throw new Error("No pudimos guardar los enlaces. Intenta de nuevo.");
     if(!alive.current||version!==revision.current)return;
     setDirty(false);setError("");onStatusChange("saved");
    }catch(e){
     if(!alive.current||version!==revision.current)return;
     setError(e instanceof Error?e.message:"No se pudieron guardar los enlaces.");onStatusChange("error");
    }
   });
  },500);
  return()=>window.clearTimeout(timer);
 },[links,ready,dirty,ownerId,retry,onStatusChange]);
 function showFirstTimeHelp(event:React.FocusEvent<HTMLInputElement>){
  if(helpShown.current)return;
  helpShown.current=true;
  focusInput.current=event.currentTarget;
  setShowHelp(true);
 }
 function closeHelp(){setShowHelp(false);focusInput.current?.focus();}
 return <section className={styles.root} aria-label="Redes sociales del negocio">
  <div className={styles.title}><Share2 size={17} aria-hidden="true"/>
   <div><strong>Redes sociales <span>(opcional)</span></strong>
    <small>Enlaza tus perfiles para que los clientes puedan visitarlos.</small></div>
  </div>
  <div className={styles.fields}>
   {SOCIAL_PLATFORMS.map(network=>{
    const Icon=Icons[network.id];
    const invalid=touched===network.id&&Boolean(links[network.id].trim())&&!normalizeSocialUrl(links[network.id],network.id);
    return <label key={network.id} className={styles.network}>
     <span><Icon size={15} aria-hidden="true"/>{network.label}</span>
     <input type="url" inputMode="url" autoComplete="url" maxLength={500}
      placeholder={network.placeholder} value={links[network.id]} disabled={!ready}
      aria-invalid={invalid} aria-describedby={invalid?"social-error-"+network.id:undefined}
      onFocus={showFirstTimeHelp} onBlur={()=>setTouched(network.id)}
      onChange={e=>{setTouched(null);edit(network.id,e.target.value);}}/>
     {invalid?<small id={"social-error-"+network.id} className={styles.invalid}>
      Pega un enlace válido de {network.label}.
     </small>:null}
    </label>;
   })}
  </div>
  <p role="status" className={styles.saveStatus}>
   {!ready&&!error?"Cargando enlaces…":dirty?"Guardando enlaces…":"Enlaces guardados"}
  </p>
  {error?<p role="alert" className={styles.error}>{error}
   <button type="button" onClick={()=>setRetry(n=>n+1)}>Reintentar</button>
  </p>:null}
  {showHelp?<div className={styles.backdrop} onMouseDown={e=>{if(e.target===e.currentTarget)closeHelp();}}>
   <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="social-help-title"
    aria-describedby="social-help-copy" onKeyDown={e=>{if(e.key==="Escape")closeHelp();}}>
    <div className={styles.icon}><Info size={22} aria-hidden="true"/></div>
    <button className={styles.close} type="button" aria-label="Cerrar" onClick={closeHelp}><X size={18}/></button>
    <h3 id="social-help-title">¿Cómo agregar tu perfil?</h3>
    <p id="social-help-copy">Ve a tu perfil, toca <strong>Compartir</strong>, elige <strong>Copiar enlace</strong> y pégalo aquí. Así tus clientes podrán visitarlo desde tu web.</p>
    <button className={styles.accept} type="button" onClick={closeHelp} autoFocus>Entendido</button>
   </div>
  </div>:null}
 </section>;
}
