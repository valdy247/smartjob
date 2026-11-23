"use client";
import {useEffect,useRef,useState} from "react";
import {Square,Volume2} from "lucide-react";
import {phoneVoice} from "@/lib/vmv-ai-agents/voice-options";
import styles from "./AgentSetupWizard.module.css";
import {useInterfaceLanguage} from "@/lib/i18n-web";
export default function VoiceSample({preset,language}:{preset:string;language:string}){
 const {translate}=useInterfaceLanguage();
 const bilingual=language==="Bilingüe";
 const [sampleLanguage,setSampleLanguage]=useState<"es"|"en">("es");
 const lang=bilingual?sampleLanguage:language==="English"?"en":"es";
 const selected=phoneVoice(preset,lang);
 const audio=useRef<HTMLAudioElement>(null);
 const [state,setState]=useState<"idle"|"loading"|"playing"|"error">("idle");
 const attempt=useRef(0);
 useEffect(()=>{attempt.current++;const element=audio.current;element?.pause();setState("idle");return()=>{attempt.current++;element?.pause();};},[preset,lang]);
 const listen=async()=>{
  const element=audio.current;if(!element)return;
  if(state==="playing"||state==="loading"){attempt.current++;element.pause();element.currentTime=0;setState("idle");return;}
  const id=++attempt.current;setState("loading");
  try{element.currentTime=0;await element.play();if(id===attempt.current)setState("playing");}
  catch{if(id===attempt.current)setState("error");}
 };
 return <div className={styles.voiceSample}>
  {bilingual?<select aria-label={translate("agents.voiceSample.languageLabel")} value={sampleLanguage} onChange={e=>setSampleLanguage(e.target.value as "es"|"en")}><option value="es">Español</option><option value="en">English</option></select>:null}
  {selected?<><audio key={selected.voice} ref={audio} src={selected.sample} preload="none" onEnded={()=>setState("idle")} onError={()=>setState("error")}/>
   <button type="button" onClick={()=>void listen()} aria-label={translate("agents.voiceSample.voiceAria",{action:translate(state==="playing"?"agents.voiceSample.stop":"agents.voiceSample.listen"),name:selected.name})}>
    {state==="playing"||state==="loading"?<Square size={15}/>:<Volume2 size={17}/>}{state==="loading"?translate("agents.voiceSample.loading"):state==="playing"?translate("agents.voiceSample.stop"):translate("agents.voiceSample.listenNamed",{name:selected.name})}</button>
   {state==="error"?<small role="alert">{translate("agents.voiceSample.playError")}</small>:null}
  </>:<small>{translate("agents.voiceSample.choosePolly")}</small>}
 </div>;
}
