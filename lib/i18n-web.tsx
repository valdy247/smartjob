"use client";
import {createContext,useContext,useEffect,useMemo,useSyncExternalStore} from "react";
import {usePathname} from "next/navigation";
import {getSupabase} from "@/lib/supabase";
import {INTERFACE_LANGUAGE_KEY as LANGUAGE_KEY,interfaceLanguage,t as translate,type InterfaceLanguage as Language,type MessageKey} from "./i18n";
import {LanguagePreference} from "./i18n-preference";
const isLanguage=(value:unknown):value is Language=>interfaceLanguage(value)!==null;
const Context=createContext<LanguagePreference|null>(null);
const serverState={language:"en" as const,ready:false,saving:false,error:null};
function Provider({children}:{children:React.ReactNode}){
 const preference=useMemo(()=>{
  let incoming=typeof window!=="undefined"&&window.location.pathname==="/registro"?new URLSearchParams(window.location.search).get("lang"):null;
  return new LanguagePreference(getSupabase()?.auth||null,{
  read:async()=>{const value=incoming;incoming=null;return isLanguage(value)?value:localStorage.getItem(LANGUAGE_KEY);},
  write:async language=>{try{localStorage.setItem(LANGUAGE_KEY,language);}catch{}document.cookie=`vmv_ui_language=${language}; Path=/; Max-Age=31536000; SameSite=Lax`;}
 },typeof navigator==="undefined"?"en":navigator.language);},[]);
 const state=useSyncExternalStore(preference.subscribe,preference.getSnapshot,()=>serverState);
 useEffect(()=>{
  let active=true;
  void preference.refresh();
  const client=getSupabase();
  const {data}=client?.auth.onAuthStateChange((event,session)=>{
   if(event==="SIGNED_IN"||event==="SIGNED_OUT")preference.accountChanged(session?.user.id||null);
   // Never await Supabase calls from inside its auth callback.
   if(event==="SIGNED_IN"||event==="SIGNED_OUT")setTimeout(()=>{
    if(active)void(event==="SIGNED_OUT"?preference.signedOut():preference.refresh());
   },0);
  })||{data:null};
  const refresh=()=>{if(document.visibilityState==="visible")void preference.refresh();};
  const storage=(event:StorageEvent)=>{if(event.key===LANGUAGE_KEY)void preference.refresh();};
  window.addEventListener("storage",storage);document.addEventListener("visibilitychange",refresh);
  return()=>{active=false;data?.subscription.unsubscribe();window.removeEventListener("storage",storage);document.removeEventListener("visibilitychange",refresh);};
 },[preference]);
 useEffect(()=>{if(state.ready){document.documentElement.lang=state.language;document.title=translate(state.language,"interface.meta.title");const description=document.querySelector('meta[name="description"]');description?.setAttribute("content",translate(state.language,"interface.meta.description"));}},[state.ready,state.language]);
 return <Context.Provider value={preference}>
  {!state.ready?<div role="status" style={{padding:24}}>{state.error?<><p>{translate(state.language,"language.loadError")}</p><button onClick={()=>void preference.refresh()}>{translate(state.language,"common.retry")}</button></>:<span aria-label="VMV Business">◌</span>}</div>:null}
  <div hidden={!state.ready}>{children}</div>
 </Context.Provider>;
}
export function InterfaceLanguageProvider({children}:{children:React.ReactNode}){
 // Published customer websites have their own content language, independent of VMV's interface.
 const path=usePathname();
 return path?.startsWith("/sites/")||path?.startsWith("/web/")?<>{children}</>:<Provider>{children}</Provider>;
}
export function useInterfaceLanguage(){
 const preference=useContext(Context);
 if(!preference)throw new Error("Interface language provider is missing");
 const state=useSyncExternalStore(preference.subscribe,preference.getSnapshot,()=>serverState);
 return {...state,changeLanguage:async(language:Language)=>{await preference.choose(language);if(preference.getSnapshot().error==="save")throw new Error("Language save failed");},translate:(key:MessageKey,variables?:Record<string,string|number>)=>translate(state.language,key,variables)};
}
