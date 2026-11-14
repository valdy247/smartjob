"use client";
import {useEffect,useRef,useState,type PointerEvent,type ReactNode} from "react";
import {createUsePuck,useGetPuck,type Data} from "@puckeditor/core";
import {Move} from "lucide-react";

function moveProps(data:Data,id:string,x:number,y:number,xKey:string,yKey:string):Data{
 let found=false;
 const walk=(rows:Data["content"]):Data["content"]=>rows.map(node=>{
  const props=node.props as Record<string,unknown>;
  let next=props;
  if(props.id===id){
   found=true;
   next={...props,[xKey]:x,[yKey]:y};
  }
  for(const slot of ["content","left","right","third"]){
   if(Array.isArray(next[slot]))next={...next,[slot]:walk(next[slot] as Data["content"])};
  }
  return next===props?node:{...node,props:next};
 });
 const content=walk(data.content);
 return found?{...data,content}:data;
}
const clamp=(n:number)=>Math.max(-150,Math.min(150,Math.round(n)));
function EditorMoveHandle({id,x,y,xKey,yKey,onPreview}:{
 id:string;x:number;y:number;xKey:string;yKey:string;
 onPreview:(value:{x:number;y:number})=>void;
}){
 const getPuck=useGetPuck();
 const point=useRef<{pointer:number;startX:number;startY:number;x:number;y:number}|null>(null);
 function onDown(event:PointerEvent<HTMLButtonElement>){
  if(event.button!==0)return;
  event.preventDefault();event.stopPropagation();
  point.current={pointer:event.pointerId,startX:event.clientX,startY:event.clientY,x,y};
  event.currentTarget.setPointerCapture(event.pointerId);
 }
 function onMove(event:PointerEvent<HTMLButtonElement>){
  const active=point.current;
  if(!active||active.pointer!==event.pointerId)return;
  event.preventDefault();event.stopPropagation();
  onPreview({x:clamp(active.x+event.clientX-active.startX),
   y:clamp(active.y+event.clientY-active.startY)});
 }
 function end(event:PointerEvent<HTMLButtonElement>){
  const active=point.current;
  if(!active||active.pointer!==event.pointerId)return;
  event.preventDefault();event.stopPropagation();
  point.current=null;
  const nextX=clamp(active.x+event.clientX-active.startX);
  const nextY=clamp(active.y+event.clientY-active.startY);
  if(nextX===x&&nextY===y)return;
  const api=getPuck();
  const next=moveProps(api.appState.data,id,nextX,nextY,xKey,yKey);
  if(next!==api.appState.data)api.dispatch({type:"setData",data:next});
 }
 return <button type="button" className="vmv-move-handle" aria-label="Arrastrar dentro de esta composición"
  title="Arrastra para ajustar posición dentro de la sección; usa el control de Puck para mover entre columnas"
  onPointerDown={onDown} onPointerMove={onMove} onPointerUp={end}
  onPointerCancel={()=>{point.current=null;onPreview({x,y});}}>
  <Move size={15} aria-hidden="true"/> <span>Mover</span>
 </button>;
}
export function MovableContent({id,x=0,y=0,editing=false,xKey,yKey,className="",style,children}:{
 id:string;x?:number;y?:number;editing?:boolean;xKey:string;yKey:string;
 className?:string;style?:React.CSSProperties;children:ReactNode;
}){
 const [at,setAt]=useState({x,y});
 useEffect(()=>setAt({x,y}),[x,y]);
 return <div className={"vmv-compose-movable "+className} style={{...style,
  transform:"translate("+at.x+"px, "+at.y+"px)"}}>
  {editing?<EditorMoveHandle id={id} x={at.x} y={at.y} xKey={xKey} yKey={yKey}
   onPreview={setAt}/>:null}
  {children}
 </div>;
}
