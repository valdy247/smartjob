"use client";
import {useEffect,useState} from "react";
import {ActionBar,createUsePuck,useGetPuck,type Data} from "@puckeditor/core";
import {ImagePlus,Settings2,SlidersHorizontal,Trash2,Type} from "lucide-react";
import BuilderImageField from "./BuilderImageField";
import {ColorField,FontField,RangeField} from "./BuilderContextFields";

const usePuck=createUsePuck();
import BuilderImageControls from "./BuilderImageControls";
import {IMAGE_SELECT_EVENT} from "./BuilderEditableImage";
import {SECTION_TARGET_EVENT,type SectionTarget} from "./BuilderSectionTargets";
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
 const [ctaSelection,setCtaSelection]=useState<{id:string;target:SectionTarget}|null>(null);
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
 useEffect(()=>{
  const onSelect=(event:Event)=>{
   const detail=(event as CustomEvent<{id:string;target:SectionTarget}>).detail;
   if(!detail||!detail.id||!["section","title","button"].includes(detail.target))return;
   setCtaSelection(detail);setOpen(true);
  };
  window.addEventListener(SECTION_TARGET_EVENT,onSelect);
  return()=>window.removeEventListener(SECTION_TARGET_EVENT,onSelect);
 },[]);
 const targets=item?imageTargets(item.type,item.props):[];
 const isImage=targets.length>0;
 const target=chosen?.id===id?targets.find(t=>t.field===chosen.target.field&&
  (chosen.target.itemId?t.itemId===chosen.target.itemId:t.index===chosen.target.index)):targets[0];
 const data=usePuck(s=>s.appState.data);
 const destinations=imageDestinations(data);
 function changeImage(patch:Record<string,unknown>){
  if(!id||!target)return;
  const api=getPuck();
  api.dispatch({type:"setData",data:patchBuilderImage(api.appState.data,id,target,patch)});
 }
 const isText=Boolean(item&&(textTypes.has(item.type)||item.type==="HeroVisual"));
 const isCta=item?.type==="CTA";
 const isButton=item?.type==="ComposeButton";
 const ctaTarget:SectionTarget=ctaSelection&&ctaSelection.id===id?ctaSelection.target:"section";
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
 function changeMultiple(values:Record<string,unknown>){
  if(!item||!id)return;
  const api=getPuck();
  const next=Object.entries(values).reduce((data,[key,value])=>patchItem(data,id,key,value),api.appState.data);
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
   {(isImage||isText||isCta||isButton)?<ActionBar.Group>
    <ActionBar.Action label={isCta?"Editar sección":isButton?"Editar botón":isImage?"Editar imagen":"Editar texto"} onClick={()=>setOpen(v=>!v)}>
     {isCta?<Settings2 size={16}/>:isButton?<SlidersHorizontal size={16}/>:isImage?<ImagePlus size={16}/>:<Type size={16}/>}
    </ActionBar.Action>
   </ActionBar.Group>:null}
  </ActionBar>
  {(isImage||isText||isCta||isButton)&&open?<div className="vmv-context-action-panel"
    role="region" aria-label={isButton?"Ajustes del botón seleccionado":isImage&&mode!=="text"?"Ajustes de la imagen seleccionada":"Ajustes del elemento seleccionado"}
    onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}>
   <header><strong>{isCta?"Editar "+(ctaTarget==="section"?"sección":ctaTarget==="title"?"título":"botón"):isButton?"Editar botón":isImage&&mode!=="text"?"Imagen seleccionada":"Texto seleccionado"}</strong>
    <button type="button" aria-label="Cerrar ajustes" onClick={()=>setOpen(false)}>✕</button>
   </header>
   {item?.type==="HeroVisual"?<div className="vmv-context-switch vmv-context-hero-tabs" role="group"
    aria-label="Elemento de portada">
    <button type="button" aria-pressed={mode!=="text"} onClick={()=>setMode("controls")}>Foto</button>
    <button type="button" aria-pressed={mode==="text"} onClick={()=>setMode("text")}>Título</button>
   </div>:null}
   {isImage&&target&&mode!=="text"?<div className="vmv-context-content">
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
   {isButton?<div className="vmv-context-content" aria-label="Editar el botón seleccionado">
    <label className="vmv-context-text-label">Texto
     <input type="text" maxLength={120} value={String(props.label||"")}
      onChange={e=>change("label",e.target.value)}/>
    </label>
    <label className="vmv-context-text-label">Destino
     <input type="text" maxLength={450} placeholder="#solicitud, teléfono o URL"
      value={String(props.url||"")} onChange={e=>change("url",e.target.value)}/>
    </label>
    <label className="vmv-context-text-label">Apariencia
     <select value={String(props.style||"solid")} onChange={e=>change("style",e.target.value)}>
      <option value="solid">Sólido</option><option value="outline">Contorno</option>
      <option value="link">Solo enlace</option>
     </select>
    </label>
    <label className="vmv-context-text-label">Alineación en móvil
     <select value={String(props.alignMobile||"left")} onChange={e=>change("alignMobile",e.target.value)}>
      <option value="left">Izquierda</option><option value="center">Centro</option><option value="right">Derecha</option>
     </select>
    </label>
   </div>:null}
   {isCta?<div className="vmv-context-content" aria-label="Controles de la sección seleccionada">
    <div className="vmv-context-switch" role="group" aria-label="Editar">
     {(["section","title","button"] as const).map(target=>
      <button key={target} type="button" aria-pressed={ctaTarget===target}
       onClick={()=>setCtaSelection({id,target})}>
       {target==="section"?"Fondo":target==="title"?"Título":"Botón"}
      </button>)}
    </div>
    {ctaTarget==="section"?<>
     <label className="vmv-context-text-label">Estilo de la sección
      <select value={String(props.sectionSurface||"dark")}
       onChange={e=>change("sectionSurface",e.target.value)}>
       <option value="dark">Oscuro</option><option value="light">Claro</option>
       <option value="soft">Suave</option><option value="accent">Marca</option>
       <option value="custom">Personalizado</option>
      </select>
     </label>
     <ColorField label="Color de fondo" value={props.sectionBackground}
      onChange={v=>changeMultiple({sectionBackground:v,sectionSurface:"custom"})}/>
     <ColorField label="Color general del texto" value={props.sectionTextColor}
      onChange={v=>change("sectionTextColor",v)} allowTransparent/>
     <RangeField label="Esquinas de la sección" min={0} max={48} unit="px"
      value={props.sectionRadius??0} onChange={v=>change("sectionRadius",v)}/>
     <label className="vmv-context-text-label">Espaciado
      <select value={String(props.sectionPadding||"normal")}
       onChange={e=>change("sectionPadding",e.target.value)}>
       <option value="compact">Compacto</option><option value="normal">Normal</option>
       <option value="spacious">Amplio</option>
      </select>
     </label>
     <label className="vmv-context-text-label">Alineación
      <select value={String(props.sectionAlign||"left")}
       onChange={e=>change("sectionAlign",e.target.value)}>
       <option value="left">Izquierda</option><option value="center">Centro</option>
       <option value="right">Derecha</option>
      </select>
     </label>
    </>:null}
    {ctaTarget==="title"?<>
     <label className="vmv-context-text-label">Título
      <textarea value={String(props.title||"")} rows={2} maxLength={180}
       onChange={e=>change("title",e.target.value)}/>
     </label>
     <label className="vmv-context-text-label">Descripción
      <textarea value={String(props.description||"")} rows={2} maxLength={900}
       onChange={e=>change("description",e.target.value)}/>
     </label>
     <FontField value={props.titleFont||"site"}
      onChange={v=>change("titleFont",v)}/>
     <RangeField label="Tamaño del título" min={0} max={110} unit="px"
      value={props.titleFontSize??0} onChange={v=>change("titleFontSize",v)}/>
     <ColorField label="Color del título" value={props.titleColor}
      onChange={v=>change("titleColor",v)} allowTransparent/>
     <label className="vmv-context-text-label">Sombra
      <select value={String(props.titleShadow||"none")}
       onChange={e=>change("titleShadow",e.target.value)}>
       <option value="none">Sin sombra</option><option value="soft">Suave</option>
       <option value="strong">Marcada</option>
      </select>
     </label>
    </>:null}
    {ctaTarget==="button"?<>
     <label className="vmv-context-text-label">Texto del botón
      <input type="text" maxLength={120} value={String(props.buttonText||"")}
       onChange={e=>change("buttonText",e.target.value)}/>
     </label>
     <label className="vmv-context-text-label">Enlace
      <input type="text" maxLength={500} placeholder="#contacto o https://..."
       value={String(props.buttonUrl||"")} onChange={e=>change("buttonUrl",e.target.value)}/>
     </label>
     <label className="vmv-context-text-label">Estilo del botón
      <select value={String(props.buttonStyle||"solid")}
       onChange={e=>change("buttonStyle",e.target.value)}>
       <option value="solid">Sólido</option><option value="outline">Contorno</option>
       <option value="link">Solo enlace</option>
      </select>
     </label>
     <label className="vmv-context-text-label">Forma
      <select value={String(props.buttonShape||"pill")}
       onChange={e=>change("buttonShape",e.target.value)}>
       <option value="pill">Píldora</option><option value="rounded">Redondeado</option>
       <option value="square">Recto</option>
      </select>
     </label>
     <RangeField label="Redondeo" min={0} max={64} unit="px"
      value={props.buttonRadius??0} onChange={v=>change("buttonRadius",v)}/>
     <RangeField label="Tamaño del texto" min={11} max={26} unit="px"
      value={props.buttonFontSize??13} onChange={v=>change("buttonFontSize",v)}/>
     <ColorField label="Color del botón" value={props.buttonColor}
      onChange={v=>change("buttonColor",v)}/>
     <ColorField label="Color del texto" value={props.buttonTextColor}
      onChange={v=>change("buttonTextColor",v)}/>
     <ColorField label="Color del borde" value={props.buttonBorderColor}
      onChange={v=>change("buttonBorderColor",v)}/>
     <RangeField label="Grosor del borde" min={0} max={10} unit="px"
      value={props.buttonBorderWidth??0} onChange={v=>change("buttonBorderWidth",v)}/>
    </>:null}
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
