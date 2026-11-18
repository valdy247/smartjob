"use client";
import Link from "next/link";
import {ArrowLeft,Sparkles} from "lucide-react";
import AdsStudio from "../AdsStudio";
import styles from "../AdsStudio.module.css";
import {InterfaceLanguagePicker} from "@/components/InterfaceLanguagePicker";
import {useInterfaceLanguage} from "@/lib/i18n-web";
export default function MarketingAdsPlatformsPage(){
 const {language}=useInterfaceLanguage();
 return <main className={styles.page}><div className={styles.shell}>
  <header className={styles.topbar}>
   <div className={styles.topbarIdentity}>
    <Link href="/vista-app/marketing" className={styles.backLink}><ArrowLeft size={17}/> Marketing</Link>
    <InterfaceLanguagePicker compact/>
   </div>
   <span className={styles.marker}><Sparkles size={14}/>{language==="en"?"Platforms":"Plataformas"}</span>
  </header>
  <AdsStudio mode="platforms"/>
 </div></main>;
}
