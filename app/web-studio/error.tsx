"use client";

import {useEffect,useState} from "react";

// This screen must not depend on Puck or the language provider: either may be
// the reason the workspace could not render. Never clear saved drafts here.
export default function WebStudioError({error,reset}:{error:Error & {digest?:string};reset:()=>void}){
 const [english,setEnglish]=useState(false);
 const [diagnostic,setDiagnostic]=useState("");
 useEffect(()=>{
  setEnglish(document.documentElement.lang.toLowerCase().startsWith("en"));
  if(!window.location.hostname.endsWith(".vercel.app"))return;
  const code=error?.name||"ClientError";
  const message=(error?.message||"Sin detalles").replace(/https?:\/\/\S+/g,"[URL]").replace(/[a-f0-9]{8}-[a-f0-9-]{27,}/gi,"[id]").slice(0,350);
  setDiagnostic(code+": "+message+(error?.digest?" · "+error.digest:""));
 },[error]);
 return <main style={{minHeight:"100dvh",background:"#faf7ff",padding:"48px 20px",fontFamily:"system-ui",color:"#30233e"}}>
  <section aria-labelledby="studio-recovery-title" style={{maxWidth:480,margin:"0 auto",padding:28,borderRadius:24,background:"white",border:"1px solid #e9ddf7"}}>
   <p style={{color:"#7650b0",fontWeight:700}}>VMV Web Studio</p>
   <h1 id="studio-recovery-title" style={{fontSize:25,lineHeight:1.2}}>{english?"We couldn’t open the editor":"No pudimos abrir el editor"}</h1>
   <p style={{lineHeight:1.6}}>{english?"Try again. If this preview was recently updated, reload to get the latest version.":"Intenta de nuevo. Si este preview se actualizó recientemente, recarga para obtener la versión más reciente."}</p>
   <div style={{display:"flex",flexWrap:"wrap",gap:12,marginTop:24}}>
    <button type="button" onClick={reset} style={{minHeight:44,padding:"10px 18px",borderRadius:12,border:0,background:"#8154cc",color:"white",font:"inherit",cursor:"pointer"}}>{english?"Try again":"Reintentar"}</button>
    <button type="button" onClick={()=>window.location.reload()} style={{minHeight:44,padding:"10px 18px",borderRadius:12,border:"1px solid #d9c7ed",background:"#f5efff",color:"#503374",font:"inherit",cursor:"pointer"}}>{english?"Reload":"Recargar"}</button>
   </div>
   <div style={{display:"flex",gap:12,flexWrap:"wrap",marginTop:14}}>
    <a href="/web-studio?mode=templates" style={{display:"inline-flex",alignItems:"center",minHeight:40,color:"#65439b"}}>{english?"Open templates":"Abrir plantillas"}</a>
    <a href="/vista-app" style={{display:"inline-flex",alignItems:"center",minHeight:40,color:"#65439b"}}>{english?"Back to VMV Business":"Volver a VMV Business"}</a>
   </div>
   {diagnostic?<details style={{fontSize:11,lineHeight:1.5,marginTop:18,color:"#6d6080"}}>
    <summary style={{cursor:"pointer",fontWeight:700}}>{english?"Diagnostic for support":"Diagnóstico para soporte"}</summary>
    <code style={{display:"block",marginTop:8,whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{diagnostic}</code>
    <p style={{marginTop:8}}>{english?"Send us the diagnostic text if the issue persists.":"Si continúa el error, comparte este texto para identificar la causa exacta."}</p>
   </details>:null}
  </section>
 </main>;
}
