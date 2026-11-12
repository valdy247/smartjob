"use client";
import {useState} from "react";
import {useInterfaceLanguage} from "@/lib/i18n-web";
export function InterfaceLanguagePicker({compact=false}:{compact?:boolean}) {
  const {language,saving,changeLanguage,translate}=useInterfaceLanguage();
  const [error,setError]=useState(false);
  return <div style={compact?{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}:{display:"grid",gap:8,padding:"14px 0"}}>
    <label htmlFor={compact?"vmv-interface-language-compact":"vmv-interface-language"} className="label">{translate("common.language")}</label>
    <select className="field" id={compact?"vmv-interface-language-compact":"vmv-interface-language"}
      aria-label={translate("common.language")} style={{width:compact?136:"100%",maxWidth:280}}
      value={language} disabled={saving}
      onChange={event=>{setError(false);void changeLanguage(event.target.value as "es"|"en").catch(()=>setError(true));}}>
      <option value="es">Español</option><option value="en">English</option>
    </select>
    {!compact?<small className="muted">{translate("common.languageHint")}</small>:null}
    {error?<small role="alert" style={{color:"#b42318"}}>{translate("common.saveError")}</small>:null}
  </div>;
}
