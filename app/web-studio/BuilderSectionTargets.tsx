"use client";
import {type MouseEvent,type ReactNode,type HTMLAttributes} from "react";
export const SECTION_TARGET_EVENT="vmv-builder-target-selected";
export type SectionTarget="section"|"button"|"title";
export function BuilderSectionTargets({id,editing,children,className="",style,kind="section",...other}:{
 id:string;editing:boolean;children:ReactNode;className?:string;style?:React.CSSProperties;kind?:string
} & Omit<HTMLAttributes<HTMLElement>,"onClick"|"onClickCapture"|"children">){
 function choose(event:MouseEvent<HTMLElement>){
  if(!editing)return;
  const el=event.target instanceof Element?event.target:null;
  const target=el?.closest("[data-vmv-edit-target]")?.getAttribute("data-vmv-edit-target");
  // Never take a nested image's selection away from the image editor.
  if(el?.closest(".vmv-managed-image"))return;
  const selected:SectionTarget=target==="button"?"button":target==="title"?"title":"section";
  if(el?.closest("a"))event.preventDefault();
  // Let Puck select the owning block first; then select the requested controls.
  requestAnimationFrame(()=>window.dispatchEvent(new CustomEvent(SECTION_TARGET_EVENT,{
   detail:{id,target:selected}
  })));
 }
 return <section {...other} className={className} data-vmv-section-kind={kind}
  style={style} onClickCapture={choose}>{children}</section>;
}
