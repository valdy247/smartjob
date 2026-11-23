"use client";

import {useState} from "react";
import {Share2} from "lucide-react";
import {getSupabase} from "@/lib/supabase";

export default function ShareQuotePdf({quoteId, english=false, disabled=false, className, prepareQuote, buttonLabel}:{
 quoteId:string; english?:boolean; disabled?:boolean; className?:string;
 prepareQuote?:()=>Promise<string|undefined>; buttonLabel?:string;
}){
 const [busy,setBusy]=useState(false);
 const [prepared,setPrepared]=useState<File|null>(null);
 const [feedback,setFeedback]=useState("");
 const label=(es:string,en:string)=>english?en:es;

 async function share(){
  setBusy(true);
  setFeedback("");
  try{
   let file=prepared;
   if(!file){
    const id=quoteId||await prepareQuote?.();
    if(!id)return;
    const db=getSupabase();
    const session=db && (await db.auth.getSession()).data.session;
    if(!session?.access_token)throw Error(label("Tu sesión expiró.","Your session expired."));
    const response=await fetch("/api/vmv/smart-quote/dispatch",{
     method:"POST",
     headers:{Authorization:"Bearer "+session.access_token,"Content-Type":"application/json"},
     body:JSON.stringify({quoteId:id,action:"pdf"})
    });
    if(!response.ok)throw Error(label("No se pudo preparar el PDF.","Could not prepare the PDF."));
    file=new File([await response.blob()],"cotizacion-"+id.slice(0,8)+".pdf",{type:"application/pdf"});
   }

   const data={files:[file]};
   if(!navigator.share||!navigator.canShare?.(data)){
    setFeedback(label("Usa Descargar PDF y adjúntalo en la app que prefieras.","Use Download PDF and attach it in your preferred app."));
    return;
   }
   if(navigator.userActivation?.isActive===false){
    setPrepared(file);
    return;
   }
   try{
    await navigator.share(data);
    setPrepared(null);
   }catch(error){
    if(error instanceof DOMException&&error.name==="AbortError"){setPrepared(null);return;}
    if(!prepared&&error instanceof DOMException&&error.name==="NotAllowedError"){
     setPrepared(file);
     return;
    }
    throw error;
   }
  }catch(error){
   setPrepared(null);
   setFeedback(error instanceof Error&&!(error instanceof DOMException)?error.message:
    label("No se pudo compartir. Puedes descargar el PDF.","Could not share. You can download the PDF."));
  }finally{
   setBusy(false);
  }
 }

 return <>
  <button type="button" className={className} disabled={disabled||busy} onClick={()=>void share()}>
   <Share2 size={16}/>{busy?label("Preparando PDF…","Preparing PDF…"):
    prepared?label("Abrir menú para compartir","Open share menu"):(buttonLabel||label("Compartir PDF","Share PDF"))}
  </button>
  {feedback&&<small role="status">{feedback}</small>}
 </>;
}
