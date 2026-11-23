"use client";
import {useEffect,useRef,useState} from "react";
import dynamic from "next/dynamic";
import {getSupabase} from "@/lib/supabase";
import {useInterfaceLanguage} from "@/lib/i18n-web";
import {centralDirectoryProfile} from "@/lib/central-directory-profile";
import type {CentralBusiness} from "@/lib/vmv-central-business";
import {marketingCategoryLabel} from "@/lib/marketing-taxonomy-i18n";
import LocalVisibilityStudio,{type LocalProfile} from "./LocalVisibilityStudio";
import styles from "./LocalVisibilityStudio.module.css";
const BusinessProfileDialog=dynamic(()=>import("../ai-agents/BusinessProfileDialog"));
type Props=React.ComponentProps<typeof LocalVisibilityStudio>;
export default function SavedLocalVisibility(props:Props){
 const {language,translate}=useInterfaceLanguage();
 const [businesses,setBusinesses]=useState<CentralBusiness[]>([]),[selected,setSelected]=useState("");
 const [drafts,setDrafts]=useState<Record<string,Partial<LocalProfile>>>({});
 const [owner,setOwner]=useState<string|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(false),[retry,setRetry]=useState(0),[editing,setEditing]=useState(false);
 const generation=useRef(0),identity=useRef<string|null>(null);
 useEffect(()=>{
  const db=getSupabase();let alive=true;
  const load=async()=>{
   const current=++generation.current;setLoading(true);setError(false);
   if(!db){if(alive){setOwner(null);setLoading(false);}return;}
   try{
    const auth=await db.auth.getUser();
    if(auth.error&&auth.error.name!=="AuthSessionMissingError")throw Error();
    const uid=auth.data.user&&!auth.data.user.is_anonymous?auth.data.user.id:null;
    if(!alive||current!==generation.current)return;
    if(identity.current!==uid){identity.current=uid;setDrafts({});setSelected("");setBusinesses([]);}
    setOwner(uid);
    if(!uid){setLoading(false);return;}
    const result=await db.from("vmv_marketing_businesses").select("*").eq("owner_id",uid).order("created_at",{ascending:false}).limit(80);
    if(result.error)throw Error();
    if(!alive||current!==generation.current)return;
    const rows=(result.data||[]) as CentralBusiness[];
    setBusinesses(rows);setSelected(previous=>rows.some(b=>b.id===previous)?previous:rows.length===1?rows[0].id:"");setLoading(false);
   }catch{if(alive&&current===generation.current){setError(true);setLoading(false);}}
  };
  void load();
  const sub=db?.auth.onAuthStateChange(event=>{
   if(event==="SIGNED_OUT"){generation.current++;identity.current=null;setOwner(null);setBusinesses([]);setSelected("");setDrafts({});setEditing(false);setError(false);setLoading(false);}
   if(event==="SIGNED_IN")queueMicrotask(()=>{if(alive)void load();});
  });
  return()=>{alive=false;generation.current++;sub?.data.subscription.unsubscribe();};
 },[retry]);
 const business=businesses.find(b=>b.id===selected)||null;
 const days=(["marketing.google.mon_2","marketing.google.tue","marketing.google.wed","marketing.google.thu","marketing.google.fri","marketing.google.sat","marketing.google.sun"] as const).map(key=>translate(key));
 const seed=business?centralDirectoryProfile(business,marketingCategoryLabel(language,business.category_id,translate("marketing.visibility.not_specified")),days,translate("marketing.google.closed")):null;
 if(loading)return <p role="status">{translate("marketing.visibility.loadingBusiness")}</p>;
 if(error)return <div role="alert"><p>{translate("marketing.visibility.loadBusinessError")}</p><button type="button" onClick={()=>setRetry(n=>n+1)}>{translate("common.retry")}</button></div>;
 if(!owner)return <LocalVisibilityStudio {...props}/>;
 return <>
  <div className={styles.savedProfile}>
   {businesses.length>1?<label className={styles.field}><span>{translate("marketing.visibility.savedBusiness")}</span><select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">{translate("marketing.visibility.chooseBusiness")}</option>{businesses.map(b=><option value={b.id} key={b.id}>{b.name}</option>)}</select></label>:business?<strong>{business.name}</strong>:<p>{translate("marketing.visibility.noSavedBusiness")}</p>}
   {business?<p className={styles.muted}>{translate("marketing.visibility.profileLoaded")}</p>:null}
   {business||businesses.length===0?<button type="button" className={styles.requestHelp} onClick={()=>setEditing(true)}>{translate(business?"marketing.visibility.editBusiness":"marketing.visibility.createBusiness")}</button>:null}
  </div>
  {business&&seed?<LocalVisibilityStudio key={business.id} fromSavedBusiness profile={{...seed,...drafts[business.id]}} onChange={(key,value)=>setDrafts(previous=>({...previous,[business.id]:{...previous[business.id],[key]:value}}))} onRequestHelp={props.onRequestHelp}/>:null}
  {business&&drafts[business.id]&&Object.keys(drafts[business.id]).length?<p className={styles.notice}>{translate("marketing.visibility.profileDraftEdits")}</p>:null}
  {editing?<BusinessProfileDialog businessId={business?.id} legacy={[]} onClose={()=>setEditing(false)} onSaved={async id=>{setEditing(false);setSelected(id);setRetry(n=>n+1);}}/>:null}
 </>;
}
