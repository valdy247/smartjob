"use client";
import {useState} from "react";
import {useInterfaceLanguage} from "@/lib/i18n-web";

function FlagIcon({language}:{language:"es"|"en"}){
 return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 16" width="22" height="15"
  focusable="false" aria-hidden="true" style={{display:"block",borderRadius:2,boxShadow:"0 0 0 1px #00000012"}}>
  {language==="es"?<>
   <rect x="0" y="0" width="24" height="16" fill="#AA151B"/>
   <rect x="0" y="4" width="24" height="8" fill="#F1BF00"/>
   <rect x="7" y="7" width="2" height="4" rx=".5" fill="#AA151B"/>
  </>:<>
   <rect x="0" y="0" width="24" height="16" fill="#FFFFFF"/>
   {[0,2.5,5,7.5,10,12.5,15].map(y=><rect key={y} x="0" y={y} width="24" height="1.35" fill="#B22234"/>)}
   <rect x="0" y="0" width="10" height="8.7" fill="#3C3B6E"/>
   {[1.5,3.8,6.1].map(y=>[1.7,4.4,7.1].map(x=><circle key={y+"-"+x} cx={x} cy={y} r=".6" fill="#FFFFFF"/>))}
  </>}
 </svg>;
}

/** Single shared VMV language preference, never a separate site-content language. */
export function InterfaceLanguagePicker({compact=false}:{compact?:boolean}){
 const {language,saving,changeLanguage,translate}=useInterfaceLanguage();
 const [error,setError]=useState(false);
 const choose=(next:"es"|"en")=>{
  if(next===language||saving)return;
  setError(false);
  void changeLanguage(next).catch(()=>setError(true));
 };
 const ariaLabel=translate("common.language");
 return <div style={{display:"inline-flex",flexDirection:"column",alignItems:"flex-start",
  gap:compact?0:8,position:"relative",minWidth:0}}>
  {!compact?<span id="vmv-interface-language-label" className="label">{ariaLabel}</span>:null}
  <div role="radiogroup" aria-label={ariaLabel} aria-busy={saving}
   style={{display:"inline-flex",gap:2,padding:compact?2:4,alignItems:"center",
    background:"#eef7f3",border:"1px solid #bcded0",borderRadius:999,flexShrink:0}}>
   {(["es","en"] as const).map(code=><button key={code} type="button" role="radio"
     aria-checked={language===code} aria-label={code==="es"?"Español":"English"}
     title={code==="es"?"Español":"English"} disabled={saving} onClick={()=>choose(code)}
     style={{display:"inline-flex",alignItems:"center",justifyContent:"center",
      width:compact?29:45,height:compact?27:39,padding:0,minWidth:0,minHeight:0,
      borderRadius:999,cursor:saving?"wait":"pointer",
      border:language===code?"1.5px solid #079a7c":"1.5px solid transparent",
      background:language===code?"#fff":"transparent",
      boxShadow:language===code?"0 1px 4px #12372e24":"none",
      opacity:saving?0.6:1,transition:"background .15s,border-color .15s"}}>
     <FlagIcon language={code}/>
    </button>)}
  </div>
  {!compact?<small className="muted">{translate("common.languageHint")}</small>:null}
  {error?<small role="alert" style={{color:"#b42318",
   ...(compact?{position:"absolute" as const,top:"100%",right:0,zIndex:5,
    background:"white",width:180,border:"1px solid #ead2d2",borderRadius:8,padding:7,boxShadow:"0 3px 12px #0001"}:{})}}>
   {translate("common.saveError")}</small>:null}
 </div>;
}
