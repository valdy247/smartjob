"use client";
import BusinessCategoryPicker from "@/components/BusinessCategoryPicker";
import {useEffect,useMemo,useRef,useState,type FormEvent} from "react";
import {ArrowRight,CalendarDays,ClipboardList,FileText,Layers3,PhoneCall,Plus,Search,ShieldCheck,ShoppingBag,Store,X} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {safeWebImageUrl} from "@/lib/web-services-site";
import {BUSINESS_CATEGORIES,CATEGORY_GROUPS} from "@/lib/vmv-business-categories";
import {FAMILIES,familyForCategory,type SiteFamily,type SiteIntake,type SiteProduct,type SiteOffering,type SiteObjective,type SiteProposal} from "@/lib/web-builder-templates";
import BuilderImageField from "./BuilderImageField";
import WebIntakeGallery,{type GalleryColumns} from "./WebIntakeGallery";
import TemplateProposals from "./TemplateProposals";
import WebIntakeProducts,{type ProductSaveStatus} from "./WebIntakeProducts";
import WebInventoryPicker,{type InventoryLoadStatus} from "./WebInventoryPicker";
import InlinePastelSelect from "./InlinePastelSelect";
import WebIntakeSocials,{type SocialSaveStatus} from "./WebIntakeSocials";
import {EMPTY_SOCIAL_LINKS,SOCIAL_PLATFORMS,normalizeSocialLinks,normalizeSocialUrl,type BusinessSocialLinks} from "@/lib/web-builder-social";
import styles from "./WebSiteIntake.module.css";

type Props={ownerId:string;busy:boolean;onChoose:(input:SiteIntake,proposal:SiteProposal)=>void};
type MediaSlot="logo_url"|"cover_url"|"work_url";
type MediaSelection={logo_url:string;cover_url:string;work_url:string};
const EMPTY_MEDIA:MediaSelection={logo_url:"",cover_url:"",work_url:""};
const mediaSlots:MediaSlot[]=["logo_url","cover_url","work_url"];
const assetPath="/storage/v1/object/public/smartjob-web-images/";
function selectionFromRow(value:unknown):MediaSelection{
 const input=value&&typeof value==="object"?value as Record<string,unknown>:{};
 return {
  logo_url:typeof input.logo_url==="string"?safeWebImageUrl(input.logo_url)||"":"",
  cover_url:typeof input.cover_url==="string"?safeWebImageUrl(input.cover_url)||"":"",
  work_url:typeof input.work_url==="string"?safeWebImageUrl(input.work_url)||"":"",
 };
}
function ownImageFilename(value:string,ownerId:string):string{
 const safe=safeWebImageUrl(value);
 if(!safe)return "";
 const asset=new URL(safe).pathname.split(assetPath)[1]||"";
 return asset.startsWith(ownerId+"/")?asset.slice(ownerId.length+1):"";
}

const offeringOptions:{id:SiteOffering;title:string}[]=[
 {id:"products",title:"Productos"},
 {id:"services",title:"Servicios"},
 {id:"both",title:"Ambos"}
];
const goals:{id:SiteObjective;label:string}[]=[
 {id:"calls",label:"Recibir llamadas"},
 {id:"quotes",label:"Pedir presupuestos"},
 {id:"bookings",label:"Solicitar citas"},
 {id:"orders",label:"Consultar pedidos"}
];
export default function WebSiteIntake({ownerId,busy,onChoose}:Props){
 const [name,setName]=useState("");
 const [category,setCategory]=useState("");
 const [kind,setKind]=useState<SiteOffering>("services");
 const [goal,setGoal]=useState<SiteObjective>("quotes");
 const [phone,setPhone]=useState("");
 const [email,setEmail]=useState("");
 const [city,setCity]=useState("");
 const [about,setAbout]=useState("");
 const [logo,setLogo]=useState("");
 const [photos,setPhotos]=useState<string[]>(["",""]);
 const [galleryUrls,setGalleryUrls]=useState<string[]>([]);
 const [galleryColumns,setGalleryColumns]=useState<GalleryColumns>(2);
 const [gallerySaving,setGallerySaving]=useState(false);
 const [galleryUploading,setGalleryUploading]=useState(false);
 const [galleryError,setGalleryError]=useState("");
 const galleryQueue=useRef<Promise<void>>(Promise.resolve());
 const galleryPending=useRef(0);
 const galleryActive=useRef(true);
 const [mediaReady,setMediaReady]=useState(false);
 const [mediaSaving,setMediaSaving]=useState(false);
 const [mediaMessage,setMediaMessage]=useState("");
 const [mediaError,setMediaError]=useState("");
 const mediaRef=useRef<MediaSelection>({...EMPTY_MEDIA});
 const mediaSaveQueue=useRef<Promise<void>>(Promise.resolve());
 const mediaPending=useRef(0);
 const mediaActive=useRef(true);
 const [services,setServices]=useState<string[]>([]);
 const [newItem,setNewItem]=useState("");
 const [products,setProducts]=useState<SiteProduct[]>([]);
 const [productStatus,setProductStatus]=useState<ProductSaveStatus>("loading");
 const [inventoryBusinessId,setInventoryBusinessId]=useState("");
 const [inventoryProducts,setInventoryProducts]=useState<SiteProduct[]>([]);
 const [inventoryStatus,setInventoryStatus]=useState<InventoryLoadStatus>("idle");
 const [socialLinks,setSocialLinks]=useState<BusinessSocialLinks>({...EMPTY_SOCIAL_LINKS});
 const [socialStatus,setSocialStatus]=useState<SocialSaveStatus>("loading");
 const [family,setFamily]=useState<SiteFamily|null>(null);
 const [stage,setStage]=useState<"details"|"proposals">("details");
 const [step,setStep]=useState(0);
 const stepLabels=["Tu negocio","Qué ofreces","Fotos y redes","Diseño"];
 const [mode,setMode]=useState<"templates"|"ai">("templates");
 const [aiDirection,setAiDirection]=useState("");
 const [aiProposal,setAiProposal]=useState<SiteProposal|null>(null);
 const [generatingAi,setGeneratingAi]=useState(false);
 const [aiStatus,setAiStatus]=useState<"idle"|"checking"|"ready"|"unavailable">("idle");
 const [aiStatusMessage,setAiStatusMessage]=useState("");
 const [aiCheck,setAiCheck]=useState(0);
 const [error,setError]=useState("");
 const [emailError,setEmailError]=useState("");
 useEffect(()=>{
  if(mode!=="ai"){setAiStatus("idle");return;}
  const controller=new AbortController();
  let active=true;
  setAiStatus("checking");setAiStatusMessage("");
  void(async()=>{
   try{
    const client=getSupabase();
    if(!client)throw new Error("No se pudo comprobar la conexión con VMV.");
    const {data:{session}}=await client.auth.getSession();
    if(!session?.access_token)throw new Error("Inicia sesión para generar una web con IA.");
    const response=await fetch("/api/web-services/generate-site",{
     cache:"no-store",headers:{"Authorization":"Bearer "+session.access_token},
     signal:controller.signal
    });
    const result=await response.json().catch(()=>({})) as {enabled?:boolean;reason?:string};
    if(!response.ok||result.enabled!==true)
     throw new Error(result.reason||"La IA no está disponible en este momento.");
    if(active)setAiStatus("ready");
   }catch(e){
    if(active){setAiStatus("unavailable");setAiStatusMessage(e instanceof Error?e.message:"La IA no respondió.");}
   }
  })();
  return()=>{active=false;controller.abort();};
 },[mode,ownerId,aiCheck]);
 useEffect(()=>{
  let alive=true;
  mediaActive.current=true;
  galleryActive.current=true;
  setMediaReady(false);setMediaError("");setMediaMessage("");
  void(async()=>{
   const client=getSupabase();if(!client){if(alive)setMediaError("No se pudo cargar tu biblioteca.");return;}
   const {data:auth}=await client.auth.getUser();
   if(!auth.user||auth.user.id!==ownerId||auth.user.is_anonymous){
    if(alive)setMediaError("Inicia sesión para recuperar tus fotografías.");
    return;
   }
   const [profile,pref,classic,mediaResult]=await Promise.all([
    client.from("smartjob_profiles").select("business_name,phone,city,state").eq("id",ownerId).maybeSingle(),
    client.from("smartjob_business_category_preferences").select("category_id").eq("owner_id",ownerId).maybeSingle(),
    client.from("smartjob_web_sites").select("draft").eq("owner_id",ownerId).maybeSingle(),
    client.from("smartjob_web_intake_media").select("logo_url,cover_url,work_url,gallery_urls,gallery_columns")
     .eq("owner_id",ownerId).maybeSingle()
   ]);
   if(!alive)return;
   const saved=classic.data?.draft&&typeof classic.data.draft==="object"?classic.data.draft as Record<string,unknown>:{};
   const person=profile.data;
   setName(old=>old||String(person?.business_name||saved.business||"").slice(0,100));
   setCategory(old=>old||String(pref.data?.category_id||saved.categoryId||"").slice(0,60));
   setPhone(old=>old||String(saved.phone||person?.phone||"").slice(0,36));
   setEmail(old=>old||String(saved.email||"").slice(0,180));
   setCity(old=>old||String(saved.address||[person?.city,person?.state].filter(Boolean).join(", ")).slice(0,180));
   setAbout(old=>old||String(saved.intro||"").slice(0,500));
   const existingServices=typeof saved.services==="string"?saved.services.split(/\r?\n/).map(v=>v.trim()).filter(Boolean).slice(0,16):[];
   setServices(old=>old.length?old:existingServices);

   try{
    if(mediaResult.error)throw new Error("No fue posible recuperar las fotos guardadas.");
    let row=mediaResult.data;
    if(!row){
     // The old classic draft may contain photos the owner already deleted.
     // Do NOT auto-reimport its logo/gallery. Empty slots are intentional.
     const inserted=await client.from("smartjob_web_intake_media")
      .insert({owner_id:ownerId,...EMPTY_MEDIA}).select("logo_url,cover_url,work_url,gallery_urls,gallery_columns").single();
     if(inserted.error){
      // A second tab may have initialized the row first; read its authoritative values.
      if(inserted.error.code!=="23505")throw new Error("No se pudo preparar el guardado de imágenes.");
      const current=await client.from("smartjob_web_intake_media")
       .select("logo_url,cover_url,work_url,gallery_urls,gallery_columns").eq("owner_id",ownerId).single();
      if(current.error)throw new Error("No se pudieron recuperar tus fotos.");
      row=current.data;
     }else row=inserted.data;
    }
    // The saved intake row is authoritative. Library-hidden files are still valid
    // when referenced by a business field; only missing Storage objects are cleared.
    // Do not confuse archive visibility with an explicit field removal.
    const original=selectionFromRow(row);
    const cleaned={...original};
    const candidates=mediaSlots.map(slot=>({slot,filename:ownImageFilename(original[slot],ownerId)}))
     .filter(v=>v.filename);
    await Promise.all(candidates.map(async ({slot,filename})=>{
     const {data:files,error:listError}=await client.storage.from("smartjob-web-images")
      .list(ownerId,{search:filename,limit:100});
     // Fail closed on a missing/deleted asset; do not display broken old thumbnails.
     if(listError||!files?.some(file=>file.name===filename))cleaned[slot]="";
    }));
    if(!alive)return;
    const cleanupPatch:Partial<MediaSelection>={};
    for(const slot of mediaSlots)if(cleaned[slot]!==original[slot])cleanupPatch[slot]=cleaned[slot];
    if(Object.keys(cleanupPatch).length){
     const savedClean=await client.from("smartjob_web_intake_media")
      .update({...cleanupPatch,updated_at:new Date().toISOString()})
      .eq("owner_id",ownerId).select("logo_url,cover_url,work_url").single();
     if(savedClean.error)throw new Error("No se pudieron confirmar tus fotos eliminadas.");
    }
    if(!alive)return;
    mediaRef.current=cleaned;
    setLogo(cleaned.logo_url);setPhotos([cleaned.cover_url,cleaned.work_url]);
    setGalleryUrls((Array.isArray(row?.gallery_urls)?row.gallery_urls:[])
     .filter((url:string)=>Boolean(safeWebImageUrl(url)&&ownImageFilename(url,ownerId)))
     .slice(0,24));
    setGalleryColumns(([1,2,3] as number[]).includes(row?.gallery_columns)?
     row.gallery_columns as GalleryColumns:2);
    setGalleryError("");
    setMediaReady(true);
   }catch(e){
    if(alive)setMediaError(e instanceof Error?e.message:"No se pudieron cargar las fotos.");
   }
  })();
  return()=>{alive=false;mediaActive.current=false;galleryActive.current=false;};
 },[ownerId]);

 function saveMedia(patch:Partial<MediaSelection>){
  if(!mediaReady)return;
  mediaPending.current++;
  setMediaSaving(true);setMediaError("");setMediaMessage("Guardando cambios…");
  mediaSaveQueue.current=mediaSaveQueue.current.catch(()=>{}).then(async()=>{
   try{
    const client=getSupabase();if(!client)throw new Error("Sin conexión con el guardado.");
    const values:Partial<MediaSelection>={};
    for(const slot of mediaSlots)if(slot in patch){
     const requested=patch[slot]||"";
     const valid=requested?safeWebImageUrl(requested):"";
     if(requested&&!valid)throw new Error("La imagen seleccionada no es válida.");
     values[slot]=valid||"";
    }
    const {data,error}=await client.from("smartjob_web_intake_media")
     .update({...values,updated_at:new Date().toISOString()})
     .eq("owner_id",ownerId).select("logo_url,cover_url,work_url").single();
    if(error||!data)throw new Error("No se guardó el cambio. Comprueba tu conexión e inténtalo otra vez.");
    if(!mediaActive.current)return;
    const selection=selectionFromRow(data);
    mediaRef.current=selection;
    setLogo(selection.logo_url);setPhotos([selection.cover_url,selection.work_url]);
    setMediaMessage("Cambios guardados");
   }catch(e){
    if(mediaActive.current){
     setMediaError(e instanceof Error?e.message:"No se pudo guardar la imagen.");
     setMediaMessage("");
    }
   }finally{
    mediaPending.current=Math.max(0,mediaPending.current-1);
    if(mediaActive.current&&mediaPending.current===0)setMediaSaving(false);
   }
  });
 }

 function saveGallery(nextImages:string[],nextColumns:GalleryColumns){
  if(!mediaReady||gallerySaving||galleryUploading)return;
  const valid=nextImages.filter(url=>Boolean(safeWebImageUrl(url)&&ownImageFilename(url,ownerId)))
   .slice(0,24);
  if(valid.length!==nextImages.length){setGalleryError("Las fotos deben pertenecer a tu biblioteca.");return;}
  const cols=([1,2,3] as number[]).includes(nextColumns)?nextColumns:2;
  const previousImages=galleryUrls,previousColumns=galleryColumns;
  setGalleryUrls(valid);setGalleryColumns(cols);setGallerySaving(true);setGalleryError("");
  galleryPending.current++;
  galleryQueue.current=galleryQueue.current.catch(()=>{}).then(async()=>{
   try{
    const client=getSupabase();if(!client)throw Error("No se pudo guardar la galería.");
    const {data:auth,error:authError}=await client.auth.getUser();
    if(authError||!auth.user||auth.user.is_anonymous||auth.user.id!==ownerId)
     throw Error("Tu sesión expiró. Inicia sesión de nuevo.");
    const {data,error}=await client.from("smartjob_web_intake_media")
     .update({gallery_urls:valid,gallery_columns:cols,updated_at:new Date().toISOString()})
     .eq("owner_id",ownerId).select("gallery_urls,gallery_columns").maybeSingle();
    if(error||!data)throw Error("No pudimos guardar la galería. Intenta otra vez.");
    if(galleryActive.current){
     setGalleryUrls(data.gallery_urls||[]);
     setGalleryColumns(data.gallery_columns as GalleryColumns);
     setGalleryError("");
    }
   }catch(e){
    if(galleryActive.current){
     setGalleryUrls(previousImages);setGalleryColumns(previousColumns);
     setGalleryError(e instanceof Error?e.message:"No se guardaron los cambios.");
    }
   }finally{
    galleryPending.current=Math.max(0,galleryPending.current-1);
    if(galleryActive.current&&galleryPending.current===0)setGallerySaving(false);
   }
  });
 }
 useEffect(()=>{
  if(!mediaReady)return;
  const onLibraryDeleted=(event:Event)=>{
   const url=(event as CustomEvent<{url?:string}>).detail?.url;
   if(!url)return;
   const current=mediaRef.current;
   const patch:Partial<MediaSelection>={};
   for(const slot of mediaSlots)if(current[slot]===url)patch[slot]="";
   if(Object.keys(patch).length)saveMedia(patch);
  };
  window.addEventListener("vmv:web-image-deleted",onLibraryDeleted);
  return()=>window.removeEventListener("vmv:web-image-deleted",onLibraryDeleted);
 },[mediaReady,ownerId]);
 const intake=useMemo<SiteIntake>(()=>({
  business:name.trim(),categoryId:category,offering:kind,objective:goal,
  phone:phone.trim(),email:email.trim(),city:city.trim(),about:about.trim(),
  logo,photos:photos.slice(0,1),gallery:galleryUrls,galleryColumns,
  offerings:kind==="products"?[]:services.filter(Boolean),
  products:kind==="services"?[]:inventoryBusinessId?inventoryProducts:products.filter(p=>p.title.trim()),
  // The site stores an owner-scoped catalog link. The listed items are only
  // preview snapshots; the public web will read approved products live.
  inventoryBusinessId:kind!=="services"&&inventoryBusinessId?inventoryBusinessId:undefined,
  socials:normalizeSocialLinks(socialLinks)
 }),[name,category,kind,goal,phone,email,city,about,logo,photos,services,
  products,inventoryBusinessId,inventoryProducts,socialLinks,galleryUrls,galleryColumns]);
 const suggestedFamily=family||familyForCategory(category);
 const validContactEmail=(value:string)=>!value.trim()||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
 function nextStep(){
  if(step===2&&(mediaSaving||gallerySaving||galleryUploading||galleryError)){
   setError(galleryError||"Espera a que terminen de guardarse tus fotografías.");return;
  }
  if(step===0){
   if(name.trim().length<2){setError("Escribe el nombre de tu negocio.");return;}
   if(!category){setError("Selecciona la categoría del negocio.");return;}
   if(!validContactEmail(email)){
    setEmailError("Revisa el correo, por ejemplo: hola@negocio.com.");
    setError("");return;
   }
   setEmailError("");
  }
  if(step===1&&kind!=="services"){
   if(inventoryBusinessId&&inventoryStatus!=="ready"){
    setError(inventoryStatus==="error"?
     "No se pudo leer el inventario. Reintenta la conexión.":
     "Espera a que se cargue el inventario.");return;
   }
   if(!inventoryBusinessId&&productStatus!=="saved"){
    setError("Espera a que se guarden los productos.");return;
   }
  }
  setError("");setStep(value=>Math.min(3,value+1));
  window.scrollTo({top:0,behavior:"smooth"});
 }
 function previousStep(){
  setError("");setStep(value=>Math.max(0,value-1));
  window.scrollTo({top:0,behavior:"smooth"});
 }
 function addService(event:FormEvent){
  event.preventDefault();
  const value=newItem.trim().slice(0,120);
  if(!value)return;
  if(services.length>=25){setError("Máximo 25 elementos iniciales; puedes agregar más desde el editor.");return;}
  setServices(old=>[...old,value]);setNewItem("");setError("");
 }
 async function preview(){
  if(generatingAi||busy)return;
  if(!mediaReady||mediaSaving||mediaError||gallerySaving||galleryUploading||galleryError){setError(galleryError||"Confirma que las fotografías terminaron de guardarse.");return;}
  if(intake.business.length<2){setError("Escribe el nombre del negocio.");return;}
  if(!category){setError("Selecciona la categoría del negocio.");return;}
  if(kind!=="services"&&inventoryBusinessId&&inventoryStatus!=="ready"){
   setError("Espera a que se cargue correctamente el inventario.");return;
  }
  if(kind!=="services"&&!inventoryBusinessId&&productStatus!=="saved"){
   setError("Espera a que termine de guardar los productos antes de continuar.");return;
  }
  if(kind!=="services"&&!inventoryBusinessId&&products.some(p=>!p.title.trim())){
   setError("Escribe el nombre de cada producto o elimina las fichas vacías.");return;
  }
  if(socialStatus!=="saved"){setError("Espera a que se guarden las redes sociales.");return;}
  const invalidSocial=SOCIAL_PLATFORMS.find(network=>
   socialLinks[network.id].trim()&&!normalizeSocialUrl(socialLinks[network.id],network.id));
  if(invalidSocial){setError("Comprueba el enlace de "+invalidSocial.label+".");return;}
  if(intake.email&& !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(intake.email)){
   setError("Comprueba el correo de contacto.");return;
  }
  setError("");
  if(mode==="ai"){
   if(aiStatus!=="ready"){setError("La IA todavía no está conectada. Comprueba su estado o utiliza una plantilla.");return;}
   setGeneratingAi(true);
   try{
    const client=getSupabase();
    if(!client)throw new Error("No se pudo acceder a tu cuenta.");
    const {data:{session}}=await client.auth.getSession();
    if(!session?.access_token)throw new Error("Inicia sesión para utilizar IA.");
    const result=await fetch("/api/web-services/generate-site",{
     method:"POST",cache:"no-store",
     headers:{"Authorization":"Bearer "+session.access_token,"Content-Type":"application/json"},
     body:JSON.stringify({intake,direction:aiDirection.trim()})
    });
    const json=await result.json().catch(()=>({})) as {proposal?:SiteProposal;error?:string};
    if(!result.ok||!json.proposal?.data)
     throw new Error(json.error||"La IA no pudo preparar un diseño. Prueba nuevamente.");
    setAiProposal(json.proposal);setStage("proposals");
   }catch(err){setError(err instanceof Error?err.message:"No se pudo generar el diseño con IA.");}
   finally{setGeneratingAi(false);}
   return;
  }
  setAiProposal(null);setStage("proposals");
 }
 if(stage==="proposals")return <TemplateProposals input={intake} familyOverride={suggestedFamily}
   generated={mode==="ai"?aiProposal:null} busy={busy} onBack={()=>setStage("details")}
   onChoose={proposal=>onChoose(intake,proposal)}/>;
 return <section className={`${styles.root} ${step===1?styles.offeringsRoot:""}`}>
  {step===1?<header className={styles.compactIntro}>
   <div className={styles.compactProgress}>
    <span>PASO 02 DE 04</span>
    <div role="progressbar" aria-label="Progreso de creación"
     aria-valuemin={0} aria-valuemax={4} aria-valuenow={step+1}>
     {stepLabels.map((label,i)=><span key={label}
      data-state={i<step?"done":i===step?"current":"upcoming"}/>)}
    </div>
   </div>
   <h2>¿Qué ofreces?</h2>
  </header>:<div className={styles.intro}>
   <a href="/web-studio?mode=sites" className={styles.backLink}>‹ Mis sitios</a>
   <span className={styles.stepMeta}>Paso {step+1} de 4</span>
   <h2>{stepLabels[step]}<span>.</span></h2>
   <div className={styles.progressTrack} role="progressbar" aria-label="Progreso de creación"
    aria-valuemin={0} aria-valuemax={4} aria-valuenow={step+1}>
    <span style={{width:`${((step+1)/4)*100}%`}}/>
   </div>
  </div>}
  <div className={styles.form}>
   {step===0?<div className={styles.panel}>
    <h3><span>01</span> Tu negocio</h3>
    <div className={styles.twoColumns}>
     <label>Nombre del negocio<input value={name} maxLength={100} placeholder="Nombre comercial" onChange={e=>setName(e.target.value)}/></label>
     <label>Categoría<BusinessCategoryPicker value={category} onChange={value=>{setCategory(value);setFamily(null);}}/></label>
     <label>Teléfono de negocio<input value={phone} maxLength={36} type="tel" placeholder="+1 000 000 0000" onChange={e=>setPhone(e.target.value)}/></label>
     <label>Correo de contacto (opcional)<input value={email} maxLength={180} type="email" inputMode="email"
      placeholder="hola@minegocio.com" aria-invalid={Boolean(emailError)}
      aria-describedby={emailError?"vmv-email-error":undefined}
      onChange={e=>{setEmail(e.target.value);setEmailError("");}}/>
      {emailError?<small className={styles.fieldError} id="vmv-email-error" role="alert">{emailError}</small>:null}
     </label>
    </div>
    <label>Ciudad o zona atendida<input value={city} maxLength={180} placeholder="Ciudad, estado" onChange={e=>setCity(e.target.value)}/></label>
    <label>Descripción aprobada<textarea value={about} maxLength={500} rows={3}
     placeholder="¿Qué hace tu negocio? Incluye solamente información real." onChange={e=>setAbout(e.target.value)}/></label>
   </div>:null}
   {step===1?<div className={styles.offeringsPanel}>
    <InlinePastelSelect label="¿Qué ofreces?" value={kind}
     options={offeringOptions.map(item=>({id:item.id,label:item.title}))}
     icon={kind==="products"?<ShoppingBag size={25} strokeWidth={1.9}/>:
      kind==="both"?<Layers3 size={25} strokeWidth={1.9}/>:
      <Store size={25} strokeWidth={1.9}/>}
     onChange={next=>{setKind(next as SiteOffering);setError("");}}/>
    <InlinePastelSelect label="Objetivo principal" showLabel value={goal}
     options={goals.map(item=>({id:item.id,label:item.label}))}
     icon={goal==="calls"?<PhoneCall size={24} strokeWidth={1.9}/>:
      goal==="bookings"?<CalendarDays size={24} strokeWidth={1.9}/>:
      goal==="orders"?<ClipboardList size={24} strokeWidth={1.9}/>:
      <FileText size={24} strokeWidth={1.9}/>}
     onChange={next=>setGoal(next as SiteObjective)}/>
    <div hidden={kind==="services"}>
     <WebInventoryPicker ownerId={ownerId} businessName={name}
      selectedBusinessId={inventoryBusinessId} onSelect={setInventoryBusinessId}
      onProducts={setInventoryProducts} onStatus={setInventoryStatus}/>
    </div>
    <WebIntakeProducts ownerId={ownerId} items={products}
     visible={kind!=="services"&&!inventoryBusinessId}
     onChange={setProducts} onStatusChange={setProductStatus}/>
    {kind!=="products"?<form className={`${styles.addItem} ${styles.offeringsAdd}`} onSubmit={addService}>
     <label htmlFor="vmv-intake-service">Servicios (opcional)</label>
     <div className={styles.offeringsAddRow}>
      <span className={styles.offeringsInputWrap}><Search size={18} aria-hidden="true"/>
       <input id="vmv-intake-service" maxLength={120} value={newItem}
        placeholder="Ej. Pasteles personalizados"
        onChange={e=>setNewItem(e.target.value)}/></span>
      <button type="submit" disabled={!newItem.trim()||services.length>=25}>
       <Plus size={20} strokeWidth={2.5}/> Agregar
      </button>
     </div>
     <div className={`${styles.tokens} ${styles.offeringsTokens}`}>
      {services.map((item,index)=><span key={index}>{item}
       <button type="button" aria-label={"Eliminar "+item} onClick={()=>setServices(old=>old.filter((_,i)=>i!==index))}>
        <X size={14} strokeWidth={2.5}/>
       </button>
      </span>)}
     </div>
    </form>:null}
   </div>:null}
   {step===2?<div className={styles.panel}>
    <h3><span>03</span> Fotos y redes</h3>
    <p>Fotos opcionales. Puedes añadirlas después.</p>
    {mediaSaving||!mediaReady||mediaMessage?<p role="status" aria-live="polite">{mediaSaving?"Guardando imágenes…":!mediaReady?"Cargando imágenes…":mediaMessage}</p>:null}
    {mediaError&&!mediaReady?<button type="button" onClick={()=>window.location.reload()}
     style={{alignSelf:"flex-start",border:"1px solid #d5c5eb",borderRadius:10,padding:"9px 13px",
      background:"#f7f1ff",color:"#7853b3",fontSize:12,fontWeight:850,cursor:"pointer"}}>
     Reintentar carga de imágenes
    </button>:null}
    {mediaError?<p role="alert" className={styles.error}>{mediaError}</p>:null}
    <fieldset disabled={!mediaReady||mediaSaving} style={{border:0,padding:0,margin:0,minWidth:0}}>
     <div className={styles.photos}>
      <div><strong>Logo</strong><BuilderImageField kind="logo" value={logo} onChange={url=>saveMedia({logo_url:url})}/></div>
      <div><strong>Foto de portada</strong>
       <BuilderImageField value={photos[0]||""} onChange={url=>saveMedia({cover_url:url})}/></div>
     </div>
    </fieldset>
    <WebIntakeGallery ownerId={ownerId} images={galleryUrls}
     columns={galleryColumns} onChange={saveGallery}
     onUploadingChange={setGalleryUploading}
     disabled={!mediaReady||mediaSaving||gallerySaving}/>
    {gallerySaving?<p role="status">Guardando galería…</p>:null}
    {galleryError?<p role="alert" className={styles.error}>{galleryError}</p>:null}
    <WebIntakeSocials ownerId={ownerId} links={socialLinks}
     onChange={setSocialLinks} onStatusChange={setSocialStatus}/>
   </div>:null}
   {step===3?<div className={styles.panel}>
    <h3><span>04</span> Elige tu estilo</h3>
    {mode==="templates"?<label>Familia de diseño<select value={suggestedFamily} onChange={e=>setFamily(e.target.value as SiteFamily)}>
      {FAMILIES.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
     </select></label>:<div className={styles.aiUnavailable}>
      <label>¿Qué estilo imaginas para tu web? (opcional)
       <textarea rows={3} maxLength={400} value={aiDirection}
        placeholder="Ej. Editorial y elegante, con tonos cálidos, fotografías grandes y textos breves."
        onChange={e=>setAiDirection(e.target.value)}/>
      </label>
      <small>La IA reutiliza la conexión de VMV. El diseño no se publica automáticamente;
       revisa la información antes de aceptarla. No inventaremos reseñas ni precios.
       Se usa una generación de tu cupo diario (máximo 2).</small>
      {aiStatus==="checking"?<small role="status">Comprobando la conexión real con la IA de VMV…</small>:
       aiStatus==="ready"?<small role="status">IA conectada. Puedes generar tu diseño.</small>:
       <div><small role="alert">{aiStatusMessage||"La IA no está disponible."}</small>
        <button type="button" disabled={generatingAi} onClick={()=>setAiCheck(n=>n+1)}>Recomprobar IA</button>
       </div>}
     </div>}
   </div>:null}
   {error?<p className={styles.error} role="alert">{error}</p>:null}
   <div className={`${styles.finish} ${step===1?styles.offeringsFinish:""}`}>
    <span><ShieldCheck size={16}/> Tu web no se publicará sin tu autorización.</span>
    <div className={styles.wizardNavigation}>
     {step>0?<button type="button" className={styles.previous} onClick={previousStep} disabled={busy||generatingAi}>Atrás</button>:null}
     {step<3?<button type="button" onClick={nextStep} disabled={busy||generatingAi}>
      Continuar <ArrowRight size={17}/></button>:
      <button type="button" disabled={busy||generatingAi||(mode==="ai"&&aiStatus!=="ready")||!mediaReady||mediaSaving||Boolean(mediaError)||socialStatus!=="saved"||(kind!=="services"&&(inventoryBusinessId?inventoryStatus!=="ready":productStatus!=="saved"))} onClick={()=>void preview()}>
       {generatingAi?"Creando tu web con IA…":mode==="ai"?"Generar web con IA":"Ver propuestas"} <ArrowRight size={17}/>
      </button>}
    </div>
   </div>
  </div>
 </section>;
}
