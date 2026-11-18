"use client";

import Link from "next/link";
import {ArrowLeft} from "lucide-react";
import {InterfaceLanguagePicker} from "@/components/InterfaceLanguagePicker";
import {useInterfaceLanguage} from "@/lib/i18n-web";
import MarketingActionCenter from "../MarketingActionCenter";
import styles from "../page.module.css";

/** Dedicated request tracking page; the Marketing catalog stays focused on choosing a service. */
export default function MarketingRequestsPage(){
 const {translate}=useInterfaceLanguage();
 return <main className={styles.page}>
  <div className={styles.shell} style={{maxWidth:1020}}>
   <header className={styles.header}>
    <Link href="/vista-app/marketing" className={styles.back}>
     <ArrowLeft size={18}/> {translate("marketing.report.back")}
    </Link>
    <InterfaceLanguagePicker compact/>
   </header>
   <MarketingActionCenter businessName="" industryId="" website="" onGoToVisibility={()=>{}} requestsOnly/>
  </div>
 </main>;
}
