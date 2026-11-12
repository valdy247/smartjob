"use client";
import {useCallback,useEffect,useState,type CSSProperties} from "react";
import {ArrowLeft,Check,Copy,ExternalLink,Globe,Save,Send,Trash2} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {defaultWebContent,normalizeWebContent,paletteStyles,webServices,type WebSiteContent,type WebPalette,type WebTemplate} from "@/lib/web-services-site";
import styles from "./WebServicesStudio.module.css";

const palettes:{id:WebPalette;name:string}[]=[
 {id:"violet",name:"Lavanda"},{id:"mint",name:"Menta"},
 {id:"amber",name:"Dorado"},{id:"ink",name:"Grafito"}
];
const templates:{id:WebTemplate;name:string}[]=[
 {id:"editorial",name:"Editorial"},{id:"showcase",name:"Impacto"},
 {id:"minimal",name:"Minimal"}
];
const fields:{id:Exclude<keyof WebSiteContent,"template"|"palette">;label:string;max:number;multi?:boolean;type?:"email"|"tel"}[]=[
 {id:"business",label:"Nombre del negocio",max:100},
 {id:"headline",label:"Título principal",max:180,multi:true},
 {id:"eyebrow",label:"Etiqueta",max:70},
 {id:"intro",label:"Presentación",max:400,multi:true},
 {id:"about",label:"Sobre nosotros",max:900,multi:true},
 {id:"services",label:"Servicios (uno por línea)",max:450,multi:true},
 {id:"email",label:"Correo",max:180,type:"email"},
 {id:"phone",label:"Teléfono",max:36,type:"tel"},
 {id:"address",label:"Dirección",max:250,multi:true},
 {id:"action",label:"Botón",max:45}
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
 const [studioMode,setStudioMode]=useState<"edit"|"preview">("edit");
 const [origin,setOrigin]=useState("");
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
  void (async()=>{
   try{
    const client=await verify();
    const [own,publicSite]=await Promise.all([
     client.from("smartjob_web_sites").select("slug,draft").eq("owner_id",ownerId).maybeSingle(),
     client.from("smartjob_web_publications").select("slug").eq("owner_id",ownerId).maybeSingle()
    ]);
    if(own.error||publicSite.error)throw new Error("No se pudo cargar tu web");
    if(!active)return;
    if(own.data){setContent(normalizeWebContent(own.data.draft));setSlug(own.data.slug as string);}
    setPublished(Boolean(publicSite.data));setReady(true);
   }catch(error){if(active)setStatus(error instanceof Error?error.message:"No disponible");}
   finally{if(active)setLoading(false);}
  })();
  return()=>{active=false;};
 },[ownerId,verify]);
 const update=(key:Exclude<keyof WebSiteContent,"template"|"palette">,value:string)=>{
  setContent(old=>({...old,[key]:value}));setStatus("");
 };
 const validate=(next:WebSiteContent)=>{
  if(next.business.length<2||next.headline.length<3){setStatus("Completa el negocio y el título");return false;}
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
  return data.slug as string;
 };
 const save=async()=>{
  if(busy||!ready)return;
  const next=normalizeWebContent(content);
  if(!validate(next))return;
  setBusy(true);setStatus("");
  try{await store(next);setStatus("Borrador guardado");}
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
   const client=await verify();
   const {data,error}=await client.from("smartjob_web_publications").upsert({
    owner_id:ownerId,slug:currentSlug,content:next,published_at:new Date().toISOString()
   },{onConflict:"owner_id"}).select("slug").single();
   if(error||!data)throw new Error("No se pudo publicar");
   setPublished(true);setStatus("Sitio publicado");
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
   setPublished(false);setStatus("Página retirada");
  }catch(e){setStatus(e instanceof Error?e.message:"No se pudo retirar");}
  finally{setBusy(false);}
 };
 const link=origin&&slug?origin+"/sites/"+encodeURIComponent(slug):null;
 const copy=async()=>{
  if(!link||!published)return;
  try{await navigator.clipboard.writeText(link);setStatus("Enlace copiado");}
  catch{setStatus("No se pudo copiar");}
 };
 const palette=paletteStyles[content.palette];
 const tokens={"--web-color":palette.accent,"--web-light":palette.light,"--web-ink":palette.ink} as CSSProperties;
 const serviceItems=webServices(content);
 return <section className={styles.studio} aria-label="Creador web">
  <button type="button" className={styles.back} onClick={onBack}><ArrowLeft size={18}/> Web Services</button>
  <div className={styles.heading}><div><span>WEB STUDIO</span><h2>Crea tu web<b>.</b></h2></div>
   <small>{loading?"Cargando":published?"Publicado":"Borrador"}</small>
  </div>
  {loading?<p className={styles.notice}>Cargando…</p>:!ready?<p className={styles.notice} role="alert">{status}</p>:<>
   <div className={styles.switch} role="group" aria-label="Sección del estudio">
    <button type="button" className={studioMode==="edit"?styles.active:""} aria-pressed={studioMode==="edit"}
     onClick={()=>setStudioMode("edit")}>Editar contenido</button>
    <button type="button" className={studioMode==="preview"?styles.active:""} aria-pressed={studioMode==="preview"}
     onClick={()=>setStudioMode("preview")}>Vista previa</button>
   </div>
   <div className={styles.actions}>
    <button type="button" className={styles.save} disabled={busy} onClick={()=>void save()}><Save size={17}/> Guardar</button>
    <button type="button" className={styles.publish} disabled={busy} onClick={()=>void publish()}><Send size={17}/> {busy?"Guardando…":published?"Actualizar web":"Publicar web"}</button>
    {published?<button type="button" className={styles.delete} disabled={busy} onClick={()=>void unpublish()} aria-label="Retirar web"><Trash2 size={18}/></button>:null}
   </div>
   {published&&link?<div className={styles.url}><Globe size={16}/>
    <a href={link} target="_blank" rel="noopener noreferrer">{link.replace(/^https?:\/\//,"")}</a>
    <button type="button" onClick={()=>void copy()} aria-label="Copiar enlace"><Copy size={16}/></button>
    <a href={link} target="_blank" rel="noopener noreferrer" aria-label="Abrir web"><ExternalLink size={16}/></a>
   </div>:null}
   <p className={styles.notice} role="status" aria-live="polite">{status?<><Check size={15}/>{status}</>:null}</p>
   <div className={styles.workbench} data-mode={studioMode}>
    <div className={styles.editor}>
     <header className={styles.panelHead}><strong>Contenido</strong><small>EDITAR</small></header>
     <div className={styles.fields}>
      {fields.map(f=><label key={f.id} className={styles.field}>
       <span>{f.label}</span>
       {f.multi?<textarea maxLength={f.max} rows={f.id==="services"?4:3} value={content[f.id]}
          onChange={e=>update(f.id,e.target.value)} placeholder={f.label}/>:
        <input type={f.type||"text"} maxLength={f.max} value={content[f.id]}
          onChange={e=>update(f.id,e.target.value)} placeholder={f.label}/>}
      </label>)}
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
        onClick={()=>{setContent(v=>({...v,palette:p.id}));setStatus("");}}>{p.name}</button>)}
      </div>
     </div>
    </div>
    <div className={styles.visual}>
     <header className={styles.panelHead}><strong>Vista previa</strong>
      <div className={styles.devices}><button type="button" aria-pressed={!mobile} onClick={()=>setMobile(false)} className={!mobile?styles.active:""}>Web</button>
      <button type="button" aria-pressed={mobile} onClick={()=>setMobile(true)} className={mobile?styles.active:""}>Móvil</button></div>
     </header>
     <div className={styles.previewBg}>
      <div className={mobile?styles.mobile:styles.device} style={tokens}>
       <div className={styles.bar}><i/><i/><i/><span>{slug||"mi-negocio"}</span></div>
       <div className={styles.site}>
        <div className={styles.siteNav}><strong>{content.business||"Mi negocio"}<b>.</b></strong><small>Servicios　 Contacto</small></div>
        <div className={[styles.hero,content.template==="showcase"?styles.showcase:content.template==="minimal"?styles.minimal:""].join(" ")}>
         <small>{content.eyebrow||"TU NEGOCIO · TU IDENTIDAD"}</small>
         <h3>{content.headline||"Tu próxima gran idea comienza aquí."}</h3>
         {content.intro?<p>{content.intro}</p>:null}
         <span className={styles.cta}>{content.action||"Contáctanos"} ↗</span>
        </div>
        <div className={styles.serviceArea}><h4>Lo que hacemos<b>.</b></h4>
         <div>{(serviceItems.length?serviceItems:["Tus servicios"]).map((name,i)=><span key={i}>{name} ↗</span>)}</div>
        </div>
       </div>
      </div>
     </div>
    </div>
   </div>

  </>}
 </section>;
}
