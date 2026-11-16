"use client";
import {useState} from "react";
import {ArrowLeft,FileVideo2,LockKeyhole,Sparkles,UploadCloud} from "lucide-react";
import {useInterfaceLanguage} from "@/lib/i18n-web";
import styles from "./SocialCaptionPreview.module.css";

const networks=["Instagram","TikTok","Facebook","YouTube","LinkedIn","X"] as const;

export default function SocialCaptionPreview({onBack}:{onBack:()=>void}){
 const {language}=useInterfaceLanguage();
 const en=language==="en";
 const [network,setNetwork]=useState("");
 const [videoName,setVideoName]=useState("");
 const [description,setDescription]=useState("");
 return <section className={styles.preview} aria-label={en?"Social media captions preview":"Vista previa de descripciones para redes"}>
  <button type="button" className={styles.back} onClick={onBack}><ArrowLeft size={16}/>{en?"Back to Marketing":"Volver a Marketing"}</button>
  <div className={styles.heading}>
   <span className={styles.icon}><Sparkles size={22}/></span>
   <span className={styles.badge}>{en?"Coming soon":"Próximamente"}</span>
   <h2>{en?"Social media captions":"Descripciones para redes"}</h2>
   <p>{en?"Choose a platform first. When available, we'll transcribe the video's speech and suggest a caption for that network, without storing your video.":"Primero elige una red. Cuando esté disponible, transcribiremos la voz del video y sugeriremos una descripción para esa red, sin guardar el video."}</p>
  </div>
  <div className={styles.form}>
   <label className={styles.field}>
    <strong><span>01</span>{en?"Which social network?":"¿Para qué red social?"}</strong>
    <select value={network} onChange={e=>{setNetwork(e.target.value);setVideoName("");}}>
     <option value="">{en?"Choose a network":"Selecciona una red"}</option>
     {networks.map(item=><option key={item} value={item}>{item}</option>)}
    </select>
   </label>
   <label className={styles.field}>
    <strong><span>02</span>{en?"Choose your video":"Selecciona tu video"}</strong>
    <span className={styles.upload}><UploadCloud size={24}/><b>{en?"Select a video (preview only)":"Elegir video (demostración)"}</b><small>{en?"Not uploaded or saved":"No se sube ni se guarda"}</small></span>
    <input type="file" accept="video/*" disabled={!network} onChange={e=>{setVideoName(e.target.files?.[0]?.name||"");e.target.value="";}} aria-label={en?"Select video on your device":"Seleccionar video en tu dispositivo"}/>
    {videoName?<small className={styles.selected}><FileVideo2 size={15}/>{videoName} · {en?"Only on your device":"Solo en tu dispositivo"}</small>:null}
    {!network?<small className={styles.helper}>{en?"Choose a network first.":"Primero selecciona una red social."}</small>:null}
   </label>
   <label className={styles.field}>
    <strong><span>03</span>{en?"No spoken audio? Describe the video.":"¿El video no tiene voz? Descríbelo."}</strong>
    <textarea rows={3} maxLength={500} value={description} onChange={e=>setDescription(e.target.value)}
      placeholder={en?"Example: A baker decorates a birthday cake with buttercream flowers in her kitchen.":"Ej.: Una pastelera decora un pastel de cumpleaños con flores de crema en su cocina."}/>
    <small className={styles.helper}>{en?"A short description of what's happening is enough.":"Basta con contar brevemente qué ocurre en el video."}</small>
   </label>
   <button type="button" className={styles.disabledAction} disabled><Sparkles size={17}/>{en?"Generate caption · Coming soon":"Generar descripción · Próximamente"}</button>
   <p className={styles.privacy}><LockKeyhole size={15}/>{en?"Preview only: no transcription, AI analysis, upload or storage yet.":"Solo demostración: aún no se transcribe, analiza, sube ni guarda ningún video."}</p>
  </div>
 </section>;
}
