"use client";
import {useEffect,useState} from "react";
import {ActionBar,createUsePuck,useGetPuck,type Data} from "@puckeditor/core";
import {ImagePlus,SlidersHorizontal,Trash2,Type} from "lucide-react";
import BuilderImageField from "./BuilderImageField";
import {ColorField,FontField,RangeField} from "./BuilderContextFields";

const usePuck=createUsePuck();
const imageTypes=new Set(["ComposeImage","HeroVisual","Image"]);
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
 const [mode,setMode]=useState<"controls"|"library">("controls");
 const id=item?.props?.id||"";
 useEffect(()=>{setOpen(true);setMode("controls");},[id]);
 const isImage=Boolean(item&&imageTypes.has(item.type));
 const isText=Boolean(item&&textTypes.has(item.type));
 function change(field:string,value:unknown){
  if(!item||!id)return;
  const api=getPuck();
  const next=patchItem(api.appState.data,id,field,value);
  if(next!==api.appState.data)api.dispatch({type:"setData",data:next});
 }
 const props=item?.props||{};
 const imageKey=item?.type==="Image"?"url":"image";
 const textKey=item?.type==="ComposeHeading"?"title":"text";
 return <div className="vmv-context-action-wrap">
  <ActionBar label={label}>
   <ActionBar.Group>{children}</ActionBar.Group>
   {(isImage||isText)?<ActionBar.Group>
    <ActionBar.Action label={isImage?"Editar imagen":"Editar texto"} onClick={()=>setOpen(v=>!v)}>
     {isImage?<ImagePlus size={16}/>:<Type size={16}/>}
    </ActionBar.Action>
   </ActionBar.Group>:null}
  </ActionBar>
  {(isImage||isText)&&open?<div className="vmv-context-action-panel"
    role="region" aria-label={isImage?"Ajustes de la imagen seleccionada":"Ajustes del texto seleccionado"}
    onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}>
   <header><strong>{isImage?"Imagen seleccionada":"Texto seleccionado"}</strong>
    <button type="button" aria-label="Cerrar ajustes" onClick={()=>setOpen(false)}>✕</button>
   </header>
   {isImage?<div className="vmv-context-content">
    <div className="vmv-context-switch" role="group" aria-label="Modo de imagen">
     <button type="button" aria-pressed={mode==="controls"} onClick={()=>setMode("controls")}>
      <SlidersHorizontal size={13}/> Ajustar</button>
     <button type="button" aria-pressed={mode==="library"} onClick={()=>setMode("library")}>
      <ImagePlus size={13}/> Reemplazar</button>
    </div>
    {mode==="library"?<BuilderImageField
     value={typeof props[imageKey]==="string"?props[imageKey]:""}
     onChange={src=>change(imageKey,src)}/>:<>
     {(item?.type==="ComposeImage"||item?.type==="HeroVisual")?<>
      <RangeField label="Tamaño" min={25} max={100} unit="%" value={props.imageWidth??100}
       onChange={v=>change("imageWidth",v)}/>
      <RangeField label="Esquinas redondas" min={0} max={80} unit="px" value={props.imageRadius??16}
       onChange={v=>change("imageRadius",v)}/>
      <RangeField label="Transparencia" min={0} max={100} unit="%" value={props.imageOpacity??0}
       onChange={v=>change("imageOpacity",v)}/>
      <RangeField label="Grosor del borde" min={0} max={12} unit="px" value={props.imageBorder??0}
       onChange={v=>change("imageBorder",v)}/>
      <ColorField label="Color del borde" value={props.borderColor}
       onChange={v=>change("borderColor",v)}/>
      <details><summary>Posición dentro de la sección</summary>
       <RangeField label="Horizontal" min={-150} max={150} unit="px" value={props.imageMoveX??0}
        onChange={v=>change("imageMoveX",v)}/>
       <RangeField label="Vertical" min={-150} max={150} unit="px" value={props.imageMoveY??0}
        onChange={v=>change("imageMoveY",v)}/>
      </details>
     </>:<p className="vmv-context-hint">
      Esta portada tiene controles de imagen y encuadre en el panel de edición.
      Puedes ajustar tamaño y transparencia en el bloque Imagen editable.
     </p>}
    </>}
    <button type="button" className="vmv-context-remove" onClick={()=>{
     change(imageKey,"");setMode("controls");
    }}><Trash2 size={14}/> Quitar imagen de este lugar</button>
   </div>:null}
   {isText?<div className="vmv-context-content">
    <label className="vmv-context-text-label">Contenido
     <textarea rows={2} value={String(props[textKey]||"")} maxLength={item?.type==="ComposeHeading"?180:2400}
      onChange={e=>change(textKey,e.target.value)}/></label>
    <FontField value={props.font||"site"} onChange={v=>change("font",v)}/>
    <RangeField label="Tamaño de fuente" min={12} max={110} value={props.fontSize??32}
     unit="px" onChange={v=>change("fontSize",v)}/>
    <ColorField value={props.textColor} label="Color del texto"
     onChange={v=>change("textColor",v)} allowTransparent/>
    <div className="vmv-context-switch" role="group" aria-label="Estilo de texto">
     <button type="button" aria-pressed={props.weight==="heavy"} onClick={()=>
      change("weight",props.weight==="heavy"?"normal":"heavy")}>Negrita</button>
     <button type="button" aria-pressed={props.italic==="yes"} onClick={()=>
      change("italic",props.italic==="yes"?"no":"yes")}>Cursiva</button>
    </div>
    <div className="vmv-context-switch" role="group" aria-label="Sombra de texto">
     {([{value:"none",label:"Sin sombra"},{value:"soft",label:"Suave"},{value:"strong",label:"Fuerte"}]).map(option=>
      <button type="button" key={option.value} aria-pressed={(props.textShadow||"none")===option.value}
       onClick={()=>change("textShadow",option.value)}>{option.label}</button>)}
    </div>
    <label className="vmv-context-text-label">Convertir texto en enlace
     <input type="text" placeholder="https://... o #contacto" value={String(props.linkUrl||"")}
      onChange={e=>change("linkUrl",e.target.value)}/></label>
    <details><summary>Mover dentro de la sección</summary>
     <RangeField label="Horizontal" min={-150} max={150} unit="px" value={props.moveX??0}
      onChange={v=>change("moveX",v)}/>
     <RangeField label="Vertical" min={-150} max={150} unit="px" value={props.moveY??0}
      onChange={v=>change("moveY",v)}/>
    </details>
    <p className="vmv-context-hint">Arrastra el control Mover sobre el elemento para desplazarlo.
     Usa el arrastre de Puck para colocarlo en otra columna.</p>
   </div>:null}
  </div>:null}
 </div>;
}
