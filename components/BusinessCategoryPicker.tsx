"use client";
import {useEffect,useId,useRef,useState} from "react";
import {useInterfaceLanguage} from "@/lib/i18n-web";
import {marketingCategoryLabel,marketingGroupLabel} from "@/lib/marketing-taxonomy-i18n";
import {searchBusinessCategories} from "@/lib/business-category-search";
import styles from "./BusinessCategoryPicker.module.css";
export default function BusinessCategoryPicker({value,onChange}:{value:string;onChange:(value:string)=>void}){
 const {language,translate:t}=useInterfaceLanguage();
 const [open,setOpen]=useState(false),[query,setQuery]=useState(""),[active,setActive]=useState(-1);
 const id=useId();
 const menuRef=useRef<HTMLSpanElement>(null);
 useEffect(()=>{
  const menu=menuRef.current,option=menu?.children[active] as HTMLElement|undefined;
  if(!menu||!option)return;
  if(option.offsetTop<menu.scrollTop)menu.scrollTop=option.offsetTop;
  else if(option.offsetTop+option.offsetHeight>menu.scrollTop+menu.clientHeight)menu.scrollTop=option.offsetTop+option.offsetHeight-menu.clientHeight;
 },[active]);
 const results=searchBusinessCategories(query);
 const label=marketingCategoryLabel(language,value,"");
 const choose=(id:string)=>{onChange(id);setQuery("");setOpen(false);setActive(-1);};
 return <span className={styles.root}>
  <input aria-label={t("category.search")} role="combobox" aria-expanded={open} aria-controls={id} aria-autocomplete="list" aria-activedescendant={open&&active>=0&&results[active]?id+"-"+active:undefined}
   value={open?query:label} placeholder={t("category.search")} autoComplete="off" maxLength={100}
   onFocus={()=>{setOpen(true);setQuery("");setActive(-1);}} onBlur={()=>setOpen(false)}
   onChange={e=>{setQuery(e.target.value);setOpen(true);setActive(-1);}}
   onKeyDown={e=>{
    if(e.key==="Escape"){e.preventDefault();setOpen(false);setActive(-1);}
    if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();setOpen(true);setActive(previous=>Math.max(0,Math.min(results.length-1,previous+(e.key==="ArrowDown"?1:-1))));}
    if(e.key==="Enter"&&open){e.preventDefault();if(active>=0&&results[active])choose(results[active].id);}
   }}/>
  {open?<span className={styles.menu} ref={menuRef} id={id} role="listbox">
   {results.length?results.map((item,index)=><span role="option" id={id+"-"+index} key={item.id} aria-selected={active===index||value===item.id}
    className={active===index?styles.active:undefined} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(item.id)}>
    <strong>{marketingCategoryLabel(language,item.id)}</strong><small>{marketingGroupLabel(language,item.group)}</small>
   </span>):<span className={styles.empty}>{t("category.noResults")}<button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>choose("other")}>{marketingCategoryLabel(language,"other")}</button></span>}
  </span>:null}
 </span>;
}
