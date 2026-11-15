"use client";

import {useCallback,useEffect,useMemo,useRef,useState,type CSSProperties,type PointerEvent as ReactPointerEvent} from "react";
import {Render,type Config,type Data} from "@puckeditor/core";
import {
 ArrowDown,ArrowLeft,ArrowUp,Check,ChevronDown,ChevronRight,Eye,EyeOff,
 FilePlus2,Globe,ImagePlus,Layers,Menu,MessageCircle,Monitor,Palette,
 Plus,RotateCw,Save,Settings2,SlidersHorizontal,Smartphone,
 Sparkles,Type,Upload, X
} from "lucide-react";
import {builderConfig,normalizeBuilderDocument} from "@/lib/web-builder-puck";
import {imageTargets,imageTargetIndex,patchBuilderImage,targetImage,targetSettings,type ImageTarget} from "@/lib/web-builder-images";
import {WEBSITE_STYLES,restyleWebsiteDocument,type WebsiteStyleId} from "@/lib/web-builder-safe-styles";
import BuilderImageField from "./BuilderImageField";
import {ColorField,FontField,RangeField} from "./BuilderContextFields";
import {WebsiteChrome,websiteVisualStyle} from "@/lib/web-site-chrome";
import {familyForCategory} from "@/lib/web-builder-templates";
import WebChatLauncher from "./WebChatLauncher";
import RequestForm from "@/app/sites/[slug]/RequestForm";
import styles from "./MobileVisualStudio.module.css";

type PageChoice={id:string;slug:string;title:string};
type Item=Data["content"][number];
type Pick={id:string;kind:"image"|"text"|"button"|"section";target?:ImageTarget;
 key?:string;index?:number;x:number;y:number};
type Section="home"|"pages"|"create"|"appearance"|"seo"|"connections"|"domain"|"history";

const TEXT_KEYS=["title","description","body","text","eyebrow","subtitle","buttonText","label",
 "caption","quote","author","price","hours","area","notes","first","second","third","phone","email","address"];
const LABELS:Record<string,string>={title:"Título",description:"Descripción",body:"Texto",text:"Texto",
 eyebrow:"Encabezado",subtitle:"Subtítulo",buttonText:"Texto del botón",label:"Texto del botón",
 caption:"Pie de foto",quote:"Cita",author:"Autor",price:"Precio",hours:"Horario",area:"Zona",
 notes:"Notas",first:"Primer elemento",second:"Segundo elemento",third:"Tercer elemento",
 phone:"Teléfono",email:"Correo",address:"Dirección"};
const ADDS=[
 {type:"ComposeHeading",label:"Título"},{type:"ComposeText",label:"Descripción"},
 {type:"ComposeImage",label:"Imagen"},{type:"ComposeButton",label:"Botón"},
 {type:"HeroVisual",label:"Portada"},{type:"OfferingGrid",label:"Productos / servicios"},
 {type:"PhotoGallery",label:"Galería"},{type:"Contact",label:"Contacto"},
 {type:"CTA",label:"Llamada a la acción"},{type:"SectionLayout",label:"Contenedor"},
 {type:"ColumnsLayout",label:"Columnas"},{type:"FAQList",label:"Preguntas"},
 {type:"TeamGrid",label:"Equipo"},{type:"HoursArea",label:"Horarios"}
] as const;

function findBlock(data:Data,id:string):Item|null{
 function walk(list:Data["content"]):Item|null{
  for(const node of list){
   if(node.props?.id===id)return node;
   const props=node.props as Record<string,unknown>;
   for(const field of ["content","left","right","third"]){
    if(Array.isArray(props[field])){
     const match=walk(props[field] as Data["content"]);
     if(match)return match;
    }
   }
  }
  return null;
 }
 return walk(data.content);
}
function patchBlock(data:Data,id:string,patch:Record<string,unknown>):Data{
 function visit(nodes:Data["content"]):Data["content"]{
  return nodes.map(node=>{
   let props=node.props as Record<string,unknown>;
   if(props.id===id)props={...props,...patch};
   for(const slot of ["content","left","right","third"])
    if(Array.isArray(props[slot]))props={...props,[slot]:visit(props[slot] as Data["content"])};
   return props===node.props?node:{...node,props};
  });
 }
 return {...data,content:visit(data.content)};
}
function moveBlock(data:Data,id:string,step:number):Data{
 let moved=false;
 function visit(nodes:Data["content"]):Data["content"]{
  const index=nodes.findIndex(node=>node.props?.id===id);
  if(index>=0){
   const to=index+step;
   if(to<0||to>=nodes.length)return nodes;
   moved=true;
   const next=[...nodes];[next[index],next[to]]=[next[to],next[index]];
   return next;
  }
  return nodes.map(node=>{
   const props=node.props as Record<string,unknown>;
   let updated=props;
   for(const slot of ["content","left","right","third"])
    if(Array.isArray(updated[slot]))updated={...updated,[slot]:visit(updated[slot] as Data["content"])};
   return updated===props?node:{...node,props:updated};
  });
 }
 const content=visit(data.content);
 return moved?{...data,content}:data;
}
function editableConfig():Config{
 const blocks=Object.fromEntries(Object.entries(builderConfig.components||{}).map(([kind,block])=>{
  const original=block as unknown as {render:(props:Record<string,unknown>)=>React.ReactNode};
  return [kind,{...block,render:(props:Record<string,unknown>)=>{
   const emptyImage=(["ComposeImage","Image"].includes(kind)&&!String(props.image||props.url||""));
   const emptySection=(["OfferingGrid","PhotoGallery","ProjectShowcase","TeamGrid"].includes(kind)&&
    (!Array.isArray(props.items)||props.items.length===0));
   return <div data-vmv-edit-block={String(props.id||"")} data-vmv-block-type={kind} style={{display:"contents"}}>
    {emptyImage||emptySection?
     <div data-vmv-empty="true" style={{padding:"50px 20px",textAlign:"center",border:"1px dashed #bc9bda",
      borderRadius:12,background:"#faf6ff",color:"#7956a9",fontSize:14}}>
      {emptyImage?"Mantén pulsado aquí para agregar una imagen":"Mantén pulsado aquí para editar esta sección"}
     </div>:original.render(props)}
   </div>;
  }}];
 }));
 return {...builderConfig,components:blocks} as Config;
}
function fieldsFor(props:Record<string,unknown>):string[]{
 return TEXT_KEYS.filter(key=>typeof props[key]==="string"&&key!=="address"||key==="address"&&typeof props[key]==="string");
}
function listImages(data:Data):Array<{id:string;type:string;target:ImageTarget;name:string;alt:string}>{
 const result:Array<{id:string;type:string;target:ImageTarget;name:string;alt:string}>=[];
 function walk(nodes:Data["content"]){
  for(const node of nodes){
   const p=node.props as Record<string,unknown>;const id=String(p.id||"");
   if(id){
    for(const target of imageTargets(node.type,p)){
     const alt=target.index!==undefined&&Array.isArray(p.items)?
      String((p.items[target.index] as Record<string,unknown>)?.alt||""):
      String(p[node.type==="HeroVisual"?"imageAlt":target.field==="beforeImage"?"beforeAlt":target.field==="afterImage"?"afterAlt":"alt"]||"");
     result.push({id,type:node.type,target,name:String(p.title||target.label||node.type),alt});
    }
   }
   for(const slot of ["content","left","right","third"])if(Array.isArray(p[slot]))walk(p[slot] as Data["content"]);
  }
 }
 walk(data.content);
 return result;
}
function getTextTarget(p:Record<string,unknown>,clicked:Element,kind:string):{key:string;index?:number}{
 const text=(clicked.textContent||"").replace(/\s+/g," ").trim();
 const items=Array.isArray(p.items)?p.items as Record<string,unknown>[]:[];
 const article=clicked.closest("article,figure,li");
 const outer=clicked.closest("[data-vmv-edit-block]");
 if(article&&outer){
  const rows=Array.from(outer.querySelectorAll("article,figure,li")).filter(el=>el.closest("[data-vmv-edit-block]")===outer);
  const index=rows.indexOf(article);
  if(index>=0&&index<items.length){
   const entry=items[index]||{};
   const match=TEXT_KEYS.find(key=>typeof entry[key]==="string"&&
    (String(entry[key]).replace(/\s+/g," ").trim()===text||text.includes(String(entry[key]).trim())&&String(entry[key]).trim().length>4));
   return {key:match||"title",index};
  }
 }
 const fallback=clicked.closest("a,button")?
  kind==="ComposeButton"?"label":"buttonText":
  clicked.matches("p")?"description":"title";
 const matched=TEXT_KEYS.find(key=>{
  const value=p[key];
  return typeof value==="string"&&value.trim().length>0&&
   (value.replace(/\s+/g," ").trim()===text||
    (text.length>0&&value.replace(/\s+/g," ").includes(text)));
 });
 return {key:matched||fallback};
}

export default function MobileVisualStudio({
 data,onChange,siteName,siteSlug,siteCategory,siteId,pages,pageId,
 onBack,onChoosePage,onCreatePage,onPublish,onSave,
 busy=false,title,description,onTitleChange,onDescriptionChange,
 inquiriesEnabled,onToggleInquiries,onDomains,onHistory,
 domains,domainRequests,domainInput,domainQuote,quote,onDomainInput,onCheckDomain,onSubmitDomainRequest,onVerifyDomain,
 revisions,onRestoreRevision,error,notice,savePhase,recoveryAvailable,onRecover,onDiscardRecovery
}:{
 data:Data;onChange:(next:Data)=>void;siteName:string;siteSlug:string;siteCategory:string;siteId:string;
 pages:PageChoice[];pageId:string;onBack:()=>void;onChoosePage:(id:string)=>void;onCreatePage:(name:string)=>void;
 onPublish:()=>void;onSave:()=>void;busy?:boolean;title:string;description:string;
 onTitleChange:(v:string)=>void;onDescriptionChange:(v:string)=>void;
 inquiriesEnabled:boolean;onToggleInquiries:(enabled:boolean)=>void;onDomains:()=>void;onHistory:()=>void;
 domains:Array<{id:string;hostname:string;state:string}>;
 domainRequests:Array<{id:string;hostname:string;intent:string;status:string}>;
 domainInput:string;domainQuote:{domain:string;available:boolean;priceDisplay:string}|null;quote:string;
 onDomainInput:(value:string)=>void;onCheckDomain:()=>void;
 onSubmitDomainRequest:(intent:"buy"|"connect")=>void;
 onVerifyDomain:(hostname:string,action:"connect"|"verify")=>void;
 revisions:Array<{id:string;page_id:string;version:number;title:string;description:string;created_at:string;document:unknown}>;
 onRestoreRevision:(r:{id:string;page_id:string;version:number;title:string;description:string;created_at:string;document:unknown})=>void;
 error:string;notice:string;savePhase:string;recoveryAvailable:boolean;onRecover:()=>void;onDiscardRecovery:()=>void;
}){
 const [drawer,setDrawer]=useState(false);
 const [section,setSection]=useState<Section>("home");
 const [device,setDevice]=useState<"mobile"|"desktop">("mobile");
 const [preview,setPreview]=useState(false);
 const [orientation,setOrientation]=useState<"portrait"|"landscape">("portrait");
 const [selection,setSelection]=useState<Pick|null>(null);
 const [adjust,setAdjust]=useState<"actions"|"image"|"move"|"text">("actions");
 const [newName,setNewName]=useState("");
 const [noticeVisible,setNoticeVisible]=useState(false);
 const [errorDismissed,setErrorDismissed]=useState("");
 useEffect(()=>{
  if(!notice){setNoticeVisible(false);return;}
  setNoticeVisible(true);
  const timer=window.setTimeout(()=>setNoticeVisible(false),4800);
  return()=>window.clearTimeout(timer);
 },[notice]);
 const press=useRef<{id:number;timer:number;x:number;y:number;active:boolean}|null>(null);
 const suppressed=useRef(0);
 const pageSurface=useRef<HTMLDivElement>(null);
 const config=useMemo(()=>editableConfig(),[]);
 const clean=useMemo(()=>normalizeBuilderDocument(data),[data]);
 const root=clean.root.props as Record<string,unknown>;
 const block=selection?findBlock(clean,selection.id):null;
 const props=block?.props as Record<string,unknown>|undefined;
 const image=selection?.kind==="image"&&block?
  selection.target||imageTargets(block.type,props||{})[0]:undefined;
 const textFields=props?fieldsFor(props):[];
 const imageList=useMemo(()=>listImages(clean),[clean]);
 const page=pages.find(p=>p.id===pageId);
 const rootPatch=(patch:Record<string,unknown>)=>onChange({...data,root:{...data.root,props:{...data.root?.props,...patch}}});
 const edit=(patch:Record<string,unknown>)=>{if(selection)onChange(patchBlock(data,selection.id,patch));};
 const editText=(key:string,value:string,index?:number)=>{
  if(!props)return;
  if(index!==undefined&&Array.isArray(props.items)){
   const items=props.items.map((entry:Record<string,unknown>,i:number)=>i===index?{...entry,[key]:value}:entry);
   edit({items});
  }else edit({[key]:value});
 };
 const editImage=(target:ImageTarget,patch:Record<string,unknown>)=>{
  if(selection)onChange(patchBuilderImage(data,selection.id,target,patch));
 };
 const closePopup=()=>{setSelection(null);setAdjust("actions");};
 const closeDrawer=()=>{setDrawer(false);setSection("home");};
 function selectAt(target:Element,x:number,y:number){
  const wrapper=target.closest<HTMLElement>("[data-vmv-edit-block]");
  const id=wrapper?.dataset.vmvEditBlock;
  if(!id)return;
  const node=findBlock(clean,id);
  if(!node)return;
  const p=node.props as Record<string,unknown>;
  let kind:Pick["kind"]="section";let key:string|undefined;let index:number|undefined;let img:ImageTarget|undefined;
  const images=imageTargets(node.type,p);
  const picture=target.closest("img,.vmv-managed-image,.vmv-hero-cover,.vmv-hero-image,.vmv-visual-media,[data-vmv-empty]");
  if(picture&&images.length){
   const ordered=wrapper?Array.from(wrapper.querySelectorAll(".vmv-managed-image")):[];
   const indexFound=ordered.findIndex(el=>el===picture||el.contains(picture));
   img=images[Math.max(0,Math.min(indexFound,images.length-1))]||images[0];
   kind="image";
  }else{
   const content=target.closest("a,button,h1,h2,h3,h4,h5,p,small,figcaption,blockquote,strong");
   if(content){
    kind=content.matches("a,button")?"button":"text";
    const t=getTextTarget(p,content,node.type);key=t.key;index=t.index;
   }
  }
  if(navigator.vibrate)navigator.vibrate(12);
  setSelection({id,kind,target:img,key,index,x:Math.max(16,Math.min(window.innerWidth-16,x)),
   y:Math.max(12,Math.min(window.innerHeight-18,y))});
  setAdjust("actions");
 }
 function pointerDown(event:ReactPointerEvent<HTMLDivElement>){
  if(preview||drawer||event.pointerType!=="touch")return;
  const t=event.target instanceof Element?event.target:null;
  if(!t?.closest("[data-vmv-edit-block]"))return;
  if(press.current)window.clearTimeout(press.current.timer);
  const p={id:event.pointerId,x:event.clientX,y:event.clientY,timer:0,active:true};
  press.current=p;
  p.timer=window.setTimeout(()=>{
   if(!p.active||press.current!==p)return;
   suppressed.current=Date.now()+900;
   selectAt(t,p.x,p.y);
  },530);
 }
 function pointerMove(event:ReactPointerEvent<HTMLDivElement>){
  const p=press.current;
  if(!p||p.id!==event.pointerId)return;
  if(Math.hypot(event.clientX-p.x,event.clientY-p.y)>11){
   p.active=false;window.clearTimeout(p.timer);press.current=null;
  }
 }
 function pointerUp(event:ReactPointerEvent<HTMLDivElement>){
  const p=press.current;
  if(!p||p.id!==event.pointerId)return;
  window.clearTimeout(p.timer);p.active=false;press.current=null;
 }
 useEffect(()=>{
  const detect=()=>setOrientation(window.matchMedia("(orientation: landscape)").matches?"landscape":"portrait");
  detect();window.addEventListener("resize",detect);return()=>window.removeEventListener("resize",detect);
 },[]);
 useEffect(()=>{closePopup();closeDrawer();},[pageId]);
 useEffect(()=>()=>{if(press.current)clearTimeout(press.current.timer);},[]);
 useEffect(()=>{
  if(!selection&&!drawer)return;
  const key=(event:KeyboardEvent)=>{if(event.key==="Escape"){closePopup();closeDrawer();}};
  window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key);
 },[selection,drawer]);
 const withSiteStyle=websiteVisualStyle(root.palette,root.accentColor,root.secondaryColor,root.tertiaryColor);
 const mainCanvas=<WebsiteChrome siteName={siteName} baseUrl={"/web/"+siteSlug}
  menu={pages.map(p=>({title:p.title,page_slug:p.slug}))}
  logo={String(root.logo||"")} family={String(root.family||familyForCategory(siteCategory))}
  language={root.language==="en"?"en":"es"} siteStyle={String(root.style||"light")}
  siteWidth={String(root.width||"regular")} font={String(root.font||"modern")}
  socialLinks={root.socialLinks} visualStyle={withSiteStyle}>
  <Render config={preview?builderConfig:config} data={clean}/>
  {inquiriesEnabled&&page?.slug==="home"&&root.chatMode==="inbox"?
   <WebChatLauncher preview slug={siteSlug} business={siteName} categoryId={siteCategory}
    services={clean.content.flatMap(c=>c.type==="OfferingGrid"&&Array.isArray(c.props.items)?
     (c.props.items as Array<{title?:unknown}>).map(x=>String(x.title||"")).filter(Boolean):[])}/>:null}
  {inquiriesEnabled&&page?.slug==="home"?<section className="vmv-site-inquiry" id="solicitud">
   <small>CONTACTA CON NOSOTROS</small><h2>¿Qué necesitas?</h2>
   <RequestForm preview source="builder" slug={siteSlug} business={siteName}
    categoryId={siteCategory} services={[]}/>
  </section>:null}
 </WebsiteChrome>;
 const menuAction=(next:Section)=>{setSection(next);closePopup();if(next==="domain")onDomains();if(next==="history")onHistory();};
 const sectionLabel=(part:Section)=>({home:"Editor",pages:"Páginas",create:"Añadir elemento",
  appearance:"Colores y diseño",seo:"SEO e imágenes",connections:"Chat y agente",
  domain:"Dominio",history:"Versiones"})[part];
 return <div className={styles.stage} data-device={device} data-preview={preview}>
  <button className={styles.menuButton} type="button" aria-label="Abrir menú del editor"
   aria-expanded={drawer} onClick={()=>{setDrawer(true);closePopup();setSection("home");}}>
   <Menu size={23}/></button>
  <div className={device==="desktop"?styles.desktopFrame:styles.mobileFrame}>
   {device==="desktop"&&orientation==="portrait"?<div className={styles.rotateHint} role="status">
    <RotateCw size={32}/> Gira tu teléfono para editar en horizontal
    <small>Vista de escritorio · 16:9</small>
   </div>:null}
   <div className={styles.viewport} ref={pageSurface}
    onPointerDownCapture={pointerDown} onPointerMoveCapture={pointerMove}
    onPointerUpCapture={pointerUp} onPointerCancelCapture={pointerUp}
    onClickCapture={e=>{
     if(preview)return;
     const target=e.target instanceof Element?e.target:null;
     if(!target)return;
     // The real-looking canvas must not navigate or submit anything while editing.
     if(target.closest("a,button,input[type=submit],select,textarea,[role=button]")||
        Date.now()<suppressed.current){
      e.preventDefault();e.stopPropagation();
     }
    }}
    onContextMenu={e=>{if(!preview)e.preventDefault();}}>
    {mainCanvas}
   </div>
  </div>
  {error&&errorDismissed!==error?<div className={styles.statusAlert} role="alert">
   <span>{error}</span><button aria-label="Cerrar aviso" onClick={()=>setErrorDismissed(error)}><X size={15}/></button>
  </div>:noticeVisible?<div className={styles.statusToast} role="status">{notice}</div>:null}
    {selection&&!drawer&&!preview&&block&&props?<div className={styles.floating}
   role="dialog" aria-label="Editar elemento seleccionado"
   style={{"--float-x":selection.x+"px","--float-y":selection.y+"px"} as CSSProperties}>
   <div className={styles.floatHead}>
    <span>{selection.kind==="image"?"Imagen":selection.kind==="button"?"Botón":selection.kind==="text"?"Texto":"Sección"}</span>
    <button aria-label="Cerrar edición" onClick={closePopup}><X size={17}/></button>
   </div>
   {selection.kind==="image"&&image?<div className={styles.floatContent}>
    <div className={styles.chips}>
     <button onClick={()=>setAdjust("actions")} aria-pressed={adjust==="actions"}><ImagePlus size={15}/> Reemplazar</button>
     <button onClick={()=>setAdjust("image")} aria-pressed={adjust==="image"}><SlidersHorizontal size={15}/> Ajustar</button>
     <button onClick={()=>setAdjust("move")} aria-pressed={adjust==="move"}><Layers size={15}/> Mover</button>
    </div>
    {adjust==="actions"?<BuilderImageField value={targetImage(props,image)}
     onChange={url=>editImage(image,{[image.field]:url})}/>:null}
    {adjust==="image"?<div className={styles.controls}>
     <RangeField label="Transparencia" min={0} max={100} value={targetSettings(props,image).imageOpacity??0}
      onChange={v=>editImage(image,{imageOpacity:v})}/>
     <RangeField label="Esquinas" min={0} max={80} unit="px" value={targetSettings(props,image).imageRadius??16}
      onChange={v=>editImage(image,{imageRadius:v})}/>
     <RangeField label="Grosor del borde" min={0} max={12} unit="px" value={targetSettings(props,image).imageBorder??0}
      onChange={v=>editImage(image,{imageBorder:v})}/>
     <ColorField label="Color del borde" value={targetSettings(props,image).borderColor}
      onChange={v=>editImage(image,{borderColor:v})}/>
    </div>:null}
    {adjust==="move"?<div className={styles.controls}>
     <RangeField label="Mover horizontalmente" min={-250} max={250} unit="px" value={targetSettings(props,image).imageMoveX??0}
      onChange={v=>editImage(image,{imageMoveX:v})}/>
     <RangeField label="Mover verticalmente" min={-250} max={250} unit="px" value={targetSettings(props,image).imageMoveY??0}
      onChange={v=>editImage(image,{imageMoveY:v})}/>
     <RangeField label="Tamaño" min={25} max={100} value={targetSettings(props,image).imageWidth??100}
      onChange={v=>editImage(image,{imageWidth:v})}/>
    </div>:null}
   </div>:null}
   {selection.kind!=="image"?<div className={styles.floatContent}>
    {selection.kind!=="section"?<div className={styles.controls}>
     <label className={styles.formLabel}>Editar {LABELS[selection.key||""]||"texto"}
      <textarea rows={2} value={selection.index!==undefined&&Array.isArray(props.items)?
       String((props.items[selection.index] as Record<string,unknown>)?.[selection.key||"title"]||""):
       String(props[selection.key||"title"]||"")}
       onChange={e=>editText(selection.key||"title",e.target.value,selection.index)}/>
     </label>
     {selection.index===undefined&&textFields.length>1?<label className={styles.formLabel}>Campo
      <select value={selection.key||"title"} onChange={e=>setSelection(v=>v?{...v,key:e.target.value}:null)}>
       {textFields.map(key=><option key={key} value={key}>{LABELS[key]||key}</option>)}
      </select></label>:null}
     {selection.index===undefined&&["ComposeHeading","ComposeText","HeroVisual"].includes(block.type)?<>
      <RangeField label="Tamaño de texto" min={12} max={100} unit="px" value={props.fontSize??props.titleFontSize??32}
       onChange={v=>edit(block.type==="HeroVisual"?{titleFontSize:v}:{fontSize:v})}/>
      <ColorField label="Color del texto" value={props.textColor??props.titleColor}
       onChange={v=>edit(block.type==="HeroVisual"?{titleColor:v}:{textColor:v})}/>
     </>:null}
    </div>:<div className={styles.controls}>
     {textFields.slice(0,8).map(key=><label key={key} className={styles.formLabel}>{LABELS[key]||key}
      <textarea rows={2} value={String(props[key]||"")} onChange={e=>editText(key,e.target.value)}/>
     </label>)}
     {Array.isArray(props.items)?<details><summary>Productos y elementos</summary>
      {(props.items as Record<string,unknown>[]).map((entry,index)=><div key={index} className={styles.itemRow}>
       <strong>Elemento {index+1}</strong>
       {["title","description","price","caption"].filter(k=>typeof entry[k]==="string").map(key=>
        <label key={key} className={styles.formLabel}>{LABELS[key]||key}
         <input value={String(entry[key]||"")} onChange={e=>editText(key,e.target.value,index)}/>
        </label>)}
      </div>)}
     </details>:null}
     {textFields.length===0&&!Array.isArray(props.items)?<p>Selecciona un texto o una imagen de esta sección para modificarla.</p>:null}
    </div>}
    <div className={styles.chips}>
     <button onClick={()=>onChange(moveBlock(data,selection.id,-1))}><ArrowUp size={15}/> Subir</button>
     <button onClick={()=>onChange(moveBlock(data,selection.id,1))}><ArrowDown size={15}/> Bajar</button>
    </div>
   </div>:null}
  </div>:null}
  {drawer?<div className={styles.scrim} onPointerDown={e=>{if(e.target===e.currentTarget)closeDrawer();}}>
   <nav className={styles.drawer} aria-label="Herramientas de edición móvil">
    <header className={styles.drawerHead}>
     <div><small>VMV WEB STUDIO</small><strong>{siteName}</strong></div>
     <button type="button" aria-label="Cerrar menú" onClick={closeDrawer}><X size={20}/></button>
    </header>
    {section==="home"?<div className={styles.drawerBody}>
     {recoveryAvailable?<div className={styles.recovery}>
      <strong>Encontramos cambios sin guardar</strong>
      <p>Recupéralos antes de continuar para evitar perder el borrador.</p>
      <button onClick={()=>{onRecover();closeDrawer();}}>Recuperar cambios</button>
      <button onClick={onDiscardRecovery}>Descartar copia local</button>
     </div>:null}
     <small className={styles.saveStatus}>{savePhase==="saving"?"Guardando cambios…":savePhase==="error"?"Error al guardar":"Guardado automático activado"}</small>
     <small className={styles.groupLabel}>CONTENIDO</small>
     <button onClick={()=>menuAction("create")}><Plus/> Agregar elemento o sección <ChevronRight/></button>
     <button onClick={()=>menuAction("pages")}><Layers/> Seleccionar página <ChevronRight/></button>
     <button onClick={()=>menuAction("pages")}><FilePlus2/> Agregar página <ChevronRight/></button>
     <small className={styles.groupLabel}>DISEÑO</small>
     <button onClick={()=>menuAction("appearance")}><Palette/> Paleta, fuentes y estilos <ChevronRight/></button>
     <button onClick={()=>{setDevice(device==="mobile"?"desktop":"mobile");closeDrawer();}}>
      {device==="mobile"?<Monitor/>:<Smartphone/>} {device==="mobile"?"Modo escritorio (16:9)":"Modo móvil"} <ChevronRight/>
     </button>
     <button onClick={()=>{setPreview(!preview);closeDrawer();}}>{preview?<EyeOff/>:<Eye/>} {preview?"Volver a editar":"Vista previa"} <ChevronRight/></button>
     <small className={styles.groupLabel}>NEGOCIO Y CONFIGURACIÓN</small>
     <button onClick={()=>menuAction("connections")}><MessageCircle/> Chat y agente IA <ChevronRight/></button>
     <button onClick={()=>menuAction("seo")}><Settings2/> SEO e imágenes <ChevronRight/></button>
     <button onClick={()=>menuAction("domain")}><Globe/> Dominios <ChevronRight/></button>
     <small className={styles.groupLabel}>PUBLICACIÓN</small>
     <button onClick={()=>{onSave();closeDrawer();}} disabled={busy}><Save/> Guardar borrador <ChevronRight/></button>
     <button className={styles.publish} onClick={()=>{onPublish();closeDrawer();}} disabled={busy}><Upload/> Publicar web <ChevronRight/></button>
     <button onClick={()=>menuAction("history")}><Layers/> Historial de versiones <ChevronRight/></button>
     <button onClick={()=>{closeDrawer();onBack();}}><ArrowLeft/> Mis sitios</button>
    </div>:<div className={styles.drawerBody}>
     <button className={styles.drawerBack} onClick={()=>setSection("home")}><ArrowLeft/> {sectionLabel(section)}</button>
     {section==="pages"?<>
      {pages.map(p=><button key={p.id} onClick={()=>{onChoosePage(p.id);closeDrawer();}}>
       <Layers/> {p.slug==="home"?"Inicio":p.title}{pageId===p.id?<Check/>:<ChevronRight/>}</button>)}
      <form className={styles.createForm} onSubmit={e=>{e.preventDefault();if(newName.trim().length<2)return;onCreatePage(newName.trim());setNewName("");closeDrawer();}}>
       <label className={styles.formLabel}>Crear otra página
        <input value={newName} maxLength={100} placeholder="Ej. Servicios"
         onChange={e=>setNewName(e.target.value)}/></label>
       <button type="submit" disabled={busy||newName.trim().length<2}><Plus/> Crear página</button>
      </form>
     </>:null}
     {section==="create"?<>
      <p className={styles.help}>El nuevo elemento se añadirá al final de la página.</p>
      {ADDS.map(o=><button key={o.type} onClick={()=>{
       const spec=builderConfig.components?.[o.type] as {defaultProps?:Record<string,unknown>}|undefined;
       const defaults=JSON.parse(JSON.stringify(spec?.defaultProps||{})) as Record<string,unknown>;
       const node={type:o.type,props:{...defaults,id:crypto.randomUUID()}};
       onChange({...data,content:[...data.content,node]});
       closeDrawer();
      }}><Plus/> {o.label}<ChevronRight/></button>)}
     </>:null}
     {section==="appearance"?<>
      <label className={styles.formLabel}>Paleta
       <select value={String(root.palette||"violet")} onChange={e=>rootPatch({palette:e.target.value})}>
        {["violet","mint","amber","ink","rose","forest","ocean","terracotta","charcoal"].map(p=>
         <option key={p} value={p}>{({violet:"Violeta",mint:"Menta",amber:"Ámbar",ink:"Tinta",rose:"Rosa",
          forest:"Bosque",ocean:"Océano",terracotta:"Terracota",charcoal:"Carbón"} as Record<string,string>)[p]}</option>)}
       </select>
      </label>
      <ColorField label="Color principal" value={root.accentColor} onChange={v=>rootPatch({accentColor:v})}/>
      <ColorField label="Color secundario" value={root.secondaryColor} onChange={v=>rootPatch({secondaryColor:v})}/>
      <ColorField label="Color de apoyo" value={root.tertiaryColor} onChange={v=>rootPatch({tertiaryColor:v})}/>
      <label className={styles.formLabel}>Tipografía
       <select value={String(root.font||"modern")} onChange={e=>rootPatch({font:e.target.value})}>
        <option value="modern">Moderna</option><option value="editorial">Editorial</option>
        <option value="rounded">Redondeada</option><option value="geometric">Geométrica</option>
       </select></label>
      <label className={styles.formLabel}>Estilo general
       <select value={String(root.style||"light")} onChange={e=>rootPatch({style:e.target.value})}>
        <option value="light">Claro</option><option value="dark">Oscuro</option><option value="warm">Cálido</option>
        <option value="editorial">Editorial</option><option value="bold">Atrevido</option>
       </select></label>
      <button onClick={()=>setSection("home")}>Aplicar diseño <Check/></button>
     </>:null}
     {section==="seo"?<>
      <label className={styles.formLabel}>Título de la página para Google
       <input value={title} maxLength={100} onChange={e=>onTitleChange(e.target.value)}/></label>
      <label className={styles.formLabel}>Descripción para Google
       <textarea value={description} maxLength={300} rows={4} onChange={e=>onDescriptionChange(e.target.value)}/></label>
      <h3>Textos alternativos de imágenes</h3>
      <p className={styles.help}>Describe cada imagen para mejorar la accesibilidad y el SEO.</p>
      {imageList.map((item,n)=><label key={item.id+"-"+n} className={styles.formLabel}>
       {item.name} · Imagen {n+1}
       <input maxLength={140} value={item.alt} onChange={e=>{
        const p= item.target.index!==undefined?{alt:e.target.value}:
         item.target.field==="beforeImage"?{beforeAlt:e.target.value}:
         item.target.field==="afterImage"?{afterAlt:e.target.value}:
         item.type==="HeroVisual"?{imageAlt:e.target.value}:{alt:e.target.value};
        onChange(item.target.index!==undefined?
         patchBuilderImage(data,item.id,item.target,p):patchBlock(data,item.id,p));
       }}/></label>)}
     </>:null}
     {section==="connections"?<>
      <h3>Chat en la página</h3>
      <label className={styles.toggle}><span>Mostrar botón para recibir mensajes</span>
       <input type="checkbox" checked={root.chatMode==="inbox"&&inquiriesEnabled}
        onChange={e=>{
         rootPatch({chatMode:e.target.checked?"inbox":"off"});
         if(e.target.checked&&!inquiriesEnabled)onToggleInquiries(true);
        }}/></label>
      <p className={styles.help}>Los mensajes de los visitantes llegan a VMV. No se publican cambios hasta que apruebes la web.</p>
      <h3>Agente IA</h3>
      <p className={styles.help}>Puedes preparar tu agente en VMV. Las respuestas automáticas del chat público requieren conectar ese canal primero.</p>
      <a className={styles.drawerLink} href="/vista-app/ai-agents" target="_blank" rel="noopener noreferrer"><Sparkles size={18}/> Configurar agente IA <ChevronRight size={17}/></a>
     </>:null}
     {section==="domain"?<>
      <h3>Dominio de tu web</h3>
      <p className={styles.help}>Consulta disponibilidad antes de solicitar un dominio. No se compra nada automáticamente.</p>
      <label className={styles.formLabel}>Dominio
       <input type="text" placeholder="minegocio.com" autoCapitalize="none"
        value={domainInput} maxLength={253} spellCheck={false}
        onChange={e=>onDomainInput(e.target.value.toLowerCase())}/>
      </label>
      <button disabled={busy||domainInput.trim().length<4} onClick={onCheckDomain}><Globe/> Consultar disponibilidad <ChevronRight/></button>
      {quote?<p className={styles.help} role="status">{quote}</p>:null}
      {domainQuote?.available?<div className={styles.domainActions}>
       <button disabled={busy} onClick={()=>onSubmitDomainRequest("buy")}>Solicitar compra sin pagar ahora</button>
       <button disabled={busy} onClick={()=>onSubmitDomainRequest("connect")}>Ya tengo este dominio</button>
      </div>:null}
      {domainRequests.length>0?<><h3>Solicitudes</h3>{domainRequests.map(entry=>
       <div className={styles.domainRow} key={entry.id}>
        <strong>{entry.hostname}</strong><small>{entry.status} · {entry.intent==="buy"?"Compra":"Conexión"}</small>
        {entry.intent==="connect"?<button disabled={busy} onClick={()=>onVerifyDomain(entry.hostname,"connect")}>Conectar DNS</button>:null}
       </div>)}</>:null}
      {domains.length>0?<><h3>Dominios conectados</h3>{domains.map(entry=>
       <div className={styles.domainRow} key={entry.id}>
        <strong>{entry.hostname}</strong><small>{entry.state}</small>
        {entry.state==="verifying"?<button disabled={busy} onClick={()=>onVerifyDomain(entry.hostname,"verify")}>Verificar DNS</button>:null}
       </div>)}</>:null}
     </>:null}
     {section==="history"?<>
      <p className={styles.help}>Puedes restaurar una versión anterior como borrador. La web pública no cambiará hasta que publiques.</p>
      {revisions.length?revisions.map(entry=><div className={styles.domainRow} key={entry.id}>
       <strong>Versión {entry.version} · {entry.title}</strong>
       <small>{new Date(entry.created_at).toLocaleDateString("es-US")}</small>
       <button onClick={()=>{onRestoreRevision(entry);closeDrawer();}} disabled={busy}>Restaurar</button>
      </div>):<p className={styles.help}>No hay versiones anteriores.</p>}
     </>:null}
    </div>}
   </nav>
  </div>:null}
 </div>;
}
