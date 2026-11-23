"use client";
import {useEffect,useRef,useState} from "react";
import {ArrowRight,Check,LoaderCircle,Sparkles,X} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import css from "./VideoPromptAssistant.module.css";
export type PromptKind="topic"|"video"|"image"|"scene_image"|"narration"|"overlay"|"social"|"niche";
type Context={visual?:string;purpose?:string;duration?:number};
type Props={
 value:string;onApply:(next:string)=>void;kind:PromptKind;maxLength:number;
 en?:boolean;context?:Context;disabled?:boolean;
};
export default function VideoPromptAssistant({value,onApply,kind,maxLength,en=false,context,disabled=false}:Props){
 const [open,setOpen]=useState(false),[loading,setLoading]=useState(false);
 const [suggestion,setSuggestion]=useState(""),[original,setOriginal]=useState("");
 const [error,setError]=useState("");
 const controller=useRef<AbortController|null>(null);
 useEffect(()=>()=>controller.current?.abort(),[]);
 useEffect(()=>{
  if(!open)return;
  const onKey=(event:KeyboardEvent)=>{if(event.key==="Escape"&&!loading)setOpen(false);};
  document.addEventListener("keydown",onKey);
  return()=>document.removeEventListener("keydown",onKey);
 },[open,loading]);
 const improve=async()=>{
  if(loading||disabled||value.trim().length<3)return;
  controller.current?.abort();const abort=new AbortController();controller.current=abort;
  const input=value;
  setOriginal(input);setSuggestion("");setError("");setOpen(true);setLoading(true);
  try{
   const client=getSupabase();if(!client)throw Error("login");
   const {data:{session}}=await client.auth.getSession();
   if(!session?.access_token)throw Error("login");
   if(abort.signal.aborted)return;
   const response=await fetch("/api/video-generator/prompt-helper",{
    method:"POST",cache:"no-store",signal:abort.signal,
    headers:{Authorization:"Bearer "+session.access_token,"Content-Type":"application/json"},
    body:JSON.stringify({text:input,kind,locale:en?"en":"es",context})
   });
   const body=await response.json().catch(()=>({error:"video_ai_unavailable"})) as {suggestion?:unknown;error?:string};
   if(!response.ok)throw Error(body.error||"video_ai_unavailable");
   if(typeof body.suggestion!=="string"||body.suggestion.trim().length<3||
    body.suggestion.length>maxLength)throw Error("video_ai_invalid_suggestion");
   setSuggestion(body.suggestion);
  }catch(e){
   if(!abort.signal.aborted)setError(e instanceof Error?e.message:"video_ai_unavailable");
  }finally{if(!abort.signal.aborted)setLoading(false);}
 };
 const errorMessage=error==="login"?
  (en?"Sign in to use AI.":"Inicia sesión para usar la IA."):
  error==="video_not_enabled_for_account"?
  (en?"AI assistant is limited to enabled pilot accounts.":"El ayudante IA está disponible para las cuentas habilitadas del piloto."):
  error==="video_ai_limit"?
  (en?"You've reached the temporary assistant limit.":"Alcanzaste el límite temporal del ayudante."):
  error==="video_ai_invalid_suggestion"?
  (en?"The suggestion was too long. Please try again.":"La propuesta excedió el límite del campo. Vuelve a intentar."):
  (en?"Couldn't improve the text. Try again.":"No se pudo mejorar el texto. Intenta otra vez.");
 const apply=()=>{
  const next=suggestion.trim();
  if(loading||disabled||value!==original||next.length<3||next.length>maxLength)return;
  onApply(next);setOpen(false);setError("");
 };
 return <>
  <button type="button" className={css.trigger}
   disabled={disabled||loading||value.trim().length<3}
   onClick={()=>void improve()}>
   <Sparkles size={15}/>{en?"Improve with AI":"Mejorar con IA"}
  </button>
  {open?<div className={css.backdrop} onMouseDown={e=>{
   if(e.target===e.currentTarget&&!loading)setOpen(false);
  }}>
   <section role="dialog" aria-modal="true" aria-labelledby="vmv-prompt-assistant-title"
    className={css.dialog}>
    <header className={css.header}>
     <div className={css.heading}><span className={css.icon}><Sparkles size={19}/></span>
      <h2 id="vmv-prompt-assistant-title">{en?"AI prompt assistant":"Ayudante de prompts"}</h2></div>
     <button type="button" className={css.close} disabled={loading}
      onClick={()=>setOpen(false)} aria-label={en?"Close":"Cerrar"}><X size={19}/></button>
    </header>
    {loading?<div className={css.loading} role="status">
     <LoaderCircle className={css.spinner} size={20}/>
     {en?"Improving your idea…":"Mejorando tu idea…"}
    </div>:null}
    {suggestion&&!loading?<div className={css.content}>
     <label className={css.label} htmlFor="vmv-prompt-improved">
      {en?"Suggested version":"Versión sugerida"}</label>
     <textarea id="vmv-prompt-improved" autoFocus value={suggestion} maxLength={maxLength}
      rows={Math.min(9,Math.max(3,Math.ceil(suggestion.length/75)))}
      onChange={e=>setSuggestion(e.target.value)}/>
     <span className={css.counter}>{suggestion.length}/{maxLength}</span>
     <details className={css.original}><summary>{en?"See original":"Ver original"}</summary>
      <p>{original}</p></details>
    </div>:null}
    {error&&!loading?<p className={css.error} role="alert">{errorMessage}</p>:null}
    {value!==original&&!loading?<p className={css.error} role="alert">
     {en?"Your original text changed. Close and try again.":"El texto original cambió. Cierra y vuelve a intentarlo."}
    </p>:null}
    <footer className={css.actions}>
     <button type="button" className={css.cancel} disabled={loading}
      onClick={()=>setOpen(false)}>{en?"Keep original":"Conservar original"}</button>
     {suggestion&&!loading?<button type="button" className={css.apply}
      disabled={disabled||value!==original||suggestion.trim().length<3||suggestion.length>maxLength}
      onClick={apply}><Check size={16}/>{en?"Use this version":"Usar esta versión"}</button>:
      !loading?<button type="button" className={css.apply} onClick={()=>void improve()}>
       <ArrowRight size={16}/>{en?"Try again":"Reintentar"}</button>:null}
    </footer>
   </section>
  </div>:null}
 </>;
}
