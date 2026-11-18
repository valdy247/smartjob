"use client";

import Link from "next/link";
import {useEffect,useState} from "react";
import {ArrowLeft} from "lucide-react";
import {InterfaceLanguagePicker} from "@/components/InterfaceLanguagePicker";
import {useInterfaceLanguage} from "@/lib/i18n-web";
import MarketingActionCenter from "../MarketingActionCenter";
import styles from "../page.module.css";

/** Dedicated request tracking page; the Marketing catalog stays focused on choosing a service. */
export default function MarketingRequestsPage(){
 const {translate,language}=useInterfaceLanguage();
 const [paymentReturn,setPaymentReturn]=useState<"processing"|"canceled"|null>(null);
 useEffect(()=>{const result=new URLSearchParams(window.location.search).get("campaign_payment");if(result==="processing"||result==="canceled")setPaymentReturn(result);},[]);
 return <main className={styles.page}>
  <div className={styles.shell} style={{maxWidth:1020}}>
   <header className={styles.header}>
    <Link href="/vista-app/marketing" className={styles.back}>
     <ArrowLeft size={18}/> {translate("marketing.report.back")}
    </Link>
    <InterfaceLanguagePicker compact/>
   </header>
   {paymentReturn?<p role="status" style={{margin:"16px 0",padding:"14px 16px",background:"#fff",border:"1px solid #eadce8",borderRadius:12,fontSize:14,lineHeight:1.6}}>
    {paymentReturn==="processing"
      ?(language==="en"?"Stripe TEST checkout completed. Your payment is only confirmed when the signed server notification arrives; refresh below to check the receipt. No ads were published.":"Terminaste el Checkout de Stripe de PRUEBA. El pago se confirma únicamente al recibir la notificación firmada de Stripe; actualiza tus solicitudes para ver el recibo. No se publicó ningún anuncio.")
      :(language==="en"?"Test checkout canceled. No payment is recorded.":"Cancelaste el cobro de prueba. No se ha registrado ningún pago.")}
   </p>:null}
   <MarketingActionCenter businessName="" industryId="" website="" onGoToVisibility={()=>{}} requestsOnly/>
  </div>
 </main>;
}
