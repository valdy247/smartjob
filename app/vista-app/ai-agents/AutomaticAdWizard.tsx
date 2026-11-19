"use client";
import {useEffect,useState} from "react";
import {ArrowLeft,ArrowRight,Bot,Check,Globe2,Image as ImageIcon,LoaderCircle,Megaphone,Package,ShieldCheck,Sparkles,RefreshCw,Pencil,WandSparkles} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import type {CentralBusiness} from "./centralBusiness";
import type {PersistedAgent} from "./agentStore";
import {saveAgentAdBrief,type AgentAdBrief} from "@/lib/vmv-ai-agents/ad-handoff";
import styles from "./AutomaticAdWizard.module.css";

type Product={id:string;name:string;description:string;price_cents:number;currency:string;stock_mode:string;image_path:string|null;type:"product"|"service"};
type MetaAccount={id:string;name:string;currency:string;status:number};
type MetaPage={id:string;name:string};
type MetaProfile={configured:boolean;connected:boolean;connection?:{selectedAccountId:string|null};accounts:MetaAccount[];pages:MetaPage[]};
type Place={key:string;name:string;region:string;countryCode:string};
type Goal="visits"|"messages"|"sales";
type Answer={businessName:string;website:string;offer:string;productIds:string[];
 audience:string;city:string;region:string;goals:Goal[];
 imageChoice:"business"|"product"|"upload";imageProductId:string;notes:string};
type Step="business"|"website"|"product"|"goal"|"audience"|"account"|"location"|"image"|"copy"|"budget"|"review";
const steps:Step[]=["business","website","product","goal","audience","account","location","image","copy","budget","review"];
const usStates="AL:Alabama|AK:Alaska|AZ:Arizona|AR:Arkansas|CA:California|CO:Colorado|CT:Connecticut|DE:Delaware|DC:District of Columbia|FL:Florida|GA:Georgia|HI:Hawaii|ID:Idaho|IL:Illinois|IN:Indiana|IA:Iowa|KS:Kansas|KY:Kentucky|LA:Louisiana|ME:Maine|MD:Maryland|MA:Massachusetts|MI:Michigan|MN:Minnesota|MS:Mississippi|MO:Missouri|MT:Montana|NE:Nebraska|NV:Nevada|NH:New Hampshire|NJ:New Jersey|NM:New Mexico|NY:New York|NC:North Carolina|ND:North Dakota|OH:Ohio|OK:Oklahoma|OR:Oregon|PA:Pennsylvania|RI:Rhode Island|SC:South Carolina|SD:South Dakota|TN:Tennessee|TX:Texas|UT:Utah|VT:Vermont|VA:Virginia|WA:Washington|WV:West Virginia|WI:Wisconsin|WY:Wyoming".split("|").map(x=>x.split(":") as [string,string]);
const stateName=(value:string)=>usStates.find(([code,name])=>code.toLowerCase()===value.trim().toLowerCase()||name.toLowerCase()===value.trim().toLowerCase())?.[1]||"";
const stateCode=(value:string)=>usStates.find(([code,name])=>code.toLowerCase()===value.trim().toLowerCase()||name.toLowerCase()===value.trim().toLowerCase())?.[0]||"";
const validSite=(v:string)=>{try{const u=new URL(v);return u.protocol==="https:"&&
 !u.username&&!u.password&&!u.port&&u.hostname.includes(".")&&!u.hostname.endsWith(".local")&&
 !["localhost","127.0.0.1"].includes(u.hostname);}catch{return false;}};
type MenuChoice={value:string;label:string;detail?:string};
function ChoiceDropdown({label,value,placeholder,choices,disabled,onSelect}:{
 label:string;value:string;placeholder:string;choices:MenuChoice[];
 disabled?:boolean;onSelect:(value:string)=>void;
}){
 const [open,setOpen]=useState(false);
 const current=choices.find(item=>item.value===value);
 return <div className={styles.field}>
  <span>{label}</span>
  <div className={styles.dropdown} onBlurCapture={e=>{
   if(!e.currentTarget.contains(e.relatedTarget as Node))setOpen(false);
  }}>
   <button type="button" className={styles.dropdownTrigger} aria-expanded={open}
    disabled={disabled||!choices.length} onClick={()=>setOpen(v=>!v)}>
    <span>{current?.label||placeholder}</span><span aria-hidden="true">⌄</span>
   </button>
   {open?<div className={styles.dropdownPanel} role="group" aria-label={label}>
    {choices.map(item=><button type="button" key={item.value}
     className={value===item.value?styles.dropdownSelected:styles.dropdownOption}
     aria-pressed={value===item.value} onClick={()=>{
      onSelect(item.value);setOpen(false);
     }}><span><strong>{item.label}</strong>{item.detail?<small>{item.detail}</small>:null}</span>
      {value===item.value?<Check size={16}/>:null}</button>)}
   </div>:null}
  </div>
 </div>;
}
export default function AutomaticAdWizard({business,workspaceId,agent,onClose}:{
 business:CentralBusiness;workspaceId:string;agent:PersistedAgent;onClose:()=>void;
}){
 const [owner,setOwner]=useState("");
 const [step,setStep]=useState<Step>("business");
 const [products,setProducts]=useState<Product[]>([]);
 const [meta,setMeta]=useState<MetaProfile>({configured:false,connected:false,accounts:[],pages:[]});
 const [accountId,setAccountId]=useState("");
 const [pageId,setPageId]=useState("");
 const [places,setPlaces]=useState<Place[]>([]);
 const [cityDialogOpen,setCityDialogOpen]=useState(false);
 const [cityKey,setCityKey]=useState("");
 const [cityMetaName,setCityMetaName]=useState("");
 const [image,setImage]=useState<File|null>(null);
 const [imageMode,setImageMode]=useState<"upload"|"ai">("upload");
 const [aiCandidate,setAiCandidate]=useState<File|null>(null);
 const [aiPreview,setAiPreview]=useState("");
 const [imagePrompt,setImagePrompt]=useState("");
 const [returnToReview,setReturnToReview]=useState(false);
 const [imageHash,setImageHash]=useState("");
 const [imagePreview,setImagePreview]=useState("");
 const [headline,setHeadline]=useState("");
 const [message,setMessage]=useState("");
 const [pending,setPending]=useState("");
 const [adReady,setAdReady]=useState(false);
 const [dailyBudget,setDailyBudget]=useState("10");
 const [durationDays,setDurationDays]=useState("7");
 const [radiusMiles,setRadiusMiles]=useState<10|15|25|50>(15);
 const [utmEnabled,setUtmEnabled]=useState(true);
 const [specialConfirmed,setSpecialConfirmed]=useState(false);
 const [sendKey]=useState(()=>crypto.randomUUID());
 const budgetCents=Math.round(Number(dailyBudget)*100);
 const duration=Number(durationDays);
 const totalCents=budgetCents*duration;
 const validBudget=Number.isInteger(budgetCents)&&budgetCents>=500&&budgetCents<=25000&&
  Number.isInteger(duration)&&duration>=1&&duration<=30&&
  Number.isInteger(totalCents)&&totalCents<=750000;
 const usd=(cents:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(cents/100);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [editBusiness,setEditBusiness]=useState(false);
 const [siteChoice,setSiteChoice]=useState<"saved"|"custom"|"none">(validSite(business.website_url||"")?"saved":"custom");
 const [customWebsite,setCustomWebsite]=useState("");
 const [editCity,setEditCity]=useState(false);
 const [answer,setAnswer]=useState<Answer>({
  businessName:business.name,website:validSite(business.website_url||"")?business.website_url||"":"",
  offer:"",productIds:[],audience:"Personas interesadas en los productos o servicios del negocio",
  city:business.city||"",region:business.region||"",goals:["visits"],
  imageChoice:"upload",imageProductId:"",notes:""
 });
 const update=<K extends keyof Answer>(k:K,v:Answer[K])=>setAnswer(x=>({...x,[k]:v}));
 useEffect(()=>{let live=true;
  const run=async()=>{
   const db=getSupabase();if(!db)throw Error("Conexión no disponible.");
   const {data:{user},error:authError}=await db.auth.getUser();
   if(authError||!user||user.is_anonymous||user.id!==business.owner_id||
    user.id!==agent.owner_id||agent.business_id!==workspaceId)
    throw Error("Selecciona un agente y un negocio de tu propia cuenta.");
   if(!live)return;
   setOwner(user.id);
   const [catalog,services]=await Promise.all([
    db.from("vmv_ai_catalog_items")
     .select("id,name,description,price_cents,currency,stock_mode,image_path")
     .eq("owner_id",user.id).eq("business_id",workspaceId)
     .eq("approved",true).eq("active",true).order("updated_at",{ascending:false}).limit(50),
    db.from("vmv_ai_booking_services").select("id,name,description,price_cents,currency")
     .eq("owner_id",user.id).eq("business_id",workspaceId)
     .eq("approved",true).eq("active",true).limit(50)
   ]);
   if(catalog.error||services.error)throw Error("No se pudo consultar el inventario y los servicios.");
   if(live)setProducts([
    ...(catalog.data||[]).map(x=>({...x,type:"product" as const})),
    ...(services.data||[]).map(x=>({...x,stock_mode:"manual",image_path:null,type:"service" as const}))
   ]);
  };
  void run().catch(e=>{if(live)setError(e instanceof Error?e.message:"No se pudo cargar tu negocio.");})
   .finally(()=>{if(live)setLoading(false);});
  return()=>{live=false;};
 },[business.id,workspaceId,agent.id,agent.owner_id,agent.business_id]);
 const savedWebsite=validSite(business.website_url||"")?business.website_url||"":"";
 useEffect(()=>{if(step==="account"&&!meta.connected&&!pending)void fetchMeta();},
  // The account step is entered deliberately; avoid repeated requests while pending.
  [step]);
 const hasSite=Boolean(savedWebsite);
 const index=steps.indexOf(step);
 const selectedProducts=products.filter(x=>answer.productIds.includes(x.id));
 const product=selectedProducts.length===1?selectedProducts[0]:null;
 const verifiedPage=meta.pages.find(p=>p.id===pageId)||null;
 const selectedAccount=meta.accounts.find(a=>a.id===accountId);
 const locationVerified=Boolean(cityKey&&cityMetaName);
 const canContinue=step==="business"?answer.businessName.trim().length>=2:
  step==="website"?siteChoice==="saved"&&hasSite||siteChoice==="custom"&&validSite(customWebsite):
  step==="product"?answer.offer.trim().length>=3:
  step==="goal"?answer.goals.length>0:
  step==="audience"?answer.audience.trim().length>=3:
  step==="account"?Boolean(meta.connected&&selectedAccount?.status===1&&selectedAccount.currency==="USD"&&verifiedPage):
  step==="location"?locationVerified:
  step==="image"?Boolean(imageHash):
  step==="copy"?headline.trim().length>=5&&message.trim().length>=10:
  step==="budget"?validBudget:true;
 const next=()=>{
  if(!canContinue||Boolean(pending))return;
  if(step==="website")setAnswer(x=>({...x,website:siteChoice==="saved"?savedWebsite:siteChoice==="custom"?customWebsite.trim():""}));
  if(!returnToReview&&step==="image"&&!headline.trim()&&!message.trim())void generateCopy();
  setError("");
  if(returnToReview){setReturnToReview(false);setStep("review");return;}
  setStep(steps[Math.min(index+1,steps.length-1)]);
 };
 const back=()=>{
  if(cityDialogOpen){setCityDialogOpen(false);return;}
  if(returnToReview){setReturnToReview(false);setError("");setStep("review");return;}
  if(index===0){onClose();return;}
  setError("");setStep(steps[index-1]);
 };
 const editReview=(target:Step)=>{
  setReturnToReview(true);setError("");setStep(target);
 };
 const toggleGoal=(goal:Goal)=>setAnswer(current=>({
  ...current,goals:current.goals.includes(goal)?
   current.goals.filter(item=>item!==goal):[...current.goals,goal]
 }));
 const selectProduct=(id:string)=>{
  if(!answer.productIds.includes(id)&&answer.productIds.length>=20){
   setError("Puedes seleccionar hasta 20 productos o servicios por anuncio.");return;
  }
  setError("");
  setAnswer(x=>{
   const ids=x.productIds.includes(id)?x.productIds.filter(v=>v!==id):[...x.productIds,id];
   const names=products.filter(p=>ids.includes(p.id)).map(p=>p.name);
   return {...x,productIds:ids,offer:names.join(", ").slice(0,220)};
  });
  setHeadline("");setMessage("");setAdReady(false);
 };
 const api=async(path:string,method:"GET"|"POST"="GET",payload?:unknown)=>{
  const db=getSupabase();if(!db)throw Error("No se pudo conectar con VMV.");
  const {data:{session}}=await db.auth.getSession();
  if(!session?.access_token)throw Error("Inicia sesión nuevamente.");
  const response=await fetch(path,{method,cache:"no-store",headers:{
   Authorization:"Bearer "+session.access_token,...(method==="POST"?{"Content-Type":"application/json"}:{})
  },body:method==="POST"?JSON.stringify(payload):undefined});
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw Error(String(data?.error||"El servicio no respondió."));
  return data;
 };
 const fetchMeta=async()=>{
  setPending("meta");setError("");
  try{
   const data=await api("/api/marketing/ads/meta/accounts") as MetaProfile;
   setMeta(data);setAccountId(data.connection?.selectedAccountId||"");
   setPageId(old=>data.pages.some(p=>p.id===old)?old:data.pages.length===1?data.pages[0].id:"");
  }catch(e){setError(e instanceof Error?e.message:"No se pudo consultar Meta.");}
  finally{setPending("");}
 };
 const saveAccount=async(id:string)=>{
  setPending("account");setError("");
  try{
   await api("/api/marketing/ads/meta/accounts","POST",{accountId:id});
   setAccountId(id);
   const data=await api("/api/marketing/ads/meta/accounts") as MetaProfile;
   setMeta(data);setPageId(old=>data.pages.some(p=>p.id===old)?old:data.pages.length===1?data.pages[0].id:"");
  }catch(e){setError(e instanceof Error?e.message:"No se pudo seleccionar la cuenta.");}
  finally{setPending("");}
 };
 const connectMeta=async()=>{
  setPending("meta");setError("");
  try{
   const response=await api("/api/marketing/ads/meta/start","POST",{});
   const url=String(response.url||"");
   if(!url.startsWith("https://www.facebook.com/"))throw Error("Enlace de Meta inválido.");
   window.open(url,"_blank","noopener,noreferrer");
  }catch(e){setError(e instanceof Error?e.message:"No se pudo conectar Meta.");}
  finally{setPending("");}
 };
 const verifyCity=async()=>{
  if(answer.city.trim().length<3||!stateName(answer.region)||!meta.connected)return;
  setCityDialogOpen(true);setPending("city");setError("");setPlaces([]);setCityKey("");setCityMetaName("");
  try{
   const data=await api("/api/marketing/ads/meta/locations?q="+encodeURIComponent(answer.city.trim()));
   const wanted=stateName(answer.region).toLowerCase();
   const results=(Array.isArray(data.places)?data.places:[]) as Place[];
   setPlaces(results.filter(p=>p.countryCode==="US"&&p.region.trim().toLowerCase()===wanted).slice(0,30));
  }catch(e){setError(e instanceof Error?e.message:"No se pudo verificar la ciudad.");}
  finally{setPending("");}
 };
 /** One generated candidate remains private to the owner until approval. */
 const generateAdImage=async()=>{
  if(pending)return;
  setPending("image-ai");setError("");setAiCandidate(null);setImageHash("");
  try{
   const result=await api("/api/marketing/ads/generate-image","POST",{
    businessId:business.id,workspaceId,offer:answer.offer,
    audience:answer.audience,notes:answer.notes,prompt:imagePrompt
   });
   const base64=String(result?.imageBase64||"");
   const mime=String(result?.mediaType||"");
   if(!["image/png","image/jpeg","image/webp"].includes(mime)||base64.length>9000000||!base64)
    throw Error("La IA no devolvió una imagen válida.");
   const binary=atob(base64),bytes=new Uint8Array(binary.length);
   for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
   const bitmap=await createImageBitmap(new Blob([bytes],{type:mime}));
   let output:Blob|null=null;
   try{
    const canvas=document.createElement("canvas");
    canvas.width=bitmap.width;canvas.height=bitmap.height;
    const context=canvas.getContext("2d");
    if(!context)throw Error("No se pudo preparar la imagen.");
    context.drawImage(bitmap,0,0);
    for(const quality of [0.85,0.72,0.58]){
     output=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/jpeg",quality));
     if(output&&output.size>=1024&&output.size<=2*1024*1024)break;
    }
   }finally{bitmap.close();}
   if(!output||output.size<1024||output.size>2*1024*1024)
    throw Error("La imagen superó el tamaño admitido por Meta.");
   setAiCandidate(new File([output],"vmv-anuncio-ia.jpg",{type:"image/jpeg"}));
  }catch(e){const error=e instanceof Error?e.message:"Error generando imagen.";
   setError(error==="image_daily_limit"?"Has alcanzado el límite diario de imágenes con IA. Puedes subir una imagen propia.":error);}
  finally{setPending("");}
 };
 const uploadImage=async(file:File)=>{
  setImage(file);setImageHash("");setAdReady(false);setPending("image");setError("");
  if(!["image/jpeg","image/png"].includes(file.type)||file.size<1024||file.size>2*1024*1024){
   setError("Selecciona JPG o PNG de hasta 2 MB.");setPending("");return;
  }
  try{
   const db=getSupabase();if(!db)throw Error("Sin conexión.");
   const {data:{session}}=await db.auth.getSession();
   if(!session?.access_token)throw Error("Inicia sesión nuevamente.");
   const form=new FormData();form.set("image",file);
   const response=await fetch("/api/marketing/ads/meta/image",{
    method:"POST",headers:{Authorization:"Bearer "+session.access_token},body:form
   });
   const data=await response.json().catch(()=>null);
   if(!response.ok||typeof data?.imageHash!=="string")throw Error(String(data?.error||"Meta rechazó la imagen."));
   setImageHash(data.imageHash);
  }catch(e){setError(e instanceof Error?e.message:"La imagen no se pudo subir.");}
  finally{setPending("");}
 };
 const generateCopy=async()=>{
  setPending("copy");setError("");setAdReady(false);
  try{
   const offer=answer.offer.trim();
   const description=offer.length>=8?offer:offer+" de "+answer.businessName.trim();
   if(description.length<8)throw Error("Describe qué vas a anunciar.");
   const response=await api("/api/marketing/ads/generate","POST",{
    business:answer.businessName,offer:description,audience:answer.audience,
    city:cityMetaName,benefit:answer.notes,locale:"es",goal:"website",angle:"offer"
   });
   if(response.source!=="ai"||!response.variant?.headline||!response.variant?.message)
    throw Error("La IA no pudo generar el anuncio. Intenta nuevamente.");
   setHeadline(response.variant.headline);setMessage(response.variant.message);setAdReady(true);
  }catch(e){setError(e instanceof Error?e.message:"No se pudo crear el texto.");}
  finally{setPending("");}
 };
 useEffect(()=>{
  if(!image){setImagePreview("");return;}
  const url=URL.createObjectURL(image);setImagePreview(url);
  return()=>URL.revokeObjectURL(url);
 },[image]);
 useEffect(()=>{
  if(!aiCandidate){setAiPreview("");return;}
  const url=URL.createObjectURL(aiCandidate);setAiPreview(url);
  return()=>URL.revokeObjectURL(url);
 },[aiCandidate]);
 const finish=async()=>{
  if(!owner||!validBudget||!specialConfirmed||!cityKey||!pageId||!imageHash||
    !headline.trim()||!message.trim()||!accountId||pending)return;
  if(!answer.website||!validSite(answer.website)){
   setError("El enlace del anuncio debe utilizar HTTPS.");return;
  }
  if(!meta.connected||meta.connection?.selectedAccountId!==accountId||
   !meta.pages.some(p=>p.id===pageId)){
   setError("Verifica nuevamente la cuenta y la página de Facebook.");return;
  }
  if(!window.confirm("Confirmo un presupuesto máximo de "+usd(totalCents)+
   ". Se enviará a Meta como anuncio PAUSADO, sin publicación ni gasto. ¿Continuar?"))return;
  setPending("send");setError("");
  try{
   const dest=new URL(answer.website);
   if(utmEnabled){
    dest.searchParams.set("utm_source","meta");
    dest.searchParams.set("utm_medium","paid_social");
    dest.searchParams.set("utm_campaign",(answer.businessName+"_"+answer.offer)
     .toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"_").slice(0,50));
   }
   const saved=await api("/api/marketing/ads/meta/campaigns","POST",{
    operation:"draft",clientKey:sendKey,draft:{
     name:(answer.businessName+" · "+answer.offer).slice(0,80),
     headline:headline.trim(),message:message.trim(),destination:dest.toString(),
     cityKey,cityName:cityMetaName,citySearch:answer.city.trim(),radiusMiles,
     imageHash,pageId,placements:"facebook",
     dailyBudgetCents:budgetCents,durationDays:duration,specialCategoriesAcknowledged:true
    }
   });
   const campaignId=String(saved.campaign?.id||"");
   if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(campaignId))throw Error("No se pudo confirmar el borrador.");
   try{
    // The user explicitly approved the capped budget in this last step.
    // Meta objects are created PAUSED. Publishing and spending remain
    // separately gated by the existing Meta campaign approval endpoint.
    await api("/api/marketing/ads/meta/campaigns","POST",{
     operation:"create_paused",campaignId,confirmPaused:true,approvedTotalCents:totalCents
    });
   }catch{
    throw Error("El borrador se guardó, pero Meta no confirmó la campaña pausada. Revísala en Historial de campañas.");
   }
   window.location.assign("/vista-app/marketing/ads/campaigns");
  }catch(e){setError(e instanceof Error?e.message:"No se pudo guardar. Intenta nuevamente.");setPending("");}
 };
 const question:Record<Step,string>={
  business:"¿Este anuncio es para tu negocio?",
  website:"¿Quieres enviar clientes a tu página web?",
  product:"¿Qué vamos a promocionar?",
  goal:"¿Qué quieres conseguir?",
  audience:"¿A quién quieres llegar?",
  account:"¿Qué página de Facebook usaremos?",
  location:"¿Dónde quieres anunciarte?",
  image:"¿Qué imagen usaremos?",
  copy:"Tu agente preparó el anuncio",
  budget:"¿Cuánto quieres invertir?",
  review:"Revisa todo antes de enviar"
 };
 const chip=(label:string,selected:boolean,onClick:()=>void)=><button type="button"
  className={selected?styles.chipSelected:styles.chip} onClick={onClick}
  aria-pressed={selected}>{selected?<Check size={15}/>:null}{label}</button>;
 return <section className={styles.root} aria-label="Asistente para anuncios automáticos">
  <header className={styles.top}><button type="button" onClick={back} aria-label="Volver"><ArrowLeft size={20}/></button>
   <span>Anuncio automático</span><span>{index+1}/{steps.length}</span></header>
  <div className={styles.track}><span style={{width:((index+1)/steps.length*100)+"%"}}/></div>
  <div className={styles.robot}><Bot size={37}/><Sparkles size={16} className={styles.spark}/></div>
  <h1 className={styles.question}>{question[step]}</h1>
  {loading?<div className={styles.helper}><LoaderCircle size={17}/> Cargando datos del negocio…</div>:null}
  {!loading&&!error&&step==="business"?<div className={styles.answers}>
    <strong className={styles.example}>{business.name}</strong>
    <div className={styles.options}>{chip("Sí",!editBusiness,()=>{
      setEditBusiness(false);update("businessName",business.name);
    })}
     {chip("No, es otro",editBusiness,()=>setEditBusiness(true))}</div>
    {editBusiness?<><input aria-label="Nombre del negocio para este anuncio" maxLength={100}
     value={answer.businessName} onChange={e=>update("businessName",e.target.value)}/>
     <p className={styles.helper}>Cambiarlo aquí no modifica tu negocio guardado.</p></>:null}
   </div>:null}
  {!loading&&step==="website"?<div className={styles.answers}>
    {hasSite?<div className={styles.fact}><Globe2 size={20}/><span>{savedWebsite}</span></div>:null}
    <div className={styles.options}>
     {chip("Sí, usar mi web",siteChoice==="saved",()=>{setSiteChoice(hasSite?"saved":"custom");setError("");})}
     {chip("No, otra opción",siteChoice!=="saved",()=>{setSiteChoice("custom");setError("");})}
    </div>
    {siteChoice!=="saved"?<div className={styles.optionsVertical}>
     {chip("Escribir otra web",siteChoice==="custom",()=>setSiteChoice("custom"))}
     {chip("No tengo web",siteChoice==="none",()=>setSiteChoice("none"))}
    </div>:null}
    {siteChoice==="custom"?<input type="url" inputMode="url" aria-label="Sitio web HTTPS"
     placeholder="https://tunegocio.com" value={customWebsite}
     onChange={e=>setCustomWebsite(e.target.value)} maxLength={240}/>:null}
    {siteChoice==="none"?<p className={styles.helper}>Este piloto de Meta necesita una web HTTPS para los anuncios de clics.</p>:null}
   </div>:null}
  {!loading&&step==="product"?<div className={styles.answers}>
    {products.length>0?<><p className={styles.helper}>Marca varios productos o servicios aprobados</p>
     <div className={styles.products} role="group" aria-label="Productos y servicios del anuncio">{products.map(p=><button key={p.id} type="button"
      className={answer.productIds.includes(p.id)?styles.productActive:styles.product}
      aria-pressed={answer.productIds.includes(p.id)} onClick={()=>selectProduct(p.id)}>
      <Package size={16}/><span>{p.name}<small>{p.type==="service"?"Servicio · ":"Producto · "}
       {p.currency==="usd"?"$"+(p.price_cents/100).toFixed(2):"Precio aprobado"}</small></span>
      {answer.productIds.includes(p.id)?<Check size={18}/>:null}</button>)}</div></>:null}
    <label className={styles.field}>Oferta (puedes editar o agregar algo más)
     <textarea maxLength={220} rows={3} value={answer.offer}
      onChange={e=>{update("offer",e.target.value);setAdReady(false);}}
      placeholder="Describe qué vas a promocionar"/></label>
    <p className={styles.helper}>{answer.productIds.length} seleccionado(s). Sin descuentos ni precios inventados.</p>
   </div>:null}
  {!loading&&step==="goal"?<div className={styles.answers}>
    <p className={styles.helper}>Puedes elegir varios objetivos.</p>
    <div className={styles.optionsVertical} role="group" aria-label="Objetivos del anuncio">
     {([["visits","Visitas a mi web"],["messages","Mensajes y consultas"],["sales","Ventas"]] as const)
      .map(([id,title])=><button key={id} type="button"
       className={answer.goals.includes(id)?styles.chipSelected:styles.chip}
       aria-pressed={answer.goals.includes(id)} onClick={()=>toggleGoal(id)}>
       {answer.goals.includes(id)?<Check size={17}/>:null}{title}
      </button>)}
    </div>
   </div>:null}
  {!loading&&step==="audience"?<div className={styles.answers}>
    <label className={styles.field}>Público
     <textarea maxLength={130} rows={3} value={answer.audience} onChange={e=>update("audience",e.target.value)}/></label>
    <p className={styles.helper}>Describe intereses generales; evita datos sensibles o personales.</p>
   </div>:null}
  {!loading&&step==="account"?<div className={styles.answers}>
    <p className={styles.helper}>Cuenta y página autorizadas de Meta</p>
    {meta.connected?<div className={styles.fact}><Check size={17}/> Meta conectado</div>:null}
    <button type="button" className={styles.chip} disabled={Boolean(pending)} onClick={()=>void fetchMeta()}>
     {pending==="meta"?<LoaderCircle className={styles.spin} size={18}/>:<RefreshCw size={17}/>} Comprobar conexión</button>
    {!meta.configured?<p className={styles.helper}>Meta aún no está configurado. Conéctalo en el piloto para continuar.</p>:null}
    {meta.configured&&!meta.connected?<button type="button" className={styles.next} onClick={()=>void connectMeta()}>
     Conectar Facebook</button>:null}
    {meta.connected?<ChoiceDropdown label="Cuenta publicitaria" value={accountId}
     placeholder="Seleccionar cuenta" disabled={Boolean(pending)}
     choices={meta.accounts.filter(a=>a.status===1&&a.currency==="USD")
      .map(a=>({value:a.id,label:a.name,detail:"Cuenta autorizada · USD"}))}
     onSelect={id=>void saveAccount(id)}/>:null}
    {meta.connected&&accountId?<ChoiceDropdown label="Página de Facebook" value={pageId}
     placeholder="Seleccionar página" disabled={Boolean(pending)}
     choices={meta.pages.map(p=>({value:p.id,label:p.name}))}
     onSelect={setPageId}/>:null}
    {pending==="account"?<p className={styles.helper}>Verificando cuenta…</p>:null}
   </div>:null}
  {!loading&&step==="location"?<div className={styles.answers}>
    <div className={styles.fieldPair}>
     <label className={styles.field}>Ciudad<input maxLength={100} placeholder="Escribe tu ciudad" value={answer.city}
      onChange={e=>{update("city",e.target.value);setCityKey("");setCityMetaName("");}}/></label>
     <ChoiceDropdown label="Estado" value={stateCode(answer.region)} placeholder="Seleccionar estado"
      choices={usStates.map(([code,name])=>({value:code,label:name}))}
      onSelect={code=>{update("region",code);setCityKey("");setCityMetaName("");}}/>
    </div>
    {locationVerified?<div className={styles.fact}><Check size={17}/>{cityMetaName} · Verificada por Meta</div>:null}
    <button type="button" disabled={pending==="city"||answer.city.trim().length<3||!stateCode(answer.region)}
     className={styles.verifyCity} onClick={()=>void verifyCity()}>
     {pending==="city"?<LoaderCircle size={17} className={styles.spin}/>:<Globe2 size={17}/>}
     Verificar ciudad con Meta</button>
    <p className={styles.helper}>Después de verificar, toca tu ciudad en la lista para continuar.</p>
   </div>:null}
  {!loading&&step==="image"?<div className={styles.answers}>
    <label className={styles.field}>Imagen del anuncio · JPG o PNG (máximo 2 MB)
     <input type="file" accept="image/jpeg,image/png" disabled={pending==="image"}
      onChange={e=>{const file=e.target.files?.[0];if(file)void uploadImage(file);}}/></label>
    {imagePreview?<img className={styles.imagePreview} src={imagePreview} alt="Vista previa de la imagen del anuncio"/>:null}
    {pending==="image"?<div className={styles.uploadProgress} role="status">
     <LoaderCircle size={26} className={styles.spin}/> Enviando imagen a Meta…</div>:null}
    {imageHash&&pending!=="image"?<div className={styles.fact} role="status"><Check size={17}/> Imagen recibida por Meta</div>:null}
    {image&&!imageHash&&pending!=="image"?<button type="button" className={styles.chip}
     onClick={()=>void uploadImage(image)}>Reintentar subida</button>:null}
    <p className={styles.helper}>No avanzaremos hasta que Facebook confirme la recepción.</p>
   </div>:null}
  {!loading&&step==="copy"?<div className={styles.answers}>
    {pending==="copy"?<div className={styles.uploadProgress} role="status">
     <LoaderCircle size={23} className={styles.spin}/> Generando anuncio con IA…</div>:null}
    {!headline&&!message&&pending!=="copy"?<button type="button" className={styles.chip}
     onClick={()=>void generateCopy()}><Sparkles size={16}/> Intentar generar texto</button>:null}
    <label className={styles.field}>Título
     <input maxLength={70} value={headline} onChange={e=>setHeadline(e.target.value)}/></label>
    <label className={styles.field}>Texto del anuncio
     <textarea rows={5} maxLength={350} value={message} onChange={e=>setMessage(e.target.value)}/></label>
    <p className={styles.helper}>Revisa y edita el anuncio. Continúa para configurar el presupuesto.</p>
   </div>:null}
  {!loading&&step==="budget"?<div className={styles.answers}>
    <div className={styles.fieldPair}>
     <label className={styles.field}>Presupuesto diario (USD)
      <input type="number" inputMode="decimal" min="5" max="250" step="0.01"
       value={dailyBudget} onChange={e=>setDailyBudget(e.target.value)}/></label>
     <label className={styles.field}>Duración (días)
      <input type="number" inputMode="numeric" min="1" max="30" step="1"
       value={durationDays} onChange={e=>setDurationDays(e.target.value)}/></label>
    </div>
    <div className={styles.budgetTotal}><small>Presupuesto máximo</small>
     <strong>{validBudget?usd(totalCents):"—"}</strong><span>Sin cobros ahora</span></div>
    <label className={styles.switchField}>
     <span><strong>Etiquetas UTM</strong><small>Medir visitas desde Meta en tu web</small></span>
     <input type="checkbox" checked={utmEnabled} onChange={e=>setUtmEnabled(e.target.checked)}/>
    </label>
    <p className={styles.helper}>El gasto se cobra directamente en Meta si autorizas la publicación más adelante.</p>
   </div>:null}
  {!loading&&step==="review"?<div className={styles.review}>
    <div><small>Negocio</small><strong>{answer.businessName}</strong></div>
    <div><small>Promoción</small><strong>{answer.offer}</strong></div>
    <div><small>Destino</small><strong>{answer.website||"Por definir en Marketing"}</strong></div>
    <div><small>Zona</small><strong>{answer.city}, {answer.region}</strong></div>
    <div><small>Página Facebook</small><strong>{verifiedPage?.name||"Pendiente"}</strong></div>
    <div><small>Productos / servicios</small><strong>{selectedProducts.map(p=>p.name).join(", ")||answer.offer}</strong></div>
    <div><small>Imagen</small><strong>{imageHash?"Recibida por Meta":"Pendiente"}</strong></div>
    <div><small>Título</small><strong>{headline}</strong></div>
    <div><small>Texto</small><strong>{message}</strong></div>
    <div><small>Presupuesto máximo</small><strong>{validBudget?usd(totalCents):"Pendiente"}</strong></div>
    <div><small>UTM</small><strong>{utmEnabled?"Activadas":"Desactivadas"}</strong></div>
    <div><small>Objetivos</small><strong>{answer.goals.map(goal=>
     ({visits:"Visitas",messages:"Mensajes",sales:"Ventas"} as const)[goal]).join(" · ")}</strong></div>
    <label className={styles.consent}><input type="checkbox" checked={specialConfirmed}
     onChange={e=>setSpecialConfirmed(e.target.checked)}/>
     <span>Confirmo que este anuncio no pertenece a vivienda, empleo, crédito ni otra categoría especial.
      Los datos son reales y tengo derechos para usar la imagen.</span></label>
    <p className={styles.helper}>Enviar crea el anuncio PAUSADO en Meta. Publicarlo y gastar requieren autorización posterior.</p>
   </div>:null}
  {error?<p role="alert" className={styles.error}>{error}
   <button type="button" className={styles.chip} onClick={()=>setError("")}>Cerrar aviso</button>
  </p>:null}
  {!loading&&owner?<div className={styles.footer}>
    {step==="location"?null:step!=="review"?<button type="button" className={styles.next}
     disabled={!canContinue||Boolean(pending)} onClick={next}>
     Continuar <ArrowRight size={18}/></button>:
     <button type="button" className={styles.generate}
      disabled={!validBudget||!specialConfirmed||Boolean(pending)} onClick={()=>void finish()}>
      {pending==="send"?<LoaderCircle size={17} className={styles.spin}/>:<Megaphone size={18}/>}
      {pending==="send"?"Enviando…":"Enviar anuncio"} <ArrowRight size={17}/></button>}
   </div>:null}
  {step!=="location"?<p className={styles.safety}><ShieldCheck size={14}/>
   No publicamos anuncios ni activamos gastos automáticamente.</p>:null}
  {cityDialogOpen&&step==="location"?<div className={styles.cityOverlay}
   role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget&&!pending)setCityDialogOpen(false);}}>
   <div className={styles.cityDialog} role="dialog" aria-modal="true"
    aria-label="Ciudades verificadas por Meta">
    <div className={styles.cityDialogHead}><span><Globe2 size={20}/> Ciudades de Meta</span>
     <button type="button" aria-label="Cerrar selección" onClick={()=>setCityDialogOpen(false)}>×</button></div>
    <p className={styles.helper}>Elige la ciudad correcta para continuar automáticamente.</p>
    {pending==="city"?<div className={styles.uploadProgress} role="status">
     <LoaderCircle size={23} className={styles.spin}/> Verificando ciudad…</div>:null}
    {!pending&&places.length===0?<p className={styles.helper}>
     No hay coincidencias verificadas para {answer.city}, {stateName(answer.region)}.
     Cierra la ventana y cambia la búsqueda.</p>:null}
    {places.map(p=><button key={p.key} type="button" className={styles.cityChoice}
     onClick={()=>{setCityKey(p.key);setCityMetaName(p.name);setPlaces([]);
      setCityDialogOpen(false);setHeadline("");setMessage("");setAdReady(false);
      setStep("image");}}>
     <span><strong>{p.name}</strong><small>{p.region} · Estados Unidos</small></span>
     <Check size={17}/></button>)}
   </div>
  </div>:null}
 </section>;
}
