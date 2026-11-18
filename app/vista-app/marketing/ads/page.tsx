"use client";
import Link from "next/link";
import {ArrowLeft} from "lucide-react";
import AdsStudio from "./AdsStudio";
import {InterfaceLanguagePicker} from "@/components/InterfaceLanguagePicker";
export default function MarketingAdsPage(){
 return <main style={{minHeight:"100dvh",background:"#faf8fc",color:"#1a1727"}}>
  <header style={{maxWidth:1120,margin:"auto",padding:"22px 20px 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
   <Link href="/vista-app/marketing" style={{display:"inline-flex",gap:8,alignItems:"center",fontSize:13,fontWeight:650,textDecoration:"none",color:"#5f526f"}}>
    <ArrowLeft size={16}/> Marketing
   </Link>
   <InterfaceLanguagePicker compact/>
  </header>
  <AdsStudio/>
 </main>;
}
