"use client";
import {useEffect,useState} from "react";
import {ActionBar,createUsePuck,useGetPuck,type Data} from "@puckeditor/core";
import {ImagePlus,SlidersHorizontal,Trash2,Type} from "lucide-react";
import BuilderImageField from "./BuilderImageField";
import {ColorField,FontField,RangeField} from "./BuilderContextFields";

const usePuck=createUsePuck();
import BuilderImageControls from "./BuilderImageControls";
import {IMAGE_SELECT_EVENT} from "./BuilderEditableImage";
import {imageTargets,targetSettings,targetImage,patchBuilderImage,imageDestinations,moveBuilderImage,type ImageTarget} from "@/lib/web-builder-images";
const textTypes=new Set(["ComposeHeading","ComposeText"]);
function patchItem(data:Data,id:string,key:string,value:unknown):Data{
 let found=false;
 const walk=(items:Data["content"]):Data["content"]=>items.map(item=>{
  const original=item.props as Record<string,unknown>;
  let props=original;
  if(original.id===id){found=true;props={...original,[key]:value};}
  for(const field of ["content","left","right","third"]){
   if(Array.isArray(props[field]))props={...props,[field]:walk(props[field] as Data["content"])};
  }
  return props===original?item:{...item,props};
 });
 const content=walk(data.content);
 return found?{...data,content}:data;
}
export default function BuilderSelectedActions({children,label}:{
 children:React.ReactNode;label:string
}){
 const item=usePuck(s=>s.selectedItem);
 const getPuck=useGetPuck();
 const [open,setOpen]=useState(true);
 const [mode,setMode]=useState<"controls"|"library"|"text">("controls");
 const [chosen,setChosen]=useState<{id:string;target:ImageTarget}|null>(null);
 const id=item?.props?.id||"";
 useEffect(()=>{
  const select=(event:Event)=>{
   const detail=(event as CustomEvent<{id:string;target:ImageTarget}>).detail;
   if(!detail)return;
   setChosen(detail);setOpen(true);setMode("controls");
  };
  window.addEventListener(IMAGE_SELECT_EVENT,select);
  return()=>window.removeEventListener(IMAGE_SELECT_EVENT,select);
 },[]);
 useEffect(()=>{setOpen(true);setMode("controls");},[id]);
 const targets=item?imageTargets(item.type,item.props):[];
 const isImage=targets.length>0;
 const target=targets.find(t=>chosen&&chosen.id===id&&t.field===chosen.target.field&&t.index===chosen.target.index)||targets[0];
 const data=usePuck(s=>s.appState.data);
 const destinations=imageDestinations(data);
 function changeImage(patch:Record<string,unknown>){
  if(!id||!target)return;
  const api=getPuck();
  api.dispatch({type:"setData",data:patchBuilderImage(api.appState.data,id,target,patch)});
 }
 const isText=Boolean(item&&(textTypes.has(item.type)||item.type==="HeroVisual"));
 function change(field:string,value:unknown){
  if(!item||!id)return;
  const api=getPuck();
  const heroTextNames:Record<string,string>={font:"titleFont",fontSize:"titleFontSize",
   textColor:"titleColor",textShadow:"titleShadow",weight:"titleWeight",
   italic:"titleItalic",linkUrl:"titleLink"};
  const key=item.type==="HeroVisual"&&field in heroTextNames?heroTextNames[field]:field;
  const next=patchItem(api.appState.data,id,key,value);
  if(next!==api.appState.data)api.dispatch({type:"setData",data:next});
 }
 const props=item?.props||{};

 const textKey=item?.type==="ComposeHeading"||item?.type==="HeroVisual"?"title":"text";
 const textProp=(key:string)=>{
  if(item?.type!=="HeroVisual")return props[key];
  const heroTextNames:Record<string,string>={font:"titleFont",fontSize:"titleFontSize",
   textColor:"titleColor",textShadow:"titleShadow",weight:"titleWeight",
   italic:"titleItalic",linkUrl:"titleLink"};
  return props[heroTextNames[key]||key];
 };
 return <div className="vmv-context-action-wrap">
  <ActionBar label={label}>
   <ActionBar.Group>{children}</ActionBar.Group>
   {(isImage||isText)?<ActionBar.Group>
    <ActionBar.Action label={isImage?"Editar portada":"Editar texto"} onClick={()=>setOpen(v=>!v)}>
     {isImage?<ImagePlus size={16}/>:<Type size={16}/>}
    </ActionBar.Action>
   </ActionBar.Group>:null}
  </ActionBar>
  {(isImage||isText)&&open?<div className="vmv-context-action-panel"
    role="region" aria-label={isImage&&mode!=="text"?"Ajustes de la imagen seleccionada":"Ajustes del texto seleccionado"}
    onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}>
   <header><strong>{isImage&&mode!=="text"?"Imagen seleccionada":"Texto seleccionado"}</strong>
    <button type="button" aria-label="Cerrar ajustes" onClick={()=>setOpen(false)}>✕</button>
   </header>
   {item?.type==="HeroVisual"?<div className="vmv-context-switch vmv-context-hero-tabs" role="group"
    aria-label="Elemento de portada">
    <button type="button" aria-pressed={mode!=="text"} onClick={()=>setMode("controls")}>Foto</button>
    <button type="button" aria-pressed={mode==="text"} onClick={()=>setMode("text")}>Título</button>
   </div>:null}
   {isImage&&mode!=="text"?<div className="vmv-context-content">
    <div className="vmv-context-switch" role="group" aria-label="Modo de imagen">
     <button type="button" aria-pressed={mode==="controls"} onClick={()=>setMode("controls")}>
      <SlidersHorizontal size={13}/> Ajustar</button>
     <button type="button" aria-pressed={mode==="library"} onClick={()=>setMode("library")}>
      <ImagePlus size={13}/> Reemplazar</button>
    </div>
    {targets.length>1?<label className="vmv-context-text-label">Imagen
     <select aria-label="Imagen que quieres editar" value={targets.indexOf(target)}
      onChange={event=>{setChosen({id,target:targets[Number(event.target.value)]});setMode("controls");}}>
      {targets.map((t,index)=><option value={index} key={index}>{t.label}</option>)}
     </select>
    </label>:null}
    {mode==="library"?<BuilderImageField value={targetImage(props,target)}
     onChange={src=>changeImage({[target.field]:src})}/>:<BuilderImageControls
      value={targetSettings(props,target)} radius={item?.type==="HeroVisual"?0:item?.type==="Image"?23:16}
      onChange={changeImage}/>}
    <button type="button" className="vmv-context-remove" onClick={()=>{
     changeImage({[target.field]:""});setMode("controls");
    }}><Trash2 size={14}/> Quitar imagen de este lugar</button>
    {item&&["ComposeImage","Image"].includes(item.type)?<label className="vmv-context-text-label">Mover a
     <select aria-label="Mover imagen a otra sección o columna" value="" onChange={event=>{
      if(event.target.value==="")return;
      const destination=destinations[Number(event.target.value)];
      if(!destination)return;
      const api=getPuck();
      api.dispatch({type:"setData",data:moveBuilderImage(api.appState.data,id,destination.id,destination.slot)});
     }}>
      <option value="">Elegir posición…</option>
      {destinations.map((d,index)=><option key={d.id+d.slot} value={index}>{d.label}</option>)}
     </select>
    </label>:null}
   </div>:null}
   {isText&&(!isImage||mode==="text")?<div className="vmv-context-content">
    <label className="vmv-context-text-label">Contenido
     <textarea rows={2} value={String(props[textKey]||"")} maxLength={item?.type==="ComposeHeading"||item?.type==="HeroVisual"?180:2400}
      onChange={e=>change(textKey,e.target.value)}/></label>
    <FontField value={textProp("font")||"site"} onChange={v=>change("font",v)}/>
    <RangeField label="Tamaño de fuente" min={12} max={110} value={textProp("fontSize")??32}
     unit="px" onChange={v=>change("fontSize",v)}/>
    <ColorField value={textProp("textColor")} label="Color del texto"
     onChange={v=>change("textColor",v)} allowTransparent/>
    <div className="vmv-context-switch" role="group" aria-label="Estilo de texto">
     <button type="button" aria-pressed={textProp("weight")==="heavy"} onClick={()=>
      change("weight",textProp("weight")==="heavy"?"normal":"heavy")}>Negrita</button>
     <button type="button" aria-pressed={textProp("italic")==="yes"} onClick={()=>
      change("italic",textProp("italic")==="yes"?"no":"yes")}>Cursiva</button>
    </div>
    <div className="vmv-context-switch" role="group" aria-label="Sombra de texto">
     {([{value:"none",label:"Sin sombra"},{value:"soft",label:"Suave"},{value:"strong",label:"Fuerte"}]).map(option=>
      <button type="button" key={option.value} aria-pressed={(textProp("textShadow")||"none")===option.value}
       onClick={()=>change("textShadow",option.value)}>{option.label}</button>)}
    </div>
    <label className="vmv-context-text-label">Convertir texto en enlace
     <input type="text" placeholder="https://... o #contacto" value={String(textProp("linkUrl")||"")}
      onChange={e=>change("linkUrl",e.target.value)}/></label>
    {item?.type!=="HeroVisual"?<details><summary>Mover dentro de la sección</summary>
     <RangeField label="Horizontal" min={-150} max={150} unit="px" value={props.moveX??0}
      onChange={v=>change("moveX",v)}/>
     <RangeField label="Vertical" min={-150} max={150} unit="px" value={props.moveY??0}
      onChange={v=>change("moveY",v)}/>
    </details>:null}
    {item?.type!=="HeroVisual"?<p className="vmv-context-hint">Arrastra el control Mover sobre el elemento para desplazarlo.
     Usa el arrastre de Puck para colocarlo en otra columna.</p>:null}
   </div>:null}
  </div>:null}
 </div>;
}
