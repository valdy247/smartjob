"use client";

import {useEffect,useRef} from "react";
import {useRouter} from "next/navigation";

/** Non-sensitive change detection for an already published inventory.
 * Refresh the RSC document only when its approved catalog revision changes.
 * Polling avoids exposing owner-private inventory through Realtime subscriptions.
 */
export default function LiveInventoryRefresh({siteSlug,version}:{
 siteSlug:string;version:string;
}){
 const router=useRouter();
 const latest=useRef(version);
 useEffect(()=>{latest.current=version;},[version]);
 useEffect(()=>{
  let disposed=false;
  let pending=false;
  const check=async()=>{
   if(disposed||pending||document.visibilityState!=="visible")return;
   pending=true;
   try{
    const response=await fetch("/api/web-services/inventory-live-version?site="+
     encodeURIComponent(siteSlug),{cache:"no-store"});
    if(!response.ok)return;
    const payload=await response.json() as {linked?:boolean;version?:string|null};
    if(!disposed&&payload.linked===true&&typeof payload.version==="string"&&
     payload.version!==latest.current){
     latest.current=payload.version;
     router.refresh();
    }
   }catch{/* A brief network outage should never interrupt the published website. */}
   finally{pending=false;}
  };
  const interval=window.setInterval(()=>void check(),8000);
  const focus=()=>{void check();};
  document.addEventListener("visibilitychange",focus);
  window.addEventListener("focus",focus);
  return()=>{
   disposed=true;window.clearInterval(interval);
   document.removeEventListener("visibilitychange",focus);
   window.removeEventListener("focus",focus);
  };
 },[router,siteSlug]);
 return null;
}
