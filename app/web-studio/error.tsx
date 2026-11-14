"use client";

import {useEffect,useState} from "react";

// This screen must not depend on Puck or the language provider: either may be
// the reason the workspace could not render. Never clear saved drafts here.
export default function WebStudioError({reset}:{error:Error & {digest?:string};reset:()=>void}){
 const [english,setEnglish]=useState(false);
 useEffect(()=>{setEnglish(document.documentElement.lang.toLowerCase().startsWith("en"));},[]);
 return <main style={{minHeight:"100dvh",background:"#faf7ff",padding:"48px 20px",fontFamily:"system-ui",color:"#30233e"}}>
  <section aria-labelledby="studio-recovery-title" style={{maxWidth:480,margin:"0 auto",padding:28,borderRadius:24,background:"white",border:"1px solid #e9ddf7"}}>
   <p style={{color:"#7650b0",fontWeight:700}}>VMV Web Studio</p>
   <h1 id="studio-recovery-title" style={{fontSize:25,lineHeight:1.2}}>{english?"We couldn’t open the editor":"No pudimos abrir el editor"}</h1>
   <p style={{lineHeight:1.6}}>{english?"Try again. If this preview was recently updated, reload to get the latest version.":"Intenta de nuevo. Si este preview se actualizó recientemente, recarga para obtener la versión más reciente."}</p>
   <div style={{display:"flex",flexWrap:"wrap",gap:12,marginTop:24}}>
    <button type="button" onClick={reset} style={{minHeight:44,padding:"10px 18px",borderRadius:12,border:0,background:"#8154cc",color:"white",font:"inherit",cursor:"pointer"}}>{english?"Try again":"Reintentar"}</button>
    <button type="button" onClick={()=>window.location.reload()} style={{minHeight:44,padding:"10px 18px",borderRadius:12,border:"1px solid #d9c7ed",background:"#f5efff",color:"#503374",font:"inherit",cursor:"pointer"}}>{english?"Reload":"Recargar"}</button>
   </div>
   <a href="/vista-app" style={{display:"inline-flex",alignItems:"center",minHeight:44,marginTop:16,color:"#65439b"}}>{english?"Back to VMV Business":"Volver a VMV Business"}</a>
  </section>
 </main>;
}
