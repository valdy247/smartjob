"use client";
import {useCallback,useEffect,useRef,useState,type CSSProperties} from "react";
import {ArrowLeft,Check,Copy,ExternalLink,Globe,Save,Send,Trash2,Plus,X,ArrowUp,ArrowDown,MessageCircle,Phone,Mail} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {defaultWebContent,normalizeWebContent,paletteStyles,webServices,webCategory,webPrimaryContact,webWhatsApp,webPhone,webEmail,type WebSiteContent,type WebPalette,type WebTemplate,type WebContactMethod} from "@/lib/web-services-site";
import {BUSINESS_CATEGORIES,CATEGORY_GROUPS} from "@/lib/vmv-business-categories";
import WebStudioImages from "./WebStudioImages";
import styles from "./WebServicesStudio.module.css";

const palettes:{id:WebPalette;name:string}[]=[
 {id:"violet",name:"Lavanda"},{id:"mint",name:"Menta"},
 {id:"amber",name:"Dorado"},{id:"ink",name:"Grafito"}
];
const templates:{id:WebTemplate;name:string}[]=[
 {id:"editorial",name:"Editorial"},{id:"showcase",name:"Impacto"},
 {id:"minimal",name:"Minimal"}
];
const fields:{id:Exclude<keyof WebSiteContent,"template"|"palette"|"categoryId"|"heroImage"|"gallery"|"services"|"eyebrow"|"contactMethod"|"whatsapp"|"contactMessage"|"action"|"inquiriesEnabled">;label:string;max:number;multi?:boolean;type?:"email"|"tel"}[]=[
 {id:"business",label:"Nombre del negocio",max:100},
 {id:"headline",label:"Título principal",max:180,multi:true},
 {id:"intro",label:"Presentación",max:400,multi:true},
 {id:"about",label:"Sobre nosotros",max:900,multi:true},
 {id:"email",label:"Correo",max:180,type:"email"},
 {id:"phone",label:"Teléfono",max:36,type:"tel"},
 {id:"address",label:"Dirección",max:250,multi:true},
];
function siteSlug(brand:string):string{
 const name=brand.normalize("NFKD").toLowerCase().replace(/[\u0300-\u036f]/g,"")
  .replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,35).replace(/-+$/g,"");
 return (name||"mi-negocio")+"-"+crypto.randomUUID().slice(0,10).replace(/-/g,"");
}
export default function WebServicesStudio({ownerId,onBack}:{ownerId:string;onBack:()=>void}){
 const [content,setContent]=useState<WebSiteContent>({...defaultWebContent});
 const [slug,setSlug]=useState<string|null>(null);
 const [published,setPublished]=useState(false);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [ready,setReady]=useState(false);
 const [status,setStatus]=useState("");
 const [mobile,setMobile]=useState(false);
 const [studioMode,setStudioMode]=useState<"edit"|"preview"|"publish">("edit");
 const [newService,setNewService]=useState("");
 const [savedSnapshot,setSavedSnapshot]=useState("");
 const [publishedSnapshot,setPublishedSnapshot]=useState<string|null>(null);
 const [recovery,setRecovery]=useState<WebSiteContent|null>(null);
 const [origin,setOrigin]=useState("");
 const recoveryKey="vmv.web-studio.recovery.v1."+ownerId;
 const currentSnapshot=JSON.stringify(normalizeWebContent(content));
 const dirty=ready&&currentSnapshot!==savedSnapshot;
 const unPublishedChanges=published&&publishedSnapshot!==currentSnapshot;
 const contentRef=useRef(content);
 const baselineRef=useRef(savedSnapshot);
 const readyRef=useRef(ready);
 contentRef.current=content;
 baselineRef.current=savedSnapshot;
 readyRef.current=ready;
 useEffect(()=>{setOrigin(window.location.origin);},[]);
 const verify=useCallback(async()=>{
  const client=getSupabase();
  if(!client)throw new Error("Conexión no configurada");
  const {data,error}=await client.auth.getUser();
  if(error||!data.user||data.user.id!==ownerId||data.user.is_anonymous)throw new Error("Inicia sesión nuevamente");
  return client;
 },[ownerId]);
 useEffect(()=>{
  let active=true;
  setLoading(true);setReady(false);setStatus("");setContent({...defaultWebContent});setPublished(false);setSlug(null);
  setRecovery(null);setSavedSnapshot("");setPublishedSnapshot(null);
  void (async()=>{
   try{
    const client=await verify();
    const [own,publicSite,categoryPreference]=await Promise.all([
     client.from("smartjob_web_sites").select("slug,draft,updated_at").eq("owner_id",ownerId).maybeSingle(),
     client.from("smartjob_web_publications").select("slug,content").eq("owner_id",ownerId).maybeSingle(),
     client.from("smartjob_business_category_preferences").select("category_id").eq("owner_id",ownerId).maybeSingle()
    ]);
    if(own.error||publicSite.error||categoryPreference.error)throw new Error("No se pudo cargar tu web");
    if(!active)return;
    const websiteDraft=own.data?normalizeWebContent(own.data.draft):{...defaultWebContent};
    if(!websiteDraft.categoryId&&typeof categoryPreference.data?.category_id==="string")websiteDraft.categoryId=categoryPreference.data.category_id;
    setContent(websiteDraft);
    const remoteJson=JSON.stringify(normalizeWebContent(websiteDraft));
    setSavedSnapshot(remoteJson);
    if(own.data)setSlug(own.data.slug as string);
    setPublished(Boolean(publicSite.data));
    setPublishedSnapshot(publicSite.data?JSON.stringify(normalizeWebContent(publicSite.data.content)):null);
    try{
     const raw=window.localStorage.getItem(recoveryKey);
     if(raw){
      const backup=JSON.parse(raw) as {version?:unknown;savedAt?:unknown;draft?:unknown};
      const backupTime=typeof backup.savedAt==="string"?Date.parse(backup.savedAt):NaN;
      const remoteTime=own.data?.updated_at?Date.parse(String(own.data.updated_at)):0;
      const backupContent=normalizeWebContent(backup.draft);
      if(backup.version===1&&Number.isFinite(backupTime)&&backupTime>remoteTime&&
         JSON.stringify(backupContent)!==remoteJson){
       setRecovery(backupContent);
      }else window.localStorage.removeItem(recoveryKey);
     }
    }catch{/* Private browsing, storage access denied or corrupt backup. */}
    setReady(true);
   }catch(error){if(active)setStatus(error instanceof Error?error.message:"No disponible");}
   finally{if(active)setLoading(false);}
  })();
  return()=>{active=false;};
 },[ownerId,verify,recoveryKey]);
 // Keep an account-isolated recovery copy without writing unapproved changes to the public site.
 useEffect(()=>{
  if(!dirty||recovery)return;
  try{
   window.localStorage.setItem(recoveryKey,JSON.stringify({
    version:1,savedAt:new Date().toISOString(),draft:normalizeWebContent(content)
   }));
  }catch{/* Browser storage may be unavailable. */}
 },[dirty,recovery,recoveryKey,content]);
 useEffect(()=>{
  if(!dirty)return;
  const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};
  window.addEventListener("beforeunload",warn);
  return()=>window.removeEventListener("beforeunload",warn);
 },[dirty]);
 useEffect(()=>{
  return ()=>{
   try{
    if(!readyRef.current)return;
    const latest=normalizeWebContent(contentRef.current);
    if(JSON.stringify(latest)!==baselineRef.current){
     window.localStorage.setItem(recoveryKey,JSON.stringify({version:1,savedAt:new Date().toISOString(),draft:latest}));
    }
   }catch{/* Local backup is best effort. */}
  };
 },[recoveryKey]);
 const update=(key:Exclude<keyof WebSiteContent,"template"|"palette"|"gallery"|"categoryId"|"heroImage"|"eyebrow"|"services"|"contactMethod"|"inquiriesEnabled">,value:string)=>{
  setContent(old=>({...old,[key]:value}));setStatus("");
 };
 const serviceItemsEditor=content.services?content.services.split(/\r?\n/).slice(0,6):[];
 const mutateServices=(values:string[])=>{
  setContent(old=>({...old,services:values.slice(0,6).join("\n")}));setStatus("");
 };
 const addService=()=>{
  const value=newService.trim().replace(/[\r\n]+/g," ").slice(0,70);
  if(!value||serviceItemsEditor.length>=6)return;
  if(serviceItemsEditor.some(item=>item.trim().toLocaleLowerCase("es")===value.toLocaleLowerCase("es"))){
   setStatus("Ese servicio ya está agregado");return;
  }
  mutateServices([...serviceItemsEditor,value]);setNewService("");
 };
 const validate=(next:WebSiteContent)=>{
  if(next.business.length<2||next.headline.length<3){setStatus("Completa el negocio y el título");return false;}
  if(!next.categoryId){setStatus("Selecciona la categoría del negocio");setStudioMode("edit");return false;}
  if(next.contactMethod!=="section"&&webPrimaryContact(next).kind==="section"){
   setStatus(next.contactMethod==="whatsapp"?"Indica WhatsApp con código de país (+1...)":next.contactMethod==="call"?"Indica un teléfono válido":"Indica un correo válido");
   setStudioMode("edit");return false;
  }
  return true;
 };
 const store=async(next:WebSiteContent):Promise<string>=>{
  const client=await verify();
  const generated=slug||siteSlug(next.business);
  const {data,error}=await client.from("smartjob_web_sites").upsert({
   owner_id:ownerId,slug:generated,draft:next,updated_at:new Date().toISOString()
  },{onConflict:"owner_id"}).select("slug").single();
  if(error||!data?.slug)throw new Error(error?.code==="23505"?"Vuelve a guardar":"Error al guardar");
  setSlug(data.slug as string);
  if(next.categoryId){
   const {error:categoryError}=await client.from("smartjob_business_category_preferences").upsert({owner_id:ownerId,category_id:next.categoryId,updated_at:new Date().toISOString()},{onConflict:"owner_id"});
   if(categoryError)throw new Error("Sitio guardado, pero no se pudo sincronizar la categoría");
  }
  return data.slug as string;
 };
 const save=async()=>{
  if(busy||!ready)return;
  // A draft may be incomplete; validation is required only when publishing.
  const next=normalizeWebContent(content);
  setBusy(true);setStatus("");
  try{
   await store(next);setSavedSnapshot(JSON.stringify(next));setStatus("Borrador guardado");
   if(JSON.stringify(normalizeWebContent(contentRef.current))===JSON.stringify(next)){
    try{window.localStorage.removeItem(recoveryKey);}catch{/* ignore */}
   }
  }
  catch(e){setStatus(e instanceof Error?e.message:"No se pudo guardar");}
  finally{setBusy(false);}
 };
 const publish=async()=>{
  if(busy||!ready)return;
  const next=normalizeWebContent(content);
  if(!validate(next))return;
  setBusy(true);setStatus("");
  try{
   const currentSlug=await store(next);
   setSavedSnapshot(JSON.stringify(next));
   if(JSON.stringify(normalizeWebContent(contentRef.current))===JSON.stringify(next)){
    try{window.localStorage.removeItem(recoveryKey);}catch{/* ignore */}
   }
   const client=await verify();
   const {data,error}=await client.from("smartjob_web_publications").upsert({
    owner_id:ownerId,slug:currentSlug,content:next,published_at:new Date().toISOString()
   },{onConflict:"owner_id"}).select("slug").single();
   if(error||!data)throw new Error("No se pudo publicar");
   setPublished(true);setPublishedSnapshot(JSON.stringify(next));setStatus("Sitio publicado");
  }catch(e){setStatus(e instanceof Error?e.message:"No se pudo publicar");}
  finally{setBusy(false);}
 };
 const unpublish=async()=>{
  if(busy||!published||!window.confirm("¿Retirar la página pública?"))return;
  setBusy(true);setStatus("");
  try{
   const client=await verify();
   const {data,error}=await client.from("smartjob_web_publications").delete()
    .eq("owner_id",ownerId).select("owner_id");
   if(error||!data?.length)throw new Error("No se pudo retirar");
   setPublished(false);setPublishedSnapshot(null);setStatus("Página retirada");
  }catch(e){setStatus(e instanceof Error?e.message:"No se pudo retirar");}
  finally{setBusy(false);}
 };
 const link=origin&&slug?origin+"/sites/"+encodeURIComponent(slug):null;
 const shareSite=async()=>{
  if(!published||!link)return;
  try{
   if(typeof navigator.share==="function"){
    await navigator.share({title:content.business||"Mi negocio",text:"Visita nuestra página web",url:link});
    setStatus("Enlace compartido");
   }else{
    await navigator.clipboard.writeText(link);
    setStatus("Enlace copiado");
   }
  }catch(error){
   if(error instanceof Error&&error.name==="AbortError")return;
   setStatus("No se pudo compartir");
  }
 };
 const palette=paletteStyles[content.palette];
 const tokens={"--web-color":palette.accent,"--web-light":palette.light,"--web-ink":palette.ink} as CSSProperties;
 const serviceItems=webServices(content);
 return <section className={styles.studio} aria-label="Creador web">
  <div className={styles.heading}><div><span>WEB STUDIO</span><h2>Crea tu web<b>.</b></h2></div>
   {!loading&&ready?<span className={styles.draftIndicator}>{dirty?"Sin guardar":"Guardado"}</span>:null}
  </div>
  {loading?<p className={styles.notice}>Cargando…</p>:!ready?<p className={styles.notice} role="alert">{status}</p>:<>
   {recovery?<div className={styles.recovery} role="status">
    <span>Encontramos cambios sin guardar.</span>
    <div>
     <button type="button" onClick={()=>{setContent(recovery);setRecovery(null);setStatus("Cambios recuperados");}}>Recuperar</button>
     <button type="button" onClick={()=>{setRecovery(null);try{window.localStorage.removeItem(recoveryKey);}catch{/* ignore */}}}>Descartar</button>
    </div>
   </div>:null}
   <div className={styles.switch} role="tablist" aria-label="Etapas del estudio web">
    <button type="button" role="tab" aria-selected={studioMode==="edit"} className={studioMode==="edit"?styles.active:""} onClick={()=>{setStudioMode("edit");setStatus("");}}>Contenido</button>
    <button type="button" role="tab" aria-selected={studioMode==="preview"} className={studioMode==="preview"?styles.active:""} onClick={()=>{setStudioMode("preview");setStatus("");}}>Diseño</button>
    <button type="button" role="tab" aria-selected={studioMode==="publish"} className={studioMode==="publish"?styles.active:""} onClick={()=>{setStudioMode("publish");setStatus("");}}>Publicación</button>
   </div>
   {status?<p className={styles.notice} role="status" aria-live="polite">{status}</p>:null}
   {studioMode!=="publish"?<div className={styles.modeToolbar}>
    <button type="button" className={styles.save} disabled={busy} onClick={()=>void save()}><Save size={16}/> {busy?"Guardando…":"Guardar cambios"}</button>
   </div>:null}
   {studioMode!=="publish"?<div className={styles.workbench} data-mode={studioMode}>
    <div className={styles.editor} hidden={studioMode!=="edit"}>
     <header className={styles.panelHead}><strong>Contenido</strong><small>EDITAR</small></header>
     <div className={styles.fields}>
      <label className={styles.field}><span>Categoría de negocio</span>
       <select value={content.categoryId} onChange={e=>{setContent(v=>({...v,categoryId:e.target.value}));setStatus("");}}
        aria-label="Selecciona la categoría de tu negocio">
        <option value="">Seleccionar categoría</option>
        {CATEGORY_GROUPS.map(group=><optgroup key={group} label={group}>
         {BUSINESS_CATEGORIES.filter(cat=>cat.group===group).map(cat=><option key={cat.id} value={cat.id}>{cat.label}</option>)}
        </optgroup>)}
       </select>
      </label>
      {fields.map(f=><label key={f.id} className={styles.field}>
       <span>{f.label}</span>
       {f.multi?<textarea maxLength={f.max} rows={f.id==="about"?4:3} spellCheck={false} autoCorrect="off" autoCapitalize="none" autoComplete="off" value={content[f.id]}
          onChange={e=>update(f.id,e.target.value)} placeholder={f.label}/>:
        <input type={f.type||"text"} maxLength={f.max} spellCheck={false} autoCorrect="off" autoCapitalize="none" autoComplete="off" value={content[f.id]}
          onChange={e=>update(f.id,e.target.value)} placeholder={f.label}/>}
      </label>)}
      <section className={styles.contactPanel} aria-label="Contacto directo del sitio">
       <div className={styles.contactPanelHeading}><MessageCircle size={16}/><strong>Conseguir clientes</strong></div>
       <label className={styles.field}><span>Texto del botón principal</span>
        <input maxLength={45} type="text" spellCheck={false} autoCorrect="off" value={content.action} placeholder="Hacer un pedido"
         onChange={e=>update("action",e.target.value)}/>
       </label>
       <label className={styles.field}><span>Al pulsar el botón</span>
        <select value={content.contactMethod} onChange={e=>{setContent(v=>({...v,contactMethod:e.target.value as WebContactMethod}));setStatus("");}}
         aria-label="Acción del botón principal">
         <option value="section">Ver contacto</option>
         <option value="whatsapp">Abrir WhatsApp</option>
         <option value="call">Llamar al negocio</option>
         <option value="email">Enviar correo</option>
        </select>
       </label>
       {content.contactMethod==="whatsapp"?<>
        <label className={styles.field}><span>WhatsApp empresarial</span>
         <input type="tel" inputMode="tel" spellCheck={false} autoCorrect="off" maxLength={32}
          placeholder="+1 239 406 1146" value={content.whatsapp} onChange={e=>update("whatsapp",e.target.value)}/>
        </label>
        <label className={styles.field}><span>Mensaje inicial</span>
         <textarea rows={2} maxLength={250} spellCheck={false} autoCorrect="off" autoCapitalize="none"
          placeholder="Hola, quisiera hacer un pedido" value={content.contactMessage} onChange={e=>update("contactMessage",e.target.value)}/>
        </label>
       </>:null}
       {content.contactMethod==="call"&&!webPhone(content)?<small className={styles.contactFieldError}>Agrega un teléfono válido arriba</small>:null}
       {content.contactMethod==="email"&&!webEmail(content)?<small className={styles.contactFieldError}>Agrega un correo válido arriba</small>:null}
       {content.contactMethod==="whatsapp"&&!webWhatsApp(content)?<small className={styles.contactFieldError}>Incluye el código de país, por ejemplo +1</small>:null}
       <label className={styles.inquiryToggle}>
        <span><strong>Recibir solicitudes en la web</strong><small>Formulario para nuevos clientes</small></span>
        <input type="checkbox" role="switch" checked={content.inquiriesEnabled}
         onChange={e=>{setContent(v=>({...v,inquiriesEnabled:e.target.checked}));setStatus("");}}/>
       </label>
      </section>
      <div className={styles.serviceEditor}>
       <div className={styles.serviceHeader}><strong>Servicios</strong><span>{serviceItemsEditor.length}/6</span></div>
       {serviceItemsEditor.map((name,i)=><div className={styles.serviceRow} key={i}>
        <small>{String(i+1).padStart(2,"0")}</small>
        <input aria-label={"Servicio "+(i+1)} type="text" spellCheck={false} autoComplete="off"
         maxLength={70} value={name} onChange={e=>mutateServices(serviceItemsEditor.map((old,j)=>j===i?e.target.value.replace(/[\r\n]/g," "):old))}/>
        <button type="button" disabled={i===0} aria-label={"Subir servicio "+(i+1)}
         onClick={()=>{const next=[...serviceItemsEditor];[next[i-1],next[i]]=[next[i],next[i-1]];mutateServices(next);}}><ArrowUp size={13}/></button>
        <button type="button" disabled={i===serviceItemsEditor.length-1} aria-label={"Bajar servicio "+(i+1)}
         onClick={()=>{const next=[...serviceItemsEditor];[next[i+1],next[i]]=[next[i],next[i+1]];mutateServices(next);}}><ArrowDown size={13}/></button>
        <button type="button" aria-label={"Eliminar servicio "+(i+1)}
         onClick={()=>mutateServices(serviceItemsEditor.filter((_,j)=>j!==i))}><X size={15}/></button>
       </div>)}
       {serviceItemsEditor.length<6?<div className={styles.addService}>
        <input aria-label="Nuevo servicio" spellCheck={false} autoComplete="off" placeholder="Añadir un servicio" maxLength={70}
         value={newService} onChange={e=>setNewService(e.target.value)}
         onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();addService();}}}/>
        <button type="button" disabled={!newService.trim()} onClick={addService} aria-label="Agregar servicio"><Plus size={17}/></button>
       </div>:null}
      </div>
      <WebStudioImages ownerId={ownerId} busy={busy} content={content}
       onMessage={setStatus} onChange={next=>{setContent(v=>({...v,...next}));setStatus("Imágenes actualizadas. Guarda los cambios.");}}/>
     </div>
    </div>
    <div className={styles.visual} hidden={studioMode!=="preview"}>
     <header className={styles.panelHead}><strong>Vista previa</strong>
      <div className={styles.devices}><button type="button" aria-pressed={!mobile} onClick={()=>setMobile(false)} className={!mobile?styles.active:""}>Web</button>
      <button type="button" aria-pressed={mobile} onClick={()=>setMobile(true)} className={mobile?styles.active:""}>Móvil</button></div>
     </header>
     <div className={styles.visualDesign}>
      <span className={styles.fieldTitle}>Plantilla</span>
      <div className={styles.options} role="group" aria-label="Plantilla">
       {templates.map(t=><button type="button" key={t.id} aria-pressed={content.template===t.id}
        className={content.template===t.id?styles.active:""}
        onClick={()=>{setContent(v=>({...v,template:t.id}));setStatus("");}}>{t.name}</button>)}
      </div>
      <span className={styles.fieldTitle}>Color</span>
      <div className={styles.options} role="group" aria-label="Color">
       {palettes.map(p=><button type="button" key={p.id} aria-pressed={content.palette===p.id}
        className={content.palette===p.id?styles.active:""}
        onClick={()=>{setContent(v=>({...v,palette:p.id}));setStatus("");}}><i aria-hidden="true" className={styles.paletteDot} style={{background:paletteStyles[p.id].accent}}/>{p.name}</button>)}
      </div>

     </div>
     <div className={styles.previewBg}>
      <div className={mobile?styles.mobile:styles.device} style={tokens}>
       <div className={styles.bar}><i/><i/><i/><span>{slug||"mi-negocio"}</span></div>
       <div className={styles.site}>
        <div className={styles.siteNav}><strong>{content.business||"Mi negocio"}<b>.</b></strong><small>Servicios　 Contacto</small></div>
        <div className={[styles.hero,content.template==="showcase"?styles.showcase:content.template==="minimal"?styles.minimal:""].join(" ")}>
         <small>{webCategory(content)}</small>
         <h3>{content.headline||"Tu próxima gran idea comienza aquí."}</h3>
         {content.intro?<p>{content.intro}</p>:null}
         {content.heroImage?<img className={styles.heroImage} src={content.heroImage} alt="Portada del negocio"/>:null}
         <span className={styles.cta}>{content.action||"Contáctanos"} ↗</span>
         {content.contactMethod==="whatsapp"&&webWhatsApp(content)?<small className={styles.previewChannel}><MessageCircle size={11}/> WhatsApp</small>:null}
        </div>
        <div className={styles.serviceArea}><h4>Lo que hacemos<b>.</b></h4>
         <div>{(serviceItems.length?serviceItems:["Tus servicios"]).map((name,i)=><span key={i}>{name} ↗</span>)}</div>
         {content.gallery.length?<div className={styles.previewGallery}>{content.gallery.map(url=><img src={url} key={url} alt="Galería del negocio"/>)}</div>:null}
         {content.inquiriesEnabled?<div className={styles.previewInquiry}><strong>Solicitud de servicio</strong><span>Nombre · Contacto · Detalles</span><b>Enviar solicitud ↗</b></div>:null}
        </div>
       </div>
      </div>
     </div>

    </div>
   </div>:<section className={styles.publication} aria-label="Publicar y administrar la web">
    <div className={styles.publicationHeader}>
     <div className={styles.publicationIcon}><Globe size={23}/></div>
     <div className={styles.publicationInfo}>
      <span className={styles.publicationCaption}>ESTADO DE TU WEB</span>
      <strong>{unPublishedChanges?"Tienes cambios por publicar":published?"Tu web está publicada":"Tu web está en borrador"}</strong>
     </div>
     <span className={styles.publicationBadge}>{unPublishedChanges?"Por actualizar":published?"Activa":"Borrador"}</span>
    </div>
    <button type="button" className={styles.primaryPublish} disabled={busy} onClick={()=>void publish()}>
     <Send size={17}/>{busy?"Procesando…":published?"Actualizar publicación":"Publicar web"}
    </button>
    {published&&link?<div className={styles.publicationLink}>
     <span className={styles.publicationCaption}>TU SITIO PÚBLICO</span>
     <div className={styles.publicationAddress}><Globe size={17}/><span>{slug}</span></div>
     <div className={styles.publicationLinkActions}>
      <a href={link} target="_blank" rel="noopener noreferrer"><ExternalLink size={16}/> Abrir sitio</a>
      <button type="button" onClick={()=>void shareSite()}><Copy size={16}/> Compartir</button>
     </div>
    </div>:null}
    {published?<button type="button" className={styles.withdraw} disabled={busy} onClick={()=>void unpublish()}><Trash2 size={16}/> Retirar publicación</button>:null}
    <button type="button" className={styles.closeStudio} onClick={onBack}><ArrowLeft size={15}/> Volver a Web Services</button>
   </section>}
  </>}
 </section>;
}
