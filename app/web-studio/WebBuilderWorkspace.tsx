"use client";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import type {Data} from "@puckeditor/core";
import {Puck,Render} from "@puckeditor/core";
import {ArrowLeft,ChevronDown,ExternalLink,Eye,FilePlus2,Globe,History,Layers,Plus,RefreshCw,Save,Settings2,ShieldCheck,SlidersHorizontal,Trash2} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {useInterfaceLanguage} from "@/lib/i18n-web";
import {t as interfaceText,type InterfaceLanguage} from "@/lib/i18n";
import {builderConfig,normalizeBuilderDocument,validateBuilderDocument,starterBuilderDocument,importLegacyBuilderDocument} from "@/lib/web-builder-puck";
import {normalizeWebContent,type WebSiteContent} from "@/lib/web-services-site";
import {BUSINESS_CATEGORIES,CATEGORY_GROUPS} from "@/lib/vmv-business-categories";
import WebSiteIntake from "./WebSiteIntake";
import type {SiteIntake,SiteProposal} from "@/lib/web-builder-templates";
import {WEBSITE_STYLES,restyleWebsiteDocument,type WebsiteStyleId} from "@/lib/web-builder-safe-styles";
import BuilderHistoryControls from "./BuilderHistoryControls";
import BuilderQuickAdd from "./BuilderQuickAdd";
import BuilderSelectedActions from "./BuilderSelectedActions";
import {WebsiteChrome,websiteVisualStyle} from "@/lib/web-site-chrome";
import {familyForCategory} from "@/lib/web-builder-templates";
import RequestForm from "@/app/sites/[slug]/RequestForm";
import styles from "./WebBuilderWorkspace.module.css";

type Site={id:string;owner_id:string;slug:string;name:string;category_id:string;inquiries_enabled:boolean;legacy_source_slug:string|null};
type Page={id:string;site_id:string;owner_id:string;slug:string;title:string;description:string;draft:unknown;revision:number;updated_at:string};
type Revision={id:string;page_id:string;version:number;title:string;description:string;document:unknown;created_at:string};
type Domain={id:string;hostname:string;state:string;last_error:string;verification:unknown;last_checked_at:string|null};
type DomainRequest={id:string;hostname:string;intent:"buy"|"connect";status:string;years:number;auto_renew:boolean;created_at:string};
type DomainQuote={domain:string;available:boolean;price:number|null;renewalPrice:number|null;years:number;priceDisplay:string;renewalDisplay:string;premium:boolean};
type View="sites"|"editor"|"history"|"domains";
type SavePhase="saved"|"pending"|"saving"|"error";
type LocalBackup={pageId:string;document:Data;title:string;description:string;savedAt:string;revision:number};
function backupKey(ownerId:string,pageId:string){return "vmv.puck.local.v1."+ownerId+"."+pageId;}
function publicationSignature(draft:unknown,title:string,description:string){
 return JSON.stringify({draft:normalizeBuilderDocument(draft),title,description});
}

function slugify(input:string){
 return input.normalize("NFKD").toLowerCase().replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,49).replace(/-$/g,"");
}
const puckTokens=["header-publish","header-undo","header-redo","header-toggle-leftsidebar","header-toggle-rightsidebar","header-toggle-menubar","action-selectparent","action-drag","action-duplicate","action-delete","label-page","label-component","outline-empty","outline-header-title","outline-header-collapseall","outline-item-collapse","outline-item-expand","outline-item-duplicate","outline-item-delete","drawer-category-collapse","drawer-category-expand","drawer-category-other","canvas-noconfig","field-readonly","field-arrayitem-summary","field-arrayitem-duplicate","field-arrayitem-delete","field-external-selectdata","field-external-search","field-external-togglefilters","field-external-item","field-external-result-singular","field-external-result-plural","field-richtext-bold","field-richtext-italic","field-richtext-underline","field-richtext-strikethrough","field-richtext-blockquote","field-richtext-code-inline","field-richtext-code-block","field-richtext-list-bullet","field-richtext-list-ordered","field-richtext-horizontalrule","field-richtext-align-left","field-richtext-align-center","field-richtext-align-right","field-richtext-align-justify","field-richtext-select","field-richtext-headingselect-1","field-richtext-headingselect-2","field-richtext-headingselect-3","field-richtext-headingselect-4","field-richtext-headingselect-5","field-richtext-headingselect-6","field-richtext-alignselect-left","field-richtext-alignselect-center","field-richtext-alignselect-right","field-richtext-alignselect-justify","field-richtext-listselect-bullet","field-richtext-listselect-ordered","viewport-zoom-in","viewport-zoom-out","viewport-zoom-auto","viewport-toggle-menu","viewport-switch","viewport-switch-default","plugin-blocks","plugin-outline","plugin-fields","plugin-components","layout-maximize","layout-minimize","loader-loading"] as const;
function puckDictionary(language:InterfaceLanguage){
 return Object.fromEntries(puckTokens.map(token=>[token,interfaceText(language,`puck.${token}`)]));
}
export default function WebBuilderWorkspace(){
 const {language}=useInterfaceLanguage();
 const dictionary=useMemo(()=>puckDictionary(language),[language]);
 const [userId,setUserId]=useState("");
 const [sites,setSites]=useState<Site[]>([]);
 const [site,setSite]=useState<Site|null>(null);
 const [pages,setPages]=useState<Page[]>([]);
 const [publishedIds,setPublishedIds]=useState<string[]>([]);
 const [publishedSignatures,setPublishedSignatures]=useState<Record<string,string>>({});
 const [page,setPage]=useState<Page|null>(null);
 const pageIdRef=useRef<string|null>(null);
 const [document,setDocument]=useState<Data>(()=>starterBuilderDocument());
 const [initialDocument,setInitialDocument]=useState<Data>(()=>starterBuilderDocument());
 const [previewMode,setPreviewMode]=useState<"desktop"|"mobile"|null>(null);
 const [designChoice,setDesignChoice]=useState<WebsiteStyleId|null>(null);
 const [designUndo,setDesignUndo]=useState<{pageId:string;document:Data}|null>(null);
 const [savePhase,setSavePhase]=useState<SavePhase>("saved");
 const [recovery,setRecovery]=useState<LocalBackup|null>(null);
 const blockedAutosaveRef=useRef("");
 const [view,setView]=useState<View>("sites");
 const [mobileSettings,setMobileSettings]=useState(false);
 const [mobilePageForm,setMobilePageForm]=useState(false);
 const [mobilePageMenu,setMobilePageMenu]=useState(false);
 const workspaceRef=useRef<HTMLDivElement|null>(null);
 const [compactStudio,setCompactStudio]=useState(false);
 useEffect(()=>{
  const element=workspaceRef.current;
  if(!element)return;
  const update=()=>setCompactStudio(element.getBoundingClientRect().width<=700);
  update();
  const observer=new ResizeObserver(update);
  observer.observe(element);
  return()=>observer.disconnect();
 },[site?.id]);
 const [classicDraft,setClassicDraft]=useState<WebSiteContent|null>(null);
 const [classicSlug,setClassicSlug]=useState<string|null>(null);
 const [newPageName,setNewPageName]=useState("");
 const [title,setTitle]=useState("");
 const [description,setDescription]=useState("");
 const documentRef=useRef(document);
 const titleRef=useRef(title);
 const descriptionRef=useRef(description);
 documentRef.current=document;titleRef.current=title;descriptionRef.current=description;
 pageIdRef.current=page?.id||null;
 const [revisions,setRevisions]=useState<Revision[]>([]);
 const [domains,setDomains]=useState<Domain[]>([]);
 const [domainRequests,setDomainRequests]=useState<DomainRequest[]>([]);
 const [domainQuote,setDomainQuote]=useState<DomainQuote|null>(null);
 const [domainInput,setDomainInput]=useState("");
 const [quote,setQuote]=useState("");
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [refreshKey,setRefreshKey]=useState(0);
 const [origin,setOrigin]=useState("");
 const previewDocument=useMemo(()=>normalizeBuilderDocument(document),[document]);
 const previewRoot=(previewDocument.root?.props||{}) as Record<string,unknown>;
 const previewFamily=typeof previewRoot.family==="string"&&
  ["bakery","construction","professional","beauty","creative"].includes(previewRoot.family)?
  previewRoot.family:familyForCategory(site?.category_id||"");
 const previewServices=useMemo(()=>{
  const fromClassic=previewDocument.content.filter(c=>c.type==="Services")
   .flatMap(c=>["first","second","third"].map(k=>c.props?.[k]).filter((s):s is string=>
    typeof s==="string"&&Boolean(s.trim())));
  const fromCatalog=previewDocument.content.filter(c=>c.type==="OfferingGrid")
   .flatMap(c=>Array.isArray(c.props?.items)?c.props.items.flatMap((v:unknown)=>
    v&&typeof v==="object"&&typeof (v as {title?:unknown}).title==="string"?
     [(v as {title:string}).title]:[]):[]);
  return Array.from(new Set([...fromClassic,...fromCatalog])).slice(0,30);
 },[previewDocument]);
 const dirty=page&&(JSON.stringify(normalizeBuilderDocument(document))!==JSON.stringify(normalizeBuilderDocument(page.draft))||
  title!==page.title||description!==page.description);
 const publishedHere=Boolean(page&&publishedIds.includes(page.id));
 const unpublishedEdits=Boolean(page&&publishedHere&&
  publishedSignatures[page.id]!==publicationSignature(document,title,description));
 const siteUrl=site?origin+"/web/"+site.slug:null;
 const pageUrl=site&&page?siteUrl+(page.slug==="home"?"":"/"+page.slug):null;
 const client=useMemo(()=>getSupabase(),[]);
 const authorized=useCallback(async()=>{
  if(!client)throw new Error("Supabase no está disponible");
  const {data,error}=await client.auth.getUser();
  if(error||!data.user||data.user.id!==userId||data.user.is_anonymous)
   throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
  return client;
 },[client,userId]);
 useEffect(()=>{
  let active=true;
  setOrigin(window.location.origin);
  void(async()=>{
   try{
    if(!client)throw new Error("Supabase no está configurado");
    const {data,error:authError}=await client.auth.getUser();
    if(authError||!data.user||data.user.is_anonymous)throw new Error("Inicia sesión en VMV Business para continuar");
    const {data:rows,error}=await client.from("smartjob_builder_sites")
     .select("id,owner_id,slug,name,category_id,inquiries_enabled,legacy_source_slug").eq("owner_id",data.user.id).order("created_at",{ascending:false});
    if(error)throw new Error("No se pudieron cargar tus sitios");
    if(active){setUserId(data.user.id);setSites((rows||[]) as Site[]);}
    const {data:classic}=await client.from("smartjob_web_sites")
     .select("slug,draft").eq("owner_id",data.user.id).maybeSingle();
    if(classic?.draft&&active&&!rows?.some(row=>row.legacy_source_slug===classic.slug)){
     const old=normalizeWebContent(classic.draft);
     if(old.business){setClassicDraft(old);setClassicSlug(classic.slug);}
    }
   }catch(e){if(active)setError(e instanceof Error?e.message:"No disponible");}
   finally{if(active)setLoading(false);}
  })();
  return()=>{active=false};
 },[client]);
 useEffect(()=>{
  if(!dirty)return;
  const callback=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue="";};
  window.addEventListener("beforeunload",callback);
  return()=>window.removeEventListener("beforeunload",callback);
 },[dirty]);
 function openDraft(draft:unknown){
  blockedAutosaveRef.current="";
  setRecovery(null);setSavePhase("saved");
  const normalized=normalizeBuilderDocument(draft);
  setInitialDocument(normalized);
  setDocument(normalized);
  setRefreshKey(value=>value+1);
  setPreviewMode(null);setDesignChoice(null);setDesignUndo(null);
 }

 // Restore a newer local copy only after the owner explicitly agrees.
 useEffect(()=>{
  if(!userId||!page)return;
  try{
   const raw=window.localStorage.getItem(backupKey(userId,page.id));
   if(!raw)return;
   if(raw.length>180000){window.localStorage.removeItem(backupKey(userId,page.id));return;}
   const data=JSON.parse(raw) as Partial<LocalBackup>;
   if(data.pageId!==page.id||typeof data.savedAt!=="string"||
    !Number.isFinite(Date.parse(data.savedAt))||!data.document)return;
   const backupDocument=normalizeBuilderDocument(data.document);
   const same=JSON.stringify(backupDocument)===JSON.stringify(normalizeBuilderDocument(page.draft))&&
    data.title===page.title&&data.description===page.description;
   if(same){window.localStorage.removeItem(backupKey(userId,page.id));return;}
   if(Date.parse(data.savedAt)>Date.parse(page.updated_at)){
    setRecovery({pageId:page.id,document:backupDocument,title:String(data.title||page.title).slice(0,100),
     description:String(data.description||"").slice(0,300),revision:Number(data.revision)||page.revision,savedAt:data.savedAt});
   }
  }catch{/* Local storage can be blocked or corrupt. */}
 // Recheck when the selected page changes, not on every server save.
 },[userId,page?.id]);

 useEffect(()=>{
  if(!userId||!page||!dirty||recovery)return;
  try{
   const snapshot:LocalBackup={pageId:page.id,document:normalizeBuilderDocument(document),
    title,description,savedAt:new Date().toISOString(),revision:page.revision};
   window.localStorage.setItem(backupKey(userId,page.id),JSON.stringify(snapshot));
  }catch{/* Best-effort recovery copy; browser may deny storage. */}
 },[userId,page?.id,page?.revision,document,title,description,dirty,recovery]);
 const loadPages=useCallback(async(currentSite:Site)=>{
  const c=await authorized();
  const {data,error}=await c.from("smartjob_builder_pages")
   .select("id,site_id,owner_id,slug,title,description,draft,revision,updated_at")
   .eq("site_id",currentSite.id).eq("owner_id",userId).order("created_at");
  if(error)throw new Error("No se pudieron cargar las páginas");
  return (data||[]) as Page[];
 },[authorized,userId]);
 function choosePage(target:Page){
  if(dirty&&!window.confirm("Hay cambios sin guardar. ¿Cambiar de página?"))return;
  setPage(target);setTitle(target.title);setDescription(target.description);
  openDraft(target.draft);
  setView("editor");setError("");setNotice("");setMobileSettings(false);setMobilePageForm(false);
 }
 async function selectSite(chosen:Site){
  if(dirty&&!window.confirm("Hay cambios sin guardar. ¿Salir del editor?"))return;
  setBusy(true);setError("");setNotice("");
  try{
   const list=await loadPages(chosen);
   const db=await authorized();
   const {data:published,error:publishedError}=await db.from("smartjob_builder_public_pages")
    .select("page_id,document,title,description").eq("site_id",chosen.id).eq("owner_id",userId);
   if(publishedError)throw new Error("No se pudo verificar el estado de publicación");
   setPublishedIds((published||[]).map(row=>row.page_id));
   setPublishedSignatures(Object.fromEntries((published||[]).map(row=>[
    row.page_id,publicationSignature(row.document,row.title,row.description)
   ])));
   setSite(chosen);setPages(list);
   if(list.length){const home=list.find(p=>p.slug==="home")||list[0];setPage(home);
    setTitle(home.title);setDescription(home.description);openDraft(home.draft);
    setView("editor");}
   else{setPage(null);setView("sites");}
  }catch(e){setError(e instanceof Error?e.message:"No se pudo abrir");}
  finally{setBusy(false);}
 }
 async function loadCreatedSite(c:NonNullable<ReturnType<typeof getSupabase>>,ids:{siteId:string;pageId:string}){
  const [siteResult,pageResult]=await Promise.all([
   c.from("smartjob_builder_sites").select(
    "id,owner_id,slug,name,category_id,inquiries_enabled,legacy_source_slug"
   ).eq("id",ids.siteId).eq("owner_id",userId).single(),
   c.from("smartjob_builder_pages").select(
    "id,site_id,owner_id,slug,title,description,draft,revision,updated_at"
   ).eq("id",ids.pageId).eq("owner_id",userId).single()
  ]);
  if(siteResult.error||pageResult.error||!siteResult.data||!pageResult.data)
   throw new Error("Sitio creado, pero no pudo abrirse. Recarga Mis sitios.");
  return {created:siteResult.data as Site,home:pageResult.data as Page};
 }
 async function createSite(intake:SiteIntake,proposal:SiteProposal){
  if(busy||!userId)return;
  const name=intake.business.trim().slice(0,100);
  if(name.length<2){setError("Escribe el nombre del negocio");return;}
  setBusy(true);setError("");setNotice("");
  try{
   const db=await authorized();
   const slug=(slugify(name).slice(0,33)||"mi-negocio")+"-"+crypto.randomUUID().replace(/-/g,"").slice(0,8);
   const {data:ids,error:rpcError}=await db.rpc("smartjob_builder_create_site",{
    p_name:name,p_slug:slug,p_category_id:intake.categoryId,
    p_home_draft:normalizeBuilderDocument(proposal.data),
    p_home_description:intake.about.slice(0,300),p_legacy_source_slug:null
   });
   if(rpcError||!ids?.siteId||!ids?.pageId)throw new Error("No se pudo crear el sitio. Revisa el límite de sitios.");
   const {created,home}=await loadCreatedSite(db,ids);
   setSites(current=>[created,...current]);
   setSite(created);setPages([home]);setPage(home);setPublishedIds([]);setPublishedSignatures({});
   openDraft(home.draft);setTitle(home.title);setDescription(home.description);
   setView("editor");setNotice("Diseño creado. Personalízalo y publícalo cuando esté listo.");
  }catch(e){setError(e instanceof Error?e.message:"No se pudo crear");}
  finally{setBusy(false);}
 }
 async function importClassic(){
  if(!classicDraft||!classicSlug||busy||!userId)return;
  if(!window.confirm("Importar tu web anterior como un nuevo borrador visual. Tu web actual no será modificada."))return;
  setBusy(true);setError("");setNotice("");
  try{
   const c=await authorized();
   const name=classicDraft.business.trim().slice(0,100);
   const slug=(slugify(name).slice(0,33)||"mi-negocio")+"-"+crypto.randomUUID().replace(/-/g,"").slice(0,8);
   const doc=importLegacyBuilderDocument(classicDraft);
   const {data:ids,error:rpcError}=await c.rpc("smartjob_builder_create_site",{
    p_name:name,p_slug:slug,p_category_id:classicDraft.categoryId,
    p_home_draft:doc,p_home_description:classicDraft.intro.slice(0,300),
    p_legacy_source_slug:classicSlug
   });
   if(rpcError||!ids?.siteId||!ids?.pageId)throw new Error("No se pudo importar. La web anterior sigue intacta.");
   const {created,home}=await loadCreatedSite(c,ids);
   setSites(old=>[created as Site,...old]);
   setSite(created as Site);setPages([home as Page]);setPage(home as Page);setPublishedIds([]);setPublishedSignatures({});
   setTitle(home.title);setDescription(home.description);
   openDraft(doc);setView("editor");
   setClassicDraft(null);setClassicSlug(null);
   setNotice("Tu web anterior quedó intacta. Revisa y publica esta nueva versión cuando quieras.");
  }catch(e){setError(e instanceof Error?e.message:"No se pudo importar");}
  finally{setBusy(false);}
 }
 async function toggleRequests(enabled:boolean){
  if(!site||busy)return;
  setBusy(true);setError("");setNotice("");
  try{
   const db=await authorized();
   const {data,error}=await db.from("smartjob_builder_sites")
    .update({inquiries_enabled:enabled,updated_at:new Date().toISOString()})
    .eq("id",site.id).eq("owner_id",userId)
    .select("id,inquiries_enabled").single();
   if(error||!data)throw new Error("No se pudo cambiar la configuración");
   setSite(old=>old?{...old,inquiries_enabled:enabled}:null);
   setSites(old=>old.map(s=>s.id===site.id?{...s,inquiries_enabled:enabled}:s));
   setNotice("Configuración guardada. Publica la página Inicio para aplicar el cambio.");
  }catch(e){setError(e instanceof Error?e.message:"Error al guardar");}
  finally{setBusy(false);}
 }
 async function createPage(){
  if(!site||busy||!userId)return;
  const name=newPageName.trim().slice(0,100);
  const requested=slugify(name);
  if(name.length<2||requested.length<2){setError("Escribe un nombre para la página");return;}
  if(pages.some(p=>p.slug===requested)){setError("Ya existe esa página");return;}
  if(pages.length>=15){setError("Máximo 15 páginas por sitio en esta versión");return;}
  if(dirty&&!window.confirm("Hay cambios sin guardar. ¿Crear otra página?"))return;
  setBusy(true);setError("");
  try{
   const c=await authorized();
   const draft=starterBuilderDocument(name,site.category_id);
   const {data,error}=await c.from("smartjob_builder_pages").insert({
    site_id:site.id,owner_id:userId,slug:requested,title:name,description:"",draft
   }).select("id,site_id,owner_id,slug,title,description,draft,revision,updated_at").single();
   if(error||!data)throw new Error("No se pudo crear la página");
   const newPage=data as Page;
   setPages(old=>[...old,newPage]);setPage(newPage);setTitle(name);setDescription("");
   openDraft(draft);setNewPageName("");setMobilePageForm(false);setMobileSettings(false);
   setView("editor");setNotice("Nueva página creada");
  }catch(e){setError(e instanceof Error?e.message:"No se pudo crear");}
  finally{setBusy(false);}
 }
 async function saveDraft(value:Data):Promise<Page>{
  if(!page)throw new Error("Selecciona una página");
  const problem=validateBuilderDocument(value);
  if(problem)throw new Error(problem);
  const c=await authorized();
  const clean=normalizeBuilderDocument(value);
  const pageTitle=title.trim().slice(0,100);
  const desc=description.trim().slice(0,300);
  if(!pageTitle)throw new Error("El título de la página no puede estar vacío.");
  const {data,error}=await c.from("smartjob_builder_pages")
   .update({draft:clean,title:pageTitle,description:desc,updated_at:new Date().toISOString(),revision:page.revision+1})
   .eq("id",page.id).eq("owner_id",userId).eq("revision",page.revision)
   .select("id,site_id,owner_id,slug,title,description,draft,revision,updated_at").maybeSingle();
  if(error||!data)throw new Error("Esta página se modificó en otra pestaña. Recarga para evitar sobrescribir cambios.");
  const updated=data as Page;
  if(pageIdRef.current===updated.id){
   setPage(updated);
   if(titleRef.current===title)setTitle(pageTitle);
   if(descriptionRef.current===description)setDescription(desc);
  }
  setPages(current=>current.map(p=>p.id===updated.id?updated:p));
  const stillCurrent=JSON.stringify(normalizeBuilderDocument(documentRef.current))===JSON.stringify(clean)&&
   titleRef.current.trim().slice(0,100)===pageTitle&&descriptionRef.current.trim().slice(0,300)===desc;
  setSavePhase(stillCurrent?"saved":"pending");
  if(stillCurrent){
   try{window.localStorage.removeItem(backupKey(userId,updated.id));}catch{/* Storage may be blocked. */}
  }
  return updated;
 }

 // Save drafts after editing settles. Never publish from autosave.
 useEffect(()=>{
  if(!page||!userId||!dirty||busy||recovery)return;
  const snapshot=JSON.stringify({
   id:page.id,document:normalizeBuilderDocument(document),title:title.trim(),description:description.trim()
  });
  if(blockedAutosaveRef.current===snapshot)return;
  setSavePhase("pending");
  const timer=window.setTimeout(()=>{
   setBusy(true);setSavePhase("saving");
   void (async()=>{
    try{
     await saveDraft(document);
     blockedAutosaveRef.current="";setError("");
    }catch{
     blockedAutosaveRef.current=snapshot;
     setSavePhase("error");
     setError("No se pudo guardar automáticamente. Tus cambios siguen en el navegador.");
    }finally{setBusy(false);}
   })();
  },2100);
  return()=>window.clearTimeout(timer);
 },[page?.id,page?.revision,userId,document,title,description,dirty,busy,view,recovery]);
 async function save(){
  if(busy||!page)return;
  setBusy(true);setError("");setNotice("");
  try{
   blockedAutosaveRef.current="";
   setSavePhase("saving");
   await saveDraft(document);
   setNotice("Borrador guardado");
  }catch(e){
   setSavePhase("error");
   setError(e instanceof Error?e.message:"No se pudo guardar");
  }
  finally{setBusy(false);}
 }
 async function publish(value:Data){
  if(!page)return;
  if(busy){setNotice("Aún se está guardando. Pulsa Publicar nuevamente.");return;}
  const normalized=normalizeBuilderDocument(value);
  const warnings:string[]=[];
  const hasRealContact=normalized.content.some(block=>{
   if(block.type!=="Contact")return false;
   return Boolean(String(block.props?.email||"").trim()||String(block.props?.phone||"").trim());
  });
  if(!hasRealContact&&!(site?.inquiries_enabled&&page.slug==="home")){
   warnings.push("No hay correo, teléfono ni formulario de solicitud activo en esta página.");
  }
  if(normalized.content.some(block=>block.type==="HeroVisual"&&!block.props?.image)){
   warnings.push("La portada contiene un espacio para foto sin imagen.");
  }
  const emptyCards=normalized.content.some(block=>["OfferingGrid","PhotoGallery","ProjectShowcase","TeamGrid"].includes(block.type)
   &&Array.isArray(block.props?.items)&&block.props.items.some((item:unknown)=>
    item&&typeof item==="object"&&!Boolean((item as {image?:string}).image)));
  if(emptyCards)warnings.push("Hay tarjetas o galerías sin fotografías.");
  if(normalized.content.some(block=>block.type==="OfferingGrid"
    &&(!Array.isArray(block.props?.items)||block.props.items.length===0))){
   warnings.push("Existe un catálogo de productos o servicios sin elementos.");
  }
  if(warnings.length&&!window.confirm("Antes de publicar, revisa:\n\n• "+warnings.join("\n• ")+
    "\n\n¿Quieres publicar de todas formas?"))return;
  setBusy(true);setSavePhase("saving");setError("");setNotice("");
  try{
   const updated=await saveDraft(value);
   const c=await authorized();
   const {data,error}=await c.rpc("smartjob_builder_publish_page",{p_page_id:updated.id});
   if(error||!data)throw new Error(error?.message||"No se pudo publicar");
   setPublishedIds(old=>old.includes(updated.id)?old:[...old,updated.id]);
   setPublishedSignatures(old=>({...old,[updated.id]:publicationSignature(value,updated.title,updated.description)}));
   setNotice("Página publicada. Puedes abrirla con el enlace de arriba.");
  }catch(e){setError(e instanceof Error?e.message:"No se pudo publicar");}
  finally{setBusy(false);}
 }
 async function openHistory(){
  if(!page)return;
  setBusy(true);setError("");
  try{
   const c=await authorized();
   const {data,error}=await c.from("smartjob_builder_revisions")
    .select("id,page_id,version,title,description,document,created_at")
    .eq("page_id",page.id).eq("owner_id",userId).order("version",{ascending:false}).limit(25);
   if(error)throw new Error("No se pudo cargar el historial");
   setRevisions((data||[]) as Revision[]);setView("history");
  }catch(e){setError(e instanceof Error?e.message:"No se pudo cargar");}
  finally{setBusy(false);}
 }
 async function restore(revision:Revision){
  if(busy||!page||!window.confirm("¿Recuperar esta versión como borrador? La página pública no cambiará."))return;
  if(dirty&&!window.confirm("Tienes cambios sin guardar. ¿Descartarlos y recuperar esta versión?"))return;
  setBusy(true);setError("");setNotice("");
  try{
   const db=await authorized();
   const {data,error:restoreError}=await db.rpc("smartjob_builder_restore_revision",{
    p_page_id:page.id,p_revision_id:revision.id,p_expected_revision:page.revision
   });
   if(restoreError||!data)throw new Error(
    restoreError?.code==="40001"?"Otra pestaña cambió el borrador. Recarga para continuar.":"No se pudo recuperar la versión"
   );
   const {data:fresh,error:freshError}=await db.from("smartjob_builder_pages")
    .select("id,site_id,owner_id,slug,title,description,draft,revision,updated_at")
    .eq("id",page.id).eq("owner_id",userId).single();
   if(freshError||!fresh)throw new Error("La versión se recuperó, pero debes volver a abrir el editor.");
   const restored=fresh as Page;
   setPage(restored);setPages(current=>current.map(p=>p.id===restored.id?restored:p));
   setTitle(restored.title);setDescription(restored.description);
   openDraft(restored.draft);setView("editor");
   setNotice("Versión recuperada como borrador. La página pública sigue igual hasta que publiques.");
  }catch(e){setError(e instanceof Error?e.message:"No se pudo recuperar");}
  finally{setBusy(false);}
 }
 async function openDomains(){
  if(!site)return;
  setBusy(true);setError("");
  try{
   const c=await authorized();
   const [result,requests]=await Promise.all([
    c.from("smartjob_builder_domains")
     .select("id,hostname,state,last_error,verification,last_checked_at")
     .eq("site_id",site.id).eq("owner_id",userId).order("created_at",{ascending:false}),
    c.from("smartjob_builder_domain_requests")
     .select("id,hostname,intent,status,years,auto_renew,created_at")
     .eq("site_id",site.id).eq("owner_id",userId).order("created_at",{ascending:false})
   ]);
   if(result.error||requests.error)throw new Error("No se pudieron consultar los dominios");
   setDomains((result.data||[]) as Domain[]);
   setDomainRequests((requests.data||[]) as DomainRequest[]);
   setView("domains");
  }catch(e){setError(e instanceof Error?e.message:"No se pudieron cargar");}
  finally{setBusy(false);}
 }
 async function checkDomain(){
  const domain=domainInput.toLowerCase().trim();
  if(!/^(?:[a-z0-9-]+\.)+[a-z]{2,24}$/.test(domain)){setError("Escribe un dominio válido, por ejemplo minombre.com");return;}
  setBusy(true);setQuote("");setDomainQuote(null);setError("");
  try{
   const auth=await authorized();
   const {data:sessionData}=await auth.auth.getSession();
   const token=sessionData.session?.access_token;
   if(!token)throw new Error("Inicia sesión nuevamente");
   const res=await fetch("/api/web-services/domain-search?domain="+encodeURIComponent(domain),{
    cache:"no-store",headers:{"Authorization":"Bearer "+token}
   });
   const data=await res.json();
   if(!res.ok)throw new Error(data.error||"No se pudo consultar");
   setDomainQuote(data as DomainQuote);
   setQuote(data.available?
    domain+" disponible. Registro: "+data.priceDisplay+" / "+data.years+" año(s). Renovación: "+data.renewalDisplay+". Precio del registrador; impuestos y comisiones pueden aplicar.":
    data.available===false?domain+" no está disponible para registrar.":"Consulta no disponible ahora.");
  }catch(e){setError(e instanceof Error?e.message:"No se pudo consultar");}
  finally{setBusy(false);}
 }
 async function submitDomainRequest(intent:"buy"|"connect"){
  if(!site||!userId||busy)return;
  const domain=(domainQuote?.domain||domainInput).trim().toLowerCase();
  if(!/^(?:[a-z0-9-]+\.)+[a-z]{2,24}$/.test(domain)){setError("Dominio inválido");return;}
  if(intent==="buy"&&(!domainQuote?.available||domainQuote.domain!==domain)){
   setError("Primero consulta la disponibilidad y el precio real");return;
  }
  if(domainRequests.some(item=>item.hostname===domain&&item.intent===intent)){
   setNotice("Ya existe una solicitud para este dominio");return;
  }
  setBusy(true);setError("");setNotice("");
  try{
   const db=await authorized();
   const {data,error}=await db.from("smartjob_builder_domain_requests").insert({
    owner_id:userId,site_id:site.id,hostname:domain,intent,years:domainQuote?.years||1,
    auto_renew:false,status:"requested"
   }).select("id,hostname,intent,status,years,auto_renew,created_at").single();
   if(error||!data)throw new Error("No se pudo guardar la solicitud");
   setDomainRequests(old=>[data as DomainRequest,...old]);
   setNotice(intent==="buy"?
    "Solicitud de compra guardada. No se realizó ningún cobro ni registro. VMV deberá confirmar el precio final y los datos del titular.":
    "Solicitud de conexión guardada. La verificación DNS es necesaria antes de activar el dominio.");
  }catch(e){setError(e instanceof Error?e.message:"No se pudo guardar");}
  finally{setBusy(false);}
 }
 async function requestDomainVerification(hostname:string,action:"connect"|"verify"){
  if(!site||!userId||busy)return;
  setBusy(true);setError("");setNotice("");
  try{
   const db=await authorized();
   const {data:{session}}=await db.auth.getSession();
   if(!session?.access_token)throw new Error("Inicia sesión nuevamente");
   const res=await fetch("/api/web-services/domain-connect",{
    method:"POST",headers:{"Authorization":"Bearer "+session.access_token,"Content-Type":"application/json"},
    body:JSON.stringify({siteId:site.id,domain:hostname,action})
   });
   const result=await res.json();
   if(!res.ok)throw new Error(result.error||"No se pudo verificar");
   setNotice(result.connected?"El dominio está conectado y activo.":"Faltan datos DNS. Revisa los registros de verificación.");
   await openDomains();
  }catch(e){setError(e instanceof Error?e.message:"No se pudo verificar");}
  finally{setBusy(false);}
 }
 function recoverLocal(){
  if(!recovery||!page||recovery.pageId!==page.id)return;
  const draft=recovery;
  openDraft(draft.document);
  setTitle(draft.title);setDescription(draft.description);
  setSavePhase("pending");
  setNotice("Contenido local recuperado. Se guardará como borrador, sin cambiar la web pública.");
 }
 function discardLocal(){
  if(!page)return;
  try{window.localStorage.removeItem(backupKey(userId,page.id));}catch{/* Storage is optional. */}
  setRecovery(null);
 }
 function applyDesign(){
  if(!page||!designChoice||busy||recovery)return;
  try{
   const existing=normalizeBuilderDocument(document);
   const next=restyleWebsiteDocument(existing,designChoice);
   if(JSON.stringify(next)===JSON.stringify(existing)){
    setDesignChoice(null);return;
   }
   if(!window.confirm("El diseño cambiará su paleta, tipografía y composición visual. Todos los bloques, fotos, productos y textos se conservarán. La web pública no cambiará hasta que publiques. ¿Aplicar al borrador?"))return;
   openDraft(next);
   setDesignUndo({pageId:page.id,document:existing});
   setNotice("Nuevo diseño aplicado al borrador. Puedes deshacerlo antes o después de guardarlo. Publica solo cuando estés conforme.");
  }catch(e){setError(e instanceof Error?e.message:"No se pudo aplicar el diseño");}
 }
 function undoDesign(){
  if(!page||designUndo?.pageId!==page.id||busy)return;
  const previous=designUndo.document;
  openDraft(previous);
  setNotice("Diseño anterior recuperado en el borrador. La página pública sigue intacta.");
 }
 function back(){
  if(dirty&&!window.confirm("Hay cambios sin guardar. ¿Salir?"))return;
  setSite(null);setPage(null);setPublishedIds([]);setPublishedSignatures({});setView("sites");setMobileSettings(false);setMobilePageForm(false);setMobilePageMenu(false);setError("");setNotice("");
 }
 if(loading)return <main className={styles.loading}>Cargando Web Studio…</main>;
 if(!userId)return <main className={styles.loading}><h2>Inicia sesión para crear tu web</h2>
  <p>{error}</p><a href="/vista-app">Ir a VMV Business</a></main>;
 return <div className={styles.workspace} ref={workspaceRef}>
  <header className={styles.topbar} data-site={Boolean(site)}>
   <a href="/vista-app" className={styles.brand}>VMV <span>Web Studio</span></a>
   {site?<button type="button" className={styles.mobileBack} aria-label="Volver a mis sitios"
    title="Mis sitios" onClick={back}><ArrowLeft size={19}/></button>:null}
   {site?<strong className={styles.mobileSiteName} title={site.name}>{site.name}</strong>:null}
   {site&&page&&view==="editor"?<button type="button" className={styles.mobilePublish}
    disabled={busy||Boolean(recovery)} onClick={()=>void publish(document)}>
    {busy?"Procesando…":"Publicar"}
   </button>:null}
   {site?<button type="button" className={styles.back} onClick={back}><ArrowLeft size={16}/> Mis sitios</button>:null}
  </header>
  {error?<div className={styles.error} role="alert">{error}</div>:null}
  {notice?<div className={styles.notice} role="status">{notice}</div>:null}
  {!site?<main className={styles.landing}>
   <WebSiteIntake ownerId={userId} busy={busy} onChoose={(input,proposal)=>void createSite(input,proposal)}/>
   {classicDraft?<button type="button" className={styles.importClassic} disabled={busy}
    onClick={()=>void importClassic()}><Layers size={18}/> Importar mi web actual al editor visual</button>:null}
   <h2>Mis sitios</h2>
   <div className={styles.siteList}>
    {sites.map(s=><button type="button" key={s.id} className={styles.siteCard}
     onClick={()=>void selectSite(s)}><Globe size={23}/><strong>{s.name}</strong><small>{s.slug}</small><span>Abrir ↗</span></button>)}
    {!sites.length?<p>Tu primer sitio comienza aquí.</p>:null}
   </div>
  </main>:<main className={styles.main}>
   <div className={styles.desktopSiteControls}>
   <div className={styles.siteHeading}>
    <div><small>SITIO WEB</small><h1>{site.name}</h1></div>
    {pages.some(p=>p.slug==="home"&&publishedIds.includes(p.id))?<a href={siteUrl||"#"} target="_blank" rel="noopener noreferrer" className={styles.sitePreview}><ExternalLink size={16}/> Ver sitio</a>:null}
   </div>
   <label className={styles.siteLeadsSwitch}>
    <span><strong>Solicitudes {site.inquiries_enabled?"configuradas":"desactivadas"}</strong>
     <small>{site.inquiries_enabled?"Se muestran cuando la página Inicio esté publicada":"No se recibirán desde este sitio"}</small></span>
    <input type="checkbox" role="switch" checked={site.inquiries_enabled}
     disabled={busy} onChange={e=>void toggleRequests(e.target.checked)}/>
   </label>
   <div className={styles.sections}>
    <button type="button" className={view==="editor"?styles.selected:""} onClick={()=>{setView("editor");setError("");}}>Editor</button>
    <button type="button" className={view==="history"?styles.selected:""} onClick={()=>void openHistory()}><History size={14}/> Historial</button>
    <button type="button" className={view==="domains"?styles.selected:""} onClick={()=>void openDomains()}><Globe size={14}/> Dominios</button>
   </div>
   </div>
   <div className={styles.mobileStudioTools} role="group" aria-label="Navegación del editor">
    {view!=="editor"?<button type="button" className={styles.mobileEditorReturn}
     onClick={()=>{setView("editor");setMobileSettings(false);setError("");}}>
     <ArrowLeft size={16}/> Editor
    </button>:null}
    <div className={styles.mobilePageSwitcher}>
     <button type="button" className={styles.mobilePageTrigger} disabled={busy||!page}
      aria-label="Seleccionar página" aria-haspopup="menu" aria-controls="vmv-page-choices"
      aria-expanded={mobilePageMenu}
      onClick={()=>{setMobilePageMenu(open=>!open);setMobilePageForm(false);setMobileSettings(false);}}>
      <span>{page?.slug==="home"?"Inicio":page?.title||"Seleccionar página"}</span>
      <ChevronDown size={16} aria-hidden="true"/>
     </button>
     {mobilePageMenu?<div id="vmv-page-choices" className={styles.mobilePageMenu} role="menu"
      aria-label="Páginas del sitio">
      {pages.map(p=><button type="button" role="menuitemradio" aria-checked={page?.id===p.id}
       key={p.id} onClick={()=>{choosePage(p);setMobilePageMenu(false);setMobileSettings(false);setMobilePageForm(false);}}>
       <span>{p.slug==="home"?"Inicio":p.title}</span>
       {page?.id===p.id?<span aria-hidden="true">✓</span>:null}
      </button>)}
      <button type="button" role="menuitem" className={styles.mobileAddPage}
       onClick={()=>{setMobilePageMenu(false);setMobilePageForm(true);setMobileSettings(false);}}>
       <FilePlus2 size={17}/> Agregar página
      </button>
     </div>:null}
    </div>
    <button type="button" className={styles.mobileToolButton} title={previewMode?"Volver a editar":"Vista previa"}
     aria-label={previewMode?"Volver al editor":"Vista previa"} aria-pressed={Boolean(previewMode)}
     onClick={()=>{setView("editor");setPreviewMode(mode=>mode?null:"mobile");setDesignChoice(null);
      setMobilePageForm(false);setMobilePageMenu(false);setMobileSettings(false);}}><Eye size={19}/></button>
    <button type="button" className={styles.mobileToolButton} title="Ajustes del sitio"
     aria-label="Ajustes del sitio" aria-expanded={mobileSettings}
     onClick={()=>{setMobileSettings(v=>!v);setMobilePageForm(false);setMobilePageMenu(false);}}>
     <Settings2 size={19}/>
    </button>
   </div>
   {mobilePageForm?<form className={styles.mobileCreatePage}
    onSubmit={e=>{e.preventDefault();void createPage();}}>
    <label>Nueva página
     <input autoFocus value={newPageName} maxLength={100}
      placeholder="Ej. Servicios" onChange={e=>setNewPageName(e.target.value)}/>
    </label>
    <button type="submit" disabled={busy||newPageName.trim().length<2}>Crear</button>
   </form>:null}
   {mobileSettings?<section className={styles.mobileSettingsPanel} aria-label="Ajustes del sitio y página">
    <div className={styles.mobileSettingsHeader}><strong>Ajustes</strong>
     <button type="button" onClick={()=>setMobileSettings(false)} aria-label="Cerrar ajustes">Cerrar</button>
    </div>
    <div className={styles.mobileSettingsGrid}>
     <button type="button" onClick={()=>{setView("editor");setPreviewMode("mobile");setDesignChoice(null);
      setMobileSettings(false);}}><Eye size={17}/> Vista previa</button>
     <button type="button" disabled={busy} onClick={()=>{setView("editor");setDesignChoice("warm");
      setPreviewMode(null);setMobileSettings(false);}}><SlidersHorizontal size={17}/> Diseño</button>
     <button type="button" disabled={busy} onClick={()=>void save()}><Save size={17}/> Guardar</button>
     <button type="button" onClick={()=>{void openHistory();setMobileSettings(false);}}>
      <History size={17}/> Versiones</button>
     <button type="button" onClick={()=>{void openDomains();setMobileSettings(false);}}>
      <Globe size={17}/> Dominios</button>
     {page&&publishedIds.includes(page.id)?<a href={pageUrl||"#"} target="_blank"
      rel="noopener noreferrer"><ExternalLink size={17}/> Ver página</a>:null}
    </div>
    <label className={styles.mobileRequests}>
     <span><strong>Recibir solicitudes</strong>
      <small>{site.inquiries_enabled?"Configurado · verifica que Inicio esté publicado":
       "Desactivadas"}</small></span>
     <input type="checkbox" role="switch" checked={site.inquiries_enabled}
      disabled={busy} onChange={e=>void toggleRequests(e.target.checked)}/>
    </label>
    <details className={styles.mobileSeo}>
     <summary><Settings2 size={17}/> Ajustes de página · SEO</summary>
     <div className={styles.mobileSeoFields}>
      <label>Título para buscadores
       <input value={title} maxLength={100} onChange={e=>setTitle(e.target.value)}/>
      </label>
      <label>Descripción para buscadores
       <textarea value={description} maxLength={300} rows={3}
        placeholder="Describe tu negocio y lo que ofreces"
        onChange={e=>setDescription(e.target.value)}/>
      </label>
      <small>Estos textos no cambian el contenido que el visitante ve dentro de la página.</small>
     </div>
    </details>
   </section>:null}
   {page&&view==="editor"?<div className={styles.mobileDraftStatus} role="status" aria-live="polite">
    <span aria-hidden="true" className={styles.mobileStateDot}
     data-error={savePhase==="error"}/>
    {savePhase==="saving"?"Guardando cambios…":
     savePhase==="error"?"Error al guardar":
     dirty?"Cambios pendientes de guardar":unpublishedEdits?"Cambios pendientes de publicar":
     publishedHere?"Publicado · Borrador guardado":"Borrador guardado · Pendiente de publicar"}
   </div>:null}
   {page?<section className={styles.editorSection} style={{display:view==="editor"?undefined:"none"}}>
    <div className={styles.pageTabs}>{pages.map(p=><button type="button" key={p.id}
     className={page?.id===p.id?styles.selected:""} onClick={()=>choosePage(p)}>{p.slug==="home"?"Inicio":p.title}</button>)}</div>
    <form className={styles.addPage} onSubmit={e=>{e.preventDefault();void createPage();}}>
     <input maxLength={100} placeholder="Otra página: Servicios, Contacto…" value={newPageName} onChange={e=>setNewPageName(e.target.value)}/>
     <button type="submit" disabled={busy}><Plus size={15}/> Página</button>
    </form>
    {page?<div className={styles.editing}>
     {recovery?.pageId===page.id?<div className={styles.recoveryBanner} role="status">
      <div><strong>Encontramos cambios que no llegaron a guardarse.</strong>
       <span>Elige qué versión quieres conservar. La web pública no cambiará.</span></div>
      <div className={styles.recoveryActions}>
       <button type="button" onClick={recoverLocal}>Recuperar cambios</button>
       <button type="button" onClick={discardLocal}>Usar versión guardada</button>
      </div>
     </div>:null}
     <div className={styles.editingHeader}>
      <details className={styles.seoDisclosure}>
       <summary><Settings2 size={16}/> Ajustes de página · SEO</summary>
       <div className={styles.meta}>
        <label>Título para buscadores<input value={title} maxLength={100} onChange={e=>setTitle(e.target.value)}/></label>
        <label>Descripción para buscadores<input value={description} maxLength={300} onChange={e=>setDescription(e.target.value)}/></label>
       </div>
      </details>
      <div className={styles.actions}>
       <span className={styles.publicationIndicator} data-pending={unpublishedEdits}>
        {!publishedHere?"Sin publicar":unpublishedEdits?"Cambios sin publicar":"Publicado"}
       </span>
       <span className={styles.saveIndicator} role="status" aria-live="polite">
        {savePhase==="saving"?"Guardando…":savePhase==="error"?"Error al guardar":dirty?"Sin guardar":"Borrador guardado"}
       </span>
       <button type="button" disabled={busy||Boolean(recovery)} onClick={()=>void save()}><Save size={15}/> Guardar</button>
       <button type="button" disabled={busy||Boolean(recovery)}
        onClick={()=>{setDesignChoice(designChoice?null:"warm");setPreviewMode(null);}}>
        {designChoice?"Cerrar diseños":"Cambiar diseño"}
       </button>
       <button type="button" disabled={busy} onClick={()=>{setPreviewMode("desktop");setDesignChoice(null);}}>Vista previa</button>
       {publishedIds.includes(page.id)?<a href={pageUrl||"#"} target="_blank" rel="noopener noreferrer"><ExternalLink size={15}/> Página pública</a>:null}
      </div>
     </div>
     {designUndo?.pageId===page.id?<div className={styles.designRecovery}>
      <span>El último cambio de diseño puede revertirse sin eliminar contenido.</span>
      <button type="button" disabled={busy} onClick={undoDesign}>Deshacer cambio de diseño</button>
     </div>:null}
     {designChoice?<section className={styles.designPanel} aria-label="Comparar cambios de diseño">
      <div className={styles.designPanelHead}>
       <div><strong>Cambiar diseño sin perder contenido</strong>
        <p>Compara sobre tu página actual. Conservaremos cada sección, imagen, producto, texto y enlace.</p></div>
       <button type="button" onClick={()=>setDesignChoice(null)}>Cancelar</button>
      </div>
      <div className={styles.designChoices} role="group" aria-label="Estilo visual">
       {WEBSITE_STYLES.map(style=><button type="button" key={style.id}
        aria-pressed={designChoice===style.id} onClick={()=>setDesignChoice(style.id)}>
        <strong>{style.title}</strong><small>{style.description}</small>
       </button>)}
      </div>
      <div className={styles.designComparison}>
       <div><strong>Actual</strong><div className={styles.designFrame}>
        <Render config={builderConfig} data={normalizeBuilderDocument(document)}/></div></div>
       <div><strong>Propuesta</strong><div className={styles.designFrame}>
        <Render config={builderConfig} data={restyleWebsiteDocument(document,designChoice)}/></div></div>
      </div>
      <div className={styles.designApply}>
       <span>No se elimina ninguna sección ni se publica automáticamente.</span>
       <button type="button" disabled={busy||Boolean(recovery)} onClick={applyDesign}>Aplicar al borrador</button>
      </div>
     </section>:null}
     {previewMode?<section className={styles.previewOverlay} aria-label="Vista previa del borrador">
      <div className={styles.previewTop}>
       <strong>Vista previa del borrador</strong>
       <div>
        <button type="button" aria-pressed={previewMode==="desktop"} onClick={()=>setPreviewMode("desktop")}>Escritorio</button>
        <button type="button" aria-pressed={previewMode==="mobile"} onClick={()=>setPreviewMode("mobile")}>Móvil</button>
        <button type="button" onClick={()=>setPreviewMode(null)}>Volver al editor</button>
       </div>
      </div>
      <div className={previewMode==="mobile"?styles.previewPhone:styles.previewDesktop}>
       <WebsiteChrome siteName={site?.name||"Mi negocio"} baseUrl={siteUrl||""}
        menu={pages.filter(p=>publishedIds.includes(p.id)).map(p=>({title:p.title,page_slug:p.slug}))}
        logo={typeof previewRoot.logo==="string"?previewRoot.logo:""} family={previewFamily}
        language={previewRoot.language==="en"?"en":"es"}
        siteStyle={String(previewRoot.style||"light")} siteWidth={String(previewRoot.width||"regular")}
        socialLinks={previewRoot.socialLinks}
        visualStyle={websiteVisualStyle(previewRoot.palette,previewRoot.accentColor)}>
        <Render config={builderConfig} data={previewDocument}/>
        {site?.inquiries_enabled&&page.slug==="home"?<section className="vmv-site-inquiry"
         id="solicitud" aria-label="Vista previa del formulario">
         <small>CONTACTA CON NOSOTROS</small>
         <h2>¿Qué necesitas?</h2>
         <RequestForm preview source="builder" slug={site.slug} business={site.name}
          categoryId={site.category_id} services={previewServices}/>
        </section>:null}
       </WebsiteChrome>
      </div>
     </section>:null}
     <div className={compactStudio?styles.puckShell+" "+styles.compactPuck:styles.puckShell} style={{display:previewMode?"none":undefined}}>
      <Puck key={page.id+"-"+refreshKey} dictionary={dictionary} config={builderConfig} dnd={{enableDragHandle:true}}
       overrides={{headerActions:({children})=><><BuilderHistoryControls/><BuilderQuickAdd compact={compactStudio} enabled={!previewMode&&view==="editor"}/>{compactStudio?null:children}</>,
        actionBar:({children,label})=><BuilderSelectedActions label={label||"Elemento"}>{children}</BuilderSelectedActions>}}
       viewports={compactStudio?[{width:"100%",label:"Pantalla actual",icon:"Smartphone"}]:undefined}
       _experimentalFullScreenCanvas={compactStudio}
       data={initialDocument} height={compactStudio?"100%":"75vh"}
       onChange={data=>setDocument(data)}
       onPublish={publish} />
     </div>
    </div>:<p>Selecciona o crea una página.</p>}
   </section>:null}
   {view==="history"?<section className={styles.subPanel}>
    <div className={styles.panelTitle}><History size={18}/><h2>Versiones publicadas</h2></div>
    {revisions.length===0?<p>Esta página no tiene publicaciones anteriores.</p>:revisions.map(v=><div className={styles.version} key={v.id}>
     <span><strong>Versión {v.version}</strong><small>{new Date(v.created_at).toLocaleString("es-US")}</small></span>
     <button type="button" disabled={busy} onClick={()=>void restore(v)}><RefreshCw size={14}/> Recuperar</button>
    </div>)}
   </section>:null}
   {view==="domains"?<section className={styles.subPanel}>
    <div className={styles.panelTitle}><Globe size={19}/><h2>Dominios del sitio</h2></div>
    <p>Busca un dominio para tu negocio. La compra requiere confirmar precio, titular y pago antes de registrar.</p>
    <div className={styles.domainForm}><input placeholder="minegocio.com" value={domainInput} onChange={e=>{setDomainInput(e.target.value);setQuote("");}}
     spellCheck={false} autoComplete="off" maxLength={253}/>
     <button type="button" disabled={busy} onClick={()=>void checkDomain()}>Consultar</button></div>
    {quote?<div className={styles.domainQuote}><strong>{quote}</strong>
     {domainQuote?.available?<div className={styles.domainButtons}>
      <button type="button" disabled={busy} onClick={()=>void submitDomainRequest("buy")}>Solicitar compra con VMV</button>
      <button type="button" disabled={busy} onClick={()=>void submitDomainRequest("connect")}>Ya tengo este dominio</button>
     </div>:null}
     </div>:null}
    {domainRequests.length?<div className={styles.domainRequests}><h3>Mis solicitudes</h3>
     {domainRequests.map(r=><div className={styles.domainRow} key={r.id}>
      <span><strong>{r.hostname}</strong> · {r.intent==="buy"?"Compra":"Conexión"}</span>
      <small>{r.status==="requested"?"Recibida":r.status}</small>
      {r.intent==="connect"?<button type="button" disabled={busy} onClick={()=>void requestDomainVerification(r.hostname,"connect")}>Vincular</button>:null}
     </div>)}
    </div>:null}
    {domains.map(d=><article key={d.id} className={styles.domainRow}>
     <strong>{d.hostname}</strong><span>{d.state==="active"?"Conectado":d.state==="verifying"?"Pendiente de DNS":"Pendiente"}</span>
    </article>)}
    {domains.map(d=>d.state==="verifying"?<button key={"verify-"+d.id} type="button"
     className={styles.verifyDomain} disabled={busy}
     onClick={()=>void requestDomainVerification(d.hostname,"verify")}>Comprobar DNS de {d.hostname}</button>:null)}
    <p className={styles.domainNote}><ShieldCheck size={16}/> Las solicitudes de compra no generan cargos. La conexión definitiva requiere autorización y verificación DNS.</p>
   </section>:null}
  </main>}
 </div>;
}
