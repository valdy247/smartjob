"use client";
import {useState} from "react";
import {Check,ClipboardCopy,ExternalLink,MessageSquareQuote,Send,Star} from "lucide-react";
import {useInterfaceLanguage} from "@/lib/i18n-web";
import styles from "./ReputationStudio.module.css";

export type ReviewMode="respond"|"request";
const safeReviewLink=(input:string)=>{
 try{const url=new URL(input.trim());return url.protocol==="https:"&&!url.username&&!url.password&&url.hostname.includes(".");}
 catch{return false;}
};
export function reviewReplyTemplate(name:string,text:string,tone:"cordial"|"breve"){
 if(!text.trim())return "";
 const negative=/\b(malo|mala|terrible|late|bad|awful|rude|poor|p[eé]simo|queja|horrible|retraso|incorrecto|error|never)\b/i.test(text);
 const positive=/\b(excelente|great|perfect|amazing|delicious|recomiendo|wonderful|perfecto|delicioso|encant[oó]|fant[aá]stico)\b/i.test(text);
 if(negative)return tone==="breve"?"Gracias por compartirlo. Lamentamos tu experiencia y queremos mejorar.":"Gracias por contarnos tu experiencia. Lamentamos que no haya sido la esperada. En "+name+" nos gustaría entender lo ocurrido para mejorar. Puedes contactarnos por nuestros canales habituales.";
 if(positive)return tone==="breve"?"¡Muchas gracias por tu reseña! Nos alegra saberlo.":"¡Muchas gracias por compartir tu experiencia! Nos alegra saber que la disfrutaste. En "+name+" apreciamos tus comentarios y esperamos atenderte de nuevo.";
 return "Gracias por compartir tu opinión sobre "+name+". La tendremos en cuenta para seguir mejorando.";
}
export function requestMessage(name:string,url:string){return "¡Hola! Gracias por confiar en "+name+". Si quieres, comparte una reseña sincera sobre tu experiencia: "+url.trim()+" Tu opinión nos ayuda a mejorar.";}
export default function ReputationStudio({business,mode,onModeChange,reviewInput,onReviewChange,reply,onReplyChange,link,onLinkChange,onDirectory,reviewTone,onToneChange}:{
 business:string;mode:ReviewMode;onModeChange:(v:ReviewMode)=>void;
 reviewInput:string;onReviewChange:(v:string)=>void;reply:string;onReplyChange:(v:string)=>void;
 link:string;onLinkChange:(v:string)=>void;onDirectory:()=>void;
 reviewTone:"cordial"|"breve";onToneChange:(v:"cordial"|"breve")=>void;
}){
 const {language}=useInterfaceLanguage();
 const en=language==="en";const [notice,setNotice]=useState("");
 const copy=async(value:string)=>{
  try{await navigator.clipboard.writeText(value);setNotice(en?"Copied. Review it before using.":"Copiado. Revísalo antes de utilizarlo.");}
  catch{setNotice(en?"Copy not available; select the text manually.":"No se pudo copiar; selecciona el texto manualmente.");}
 };
 const valid=safeReviewLink(link);
 const suggested=reviewReplyTemplate(business,reviewInput,reviewTone);
 const message=valid?requestMessage(business,link):"";
 return <div className={styles.root}>
  <div className={styles.tabs} role="group" aria-label={en?"Reputation tools":"Herramientas de reputación"}>
   <button type="button" aria-pressed={mode==="respond"} onClick={()=>onModeChange("respond")}><MessageSquareQuote size={17}/>{en?"Reply to reviews":"Responder reseñas"}</button>
   <button type="button" aria-pressed={mode==="request"} onClick={()=>onModeChange("request")}><Star size={17}/>{en?"Request reviews":"Pedir reseñas"}</button>
  </div>
  {mode==="respond"?<div className={styles.section}>
   <label><strong>{en?"Paste a real customer review":"Pega la reseña real de un cliente"}</strong><textarea rows={4} maxLength={650} value={reviewInput} onChange={e=>onReviewChange(e.target.value)} placeholder={en?"Paste the review you received…":"Copia el comentario que recibiste…"} /></label>
   {reviewInput.trim()?<>
    <div className={styles.row}><strong>{en?"Draft for your approval":"Respuesta para revisar"}</strong><button type="button" onClick={()=>{onToneChange(reviewTone==="cordial"?"breve":"cordial");onReplyChange("");}}>{en?"Change tone":"Cambiar tono"}</button></div>
    <label><span>{en?"Edit before using":"Puedes editarla antes de usarla"}</span><textarea rows={5} maxLength={1200} value={reply||suggested} onChange={e=>onReplyChange(e.target.value)} /></label>
    <button type="button" className={styles.primary} onClick={()=>void copy(reply||suggested)}><ClipboardCopy size={15}/>{en?"Copy reply":"Copiar respuesta"}</button>
    <p className={styles.hint}>{en?"No review will be posted automatically. You decide whether to use the reply.":"VMV no publica ninguna respuesta automáticamente. Tú decides si la utilizas."}</p>
   </>:<p className={styles.hint}>{en?"Use an actual review. VMV doesn't generate fake feedback.":"Utiliza una reseña real. VMV no inventa opiniones de clientes."}</p>}
  </div>:<div className={styles.section}>
   <label><strong>{en?"Your review link":"Enlace para recibir reseñas"}</strong><input type="url" value={link} maxLength={750} inputMode="url" placeholder="https://..." onChange={e=>onLinkChange(e.target.value)}/></label>
   {link.trim()&&!valid?<p className={styles.invalid} role="alert">{en?"Enter a valid HTTPS link.":"Introduce un enlace HTTPS válido."}</p>:null}
   {valid?<><label><strong>{en?"Message ready to share":"Mensaje listo para compartir"}</strong><textarea rows={4} readOnly value={message}/></label><button type="button" className={styles.primary} onClick={()=>void copy(message)}><ClipboardCopy size={15}/>{en?"Copy message":"Copiar mensaje"}</button><a className={styles.link} href={link} target="_blank" rel="noopener noreferrer"><ExternalLink size={15}/>{en?"Open the provided review link":"Abrir el enlace proporcionado"}</a></>:null}
   <p className={styles.hint}>{en?"Ask customers for authentic reviews, without rewards or selective targeting. Messages are not sent automatically.":"Solicita opiniones auténticas, sin incentivos ni seleccionar solo clientes satisfechos. No se envía ningún mensaje automáticamente."}</p>
  </div>}
  <button type="button" className={styles.directory} onClick={onDirectory}><Send size={16}/>{en?"Find local directories":"Encontrar directorios locales"} <span>›</span></button>
  {notice?<p role="status" className={styles.hint}><Check size={14}/> {notice}</p>:null}
 </div>;
}
