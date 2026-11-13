"use client";
import {useCallback,useEffect,useRef,useState,type ChangeEvent} from "react";
import {createPortal} from "react-dom";
import {ImagePlus,MoreVertical,RefreshCw,Trash2,WandSparkles,X} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {safeWebImageUrl} from "@/lib/web-services-site";
import styles from "./BuilderImageField.module.css";
type Props={value:string;onChange:(url:string)=>void;kind?:"photo"|"logo"};
const bucket="smartjob-web-images";
async function shrink(file:File):Promise<Blob>{
 if(!["image/jpeg","image/png","image/webp"].includes(file.type))throw new Error("Solo imágenes JPG, PNG o WebP");
 if(file.size>18*1024*1024)throw new Error("La foto supera el límite de 18 MB");
 if(typeof createImageBitmap!=="function"){
  if(file.size>5*1024*1024)throw new Error("La imagen debe pesar menos de 5 MB");
  return file;
 }
 const bitmap=await createImageBitmap(file);
 try{
  if(bitmap.width>9000||bitmap.height>9000)throw new Error("Resolución demasiado alta");
  const ratio=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(bitmap.width*ratio));
  canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
  const ctx=canvas.getContext("2d");
  if(!ctx)throw new Error("No se pudo preparar la foto");
  ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  const converted=await new Promise<Blob|null>(res=>canvas.toBlob(res,"image/webp",.83));
  if(!converted||converted.size>5*1024*1024)throw new Error("No se pudo optimizar la imagen");
  return converted;
 }finally{bitmap.close();}
}
export default function BuilderImageField({value,onChange,kind="photo"}:Props){
 const [items,setItems]=useState<string[]>([]);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [prompt,setPrompt]=useState("");
 const [ai,setAi]=useState(false);
 const [generating,setGenerating]=useState(false);
 const [deleting,setDeleting]=useState<string|null>(null);
 const [pickerOpen,setPickerOpen]=useState(false);
 const [tab,setTab]=useState<"library"|"upload">("library");
 const [menuFor,setMenuFor]=useState<string|null>(null);
 const [confirmDelete,setConfirmDelete]=useState<string|null>(null);
 const triggerRef=useRef<HTMLButtonElement>(null);
 const closeRef=useRef<HTMLButtonElement>(null);
 const load=useCallback(async()=>{
  const client=getSupabase();if(!client)return;
  const {data,error:authError}=await client.auth.getUser();
  if(authError||!data.user||data.user.is_anonymous)return;
  const {data:session}=await client.auth.getSession();
  if(!session.session?.access_token){setError("Inicia sesión para cargar las fotos.");return;}
  const [fileResult,hiddenResult]=await Promise.all([
   client.storage.from(bucket).list(data.user.id,{
    limit:50,sortBy:{column:"created_at",order:"desc"}
   }),
   fetch("/api/web-services/media/delete",{
    cache:"no-store",headers:{Authorization:"Bearer "+session.session.access_token}
   }).catch(()=>null)
  ]);
  if(fileResult.error||!hiddenResult||!hiddenResult.ok){
   setError("No se pudo cargar la biblioteca. Inténtalo de nuevo.");return;
  }
  const hiddenData=await hiddenResult.json().catch(()=>({})) as {hidden?:string[]};
  if(!Array.isArray(hiddenData.hidden)){
   setError("No se pudo verificar la biblioteca.");return;
  }
  const hidden=new Set(hiddenData.hidden);
  const urls=(fileResult.data||[])
   .filter(f=>/\.(webp|jpg|png)$/.test(f.name)&&!hidden.has(f.name))
   .map(f=>{
    const info=client.storage.from(bucket).getPublicUrl(data.user.id+"/"+f.name);
    return safeWebImageUrl(info.data.publicUrl)||"";
   }).filter(Boolean);
  setItems(urls);
 },[]);
 useEffect(()=>{if(pickerOpen)void load();},[load,pickerOpen]);
 useEffect(()=>{
  if(!pickerOpen)return;
  const prior=document.body.style.overflow;
  document.body.style.overflow="hidden";
  closeRef.current?.focus();
  const onKey=(e:KeyboardEvent)=>{if(e.key==="Escape"){setPickerOpen(false);triggerRef.current?.focus();}};
  document.addEventListener("keydown",onKey);
  return()=>{document.body.style.overflow=prior;document.removeEventListener("keydown",onKey);};
 },[pickerOpen]);
 useEffect(()=>{
  const handleDelete=(event:Event)=>{
   const deletedUrl=(event as CustomEvent<{url:string}>).detail?.url;
   if(!deletedUrl)return;
   setItems(current=>current.filter(url=>url!==deletedUrl));
  };
  window.addEventListener("vmv:web-image-archived",handleDelete);
  return()=>window.removeEventListener("vmv:web-image-archived",handleDelete);
 },[]);
 useEffect(()=>{
  let active=true;
  void(async()=>{
   const client=getSupabase();if(!client)return;
   const {data:{session}}=await client.auth.getSession();
   if(!session?.access_token)return;
   const result=await fetch("/api/web-services/generate-image",{
    headers:{authorization:"Bearer "+session.access_token},cache:"no-store"
   });
   const json=await result.json().catch(()=>({}));
   if(active)setAi(result.ok&&json.enabled===true);
  })();
  return()=>{active=false;};
 },[]);
 async function upload(file:File){
  if(busy)return;
  setBusy(true);setError("");setNotice("");
  try{
   const client=getSupabase();if(!client)throw new Error("No disponible");
   const {data,error:authError}=await client.auth.getUser();
   if(authError||!data.user||data.user.is_anonymous)throw new Error("Inicia sesión");
   const blob=await shrink(file);
   const ext=blob.type==="image/webp"?"webp":blob.type==="image/png"?"png":"jpg";
   const path=data.user.id+"/"+crypto.randomUUID()+"."+ext;
   const {error}=await client.storage.from(bucket).upload(path,blob,{
    contentType:blob.type||file.type,cacheControl:"3600",upsert:false
   });
   if(error)throw new Error("No se pudo subir");
   const result=client.storage.from(bucket).getPublicUrl(path);
   const url=safeWebImageUrl(result.data.publicUrl);
   if(!url)throw new Error("La URL no es válida");
   onChange(url);
   setPickerOpen(false);
   setNotice("Foto subida y seleccionada. Se guardará en este lugar.");
   await load();
  }catch(e){setError(e instanceof Error?e.message:"No se pudo subir la imagen");}
  finally{setBusy(false);}
 }
 async function deleteImage(url:string){
  if(busy||generating||deleting)return;
  if(value===url){
   setError("Esta foto está seleccionada aquí. Primero quítala de este lugar y guarda los cambios.");
   setConfirmDelete(null);return;
  }
  const safe=safeWebImageUrl(url);
  const filename=safe?.split("/").pop()||"";
  if(!/^[0-9a-f-]{36}\.(?:webp|jpg|png)$/.test(filename)){
   setError("Este archivo no se puede administrar desde la biblioteca.");return;
  }
  setDeleting(url);setError("");setNotice("");
  try{
   const client=getSupabase();
   if(!client)throw new Error("No se pudo acceder a tu cuenta.");
   const {data:{session}}=await client.auth.getSession();
   if(!session?.access_token)throw new Error("Inicia sesión nuevamente.");
   const response=await fetch("/api/web-services/media/delete",{
    method:"POST",cache:"no-store",
    headers:{"Authorization":"Bearer "+session.access_token,"Content-Type":"application/json"},
    body:JSON.stringify({filename})
   });
   const body=await response.json().catch(()=>({})) as {deleted?:boolean;archived?:boolean;error?:string};
   if(!response.ok||body.deleted!==true)
    throw new Error(body.error||"No se pudo eliminar el archivo.");
   setItems(current=>current.filter(item=>item!==url));
   // Archiving a file changes library visibility, NOT any saved placement.
   window.dispatchEvent(new CustomEvent("vmv:web-image-archived",{detail:{url}}));
   setNotice(body.archived
    ?"Archivo oculto en Mis imágenes. Las páginas y formularios que lo utilizan lo conservan."
    :"Archivo eliminado de la biblioteca.");
  }catch(err){setError(err instanceof Error?err.message:"No se pudo eliminar el archivo.");}
  finally{setDeleting(null);setMenuFor(null);setConfirmDelete(null);}
 }
 async function generate(){
  if(generating||!ai||prompt.trim().length<8)return;
  if(!window.confirm("Generar una imagen consume 1 generación del límite diario y tiene un costo externo de IA para VMV. No hay cobro al cliente en esta pantalla. ¿Continuar?"))return;
  setGenerating(true);setError("");
  try{
   const client=getSupabase();if(!client)throw new Error("No disponible");
   const {data:{session}}=await client.auth.getSession();
   if(!session?.access_token)throw new Error("Inicia sesión");
   const result=await fetch("/api/web-services/generate-image",{
    method:"POST",headers:{"Authorization":"Bearer "+session.access_token,"Content-Type":"application/json"},
    body:JSON.stringify({prompt:prompt.trim(),business:"Sitio web de negocio",categoryId:""})
   });
   const body=await result.json();
   const url=typeof body.url==="string"?safeWebImageUrl(body.url):null;
   if(!result.ok||!url)throw new Error(body.error||"No se pudo generar");
   onChange(url);setPickerOpen(false);setNotice("Imagen generada y seleccionada.");await load();
  }catch(e){setError(e instanceof Error?e.message:"Error en generación");}
  finally{setGenerating(false);}
 }
 const selected=Boolean(value&&safeWebImageUrl(value));
 const openPicker=()=>{setError("");setNotice("");setTab("library");setMenuFor(null);setConfirmDelete(null);setPickerOpen(true);};
 function choose(url:string){
  onChange(url);setPickerOpen(false);setNotice("Foto seleccionada para este lugar.");
 }
 return <div className={styles.wrap}>
  {selected?<div className={styles.selectedImage}>
   <img src={value} alt={kind==="logo"?"Logo completo seleccionado":"Foto seleccionada"}
    className={kind==="logo"?styles.currentLogo:styles.current}/>
   <div className={styles.fieldActions}>
    <button type="button" ref={triggerRef} className={styles.replace} onClick={openPicker}
     disabled={busy||Boolean(deleting)}><ImagePlus size={15}/> Reemplazar</button>
    <button type="button" className={styles.clearSelection} disabled={busy||Boolean(deleting)}
     onClick={()=>{onChange("");setNotice("Foto quitada solo de este lugar. Otros usos permanecen intactos.");setError("");}}>
     <Trash2 size={13}/> Quitar</button>
   </div>
  </div>:<button type="button" ref={triggerRef} className={styles.emptyPick}
   disabled={busy||Boolean(deleting)} onClick={openPicker}>
   <ImagePlus size={19}/><strong>Agregar foto</strong><small>Subir foto o elegir de Mis imágenes</small>
  </button>}
  {notice?<small role="status" className={styles.notice}>{notice}</small>:null}
  {error&&!pickerOpen?<small role="alert" className={styles.error}>{error}</small>:null}
  {pickerOpen&&typeof document!=="undefined"?createPortal(
   <div className={styles.backdrop} onMouseDown={e=>{if(e.target===e.currentTarget)setPickerOpen(false);}}>
    <div className={styles.sheet} role="dialog" aria-modal="true" aria-label="Seleccionar imagen">
     <div className={styles.modalHeader}>
      <div><small>WEB STUDIO</small><h3>Seleccionar imagen</h3></div>
      <button type="button" ref={closeRef} aria-label="Cerrar selector de imágenes"
       onClick={()=>{setPickerOpen(false);triggerRef.current?.focus();}}><X size={20}/></button>
     </div>
     <div className={styles.tabs} role="tablist" aria-label="Origen de las imágenes">
      <button type="button" role="tab" aria-selected={tab==="library"}
       className={tab==="library"?styles.selectedTab:styles.tab} onClick={()=>setTab("library")}>Mis imágenes</button>
      <button type="button" role="tab" aria-selected={tab==="upload"}
       className={tab==="upload"?styles.selectedTab:styles.tab} onClick={()=>setTab("upload")}>Subir fotos</button>
     </div>
     <div className={styles.modalBody}>
      {tab==="library"?<>
       <div className={styles.heading}><span>Fotos guardadas</span>
        <button type="button" onClick={()=>void load()} aria-label="Actualizar biblioteca"><RefreshCw size={16}/></button>
       </div>
       {items.length?<div className={styles.gallery}>
        {items.map(url=><div key={url} className={styles.photoTile}>
         <button type="button" className={value===url?styles.active:styles.selectPhoto}
          aria-label="Seleccionar esta fotografía" aria-pressed={value===url}
          disabled={busy||Boolean(deleting)} onClick={()=>choose(url)}>
          <img src={url} alt="Fotografía de Mis imágenes"/>
         </button>
         <button type="button" className={styles.more} aria-label="Opciones del archivo"
          aria-expanded={menuFor===url} disabled={busy||Boolean(deleting)}
          onClick={()=>{setMenuFor(old=>old===url?null:url);setConfirmDelete(null);}}>
          <MoreVertical size={17}/>
         </button>
         {menuFor===url?<div className={styles.fileMenu}>
          {confirmDelete===url?<>
           <p>¿Eliminar este archivo de la biblioteca? Los usos guardados se conservarán.</p>
           <div><button type="button" onClick={()=>setConfirmDelete(null)}>Cancelar</button>
            <button type="button" className={styles.danger} disabled={Boolean(deleting)}
             onClick={()=>void deleteImage(url)}>Confirmar</button></div>
          </>:<button type="button" onClick={()=>setConfirmDelete(url)}>Eliminar archivo</button>}
         </div>:null}
         {deleting===url?<span className={styles.deletingStatus}>Procesando…</span>:null}
        </div>)}
       </div>:<div className={styles.emptyState}>
        <ImagePlus size={26}/><p>No tienes fotografías guardadas.</p>
        <button type="button" onClick={()=>setTab("upload")}>Subir primera foto</button>
       </div>}
      </>:<>
       <label className={styles.upload}><ImagePlus size={19}/>{busy?"Subiendo…":"Elegir una fotografía"}
        <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy}
         onChange={(e:ChangeEvent<HTMLInputElement>)=>{
          const file=e.target.files?.[0];e.target.value="";
          if(file)void upload(file);
         }}/>
       </label>
       <p className={styles.hint}>JPG, PNG o WebP, hasta 18 MB. La foto se optimiza y queda seleccionada automáticamente.</p>
       {ai?<div className={styles.ai}>
        <small>Generar con IA consume 1 generación del cupo diario y utiliza una API con costo para VMV.</small>
        <textarea value={prompt} maxLength={450} spellCheck={false} rows={2}
         placeholder="Describe la imagen que quieres crear" onChange={e=>setPrompt(e.target.value)}/>
        <button type="button" disabled={generating||prompt.trim().length<8} onClick={()=>void generate()}>
         <WandSparkles size={15}/>{generating?"Creando…":"Generar con IA"}</button>
       </div>:null}
      </>}
      {notice?<small role="status" className={styles.notice}>{notice}</small>:null}
      {error?<small role="alert" className={styles.error}>{error}</small>:null}
     </div>
    </div>
   </div>,document.body):null}
 </div>;
}
