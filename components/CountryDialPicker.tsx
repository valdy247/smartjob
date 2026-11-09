"use client";

import {useEffect,useMemo,useRef,useState,type KeyboardEvent} from "react";
import {Check,ChevronDown,Search,X} from "lucide-react";
import {DIAL_COUNTRIES,normalize,type DialCountry} from "@/lib/registration/options";

/** Flag image with emoji fallback. Native <select> elements show ISO letters on some platforms. */
function Flag({item}:{item:DialCountry}){
 const [failed,setFailed]=useState(false);
 return <span className="vmv-country-flag" aria-hidden="true">
  {failed?<span className="vmv-country-flag-fallback">{item.flag}</span>:
   <img src={`https://flagcdn.com/24x18/${item.country.toLowerCase()}.png`}
    width={24} height={18} loading="lazy" alt="" decoding="async"
    onError={()=>setFailed(true)}/>}
 </span>;
}
export function CountryDialPicker({value,onChange}:{value:string;onChange:(code:string)=>void}){
 const [opened,setOpened]=useState(false),[query,setQuery]=useState(""),[active,setActive]=useState(0);
 const dialog=useRef<HTMLDialogElement>(null),search=useRef<HTMLInputElement>(null),trigger=useRef<HTMLButtonElement>(null);
 const selected=DIAL_COUNTRIES.find(item=>item.country===value)||DIAL_COUNTRIES[0];
 const filtered=useMemo(()=>{
  const q=normalize(query).replace(/^\+/,"");
  if(!q)return DIAL_COUNTRIES;
  return DIAL_COUNTRIES.filter(item=>normalize(item.name).includes(q)||
   item.country.toLowerCase().includes(q)||
   item.code.replace("+","").startsWith(q));
 },[query]);
 useEffect(()=>{
  const node=dialog.current;if(!node)return;
  if(opened&&!node.open){node.showModal();search.current?.focus();}
  if(!opened&&node.open)node.close();
 },[opened]);
 useEffect(()=>{setActive(0);},[query]);
 const close=()=>{
  setOpened(false);setQuery("");setActive(0);trigger.current?.focus();
 };
 const choose=(item:DialCountry)=>{
  onChange(item.country);close();
 };
 const keyDown=(event:KeyboardEvent<HTMLInputElement>)=>{
  if(event.key==="ArrowDown"&&filtered.length){
   event.preventDefault();setActive(index=>(index+1)%filtered.length);
  }else if(event.key==="ArrowUp"&&filtered.length){
   event.preventDefault();setActive(index=>(index-1+filtered.length)%filtered.length);
  }else if(event.key==="Enter"&&filtered.length){
   event.preventDefault();choose(filtered[active]||filtered[0]);
  }else if(event.key==="Escape"){
   event.preventDefault();close();
  }
 };
 return <div className="vmv-country-picker">
  <button ref={trigger} type="button" className="vmv-country-trigger" aria-haspopup="dialog"
   aria-expanded={opened} aria-label={`Prefijo internacional, ${selected.name} ${selected.code}. Cambiar país`}
   onClick={()=>setOpened(true)}>
   <Flag item={selected}/><span className="vmv-country-dial">{selected.code}</span>
   <ChevronDown size={16} strokeWidth={2} aria-hidden="true"/>
  </button>
  <dialog ref={dialog} className="vmv-country-dialog"
   aria-label="Buscar país y prefijo internacional"
   onCancel={event=>{event.preventDefault();close();}}
   onClick={event=>{if(event.target===event.currentTarget)close();}}
   onClose={()=>setOpened(false)}>
   <div className="vmv-country-dialog-content">
    <header className="vmv-country-dialog-header">
     <div><strong>Selecciona tu país</strong><span>Busca por nombre, código o prefijo</span></div>
     <button type="button" className="vmv-country-close" onClick={close} aria-label="Cerrar">
      <X size={20}/></button>
    </header>
    <div className="vmv-country-search">
     <Search size={18} aria-hidden="true"/>
     <input ref={search} type="search" placeholder="México, Argentina, +54…" value={query}
      role="combobox" aria-autocomplete="list" aria-expanded={opened}
      aria-controls="vmv-country-results" aria-activedescendant={filtered.length?`vmv-country-${filtered[active]?.country}`:undefined}
      autoComplete="off" spellCheck={false}
      onChange={e=>setQuery(e.target.value)} onKeyDown={keyDown}/>
    </div>
    <div id="vmv-country-results" className="vmv-country-results" role="listbox" aria-label="Países">
     {filtered.length?filtered.map((item,index)=><button
      type="button" role="option" id={`vmv-country-${item.country}`} key={item.country}
      aria-selected={item.country===value}
      className={"vmv-country-option "+(index===active?"is-active":"")}
      onMouseEnter={()=>setActive(index)} onClick={()=>choose(item)}>
      <Flag item={item}/>
      <span className="vmv-country-fullname">{item.name}</span>
      <span className="vmv-country-prefix">{item.code}</span>
      {item.country===value&&<Check size={17} aria-label="Seleccionado"/>}
     </button>):<p className="vmv-country-no-results">No encontramos ese país o prefijo.</p>}
    </div>
   </div>
  </dialog>
 </div>;
}
