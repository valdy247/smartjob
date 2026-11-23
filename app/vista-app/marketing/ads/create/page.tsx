"use client";
import Link from "next/link";
import {useCallback,useEffect,useRef,useState} from "react";
import {ArrowLeft,Sparkles} from "lucide-react";
import AdsStudio from "../AdsStudio";
import styles from "../AdsStudio.module.css";
import {InterfaceLanguagePicker} from "@/components/InterfaceLanguagePicker";
import {useInterfaceLanguage} from "@/lib/i18n-web";
export default function CreateAdsCampaignPage(){
 const [fromAgent,setFromAgent]=useState<boolean|null>(null);
 const wizardBack=useRef<(()=>void)|null>(null);
 const [canGoBack,setCanGoBack]=useState(false);
 const registerWizardBack=useCallback((callback:(()=>void)|null)=>{
  wizardBack.current=callback;
  setCanGoBack(Boolean(callback));
 },[]);
 useEffect(()=>{
  const params=new URLSearchParams(window.location.search);
  const agent=params.get("from")==="ai-agents";
  const draft=params.get("draft")||"";
  const resume=/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(draft);
  setFromAgent(agent);
  // Standalone Ads Studio creation is supported; AI Agents handoff is optional.
 },[]);
 const {language}=useInterfaceLanguage();
 return <main className={styles.page}><div className={styles.shell}>
  <header className={styles.topbar}>
   <div className={styles.topbarIdentity}>
    {canGoBack?
     <button type="button" className={styles.backLink} onClick={()=>wizardBack.current?.()}>
      <ArrowLeft size={17}/>{language==="en"?"Back":"Atrás"}</button>:
     <Link href="/vista-app/marketing/ads" className={styles.backLink}><ArrowLeft size={17}/>{language==="en"?"Ads Studio":"Ads Studio"}</Link>}
    <InterfaceLanguagePicker compact/>
   </div>
   <span className={styles.marker}><Sparkles size={14}/>{language==="en"?"Create campaign":"Crear campaña"}</span>
  </header>
  <AdsStudio mode="wizard" registerHeaderBack={registerWizardBack}/>
 </div></main>;
}
