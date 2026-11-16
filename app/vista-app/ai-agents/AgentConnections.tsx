"use client";
import dynamic from "next/dynamic";
import {useEffect,useState} from "react";
import {Package,ChevronRight} from "lucide-react";
import {listCatalog} from "./commerceStore";
import {provisionAiWorkspace} from "./centralBusiness";
import styles from "./AgentSetupWizard.module.css";
import {useInterfaceLanguage} from "@/lib/i18n-web";
import type {MessageKey} from "@/lib/i18n";
const CommerceStudio=dynamic(()=>import("./CommerceStudio"));
/** Uses the existing owner-scoped VMV catalog, never a parallel inventory. */
export default function AgentConnections({centralId,workspaceId,setup,onChange}:{centralId?:string;workspaceId?:string;setup:Record<string,string>;onChange:(key:string,value:string)=>void}){
 const {translate}=useInterfaceLanguage();
 const [workspace,setWorkspace]=useState(workspaceId||""),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const [count,setCount]=useState<number|null>(null),[revision,setRevision]=useState(0);
 useEffect(()=>{setWorkspace(workspaceId||"");setCount(null);setError("");setOpen(false);},[centralId,workspaceId]);
 useEffect(()=>{let live=true;setCount(null);
  if(workspace)void listCatalog(workspace).then(items=>{if(live)setCount(items.filter(x=>x.active&&x.approved).length);}).catch(()=>{if(live)setError("agents.connections.catalogLoadError");});
  return()=>{live=false;};
 },[workspace,revision]);
 const configure=async()=>{
  if(busy)return;setBusy(true);setError("");
  try{const id=workspace||(centralId?await provisionAiWorkspace(centralId):"");if(!id)throw Error("agents.connections.businessRequired");setWorkspace(id);setOpen(true);}
  catch(e){setError(e instanceof Error&&e.message==="agents.connections.businessRequired"?e.message:"agents.connections.openError");}finally{setBusy(false);}
 };
 return <div className={styles.connections}>
  <span className={styles.fieldTitle}>{translate("agents.connections.connectedFeatures")}</span>
  <button type="button" className={styles.connection} disabled={busy} onClick={()=>void configure()}>
   <Package size={21}/><span><strong>{translate("agents.connections.catalogInventory")}</strong><small>{busy?translate("agents.connections.opening"):count===null?translate("agents.connections.configureProducts"):count?translate("agents.connections.approvedProducts",{count}):translate("agents.connections.addProducts")}</small></span><ChevronRight size={18}/>
  </button>
  <label className={styles.multiOption}><input type="checkbox" checked={setup.cap_catalog==="Sí"} onChange={e=>onChange("cap_catalog",e.target.checked?"Sí":"No")}/><span>{translate("agents.connections.allowInventory")}</span></label>
  {error?<p role="alert" className={styles.error}>{translate(error as MessageKey)}</p>:null}
  {open&&workspace?<div className={styles.inlineStudio}><CommerceStudio catalogOnly workspaceId={workspace} agents={[]} onClose={()=>{setOpen(false);setRevision(n=>n+1);}}/></div>:null}
 </div>;
}
