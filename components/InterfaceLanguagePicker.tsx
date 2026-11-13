"use client";
import {useState} from "react";
import {useInterfaceLanguage} from "@/lib/i18n-web";

/** A two-position language switch; labels stay accessible to screen readers. */
export function InterfaceLanguagePicker({compact=false}:{compact?:boolean}) {
 const {language,saving,changeLanguage,translate}=useInterfaceLanguage();
 const [error,setError]=useState(false);
 const choose=(next:"es"|"en")=>{
  if(next===language||saving)return;
  setError(false);
  void changeLanguage(next).catch(()=>setError(true));
 };
 return <div style={{display:"grid",gap:compact?5:10,padding:compact?0:"14px 0"}}>
  <div className="label" id={compact?"vmv-language-label-compact":"vmv-language-label"}>{translate("common.language")}</div>
  <div role="group" aria-labelledby={compact?"vmv-language-label-compact":"vmv-language-label"}
   aria-busy={saving} style={{display:"inline-flex",alignItems:"center",gap:3,padding:4,
    width:"fit-content",border:"1px solid #d9d5e9",borderRadius:999,background:"#f3f0fa"}}>
   {([{code:"es",flag:"🇪🇸",name:"Español"},{code:"en",flag:"🇺🇸",name:"English"}] as const).map(item=>
    <button key={item.code} type="button" role="radio" aria-checked={language===item.code}
     aria-label={item.name} title={item.name} disabled={saving}
     onClick={()=>choose(item.code)}
     style={{display:"inline-flex",alignItems:"center",justifyContent:"center",
      width:compact?45:60,height:compact?38:44,borderRadius:999,cursor:saving?"wait":"pointer",
      fontSize:compact?24:29,lineHeight:1,border:language===item.code?"2px solid #7253d8":"2px solid transparent",
      background:language===item.code?"#fff":"transparent",
      boxShadow:language===item.code?"0 2px 8px #3d2a7826":"none",
      opacity:saving?.65:1,transition:"background .18s,border-color .18s,box-shadow .18s"}}>
     <span aria-hidden="true">{item.flag}</span>
    </button>)}
  </div>
  {!compact?<small className="muted">{translate("common.languageHint")}</small>:null}
  {error?<small role="alert" style={{color:"#b42318"}}>{translate("common.saveError")}</small>:null}
 </div>;
}
