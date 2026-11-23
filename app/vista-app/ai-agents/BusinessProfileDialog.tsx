"use client";
import {useEffect,useRef,useState} from "react";
import {useInterfaceLanguage} from "@/lib/i18n-web";
import {getSupabase} from "@/lib/supabase";
import {centralBusinessDefaults,centralBusinessWritePayload,validCentralBusiness,type CentralBusiness} from "@/lib/vmv-central-business";
import BusinessCategoryPicker from "@/components/BusinessCategoryPicker";
import CentralBusinessEditor,{emptyBusinessFiles} from "../marketing/CentralBusinessEditor";
import {linkLegacyWorkspace,type AiWorkspace} from "./centralBusiness";
import styles from "./page.module.css";

type Props={businessId?:string;initialName?:string;legacy:AiWorkspace[];initialLegacyId?:string|null;onClose:()=>void;onSaved:(id:string)=>Promise<void>};
export default function BusinessProfileDialog({businessId,initialName,legacy,initialLegacyId,onClose,onSaved}:Props){
 const {language}=useInterfaceLanguage();
 const L=(es:string,en:string)=>language==="en"?en:es;
 const dialog=useRef<HTMLDialogElement>(null);
 const [business,setBusiness]=useState<CentralBusiness>(()=>({id:businessId||crypto.randomUUID(),owner_id:"",...centralBusinessDefaults(initialName||"")}));
 const [stamp,setStamp]=useState<string|null>(null);
 const [exists,setExists]=useState(Boolean(businessId));
 const [loading,setLoading]=useState(Boolean(businessId));
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState("");
 const [link,setLink]=useState(false);
 const [legacyId,setLegacyId]=useState(initialLegacyId||legacy[0]?.id||"");
 const savingRef=useRef(false);
 useEffect(()=>{const node=dialog.current;node?.showModal();return()=>node?.close();},[]);
 useEffect(()=>{
  if(!businessId)return;
  let alive=true;
  void (async()=>{
   try{
    const db=getSupabase();if(!db)throw Error();
    const auth=await db.auth.getUser();if(auth.error||!auth.data.user||auth.data.user.is_anonymous)throw Error();
    const r=await db.from("vmv_marketing_businesses").select("*").eq("id",businessId).eq("owner_id",auth.data.user.id).single();
    if(r.error||!r.data)throw Error();
    if(alive){setBusiness(r.data as CentralBusiness);setStamp(r.data.updated_at);}
   }catch{if(alive)setError(L("No pudimos cargar el negocio. Cierra esta ventana y vuelve a intentarlo.","We could not load the business. Close this window and try again."));}
   finally{if(alive)setLoading(false);}
  })();return()=>{alive=false;};
 },[businessId]);
 const save=async()=>{
  if(savingRef.current||loading||(businessId&&!stamp))return;
  const invalid=validCentralBusiness(business);
  if(invalid){setError(L("Revisa el nombre (2–150 caracteres), país, correo y sitio web.","Check the name (2–150 characters), country, email and website."));return;}
  savingRef.current=true;setSaving(true);setError("");
  try{
   const db=getSupabase();if(!db)throw Error(L("No pudimos conectar con VMV.","We could not connect to VMV."));
   const auth=await db.auth.getUser();const owner=auth.data.user;
   if(auth.error||!owner||owner.is_anonymous)throw Error(L("Inicia sesión para guardar tu negocio.","Sign in to save your business."));
   const payload=centralBusinessWritePayload(business);
   const result=exists?
    await db.from("vmv_marketing_businesses").update(payload).eq("id",business.id).eq("owner_id",owner.id).eq("updated_at",stamp).select("*").maybeSingle():
    await db.from("vmv_marketing_businesses").insert({...payload,id:business.id,owner_id:owner.id}).select("*").single();
   if(result.error){
    if(!exists){
     // A timed-out insert may have succeeded. Keep its stable ID for retry,
     // but do not silently overwrite a record that was subsequently edited.
     const check=await db.from("vmv_marketing_businesses").select("*").eq("id",business.id).eq("owner_id",owner.id).maybeSingle();
     if(check.data){setBusiness(check.data as CentralBusiness);setExists(true);setStamp(check.data.updated_at);throw Error(L("El negocio ya se guardó. Revisa los datos y pulsa Guardar para continuar.","The business was already saved. Review its details and save to continue."));}
    }
    throw Error(result.error.code==="23505"?L("Ya existe un negocio con ese nombre. Selecciónalo en la lista.","A business with that name already exists. Select it from the list."):L("No pudimos guardar. Comprueba los datos y el límite de negocios de tu plan.","Could not save. Check your details and your plan’s business limit."));
   }
   if(!result.data)throw Error(L("El negocio cambió en otra sesión. Cierra esta ventana y vuelve a abrirlo antes de guardar.","This business changed in another session. Close and reopen this window before saving."));
   setBusiness(result.data as CentralBusiness);setExists(true);setStamp(result.data.updated_at);
   if(link&&legacyId)await linkLegacyWorkspace(legacyId,business.id);
   await onSaved(business.id);
  }catch(e){setError(e instanceof Error?e.message:L("No pudimos guardar el negocio.","Could not save the business."));}
  finally{savingRef.current=false;setSaving(false);}
 };
 return <dialog ref={dialog} className={styles.businessDialog} aria-labelledby="agent-business-title" onCancel={e=>{e.preventDefault();if(!saving)onClose();}}>
  <header className={styles.businessDialogHead}><h2 id="agent-business-title">{businessId?L("Editar negocio","Edit business"):L("Configura tu negocio","Set up your business")}</h2><button type="button" disabled={saving} onClick={onClose} aria-label={L("Cerrar configuración del negocio","Close business setup")}>×</button></header>
  
  {error?<p role="alert" className={styles.businessError}>{error}</p>:null}
  {loading?<p role="status">{L("Cargando negocio…","Loading business…")}</p>:<form onSubmit={e=>{e.preventDefault();void save();}}>
   <fieldset disabled={saving||Boolean(businessId&&!stamp)} className={styles.businessFields}>
    <label>{L("Nombre del negocio","Business name")}<input autoFocus value={business.name} maxLength={150} onChange={e=>setBusiness({...business,name:e.target.value})} required minLength={2}/></label>
    <label>{L("Actividad","Business category")}<BusinessCategoryPicker value={business.category_id} onChange={category_id=>setBusiness({...business,category_id})}/></label>
    <label>{L("Sitio web (opcional)","Website (optional)")}<input inputMode="url" value={business.website_url||""} maxLength={500} placeholder="tunegocio.com" onChange={e=>setBusiness({...business,website_url:e.target.value})}/></label>
    <CentralBusinessEditor business={business} onChange={setBusiness} files={emptyBusinessFiles} onFiles={()=>{}} allowImages={false}/>
    {legacy.length>0?<div className={styles.businessLinkPanel}>
     <label><input type="checkbox" checked={link} onChange={e=>setLink(e.target.checked)}/>{L("Vincular mis agentes existentes a este negocio","Link my existing agents to this business")}</label>
     {link?<><select aria-label={L("Agentes existentes que deseas vincular","Existing agents to link")} value={legacyId} onChange={e=>setLegacyId(e.target.value)}>{legacy.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select><small>{L("Conservarás sus agentes, pedidos y llamadas. La línea telefónica no cambia.","Your agents, orders and calls are preserved. The phone line does not change.")}</small></>:null}
    </div>:null}
   </fieldset>
   <footer className={styles.businessDialogActions}><button type="button" disabled={saving} onClick={onClose}>{L("Cancelar","Cancel")}</button><button type="submit" disabled={saving||Boolean(businessId&&!stamp)}>{saving?L("Guardando…","Saving…"):L("Guardar y continuar","Save and continue")}</button></footer>
  </form>}
 </dialog>;
}
