"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {ArrowLeft,Sparkles} from "lucide-react";
import AdsStudio from "../AdsStudio";
import styles from "../AdsStudio.module.css";
import {InterfaceLanguagePicker} from "@/components/InterfaceLanguagePicker";
import {useInterfaceLanguage} from "@/lib/i18n-web";
export default function CreateAdsCampaignPage(){
 const [fromAgent,setFromAgent]=useState<boolean|null>(null);
 useEffect(()=>{const agent=new URLSearchParams(window.location.search).get("from")==="ai-agents";
  setFromAgent(agent);if(!agent)window.location.replace("/vista-app/ai-agents");},[]);
 const {language}=useInterfaceLanguage();
 return <main className={styles.page}><div className={styles.shell}>
  <header className={styles.topbar}>
   <div className={styles.topbarIdentity}>
    <Link href="/vista-app/marketing/ads" className={styles.backLink}><ArrowLeft size={17}/>{language==="en"?"Ads Studio":"Ads Studio"}</Link>
    <InterfaceLanguagePicker compact/>
   </div>
   <span className={styles.marker}><Sparkles size={14}/>{language==="en"?"Create campaign":"Crear campaña"}</span>
  </header>
  <AdsStudio mode="wizard"/>
 </div></main>;
}
