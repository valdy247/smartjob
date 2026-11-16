"use client";

import {useEffect,useId,useRef,useState,type KeyboardEvent as ReactKeyboardEvent,type ReactNode} from "react";
import {Check,ChevronDown} from "lucide-react";
import styles from "./WebSiteIntake.module.css";

type Choice={id:string;label:string};
type Props={
 label:string;showLabel?:boolean;value:string;options:Choice[];
 icon:ReactNode;onChange:(next:string)=>void;
};

/** Custom, accessible inline dropdown. Unlike a native <select>, iOS doesn't
 * replace these options with its oversized system popup. Items expand below
 * the lavender card and never obscure the other form controls. */
export default function InlinePastelSelect({
 label,showLabel=false,value,options,icon,onChange
}:Props){
 const [expanded,setExpanded]=useState(false);
 const controlId=useId();
 const root=useRef<HTMLDivElement>(null);
 const trigger=useRef<HTMLButtonElement>(null);
 const selected=options.find(option=>option.id===value);

 useEffect(()=>{
  if(!expanded)return;
  const outside=(event:PointerEvent)=>{
   if(event.target instanceof Node&&!root.current?.contains(event.target))
    setExpanded(false);
  };
  const escape=(event:KeyboardEvent)=>{
   if(event.key==="Escape"){setExpanded(false);trigger.current?.focus();}
  };
  document.addEventListener("pointerdown",outside);
  document.addEventListener("keydown",escape);
  return()=>{
   document.removeEventListener("pointerdown",outside);
   document.removeEventListener("keydown",escape);
  };
 },[expanded]);

 function choose(id:string){
  onChange(id);
  setExpanded(false);
  trigger.current?.focus();
 }
 function listKeys(event:ReactKeyboardEvent<HTMLDivElement>){
  if(!["ArrowDown","ArrowUp","Home","End"].includes(event.key))return;
  const buttons=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
  if(!buttons.length)return;
  event.preventDefault();
  const index=buttons.indexOf(document.activeElement as HTMLButtonElement);
  const next=event.key==="Home"?0:
   event.key==="End"?buttons.length-1:
   event.key==="ArrowDown"?(index+1)%buttons.length:
   (index-1+buttons.length)%buttons.length;
  buttons[next]?.focus();
 }
 return <div ref={root} className={styles.compactSelectField}
  onBlur={event=>{
   if(!event.currentTarget.contains(event.relatedTarget as Node|null))setExpanded(false);
  }}>
  {showLabel?<label id={controlId+"-label"}>{label}</label>:null}
  <button ref={trigger} type="button" className={styles.compactPicker}
   aria-label={label} aria-expanded={expanded}
   aria-controls={expanded?controlId+"-options":undefined}
   onClick={()=>setExpanded(was=>!was)}>
   <span className={styles.compactIcon} aria-hidden="true">{icon}</span>
   <span className={styles.compactPickerValue}>{selected?.label||"Seleccionar"}</span>
   <ChevronDown className={styles.compactChevron} size={23} strokeWidth={2.4}
    aria-hidden="true" data-open={expanded}/>
  </button>
  {expanded?<div id={controlId+"-options"} className={styles.compactDropdownList}
   role="group" aria-label={"Opciones de "+label} onKeyDown={listKeys}>
   {options.map(option=><button type="button" key={option.id}
    className={styles.compactDropdownOption} aria-pressed={option.id===value}
    onClick={()=>choose(option.id)}>
    <span>{option.label}</span>
    {option.id===value?<span className={styles.compactDropdownSelected} aria-hidden="true">
     <Check size={17} strokeWidth={2.7}/>
    </span>:null}
   </button>)}
  </div>:null}
 </div>;
}
