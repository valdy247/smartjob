"use client";
import {useEffect,useRef,useState,type PointerEvent,type KeyboardEvent} from "react";
import {useGetPuck} from "@puckeditor/core";
import {ImagePlus,Move} from "lucide-react";
import {imageSettingsStyle,normalizeImageSettings,patchBuilderImage,type ImageTarget} from "@/lib/web-builder-images";
import {safeWebImageUrl} from "@/lib/web-services-site";

export const IMAGE_SELECT_EVENT="vmv-builder-image-select";
function sameTarget(a:ImageTarget,b:ImageTarget){
 return a.field===b.field&&(a.itemId&&b.itemId?a.itemId===b.itemId:a.index===b.index);
}
function broadcastImageSelection(id:string,target:ImageTarget,openLibrary=false){
 const detail={id,target,openLibrary};
 window.dispatchEvent(new CustomEvent(IMAGE_SELECT_EVENT,{detail}));
 // Puck's canvas lives inside an iframe: its contextual inspector lives in the shell.
 try{
  if(window.parent!==window)window.parent.dispatchEvent(new CustomEvent(IMAGE_SELECT_EVENT,{detail}));
 }catch{/* Detached or restricted preview. */}
}
// Keep the media itself interactive instead of relying on Puck's detached action bar.
// A placeholder opens the shared library on the first tap, even for array items.
function EditableMedia({id,target,url,alt}:{id:string;target:ImageTarget;url:string|null;alt:string}){
 const getPuck=useGetPuck();
 function select(){
  const api=getPuck();
  const selector=api.getSelectorForId(id);
  if(selector)api.dispatch({type:"setUi",ui:{itemSelector:selector}});
  // Puck recreates its srcdoc iframe when a block becomes selected, which
  // cancels requestAnimationFrame callbacks registered in the old canvas.
  // Schedule on the *host* window so the new action bar can receive the
  // picker request on the first tap. Keep all messages same-origin/local.
  const host=window.parent!==window?window.parent:window;
  const detail={id,target,openLibrary:!url};
  const notify=()=>{
   try{
    host.dispatchEvent(new CustomEvent(IMAGE_SELECT_EVENT,{detail}));
    if(host!==window)for(const frame of Array.from(host.document.querySelectorAll("iframe"))){
     try{frame.contentWindow?.dispatchEvent(new CustomEvent(IMAGE_SELECT_EVENT,{detail}));}
     catch{/* Ignore unrelated/cross-origin iframes. */}
    }
   }catch{/* A disconnected canvas must not break the editor. */}
  };
  const hasPicker=()=>{
   const found=(doc:Document)=>Boolean(doc.querySelector('[role="dialog"][aria-label="Seleccionar imagen"]'));
   try{
    if(found(host.document))return true;
    for(const frame of Array.from(host.document.querySelectorAll("iframe"))){
     try{if(frame.contentDocument&&found(frame.contentDocument))return true;}
     catch{/* Other frame */}
    }
   }catch{/* Detached canvas */}
   return false;
  };
  notify();
  let attempts=0;
  const retry=()=>{
   if(!url&&hasPicker())return;
   notify();
   if(!url&&++attempts<16)host.setTimeout(retry,140);
  };
  host.setTimeout(retry,150);
 }
 return url?<img src={url} alt={alt} loading="lazy" onPointerDown={e=>{e.stopPropagation();select();}} role="button"
  tabIndex={0} aria-label={"Editar imagen: "+(alt||"Foto")}
  onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();select();}}}/>:
  <button type="button" className="vmv-media-empty vmv-media-empty-pick"
   aria-label="Agregar fotografía: elegir imagen"
   onPointerDown={e=>{e.stopPropagation();select();}}
   onClick={e=>{e.stopPropagation();if(e.detail===0)select();}}>
   <span aria-hidden="true">▧</span><small>Agregar fotografía</small>
  </button>;
}
function ImageActions({id,target,label,settings,onPreview}:{id:string;target:ImageTarget;label:string;
 settings:Record<string,unknown>;onPreview:(patch:Record<string,unknown>)=>void}){
 const getPuck=useGetPuck();
 const [selected,setSelected]=useState(false);
 useEffect(()=>{
  const onImage=(event:Event)=>{
   const detail=(event as CustomEvent<{id:string;target:ImageTarget}>).detail;
   setSelected(Boolean(detail&&detail.id===id&&sameTarget(detail.target,target)));
  };
  const onSection=()=>setSelected(false);
  window.addEventListener(IMAGE_SELECT_EVENT,onImage);
  window.addEventListener("vmv-builder-target-selected",onSection);
  return()=>{
   window.removeEventListener(IMAGE_SELECT_EVENT,onImage);
   window.removeEventListener("vmv-builder-target-selected",onSection);
  };
 },[id,target.field,target.index,target.itemId]);
 const active=useRef<null|{pointer:number;startX:number;startY:number;x:number;y:number;
  minX:number;maxX:number;minY:number;maxY:number;scale:number;mobile:boolean;guides:number[]}>(null);
 function select(){
  const api=getPuck(),selector=api.getSelectorForId(id);
  if(selector)api.dispatch({type:"setUi",ui:{itemSelector:selector}});
  // Relay selection to the outer editor; never rely on iframe-local events only.
  requestAnimationFrame(()=>broadcastImageSelection(id,target));
 }
 function measure(button:HTMLButtonElement){
  const frame=button.closest<HTMLElement>(".vmv-managed-image");
  if(!frame)return null;
  const parent=frame.parentElement?.closest<HTMLElement>(".vmv-compose-section,.vmv-visual-section,.vmv-hero-visual")||frame.parentElement;
  if(!parent)return null;
  const site=frame.closest<HTMLElement>(".vmv-site");
  const mobile=(site?.clientWidth||frame.ownerDocument.documentElement.clientWidth)<=700;
  const suffix=mobile?"Mobile":"";
  const p=normalizeImageSettings(settings),x=Number(p["imageMoveX"+suffix]),y=Number(p["imageMoveY"+suffix]);
  const rect=frame.getBoundingClientRect(),box=parent.getBoundingClientRect();
  const scale=frame.offsetWidth?rect.width/frame.offsetWidth:1;
  const baseX=rect.left-x*scale,baseY=rect.top-y*scale;
  const minX=(box.left-baseX)/scale,maxX=(box.right-rect.width-baseX)/scale;
  const minY=(box.top-baseY)/scale,maxY=(box.bottom-rect.height-baseY)/scale;
  return {x,y,scale,mobile,minX,maxX:Math.max(minX,maxX),minY,maxY:Math.max(minY,maxY),
   guides:[minX,(minX+maxX)/2,maxX]};
 }
 function nextAt(point:NonNullable<typeof active.current>,dx:number,dy:number){
  let x=Math.round(Math.max(point.minX,Math.min(point.maxX,point.x+dx/point.scale)));
  const guide=point.guides.find(g=>Math.abs(g-x)<7);
  if(guide!==undefined)x=Math.round(guide);
  const y=Math.round(Math.max(point.minY,Math.min(point.maxY,point.y+dy/point.scale)));
  const suffix=point.mobile?"Mobile":"";
  return {["imageMoveX"+suffix]:x,["imageMoveY"+suffix]:y};
 }
 function commit(patch:Record<string,unknown>){
  const api=getPuck();
  api.dispatch({type:"setData",data:patchBuilderImage(api.appState.data,id,target,patch)});
  onPreview({});
 }
 function down(event:PointerEvent<HTMLButtonElement>){
  if(event.button!==0)return;
  event.preventDefault();event.stopPropagation();select();
  const measured=measure(event.currentTarget);if(!measured)return;
  active.current={...measured,pointer:event.pointerId,startX:event.clientX,startY:event.clientY};
  event.currentTarget.setPointerCapture(event.pointerId);
  event.currentTarget.closest(".vmv-managed-image")?.setAttribute("data-moving","true");
 }
 function move(event:PointerEvent<HTMLButtonElement>){
  const point=active.current;if(!point||point.pointer!==event.pointerId)return;
  event.preventDefault();event.stopPropagation();
  onPreview(nextAt(point,event.clientX-point.startX,event.clientY-point.startY));
 }
 function end(event:PointerEvent<HTMLButtonElement>,cancel=false){
  const point=active.current;if(!point||point.pointer!==event.pointerId)return;
  event.preventDefault();event.stopPropagation();active.current=null;
  event.currentTarget.closest(".vmv-managed-image")?.removeAttribute("data-moving");
  if(cancel){onPreview({});return;}
  const patch=nextAt(point,event.clientX-point.startX,event.clientY-point.startY);
  if(event.clientX!==point.startX||event.clientY!==point.startY)commit(patch);
 }
 function keyboard(event:KeyboardEvent<HTMLButtonElement>){
  const delta:Record<string,number[]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
  if(event.key==="Escape"){active.current=null;event.currentTarget.closest(".vmv-managed-image")?.removeAttribute("data-moving");onPreview({});return;}
  if(!delta[event.key])return;
  event.preventDefault();event.stopPropagation();
  const point=measure(event.currentTarget);if(!point)return;
  const step=event.shiftKey?10:1;
  // Arrow keys provide precise movement without pointer snapping.
  commit(nextAt({...point,pointer:0,startX:0,startY:0,guides:[]},delta[event.key][0]*step*point.scale,delta[event.key][1]*step*point.scale));
 }
 return <div className="vmv-image-tools" data-active={selected} onClick={e=>e.stopPropagation()}>
  <button type="button" className="vmv-image-edit" aria-label={"Editar imagen: "+label}
   onPointerDown={e=>e.stopPropagation()} onClick={select}><ImagePlus size={15}/> Ajustar</button>
  <button type="button" className="vmv-image-move" aria-label={"Mover imagen: "+label}
   title="Arrastra dentro de la sección o usa las flechas. Mayús: 10 píxeles."
   onPointerDown={down} onPointerMove={move} onPointerUp={e=>end(e)} onPointerCancel={e=>end(e,true)}
   onKeyDown={keyboard}><Move size={15}/> Mover</button>
 </div>;
}
/** The same frame is rendered in the editor, preview and published snapshot. */
export default function BuilderEditableImage({id,target={field:"image"},src,alt,settings={},editing=false,
 className="",radius=16,position="center",ratio}:{id:string;target?:ImageTarget;src:unknown;alt:string;
 settings?:Record<string,unknown>;editing?:boolean;className?:string;radius?:number;position?:string;ratio?:string}){
 const [preview,setPreview]=useState<Record<string,unknown>>({});
 const stamp=JSON.stringify(settings);
 useEffect(()=>setPreview({}),[stamp]);
 const url=typeof src==="string"?safeWebImageUrl(src):null;
 if(!url&&!editing)return null;
 return <div className={"vmv-managed-image vmv-visual-media "+className}
  data-editing={editing} data-ratio={ratio}
  style={{...imageSettingsStyle({...settings,...preview},radius),
   "--vmv-image-position":["top","bottom","left","right"].includes(position)?position:"center"} as React.CSSProperties}>
  {editing?<EditableMedia id={id} target={target} url={url} alt={alt}/>:
   url?<img src={url} alt={alt} loading="lazy"/>:null}
  {editing?<ImageActions id={id} target={target} label={alt||"Imagen"} settings={{...settings,...preview}}
   onPreview={setPreview}/>:null}
 </div>;
}
