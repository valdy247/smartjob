"use client";
import {useEffect,useState} from "react";
import {CountryDialPicker} from "./CountryDialPicker";
import {DIAL_COUNTRIES} from "@/lib/registration/options";
import {splitContactPhone,contactPhoneE164} from "@/lib/contact-phone";
import styles from "./BusinessPhoneInput.module.css";

export default function BusinessPhoneInput({value,onChange,country="US",label}:{value:string;onChange:(value:string)=>void;country?:string;label:string}){
 const [selected,setSelected]=useState(()=>value.trim().startsWith("+")?splitContactPhone(value).country:
  DIAL_COUNTRIES.find(c=>c.country===country.toUpperCase()||c.name.toLowerCase()===country.toLowerCase())?.country||"US");
 const dial=DIAL_COUNTRIES.find(c=>c.country===selected)?.code||"+1";
 useEffect(()=>{if(value.trim()===dial)onChange("");},[value,dial,onChange]);
 const national=value.startsWith(dial)?value.slice(dial.length):value;
 const update=(input:string,next=selected)=>{
  const digits=input.replace(/\D/g,"");
  if(!digits){onChange("");return;}
  if(input.trim().startsWith("+")){
   const parts=splitContactPhone(input);setSelected(parts.country);
   onChange("+"+digits);return;
  }
  const prefix=DIAL_COUNTRIES.find(c=>c.country===next)?.code||"+1";
  onChange(contactPhoneE164(input,next)||prefix+digits);
 };
 return <span className={styles.field}>
  <CountryDialPicker value={selected} onChange={next=>{setSelected(next);update(national,next);}}/>
  <input type="tel" inputMode="tel" autoComplete="tel-national" aria-label={label} value={national} maxLength={24} onChange={e=>update(e.target.value)}/>
 </span>;
}
