"use client";

import {useCallback,useEffect,useMemo,useRef,useState,type CSSProperties,type PointerEvent as ReactPointerEvent} from "react";
import {Render,type Config,type Data} from "@puckeditor/core";
import {
 ArrowDown,ArrowLeft,ArrowUp,Check,ChevronDown,ChevronRight,Eye,EyeOff,
 FilePlus2,Globe,ImagePlus,Layers,Menu,MessageCircle,Monitor,Palette,
 Plus,Redo2,Save,Settings2,SlidersHorizontal,Smartphone,
 Sparkles,Copy,GripVertical,Trash2,Type,Undo2,Upload, X
} from "lucide-react";
import {builderConfig,normalizeBuilderDocument} from "@/lib/web-builder-puck";
import {VISUAL_BLOCK_NAMES} from "@/lib/web-builder-visual-blocks";
import {imageTargets,imageTargetIndex,patchBuilderImage,targetImage,targetSettings,type ImageTarget} from "@/lib/web-builder-images";
import {WEBSITE_STYLES,restyleWebsiteDocument,type WebsiteStyleId} from "@/lib/web-builder-safe-styles";
import BuilderImageField from "./BuilderImageField";
import {ColorField,FontField,RangeField} from "./BuilderContextFields";
import {WebsiteChrome,websiteVisualStyle} from "@/lib/web-site-chrome";
import {familyForCategory} from "@/lib/web-builder-templates";
import WebChatLauncher from "./WebChatLauncher";
import WebSiteAgentSelector from "./WebSiteAgentSelector";
import RequestForm from "@/app/sites/[slug]/RequestForm";
import styles from "./MobileVisualStudio.module.css";

type PageChoice={id:string;slug:string;title:string};
type Item=Data["content"][number];
type Pick={id:string;kind:"image"|"text"|"button"|"section";target?:ImageTarget;
 key?:string;index?:number;x:number;y:number};
type Section="home"|"pages"|"create"|"appearance"|"seo"|"connections"|"domain"|"history";
type VisualTool="menu"|"content"|"size"|"color"|"background"|"font"|"weight"|"italic"|
 "spacing"|"opacity"|"align"|"image"|"shade"|"frame"|"shape"|"link"|"actions"|
 "position"|"border"|"layout"|"arrange"|"add"|"duplicate"|"delete"|"items"|"gallery"|"surface"|"buttonStyle";

const TEXT_KEYS=["title","description","body","text","eyebrow","subtitle","buttonText","label",
 "caption","quote","author","price","question","answer","q1","a1","q2","a2","hours","area","notes","first","second","third","phone","email","address"];
const LABELS:Record<string,string>={title:"Título",description:"Descripción",body:"Texto",text:"Texto",
 eyebrow:"Encabezado",subtitle:"Subtítulo",buttonText:"Texto del botón",label:"Texto del botón",
 caption:"Pie de foto",quote:"Cita",author:"Autor",price:"Precio",question:"Pregunta",answer:"Respuesta",q1:"Primera pregunta",a1:"Primera respuesta",q2:"Segunda pregunta",a2:"Segunda respuesta",hours:"Horario",area:"Zona",
 notes:"Notas",first:"Primer elemento",second:"Segundo elemento",third:"Tercer elemento",
 phone:"Teléfono",email:"Correo",address:"Dirección"};
const ADDS=[
 {type:"ComposeHeading",label:"Título"},{type:"ComposeText",label:"Descripción"},
 {type:"ComposeImage",label:"Imagen"},{type:"ComposeButton",label:"Botón"},
 {type:"HeroVisual",label:"Portada"},{type:"OfferingGrid",label:"Productos / servicios"},
 {type:"PhotoGallery",label:"Galería"},{type:"Contact",label:"Contacto"},
 {type:"CTA",label:"Llamada a la acción"},{type:"SectionLayout",label:"Contenedor"},
 {type:"ColumnsLayout",label:"Columnas"},{type:"FAQList",label:"Preguntas frecuentes (FAQ)"},
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
/** Insert immediately after the selected block, including within column/container slots. */
function insertBlockAfter(data:Data,id:string,newBlock:Item):Data{
 let inserted=false;
 function visit(nodes:Data["content"]):Data["content"]{
  let changed=false;
  const next:Data["content"]=[];
  for(const node of nodes){
   if(inserted){next.push(node);continue;}
   const props=node.props as Record<string,unknown>;
   if(props.id===id){
    next.push(node,newBlock);inserted=true;changed=true;continue;
   }
   let updated=props;
   for(const slot of ["content","left","right","third"]){
    if(inserted)break;
    if(Array.isArray(props[slot])){
     const child=visit(props[slot] as Data["content"]);
     if(child!==props[slot]){updated={...updated,[slot]:child};changed=true;}
    }
   }
   next.push(updated===props?node:{...node,props:updated});
  }
  return changed?next:nodes;
 }
 const content=visit(data.content);
 return inserted?{...data,content}:data;
}

/** Duplicates a section without reusing Puck/array-item identifiers. */
function duplicateBlock(data:Data,id:string):{data:Data;newId:string|null}{
 const original=findBlock(data,id);
 if(!original)return {data,newId:null};
 const regenerate=(value:unknown):unknown=>{
  if(Array.isArray(value))return value.map(regenerate);
  if(value&&typeof value==="object"){
   return Object.fromEntries(Object.entries(value as Record<string,unknown>).map(([key,part])=>
    [key,key==="id"&&typeof part==="string"?crypto.randomUUID():regenerate(part)]));
  }
  return value;
 };
 const duplicate=regenerate(original) as Item;
 const next=insertBlockAfter(data,id,duplicate);
 return {data:next,newId:next===data?null:String(duplicate.props.id)};
}
/** Only reorder peers in the same page or layout slot; never orphan nested content. */
function siblingBlocks(data:Data,sourceId:string,targetId:string):boolean{
 function walk(nodes:Data["content"]):boolean{
  if(nodes.some(node=>node.props?.id===sourceId)&&nodes.some(node=>node.props?.id===targetId))return true;
  return nodes.some(node=>{
   const props=node.props as Record<string,unknown>;
   return ["content","left","right","third"].some(slot=>Array.isArray(props[slot])&&
    walk(props[slot] as Data["content"]));
  });
 }
 return walk(data.content);
}
function reorderBlock(data:Data,sourceId:string,targetId:string,before:boolean):Data{
 if(sourceId===targetId||!siblingBlocks(data,sourceId,targetId))return data;
 let changed=false;
 function visit(nodes:Data["content"]):Data["content"]{
  const from=nodes.findIndex(node=>node.props?.id===sourceId);
  const to=nodes.findIndex(node=>node.props?.id===targetId);
  if(from>=0&&to>=0){
   const next=[...nodes];
   const [source]=next.splice(from,1);
   const anchor=next.findIndex(node=>node.props?.id===targetId);
   next.splice(anchor+(before?0:1),0,source);
   changed=true;
   return next;
  }
  let touched=false;
  const next=nodes.map(node=>{
   const original=node.props as Record<string,unknown>;
   let props=original;
   for(const slot of ["content","left","right","third"]){
    if(changed)break;
    if(Array.isArray(props[slot])){
     const updated=visit(props[slot] as Data["content"]);
     if(updated!==props[slot]){props={...props,[slot]:updated};touched=true;}
    }
   }
   return props===original?node:{...node,props};
  });
  return touched?next:nodes;
 }
 const content=visit(data.content);
 return changed?{...data,content}:data;
}
function removeBlock(data:Data,id:string):Data{
 let removed=false;
 function visit(nodes:Data["content"]):Data["content"]{
  return nodes.flatMap(node=>{
   if(node.props?.id===id){removed=true;return [];}
   const props=node.props as Record<string,unknown>;
   let updated=props;
   for(const slot of ["content","left","right","third"])
    if(Array.isArray(updated[slot])){
     const children=visit(updated[slot] as Data["content"]);
     if(children!==updated[slot])updated={...updated,[slot]:children};
    }
   return [updated===props?node:{...node,props:updated}];
  });
 }
 const content=visit(data.content);
 return removed?{...data,content}:data;
}
function editableConfig():Config{
 const blocks=Object.fromEntries(Object.entries(builderConfig.components||{}).map(([kind,block])=>{
  const original=block as unknown as {render:(props:Record<string,unknown>)=>React.ReactNode};
  return [kind,{...block,render:(props:Record<string,unknown>)=>{
   const emptyImage=(["ComposeImage","Image"].includes(kind)&&!String(props.image||props.url||""));
   const emptySection=(["OfferingGrid","PhotoGallery","ProjectShowcase","TeamGrid","FAQList"].includes(kind)&&
    (!Array.isArray(props.items)||props.items.length===0||
     kind==="PhotoGallery"&&!(props.items as Array<Record<string,unknown>>).some(item=>item.image)||
     kind==="FAQList"&&!(props.items as Array<Record<string,unknown>>).some(item=>String(item.question||"").trim()&&String(item.answer||"").trim())));
   return <div data-vmv-edit-block={String(props.id||"")} data-vmv-block-type={kind} style={{display:"contents"}}>
    {emptyImage||emptySection?
     <div data-vmv-empty="true" style={{padding:"50px 20px",textAlign:"center",border:"1px dashed #bc9bda",
      borderRadius:12,background:"#faf6ff",color:"#7956a9",fontSize:14}}>
      {emptyImage?"Toca para agregar una imagen":
       kind==="FAQList"?"Toca para añadir preguntas frecuentes con sus respuestas":
       "Toca para editar esta sección"}
     </div>:original.render(props)}
   </div>;
  }}];
 }));
 return {...builderConfig,components:blocks} as Config;
}
function fieldsFor(props:Record<string,unknown>):string[]{
 return TEXT_KEYS.filter(key=>typeof props[key]==="string"&&key!=="address"||key==="address"&&typeof props[key]==="string");
}
function listImages(data:Data):Array<{id:string;type:string;target:ImageTarget;name:string;alt:string;src:string;key:string}>{
 const result:Array<{id:string;type:string;target:ImageTarget;name:string;alt:string;src:string;key:string}>=[];
 function walk(nodes:Data["content"]){
  for(const node of nodes){
   const p=node.props as Record<string,unknown>;const id=String(p.id||"");
   if(id){
    for(const target of imageTargets(node.type,p)){
     const alt=target.index!==undefined&&Array.isArray(p.items)?
      String((p.items[target.index] as Record<string,unknown>)?.alt||""):
      String(p[node.type==="HeroVisual"?"imageAlt":target.field==="beforeImage"?"beforeAlt":target.field==="afterImage"?"afterAlt":"alt"]||"");
     result.push({id,type:node.type,target,name:String(p.title||target.label||node.type),alt,src:targetImage(p,target),key:`${id}:${target.field}:${target.index??""}`});
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
 const article=clicked.closest("article,figure,li,details");
 const outer=clicked.closest("[data-vmv-edit-block]");
 if(article&&outer){
  const rows=Array.from(outer.querySelectorAll("article,figure,li,details")).filter(el=>el.closest("[data-vmv-edit-block]")===outer);
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
  clicked.matches("p")?"description":clicked.matches("summary")?"question":"title";
 const matched=TEXT_KEYS.find(key=>{
  const value=p[key];
  return typeof value==="string"&&value.trim().length>0&&
   (value.replace(/\s+/g," ").trim()===text||
    (text.length>0&&value.replace(/\s+/g," ").includes(text)));
 });
 return {key:matched||fallback};
}

type TextStyleKeys={color:string;size:string;font:string;weight?:string;italic?:string;spacing?:string};
function TextStyleEditor({values,keys,onPatch}:{values:Record<string,unknown>;
 keys:TextStyleKeys;onPatch:(patch:Record<string,unknown>)=>void}){
 return <div className={styles.typographyEditor}>
  <strong className={styles.typographyHeading}>Estilo del texto</strong>
  <ColorField label="Color del texto" value={values[keys.color]}
   allowTransparent onChange={v=>onPatch({[keys.color]:v})}/>
  <RangeField label="Tamaño del texto" min={12} max={110} unit="px"
   value={values[keys.size]||16} onChange={v=>onPatch({[keys.size]:v})}/>
  <span className={styles.typographyLabel}>Tipografía</span>
  <FontField value={values[keys.font]||"site"} onChange={v=>onPatch({[keys.font]:v})}/>
  {keys.weight?<label className={styles.formLabel}>Grosor
   <select value={String(values[keys.weight]||"normal")}
    onChange={e=>onPatch({[keys.weight!]:e.target.value})}>
    <option value="light">Ligero</option><option value="normal">Normal</option>
    <option value="heavy">Negrita</option>
   </select>
  </label>:null}
  {keys.italic?<label className={styles.formLabel}>Estilo
   <select value={String(values[keys.italic]||"no")}
    onChange={e=>onPatch({[keys.italic!]:e.target.value})}>
    <option value="no">Normal</option><option value="yes">Cursiva</option>
   </select>
  </label>:null}
  {keys.spacing?<RangeField label="Separación de letras" min={-3} max={12} unit="px"
   value={values[keys.spacing]||0} onChange={v=>onPatch({[keys.spacing!]:v})}/>:null}
 </div>;
}
function textStyleKeys(prefix:string):TextStyleKeys{
 return prefix===""?{color:"textColor",size:"fontSize",font:"font",
  weight:"weight",italic:"italic",spacing:"letterSpacing"}:
  {color:prefix+"Color",size:prefix+"FontSize",font:prefix+"Font",
   weight:prefix+"Weight",italic:prefix+"Italic",spacing:prefix+"LetterSpacing"};
}
export default function MobileVisualStudio({
 data,onChange:onDocumentChange,siteName,siteSlug,siteCategory,siteId,pages,pageId,
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
 const [selection,setSelection]=useState<Pick|null>(null);
 const [visualTool,setVisualTool]=useState<VisualTool>("menu");
 const [recentColors,setRecentColors]=useState<string[]>([]);
 const [insertAfterId,setInsertAfterId]=useState<string|null>(null);
 const [deleteTarget,setDeleteTarget]=useState<{id:string;label:string}|null>(null);
 const dragRef=useRef<{pointer:number;source:string;target:string|null;before:boolean}|null>(null);
 const highlightRef=useRef<HTMLElement|null>(null);
 const [dragHint,setDragHint]=useState("");
 const [adjust,setAdjust]=useState<"actions"|"image"|"move"|"text">("actions");
 const [seoImageKey,setSeoImageKey]=useState("");
 const [newName,setNewName]=useState("");
 const [noticeVisible,setNoticeVisible]=useState(false);
 const [errorDismissed,setErrorDismissed]=useState("");
 const historyRef=useRef<{past:Data[];future:Data[];group:string|null;time:number}>({
  past:[],future:[],group:null,time:0
 });
 const latestDocument=useRef(data);
 const lastDispatched=useRef<Data|null>(null);
 const [historyAvailable,setHistoryAvailable]=useState({undo:false,redo:false});
 // The mobile canvas is not Puck's editor, so give it a bounded, local draft history.
 const onChange=(next:Data,group?:string)=>{
  const current=latestDocument.current;
  if(JSON.stringify(current)===JSON.stringify(next))return;
  const h=historyRef.current;
  const now=Date.now();
  if(!group||h.group!==group||now-h.time>900)h.past=[...h.past.slice(-39),current];
  h.future=[];
  h.group=group||null;
  h.time=now;
  latestDocument.current=next;
  lastDispatched.current=next;
  setHistoryAvailable({undo:h.past.length>0,redo:false});
  onDocumentChange(next);
 };
 const navigateHistory=(direction:"undo"|"redo")=>{
  const h=historyRef.current;
  const source=direction==="undo"?h.past:h.future;
  const previous=source.pop();
  if(!previous)return;
  const destination=direction==="undo"?h.future:h.past;
  destination.push(latestDocument.current);
  if(destination.length>40)destination.shift();
  latestDocument.current=previous;
  lastDispatched.current=previous;
  h.group=null;h.time=0;
  setHistoryAvailable({undo:h.past.length>0,redo:h.future.length>0});
  onDocumentChange(previous);
  setSelection(null);
  setDeleteTarget(null);
  setInsertAfterId(null);
 };
 // The selected website/page has its own independent undo history.
 useEffect(()=>{
  historyRef.current={past:[],future:[],group:null,time:0};
  latestDocument.current=data;
  setHistoryAvailable({undo:false,redo:false});
 },[siteId,pageId]);
 // A restored/recovered draft must not inherit undo entries from an older revision.
 useEffect(()=>{
  if(data===lastDispatched.current)return;
  if(JSON.stringify(data)===JSON.stringify(latestDocument.current)){
   latestDocument.current=data;return;
  }
  historyRef.current={past:[],future:[],group:null,time:0};
  latestDocument.current=data;
  setHistoryAvailable({undo:false,redo:false});
  setSelection(null);
  setInsertAfterId(null);
 },[data]);
 useEffect(()=>{
  if(!notice){setNoticeVisible(false);return;}
  setNoticeVisible(true);
  const timer=window.setTimeout(()=>setNoticeVisible(false),4800);
  return()=>window.clearTimeout(timer);
 },[notice]);
 const press=useRef<{id:number;timer:number;x:number;y:number;active:boolean;target:Element;selected:boolean}|null>(null);
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
 const selectedTextKey=selection?.key||"title";
 const activeTypography=selection?.kind==="text"&&block&&props?(()=>{
  // The same complete text toolkit is available for every editable field,
  // whether it belongs to a legacy block, a visual section, or an item card.
  if(selection.index!==undefined&&Array.isArray(props.items)){
   const item=(props.items as Record<string,unknown>[])[selection.index];
   return item&&typeof item[selectedTextKey]==="string"?
    {values:item,keys:textStyleKeys(selectedTextKey),index:selection.index}:null;
  }
  if(selection.index!==undefined)return null;
  const prefix=["ComposeHeading","ComposeText"].includes(block.type)?"":selectedTextKey;
  return {values:props,keys:textStyleKeys(prefix),index:null};
 })():null;
 const imageList=useMemo(()=>listImages(clean),[clean]);
 const seoImage=imageList.find(item=>item.key===seoImageKey)||imageList[0];
 const page=pages.find(p=>p.id===pageId);
 const rootPatch=(patch:Record<string,unknown>)=>onChange({...data,root:{...data.root,props:{...data.root?.props,...patch}}});
 const edit=(patch:Record<string,unknown>,group?:string)=>{
  if(selection)onChange(patchBlock(data,selection.id,patch),group);
 };
 const editText=(key:string,value:string,index?:number)=>{
  if(!props)return;
  if(index!==undefined&&Array.isArray(props.items)){
   const items=props.items.map((entry:Record<string,unknown>,i:number)=>i===index?{...entry,[key]:value}:entry);
   edit({items},`text:${selection?.id}:${index}:${key}`);
  }else edit({[key]:value},`text:${selection?.id}:${key}`);
 };
 const editImage=(target:ImageTarget,patch:Record<string,unknown>)=>{
  if(selection)onChange(patchBuilderImage(data,selection.id,target,patch));
 };

 const clearDrag=()=>{
  highlightRef.current?.removeAttribute("data-vmv-drop-target");
  highlightRef.current=null;
  dragRef.current=null;
  setDragHint("");
 };
 const beginDrag=(event:ReactPointerEvent<HTMLButtonElement>)=>{
  if(!selection||preview||drawer)return;
  event.preventDefault();event.stopPropagation();
  clearDrag();
  dragRef.current={pointer:event.pointerId,source:selection.id,target:null,before:false};
  try{event.currentTarget.setPointerCapture(event.pointerId);}catch{/* Capture is optional. */}
  setDragHint("Arrastra hasta otra sección de la página");
 };
 const moveDrag=(event:ReactPointerEvent<HTMLButtonElement>)=>{
  const gesture=dragRef.current;
  if(!gesture||gesture.pointer!==event.pointerId)return;
  event.preventDefault();
  const hit=document.elementFromPoint(event.clientX,event.clientY);
  const wrapper=hit instanceof Element?hit.closest<HTMLElement>("[data-vmv-edit-block]"):null;
  const id=wrapper?.dataset.vmvEditBlock;
  highlightRef.current?.removeAttribute("data-vmv-drop-target");
  highlightRef.current=null;
  if(!id||id===gesture.source||!siblingBlocks(data,gesture.source,id)){
   gesture.target=null;
   setDragHint("Arrastra sobre otra sección");
   return;
  }
  const box=wrapper?.firstElementChild?.getBoundingClientRect()||wrapper?.getBoundingClientRect();
  gesture.before=Boolean(box&&event.clientY<box.top+box.height/2);
  gesture.target=id;
  const node=findBlock(data,id);
  const label=String((node?.props as Record<string,unknown>|undefined)?.title||node?.type||"sección").slice(0,38);
  setDragHint((gesture.before?"Antes de ":"Después de ")+label);
  const visual=(wrapper?.firstElementChild||wrapper) as HTMLElement|undefined;
  if(visual){visual.setAttribute("data-vmv-drop-target",gesture.before?"before":"after");highlightRef.current=visual;}
 };
 const endDrag=(event:ReactPointerEvent<HTMLButtonElement>)=>{
  const gesture=dragRef.current;
  if(!gesture||gesture.pointer!==event.pointerId)return;
  event.preventDefault();event.stopPropagation();
  const result=gesture.target?reorderBlock(data,gesture.source,gesture.target,gesture.before):data;
  clearDrag();
  if(result!==data){onChange(result);setSelection(null);}
 };
 const cancelDrag=()=>clearDrag();
 const closePopup=()=>{setSelection(null);setAdjust("actions");setVisualTool("menu");clearDrag();};
 const closeDrawer=()=>{setDrawer(false);setSection("home");setInsertAfterId(null);};
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
   const content=target.closest("a,button,h1,h2,h3,h4,h5,p,small,figcaption,blockquote,strong,span,em,li,summary");
   if(content){
    kind=content.closest(".vmv-site-button,button")?"button":"text";
    const t=getTextTarget(p,content,node.type);key=t.key;index=t.index;
   }
  }
  if(navigator.vibrate)navigator.vibrate(12);
  setSelection({id,kind,target:img,key,index,x:Math.max(16,Math.min(window.innerWidth-16,x)),
   y:Math.max(12,Math.min(window.innerHeight-18,y))});
  setAdjust("actions");setVisualTool("menu");
 }
 function pointerDown(event:ReactPointerEvent<HTMLDivElement>){
  if(preview||drawer||event.pointerType!=="touch")return;
  const t=event.target instanceof Element?event.target:null;
  if(!t?.closest("[data-vmv-edit-block]"))return;
  if(press.current)window.clearTimeout(press.current.timer);
  const p={id:event.pointerId,x:event.clientX,y:event.clientY,timer:0,active:true,target:t,selected:false};
  press.current=p;
  p.timer=window.setTimeout(()=>{
   if(!p.active||press.current!==p)return;
   p.selected=true;
   suppressed.current=Date.now()+900;
   selectAt(p.target,p.x,p.y);
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
  // iOS WebViews sometimes skip synthetic click events; use pointerup for a simple tap.
  if(event.type==="pointerup"&&!p.selected&&!preview&&!drawer){
   suppressed.current=Date.now()+450;
   selectAt(p.target,event.clientX,event.clientY);
  }
 }
 useEffect(()=>{closePopup();closeDrawer();setDeleteTarget(null);},[pageId]);
 useEffect(()=>()=>{if(press.current)clearTimeout(press.current.timer);},[]);
 useEffect(()=>{
  if(!selection&&!drawer)return;
  const key=(event:KeyboardEvent)=>{if(event.key==="Escape"){closePopup();closeDrawer();}};
  window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key);
 },[selection,drawer]);
 // When the controls dock, keep the selected object visible in the remaining canvas.
 useEffect(()=>{
  if(!selection||drawer||preview)return;
  const frame=pageSurface.current;
  if(!frame)return;
  const selected=Array.from(frame.querySelectorAll<HTMLElement>("[data-vmv-edit-block]"))
   .find(el=>el.dataset.vmvEditBlock===selection.id);
  const target=selection.kind==="image"&&selected?
   Array.from(selected.querySelectorAll<HTMLElement>(".vmv-managed-image"))[selection.target?.index??0]||selected:selected;
  target?.scrollIntoView({block:"center",inline:"nearest",behavior:"auto"});
 },[selection?.id,selection?.kind,selection?.target?.index,drawer,preview]);
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
 const menuAction=(next:Section)=>{setInsertAfterId(null);setSection(next);closePopup();if(next==="domain")onDomains();if(next==="history")onHistory();};
 const sectionLabel=(part:Section)=>({home:"Editor",pages:"Páginas",create:"Añadir elemento",
  appearance:"Colores y diseño",seo:"SEO e imágenes",connections:"Chat y agente",
  domain:"Dominio",history:"Versiones"})[part];
 const isText=selection?.kind==="text";
 const isButton=selection?.kind==="button";
 const isImage=selection?.kind==="image";
 const keys=activeTypography?.keys;
 const values=activeTypography?.values;
 const opacityKey=keys?keys.color==="textColor"?"textOpacity":selectedTextKey+"Opacity":"";
 const patchTypography=(patch:Record<string,unknown>)=>{
  if(!selection||!activeTypography||!props)return;
  if(activeTypography.index!==null&&Array.isArray(props.items)){
   const items=(props.items as Record<string,unknown>[]).map((entry,i)=>
    i===activeTypography.index?{...entry,...patch}:entry);
   edit({items},`visual:${selection.id}:${activeTypography.index}`);
  }else edit(patch,`visual:${selection.id}:${selectedTextKey}`);
 };
 const activeSize=isText?Number(keys&&values?.[keys.size])||(
  selectedTextKey==="title"?32:17):
  isButton?Number(props?.buttonFontSize)||13:18;
 const currentColor=isText?String(keys&&values?.[keys.color]||""):
  isButton?String(props?.[visualTool==="background"?"buttonColor":"buttonTextColor"]||""):"";
 const patchColor=(value:string)=>{
  if(isText&&keys)patchTypography({[keys.color]:value});
  else if(isButton)edit({[visualTool==="background"?"buttonColor":"buttonTextColor"]:value});
  if(/^#[a-f\\d]{6}$/i.test(value))setRecentColors(old=>[value,...old.filter(x=>x!==value)].slice(0,8));
 };

 const menuChoices:Array<{id:VisualTool;label:string;icon:React.ReactNode}> = isText?[
  {id:"content",label:"Editar texto",icon:<Type/>},{id:"size",label:"Tamaño",icon:<SlidersHorizontal/>},
  {id:"color",label:"Color",icon:<Palette/>},{id:"font",label:"Tipografía",icon:<Type/>},
  {id:"opacity",label:"Transparencia",icon:<Eye/>},{id:"weight",label:"Grosor",icon:<Type/>},
  {id:"italic",label:"Cursiva",icon:<Type/>},{id:"spacing",label:"Espaciado",icon:<SlidersHorizontal/>},
  {id:"arrange",label:"Organizar",icon:<Layers/>}
 ]:isButton?[
  {id:"content",label:"Editar botón",icon:<Type/>},{id:"size",label:"Tamaño",icon:<SlidersHorizontal/>},
  {id:"color",label:"Color del texto",icon:<Palette/>},{id:"background",label:"Fondo",icon:<Palette/>},
  {id:"shape",label:"Esquinas",icon:<Layers/>},{id:"buttonStyle",label:"Estilo",icon:<Settings2/>},
  {id:"link",label:"Enlace",icon:<Globe/>},
  ...(block?.type==="CTA"?[{id:"border" as const,label:"Borde",icon:<Layers/>}]:[]),
  {id:"arrange",label:"Organizar sección",icon:<Layers/>}
 ]:isImage?[
  {id:"image",label:"Reemplazar imagen",icon:<ImagePlus/>},
  ...(["PhotoGallery","ProjectShowcase"].includes(block?.type||"")?[{id:"gallery" as const,label:"Fotos y columnas",icon:<Layers/>}]:[]),
  {id:"position",label:block?.type==="OfferingGrid"?"Mover tarjeta":"Mover imagen",icon:<SlidersHorizontal/>},
  {id:"size",label:block?.type==="OfferingGrid"?"Tamaño de tarjeta":"Tamaño",icon:<Layers/>},
  {id:"frame",label:block?.type==="HeroVisual"?"Encuadre":"Esquinas",icon:<Layers/>},
  ...(block?.type==="HeroVisual"?[
    {id:"layout" as const,label:"Diseño de portada",icon:<Settings2/>},
    {id:"shade" as const,label:"Oscuridad",icon:<SlidersHorizontal/>}
   ]:[{id:"border" as const,label:"Borde",icon:<Palette/>}]),
  {id:"opacity",label:"Transparencia",icon:<Eye/>},
  {id:"arrange",label:"Organizar sección",icon:<Layers/>}
 ]:[
  {id:"content",label:"Editar contenido",icon:<Type/>},
  ...(["PhotoGallery","ProjectShowcase"].includes(block?.type||"")?[{id:"gallery" as const,label:"Galería: fotos y columnas",icon:<ImagePlus/>}]:[]),
  ...(Array.isArray(props?.items)&&!["PhotoGallery","ProjectShowcase"].includes(block?.type||"")?[{id:"items" as const,
    label:block?.type==="FAQList"?"Preguntas y respuestas":"Editar elementos",
    icon:block?.type==="FAQList"?<MessageCircle/>:<Layers/>}]:[]),
  ...(block?.type==="HeroVisual"?[
    {id:"layout" as const,label:"Diseño de portada",icon:<ImagePlus/>},
    {id:"shade" as const,label:"Oscuridad",icon:<SlidersHorizontal/>}
   ]:("surface" in (props||{})||"sectionSurface" in (props||{}))?
    [{id:"surface" as const,label:"Fondo",icon:<Palette/>}]:[]),
  {id:"add",label:"Añadir sección",icon:<Plus/>},
  {id:"duplicate",label:"Duplicar sección",icon:<Copy/>},
  {id:"arrange",label:"Subir o bajar",icon:<ArrowUp/>},
  {id:"delete",label:"Eliminar sección",icon:<Trash2/>}
 ];
 const pickTool=(tool:VisualTool)=>{
  if(!selection||!props)return;
  if(tool==="add"){setInsertAfterId(selection.id);setDrawer(true);setSection("create");closePopup();return;}
  if(tool==="duplicate"){const result=duplicateBlock(data,selection.id);if(result.newId)onChange(result.data);closePopup();return;}
  if(tool==="delete"){setDeleteTarget({id:selection.id,label:String(props.title||"esta sección").slice(0,70)});setVisualTool("menu");return;}
  setVisualTool(tool);
 };
 const toolName=({
  content:isButton?"Editar botón":isText?"Editar texto":"Editar contenido",size:"Tamaño",
  color:"Color",background:"Fondo",font:"Tipografía",weight:"Grosor",italic:"Cursiva",
  spacing:"Espaciado",opacity:"Transparencia",align:"Alineación",image:"Reemplazar imagen",
  shade:"Oscuridad",frame:block?.type==="HeroVisual"?"Encuadre":"Esquinas",shape:"Esquinas",
  link:"Enlace",actions:"Opciones",menu:"Herramientas",position:"Mover",border:"Borde",
  layout:"Diseño de portada",arrange:"Organizar sección",add:"Añadir",duplicate:"Duplicar",
  delete:"Eliminar",items:block?.type==="FAQList"?"Preguntas y respuestas":"Editar elementos",gallery:"Fotos y columnas",
  surface:"Fondo",buttonStyle:"Estilo del botón"
 } as Record<VisualTool,string>)[visualTool];
 const imageSettings=isImage&&image?targetSettings(props||{},image):null;
 const moveXKey=device==="mobile"?"imageMoveXMobile":"imageMoveX";
 const moveYKey=device==="mobile"?"imageMoveYMobile":"imageMoveY";
 const widthKey=device==="mobile"?"imageWidthMobile":"imageWidth";
 const selectedValue=selection?.index!==undefined&&Array.isArray(props?.items)?
  String((props.items[selection.index] as Record<string,unknown>)?.[selectedTextKey]||""):
  String(props?.[selectedTextKey]||"");
 const addListItem=()=>{
  if(!props||!Array.isArray(props.items)||props.items.length>=40)return;
  const item=block?.type==="PhotoGallery"?{id:crypto.randomUUID(),caption:"",image:"",alt:""}:
   block?.type==="FAQList"?{id:crypto.randomUUID(),question:"",answer:""}:
   {id:crypto.randomUUID(),title:"Nuevo elemento",description:"",image:"",alt:"",price:""};
  edit({items:[...props.items,item]});
 };
 const moveListItem=(index:number,step:number)=>{
  if(!props||!Array.isArray(props.items))return;
  const dest=index+step;
  if(dest<0||dest>=props.items.length)return;
  const next=[...props.items];
  [next[index],next[dest]]=[next[dest],next[index]];
  edit({items:next});
 };
 const addFAQSection=()=>{
  const spec=builderConfig.components?.FAQList as {defaultProps?:Record<string,unknown>}|undefined;
  const defaults=JSON.parse(JSON.stringify(spec?.defaultProps||{})) as Record<string,unknown>;
  const id=crypto.randomUUID();
  const node={type:"FAQList",props:{...defaults,id,items:[]}} as Item;
  onChange({...data,content:[...data.content,node]});
  closeDrawer();
  setSelection({id,kind:"section",x:window.innerWidth/2,y:window.innerHeight/2});
  setVisualTool("items");
 };

 return <div className={styles.stage} data-device={device} data-preview={preview}
  data-inspecting={false}
  onClickCapture={event=>{
   if(!selection||drawer||preview||deleteTarget||dragRef.current)return;
   const target=event.target instanceof Element?event.target:null;
   if(!target)return;
   // Tapping blank page chrome dismisses the inspector; tapping an editable
   // block leaves the selection flow alone so another block can open directly.
   if(target.closest(`.${styles.mobileEditingTools},.${styles.floating},.${styles.visualMenuScrim},.${styles.visualToolTray},.${styles.sizeRail},.${styles.menuButton},.${styles.historyBar}`))return;
   if(target.closest("[data-vmv-edit-block]"))return;
   closePopup();
  }}>
  <button className={styles.menuButton} type="button" aria-label="Abrir menú del editor"
   aria-expanded={drawer} onClick={()=>{setDrawer(true);closePopup();setSection("home");}}>
   <Menu size={23}/></button>
  {!preview&&!drawer?<div className={styles.historyBar} role="group" aria-label="Historial del editor">
   <button type="button" disabled={!historyAvailable.undo||Boolean(deleteTarget)}
    aria-label="Deshacer último cambio" onClick={()=>navigateHistory("undo")}>
    <Undo2 size={17}/><span>Deshacer</span>
   </button>
   <button type="button" disabled={!historyAvailable.redo||Boolean(deleteTarget)}
    aria-label="Rehacer cambio" onClick={()=>navigateHistory("redo")}>
    <Redo2 size={17}/><span>Rehacer</span>
   </button>
  </div>:null}
  <div className={device==="desktop"?styles.desktopFrame:styles.mobileFrame}>
   <div className={styles.viewport} ref={pageSurface}
    onPointerDownCapture={pointerDown} onPointerMoveCapture={pointerMove}
    onPointerUpCapture={pointerUp} onPointerCancelCapture={pointerUp}
    onDoubleClickCapture={e=>{
     if(preview||drawer)return;
     const target=e.target instanceof Element?e.target:null;
     if(!target?.closest("[data-vmv-edit-block]"))return;
     e.preventDefault();e.stopPropagation();
     suppressed.current=Date.now()+600;
     selectAt(target,e.clientX,e.clientY);
    }}
    onClickCapture={e=>{
     if(preview||drawer)return;
     const target=e.target instanceof Element?e.target:null;
     if(!target)return;
     // A tap chooses what to edit, never activates links or forms on the draft.
     const blocked=Boolean(target.closest("a,button,input,select,textarea,[role=button]"));
     if(blocked){e.preventDefault();e.stopPropagation();}
     if(Date.now()<suppressed.current||dragRef.current)return;
     if(target.closest("[data-vmv-edit-block]")){
      e.preventDefault();e.stopPropagation();
      selectAt(target,e.clientX,e.clientY);
     }
    }}
    onContextMenu={e=>{if(!preview)e.preventDefault();}}>
    {mainCanvas}
   </div>
  </div>
  {selection&&!drawer&&!preview&&block&&props?<div className={styles.visualBackdrop} aria-hidden="true" onClick={closePopup}/> :null}
  {selection&&!drawer&&!preview&&block&&props?<div className={styles.mobileEditingTools}>
   <div className={styles.visualQuickBar} role="toolbar" aria-label="Herramientas del elemento seleccionado">
    {visualTool==="menu"?<>
     <span className={styles.visualQuickLabel}>Modificar {selection.kind==="button"?"botón":selection.kind==="image"?"imagen":selection.kind==="text"?"texto":"sección"}</span>
     <div className={styles.visualQuickScroll}>
      {menuChoices.map(tool=><button type="button" key={tool.id}
       onClick={()=>pickTool(tool.id)}>{tool.icon}<span>{tool.label}</span></button>)}
     </div>
    </>:<div className={styles.visualDetailHeader}>
     <button type="button" className={styles.visualBackButton} aria-label="Volver a herramientas"
      onClick={()=>setVisualTool("menu")}><ArrowLeft size={23}/></button>
     <strong>{toolName}</strong>
    </div>}
    <button type="button" className={styles.visualQuickClose} aria-label="Cerrar herramientas" onClick={closePopup}><X size={19}/></button>
   </div>
   {visualTool!=="menu"?<div className={styles.visualQuickDetail} role="region" aria-label={toolName}>

    {visualTool==="content"&&(isText||isButton)?<label className={styles.formLabel}>
     {isButton?"Texto del botón":LABELS[selectedTextKey]||"Texto"}
     <textarea rows={3} value={selectedValue} onChange={e=>editText(selectedTextKey,e.target.value,selection?.index)}/>
    </label>:null}
    {visualTool==="content"&&selection?.kind==="section"?<div className={styles.focusFields}>
     {textFields.length?textFields.map(key=><label className={styles.formLabel} key={key}>{LABELS[key]||key}
      <textarea rows={2} value={String(props[key]||"")} onChange={e=>editText(key,e.target.value)}/>
     </label>):<p>Selecciona el texto directamente para editarlo.</p>}
    </div>:null}
    {visualTool==="items"&&block?.type==="FAQList"&&Array.isArray(props.items)?<div className={styles.focusFields}>
     <label className={styles.formLabel}>Título de la sección
      <input value={String(props.title||"")} maxLength={180}
       onChange={e=>editText("title",e.target.value)} placeholder="Preguntas frecuentes"/>
     </label>
     {props.items.length===0?<p>Añade una pregunta y escribe su respuesta. Puedes crear tantas como necesites.</p>:null}
     {(props.items as Record<string,unknown>[]).map((item,index)=><div className={styles.focusItem}
      key={String(item.id||index)}>
      <strong>Pregunta {index+1}</strong>
      <label className={styles.formLabel}>Pregunta
       <input value={String(item.question||"")} maxLength={700}
        placeholder="Escribe la pregunta"
        onChange={e=>editText("question",e.target.value,index)}/>
      </label>
      <label className={styles.formLabel}>Respuesta
       <textarea rows={4} maxLength={700} placeholder="Escribe la respuesta"
        value={String(item.answer||"")}
        onChange={e=>editText("answer",e.target.value,index)}/>
      </label>
      <div className={styles.focusChoices}>
       <button type="button" disabled={index===0} aria-label={`Subir pregunta ${index+1}`}
        onClick={()=>moveListItem(index,-1)}><ArrowUp size={18}/> Subir</button>
       <button type="button" disabled={index===(props.items as Record<string,unknown>[]).length-1}
        aria-label={`Bajar pregunta ${index+1}`}
        onClick={()=>moveListItem(index,1)}><ArrowDown size={18}/> Bajar</button>
      </div>
      <button type="button" className={styles.focusDestructive}
       onClick={()=>edit({items:(props.items as unknown[]).filter((_,i)=>i!==index)})}>
       <Trash2 size={18}/> Eliminar pregunta
      </button>
     </div>)}
     <button type="button" className={styles.focusAction}
      onClick={addListItem} disabled={props.items.length>=40}>
      <Plus size={18}/> Añadir pregunta y respuesta
     </button>
     {props.items.length>=40?<p>Máximo de 40 preguntas por sección.</p>:null}
    </div>:null}
    {visualTool==="gallery"&&["PhotoGallery","ProjectShowcase"].includes(block?.type||"")?<div className={styles.focusFields}>
     <strong>Columnas de la galería</strong>
     <div className={styles.focusChoices} role="group" aria-label="Número de columnas">
      {(["1","2","3","4"] as const).map(n=><button type="button" key={n}
       aria-pressed={String(props.columns||"3")===n} onClick={()=>edit({columns:n})}>{n} {n==="1"?"columna":"columnas"}</button>)}
     </div>
     <label className={styles.formLabel}>Distribución
      <select value={String(props.layout||"mosaic")} onChange={e=>edit({layout:e.target.value})}>
       <option value="grid">Cuadrícula</option><option value="mosaic">Mosaico</option><option value="list">Lista</option>
      </select>
     </label>
     <p>Sube fotos o elige las guardadas en Mis imágenes. Se conservan al guardar el borrador.</p>
    </div>:null}
    {(visualTool==="items"||visualTool==="gallery")&&block?.type!=="FAQList"&&Array.isArray(props.items)?<div className={styles.focusFields}>
     {(props.items as Record<string,unknown>[]).map((item,index)=><div className={styles.focusItem} key={String(item.id||index)}>
      <strong>Elemento {index+1}</strong>
      {["title","description","price","caption","question","answer"].filter(k=>typeof item[k]==="string").map(key=>
       <label className={styles.formLabel} key={key}>{LABELS[key]||key}
        <textarea rows={2} value={String(item[key]||"")} onChange={e=>editText(key,e.target.value,index)}/>
       </label>)}
      {typeof item.image==="string"?<BuilderImageField value={item.image}
       onChange={url=>onChange(patchBuilderImage(data,selection!.id,{field:"image",index},{image:url}))}/>:null}
      <button type="button" className={styles.focusDestructive} onClick={()=>edit({items:(props.items as unknown[]).filter((_,i)=>i!==index)})}>
       <Trash2 size={18}/> Quitar elemento</button>
     </div>)}
     <button type="button" className={styles.focusAction} disabled={props.items.length>=40} onClick={addListItem}><Plus size={18}/> {visualTool==="gallery"?"Agregar foto":"Agregar elemento"}</button>
    </div>:null}
    {visualTool==="size"&&(isText||isButton)?<RangeField label="Tamaño del texto" min={11} max={isButton?36:110} unit="px"
     value={activeSize} onChange={v=>isButton?edit({buttonFontSize:v}):keys?patchTypography({[keys.size]:v}):undefined}/>:null}
    {visualTool==="size"&&isImage&&image&&imageSettings?<RangeField
     label={block?.type==="OfferingGrid"?"Ancho de la tarjeta":"Ancho de la imagen"} min={25} max={100} unit="%"
     value={imageSettings[widthKey]??100} onChange={v=>editImage(image,{[widthKey]:v})}/>:null}
    {(visualTool==="color"||visualTool==="background")&&(isText||isButton)?<ColorField
     label={visualTool==="background"?"Color de fondo":"Color del texto y del ícono"}
     value={currentColor} allowTransparent onChange={patchColor}/>:null}
    {visualTool==="font"&&isText&&keys?<FontField value={values?.[keys.font]||"site"}
     onChange={v=>patchTypography({[keys.font]:v})}/>:null}
    {visualTool==="weight"&&isText&&keys?.weight?<div className={styles.focusChoices}>
     {["light","normal","heavy"].map((weight,i)=><button type="button" key={weight}
      aria-pressed={String(values?.[keys.weight!]||"normal")===weight}
      onClick={()=>patchTypography({[keys.weight!]:weight})}>{["Ligero","Normal","Negrita"][i]}</button>)}
    </div>:null}
    {visualTool==="italic"&&isText&&keys?.italic?<div className={styles.focusChoices}>
     <button type="button" aria-pressed={String(values?.[keys.italic]||"no")==="no"}
      onClick={()=>patchTypography({[keys.italic!]:"no"})}>Normal</button>
     <button type="button" aria-pressed={values?.[keys.italic]==="yes"}
      onClick={()=>patchTypography({[keys.italic!]:"yes"})}>Cursiva</button>
    </div>:null}
    {visualTool==="spacing"&&isText&&keys?.spacing?<RangeField label="Espaciado" min={-3} max={12} unit="px"
     value={values?.[keys.spacing]??0} onChange={v=>patchTypography({[keys.spacing!]:v})}/>:null}
    {visualTool==="opacity"&&isText&&keys?<RangeField label="Transparencia" min={0} max={100} unit="%"
     value={values?.[opacityKey]??100} onChange={v=>patchTypography({[opacityKey]:v})}/>:null}
    {visualTool==="opacity"&&isImage&&image&&imageSettings?<RangeField label="Transparencia" min={0} max={100} unit="%"
     value={imageSettings.imageOpacity??0} onChange={v=>editImage(image,{imageOpacity:v})}/>:null}
    {visualTool==="image"&&isImage&&image?<BuilderImageField value={targetImage(props,image)}
     onChange={url=>editImage(image,{[image.field]:url})}/>:null}
    {visualTool==="position"&&isImage&&image&&imageSettings?<div className={styles.focusFields}>
     {block?.type==="OfferingGrid"?<p>Se mueve la tarjeta completa, incluida la imagen y el texto.</p>:null}
     <RangeField label="Mover horizontalmente" min={-250} max={250} unit="px"
      value={imageSettings[moveXKey]??0} onChange={v=>editImage(image,{[moveXKey]:v})}/>
     <RangeField label="Mover verticalmente" min={-250} max={250} unit="px"
      value={imageSettings[moveYKey]??0} onChange={v=>editImage(image,{[moveYKey]:v})}/>
    </div>:null}
    {visualTool==="frame"&&isImage&&image&&imageSettings?
     block?.type==="HeroVisual"?<label className={styles.formLabel}>Encuadre de portada
      <select value={String(props.imagePosition||"center")} onChange={e=>edit({imagePosition:e.target.value})}>
       {["center","top","bottom","left","right"].map((x,i)=><option value={x} key={x}>
        {["Centro","Arriba","Abajo","Izquierda","Derecha"][i]}</option>)}
      </select>
     </label>:<RangeField label="Esquinas" min={0} max={80} unit="px"
      value={imageSettings.imageRadius??16} onChange={v=>editImage(image,{imageRadius:v})}/>:null}
    {visualTool==="border"&&isImage&&image&&imageSettings?<div className={styles.focusFields}>
     <RangeField label="Grosor del borde" min={0} max={12} unit="px"
      value={imageSettings.imageBorder??0} onChange={v=>editImage(image,{imageBorder:v})}/>
     <ColorField label="Color del borde" value={imageSettings.borderColor}
      onChange={v=>editImage(image,{borderColor:v})}/>
    </div>:null}
    {visualTool==="border"&&isButton&&block?.type==="CTA"?<div className={styles.focusFields}>
     <RangeField label="Grosor del borde" min={0} max={12} unit="px"
      value={props.buttonBorderWidth??0} onChange={v=>edit({buttonBorderWidth:v})}/>
     <ColorField label="Color del borde" value={props.buttonBorderColor}
      onChange={v=>edit({buttonBorderColor:v})}/>
    </div>:null}
    {visualTool==="shape"&&isButton?<div className={styles.focusChoices}>
     {["pill","rounded","square"].map((shape,i)=><button key={shape} type="button"
      aria-pressed={String(props.buttonShape||"pill")===shape} onClick={()=>edit({buttonShape:shape})}>
      {["Redondo","Suave","Cuadrado"][i]}</button>)}
    </div>:null}
    {visualTool==="buttonStyle"&&isButton?<div className={styles.focusChoices}>
     {["solid","outline","link"].map((style,i)=><button key={style} type="button"
      aria-pressed={String(props[block?.type==="ComposeButton"?"style":"buttonStyle"]||"solid")===style}
      onClick={()=>edit({[block?.type==="ComposeButton"?"style":"buttonStyle"]:style})}>
      {["Sólido","Contorno","Enlace"][i]}</button>)}
    </div>:null}
    {visualTool==="link"&&isButton?<label className={styles.formLabel}>Enlace del botón
     <input value={String(props[block?.type==="ComposeButton"?"url":"buttonUrl"]||"")}
      onChange={e=>edit({[block?.type==="ComposeButton"?"url":"buttonUrl"]:e.target.value})}
      placeholder="https://… o #contacto"/></label>:null}
    {visualTool==="layout"&&block?.type==="HeroVisual"?<div className={styles.focusFields}>
     <label className={styles.formLabel}>Diseño de portada
      <select value={String(props.layout||"split")} onChange={e=>edit({layout:e.target.value})}>
       <option value="cover">Imagen de fondo completo</option><option value="split">Imagen al lado</option>
      </select>
     </label>
     <BuilderImageField value={String(props.image||"")} onChange={url=>edit({image:url,layout:"cover"})}/>
    </div>:null}
    {visualTool==="shade"&&block?.type==="HeroVisual"?<div className={styles.focusChoices}>
     {["soft","medium","strong"].map((shade,i)=><button type="button" key={shade}
      aria-pressed={String(props.shade||"medium")===shade} onClick={()=>edit({shade})}>
      {["Suave","Medio","Intenso"][i]}</button>)}
    </div>:null}
    {visualTool==="surface"&&selection?.kind==="section"?<label className={styles.formLabel}>Fondo de sección
     <select value={String(props[block?.type==="CTA"?"sectionSurface":"surface"]||"light")}
      onChange={e=>edit({[block?.type==="CTA"?"sectionSurface":"surface"]:e.target.value})}>
      <option value="light">Claro</option><option value="soft">Suave</option><option value="dark">Oscuro</option>
      {block?.type==="CTA"?<option value="accent">Marca</option>:null}
     </select></label>:null}
    {visualTool==="arrange"?<div className={styles.focusFields}>
     <div className={styles.focusChoices}>
      <button type="button" onClick={()=>onChange(moveBlock(data,selection!.id,-1))}><ArrowUp size={18}/> Subir</button>
      <button type="button" onClick={()=>onChange(moveBlock(data,selection!.id,1))}><ArrowDown size={18}/> Bajar</button>
     </div>
     <button className={styles.focusAction} type="button" onClick={()=>pickTool("duplicate")}><Copy size={18}/> Duplicar sección</button>
     <button className={styles.focusAction} type="button" onClick={()=>pickTool("add")}><Plus size={18}/> Añadir debajo</button>
     <button className={styles.focusDestructive} type="button" onClick={()=>pickTool("delete")}><Trash2 size={18}/> Eliminar sección</button>
    </div>:null}

   </div>:null}
  </div>:null}
  {error&&errorDismissed!==error?<div className={styles.statusAlert} role="alert">
   <span>{error}</span><button aria-label="Cerrar aviso" onClick={()=>setErrorDismissed(error)}><X size={15}/></button>
  </div>:noticeVisible?<div className={styles.statusToast} role="status">{notice}</div>:null}
  {deleteTarget?<div className={styles.confirmScrim}>
   <section className={styles.confirmDialog} role="alertdialog" aria-modal="true"
    aria-labelledby="vmv-remove-section-title" aria-describedby="vmv-remove-section-description"
    onKeyDown={e=>{if(e.key==="Escape"){e.stopPropagation();setDeleteTarget(null);}}}>
    <h2 id="vmv-remove-section-title">¿Eliminar sección?</h2>
    <p id="vmv-remove-section-description">Se quitará «{deleteTarget.label}» del borrador. No se publicará automáticamente.</p>
    <div className={styles.confirmButtons}>
     <button type="button" autoFocus onClick={()=>setDeleteTarget(null)}>Cancelar</button>
     <button type="button" className={styles.confirmRemove} onClick={()=>{
      onChange(removeBlock(data,deleteTarget.id));setDeleteTarget(null);closePopup();
     }}><Trash2 size={16}/> Eliminar</button>
    </div>
   </section>
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
     <small className={styles.saveStatus}>{savePhase==="saving"?"Guardando cambios…":savePhase==="error"?"Error al guardar":savePhase==="pending"?"Cambios pendientes":"Borrador guardado"}</small>
     <small className={styles.groupLabel}>CONTENIDO</small>
     <button onClick={()=>menuAction("create")}><Plus/> Agregar elemento o sección <ChevronRight/></button>
     <button onClick={addFAQSection}><MessageCircle/> Añadir preguntas frecuentes <ChevronRight/></button>
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
      <p className={styles.help}>{insertAfterId?"Añadir debajo de la sección seleccionada.":"El nuevo elemento se añadirá al final de la página."}</p>
      {ADDS.map(o=><button key={o.type} onClick={()=>{
       const spec=builderConfig.components?.[o.type] as {defaultProps?:Record<string,unknown>}|undefined;
       const defaults=JSON.parse(JSON.stringify(spec?.defaultProps||{})) as Record<string,unknown>;
       const node={type:o.type,props:{...defaults,id:crypto.randomUUID()}} as Item;
       if(insertAfterId){
        const next=insertBlockAfter(data,insertAfterId,node);
        if(next===data)return;
        onChange(next);
       }else onChange({...data,content:[...data.content,node]});
       closeDrawer();
       if(o.type==="FAQList"){
        setSelection({id:String(node.props.id),kind:"section",x:window.innerWidth/2,y:window.innerHeight/2});
        setVisualTool("items");
       }
      }}><Plus/> {o.label}<ChevronRight/></button>)}
     </>:null}
     {section==="appearance"?<>
      <label className={styles.formLabel}>Paleta
       <select value={String(root.palette||"violet")} onChange={e=>rootPatch({palette:e.target.value,accentColor:"",secondaryColor:"",tertiaryColor:""})}>
        {["violet","mint","amber","ink","rose","forest","ocean","terracotta","charcoal"].map(p=>
         <option key={p} value={p}>{({violet:"Violeta",mint:"Menta",amber:"Ámbar",ink:"Tinta",rose:"Rosa",
          forest:"Bosque",ocean:"Océano",terracotta:"Terracota",charcoal:"Carbón"} as Record<string,string>)[p]}</option>)}
       </select>
      </label>
      <ColorField label="Color principal" value={root.accentColor} onChange={v=>rootPatch({accentColor:v})}/>
      <ColorField label="Color secundario" value={root.secondaryColor} onChange={v=>rootPatch({secondaryColor:v})}/>
      <ColorField label="Color de apoyo" value={root.tertiaryColor} onChange={v=>rootPatch({tertiaryColor:v})}/>
      <label className={styles.formLabel}>Logotipo del sitio
       <BuilderImageField kind="logo" value={String(root.logo||"")}
        onChange={v=>rootPatch({logo:v})}/>
      </label>
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
      <p className={styles.help}>Selecciona una miniatura para editar su descripción para accesibilidad y SEO.</p>
      {imageList.length?<div className={styles.seoImageGrid} aria-label="Seleccionar imagen para SEO">
       {imageList.map((item,n)=><button type="button" key={item.key}
        className={styles.seoImageTile} aria-pressed={seoImage?.key===item.key}
        onClick={()=>setSeoImageKey(item.key)}
        aria-label={`Seleccionar imagen ${n+1}: ${item.name}`}>
        {item.src?<img src={item.src} alt="" loading="lazy"/>:<span className={styles.seoImageEmpty}><ImagePlus size={19}/> Sin foto</span>}
        <span>Imagen {n+1}</span>
       </button>)}
      </div>:<p className={styles.help}>Todavía no hay imágenes para describir en esta página.</p>}
      {seoImage?<div className={styles.seoSelected}>
       <strong>{seoImage.name}</strong>
       <label className={styles.formLabel}>Texto alternativo de la imagen
        <textarea rows={3} maxLength={140} placeholder="Describe lo que se ve en esta imagen"
         value={seoImage.alt} onChange={e=>{
          const item=seoImage;
          const patch=item.target.index!==undefined?{alt:e.target.value}:
           item.target.field==="beforeImage"?{beforeAlt:e.target.value}:
           item.target.field==="afterImage"?{afterAlt:e.target.value}:
           item.type==="HeroVisual"?{imageAlt:e.target.value}:{alt:e.target.value};
          onChange(item.target.index!==undefined?
           patchBuilderImage(data,item.id,item.target,patch):patchBlock(data,item.id,patch));
         }}/>
       </label>
       <small>{seoImage.alt.length}/140 caracteres · No cambia el nombre del archivo.</small>
      </div>:null}
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
      <WebSiteAgentSelector siteName={siteName} selectedId={String(root.webAgentId||"")}
       onSelect={agent=>rootPatch({webAgentId:agent?.id||"",webAgentName:agent?.name||""})}/>
      <p className={styles.help}>La selección queda guardada en el borrador de esta página. El chat público todavía recibe mensajes en la bandeja; las respuestas automáticas de IA requieren habilitar el canal web.</p>
      <a className={styles.drawerLink} href="/vista-app/ai-agents" target="_blank" rel="noopener noreferrer"><Sparkles size={18}/> Administrar mis agentes <ChevronRight size={17}/></a>
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
