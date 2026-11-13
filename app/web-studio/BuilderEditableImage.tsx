"use client";
import {useEffect,useRef,useState,type PointerEvent,type KeyboardEvent} from "react";
import {useGetPuck} from "@puckeditor/core";
import {ImagePlus,Move} from "lucide-react";
import {imageSettingsStyle,normalizeImageSettings,patchBuilderImage,type ImageTarget} from "@/lib/web-builder-images";
import {safeWebImageUrl} from "@/lib/web-services-site";

export const IMAGE_SELECT_EVENT="vmv-builder-image-select";
function ImageActions({id,target,label,settings,onPreview}:{id:string;target:ImageTarget;label:string;
 settings:Record<string,unknown>;onPreview:(patch:Record<string,unknown>)=>void}){
 const getPuck=useGetPuck();
 const active=useRef<null|{pointer:number;startX:number;startY:number;x:number;y:number;
  minX:number;maxX:number;minY:number;maxY:number;scale:number;mobile:boolean;guides:number[]}>(null);
 function select(){
  const api=getPuck(),selector=api.getSelectorForId(id);
  if(selector)api.dispatch({type:"setUi",ui:{itemSelector:selector}});
  // Puck may mount a new action bar after selecting another block.
  requestAnimationFrame(()=>window.dispatchEvent(new CustomEvent(IMAGE_SELECT_EVENT,{detail:{id,target}})));
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
 return <div className="vmv-image-tools" onClick={e=>e.stopPropagation()}>
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
  data-ratio={ratio} style={{...imageSettingsStyle({...settings,...preview},radius),
   "--vmv-image-position":["top","bottom","left","right"].includes(position)?position:"center"} as React.CSSProperties}>
  {url?<img src={url} alt={alt} loading="lazy"/>:<div className="vmv-media-empty"><span aria-hidden="true">▧</span><small>Agregar fotografía</small></div>}
  {editing?<ImageActions id={id} target={target} label={alt||"Imagen"} settings={{...settings,...preview}}
   onPreview={setPreview}/>:null}
 </div>;
}
