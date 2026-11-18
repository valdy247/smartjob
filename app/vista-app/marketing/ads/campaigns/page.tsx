"use client";
import Link from "next/link";
import {ArrowLeft,Sparkles} from "lucide-react";
import AdsStudio from "../AdsStudio";
import styles from "../AdsStudio.module.css";
import {InterfaceLanguagePicker} from "@/components/InterfaceLanguagePicker";
import {useInterfaceLanguage} from "@/lib/i18n-web";
export default function MarketingAdsCampaignsPage(){
 const {language}=useInterfaceLanguage();
 return <main className={styles.page}><div className={styles.shell}>
  <header className={styles.topbar}>
   <div className={styles.topbarIdentity}>
    <Link href="/vista-app/marketing" className={styles.backLink}><ArrowLeft size={17}/> {language==="en"?"Marketing":"Marketing"}</Link>
    <InterfaceLanguagePicker compact/>
   </div>
   <span className={styles.marker}><Sparkles size={14}/>{language==="en"?"My campaigns":"Mis campañas"}</span>
  </header>
  <AdsStudio mode="campaigns"/>
 </div></main>;
}
