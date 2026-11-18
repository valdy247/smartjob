"use client";
import Link from "next/link";
import {ArrowLeft,ArrowUpRight,BarChart3,CheckCircle2,Megaphone,PlusCircle,Sparkles} from "lucide-react";
import styles from "./AdsStudio.module.css";
import {InterfaceLanguagePicker} from "@/components/InterfaceLanguagePicker";
import {useInterfaceLanguage} from "@/lib/i18n-web";

export default function MarketingAdsPage(){
 const {language}=useInterfaceLanguage();
 const en=language==="en";
 return <main className={styles.page}><div className={styles.shell}>
  <header className={styles.topbar}>
   <div className={styles.topbarIdentity}>
    <Link href="/vista-app" className={styles.backLink}><ArrowLeft size={17}/> VMV Business</Link>
    <InterfaceLanguagePicker compact/>
   </div>
   <span className={styles.marker}><Sparkles size={14}/>{en?"Ads Studio · Pilot":"Ads Studio · Piloto"}</span>
  </header>
  <section className={styles.adsHubIntro}>
   <span className={styles.eyebrow}><Megaphone size={16}/>{en?"MARKETING · ADS STUDIO":"MARKETING · ADS STUDIO"}</span>
   <h1>{en?"Manage your ads":"Gestiona tus anuncios"}</h1>
   <p>{en?"Create new campaigns or review those you've already prepared, with their status and available results.":"Crea campañas nuevas o revisa las que ya preparaste, con su estado y los resultados disponibles."}</p>
  </section>
  <section className={styles.adsHubCards} aria-label={en?"Ads Studio options":"Opciones de Ads Studio"}>
   <Link href="/vista-app/marketing/ads/create" className={styles.adsHubCard}>
    <span className={styles.adsHubIcon}><PlusCircle size={24}/></span>
    <span className={styles.adsHubCardCopy}>
     <strong>{en?"Create campaign":"Crear campaña"}</strong>
     <small>{en?"A simple step-by-step assistant to prepare your ad. Nothing is published without approval.":"Un asistente sencillo paso a paso para preparar tu anuncio. Nada se publica sin aprobación."}</small>
    </span>
    <ArrowUpRight size={19} aria-hidden="true"/>
   </Link>
   <Link href="/vista-app/marketing/ads/campaigns" className={styles.adsHubCard}>
    <span className={styles.adsHubIcon}><BarChart3 size={24}/></span>
    <span className={styles.adsHubCardCopy}>
     <strong>{en?"History & results":"Historial y resultados"}</strong>
     <small>{en?"See pending, active and completed campaigns, along with metrics reported by Meta.":"Consulta campañas pendientes, en curso y terminadas, con las métricas que proporciona Meta."}</small>
    </span>
    <ArrowUpRight size={19} aria-hidden="true"/>
   </Link>
  </section>
  <p className={styles.adsHubFoot}><CheckCircle2 size={15}/>{en?"Campaigns are not activated and ad spend is not authorized from this dashboard.":"Este panel no activa anuncios ni autoriza gasto publicitario."}</p>
 </div></main>;
}
