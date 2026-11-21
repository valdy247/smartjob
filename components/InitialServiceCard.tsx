"use client";
import {useState} from "react";
import {ArrowUpRight} from "lucide-react";
import {getSupabase} from "@/lib/supabase";
import {useInterfaceLanguage} from "@/lib/i18n-web";
import {INITIAL_SERVICES,initialService} from "@/lib/initial-service";
import styles from "./InitialServiceCard.module.css";

export default function InitialServiceCard({value,onTranslation}:{value:unknown;onTranslation:()=>void}){
 const {translate:t}=useInterfaceLanguage();
 const [selected,setSelected]=useState(()=>initialService(value));
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const [saved,setSaved]=useState(false);
 const current=INITIAL_SERVICES.find(item=>item.id===selected);
 if(!current)return null;
 const save=async(value:string)=>{
  const next=initialService(value);if(!next||busy)return;
  setBusy(true);setError("");setSaved(false);
  try{
   const client=getSupabase();if(!client)throw Error();
   const {error}=await client.auth.updateUser({data:{initial_service:next}});
   if(error)throw error;
   setSelected(next);setSaved(true);
  }catch{setError(t("setup.saveError"));}
  finally{setBusy(false);}
 };
 return <section className={styles.card} aria-label={t("setup.next")}>
  <small>{t("setup.next")}</small>
  {current.id==="translation"?<button type="button" className={styles.action} onClick={onTranslation}>{t(current.label)}<ArrowUpRight size={20}/></button>:
   <a className={styles.action} href={current.href}>{t(current.label)}<ArrowUpRight size={20}/></a>}
  <details><summary>{t("setup.change")}</summary><label>{t("setup.goal")}
   <select value={selected||""} disabled={busy} onChange={e=>void save(e.target.value)}>{INITIAL_SERVICES.map(item=><option value={item.id} key={item.id}>{t(item.label)}</option>)}</select>
  </label></details>
  {error?<p role="alert">{error}</p>:saved?<p role="status">{t("setup.saved")}</p>:null}
 </section>;
}
