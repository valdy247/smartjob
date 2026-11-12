"use client";
import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from "react";
import {getSupabase} from "./supabase";
import {accountLanguage,interfaceLanguage,t,visitorLanguage,INTERFACE_LANGUAGE_KEY,type InterfaceLanguage,type MessageKey} from "./i18n";

type InterfaceContextValue = {
  language: InterfaceLanguage;
  ready: boolean;
  saving: boolean;
  changeLanguage: (next: InterfaceLanguage) => Promise<void>;
  translate: (key: MessageKey, values?: Record<string,string|number>) => string;
};
const InterfaceContext=createContext<InterfaceContextValue|null>(null);
function persistVisitorLanguage(language:InterfaceLanguage) {
  try {window.localStorage.setItem(INTERFACE_LANGUAGE_KEY,language);} catch {}
  document.cookie=INTERFACE_LANGUAGE_KEY+"="+language+"; Path=/; Max-Age=31536000; SameSite=Lax";
}
function updatePageLanguage(language:InterfaceLanguage) {
  document.documentElement.lang=language;
  document.title=t(language,"meta.title");
  document.querySelector('meta[name="description"]')?.setAttribute("content",t(language,"meta.description"));
}

export function InterfaceLanguageProvider({children}:{children:ReactNode}) {
  const [language,setLanguage]=useState<InterfaceLanguage>("es");
  const [ready,setReady]=useState(false);
  const [saving,setSaving]=useState(false);
  const sequence=useRef(0);
  const selection=useRef<InterfaceLanguage>("es");

  useEffect(()=>{
    let mounted=true;
    const client=getSupabase();
    let chosen:InterfaceLanguage;
    try {
      const queryLanguage=interfaceLanguage(new URLSearchParams(window.location.search).get("lang"));
      chosen=queryLanguage||visitorLanguage(window.localStorage.getItem(INTERFACE_LANGUAGE_KEY),navigator.language);
    }catch {chosen=visitorLanguage(null,navigator.language);}
    selection.current=chosen;
    setLanguage(chosen);
    persistVisitorLanguage(chosen);
    updatePageLanguage(chosen);
    const synchronize=async()=>{
      const ticket=++sequence.current;
      if(!client){if(mounted&&ticket===sequence.current)setReady(true);return;}
      try{
        const {data,error}=await client.auth.getUser();
        if(error)throw error;
        const metadata=data.user?.user_metadata as Record<string,unknown>|undefined;
        let selected=accountLanguage(metadata);
        if(data.user&&!selected){
          // Legacy users: initialize once from their explicit visitor choice/device language.
          const fallback=selection.current;
          const result=await client.auth.updateUser({data:{ui_language:fallback}});
          if(!result.error)selected=accountLanguage(result.data.user?.user_metadata)||fallback;
        }
        if(mounted&&ticket===sequence.current){
          const resolved=selected||selection.current;
          selection.current=resolved;setLanguage(resolved);
          persistVisitorLanguage(resolved);updatePageLanguage(resolved);
        }
      }catch {
        // Never overwrite account metadata on authentication/network failures.
      }finally{if(mounted&&ticket===sequence.current)setReady(true);}
    };
    const {data}=client?.auth.onAuthStateChange((event)=>{
      if(event==="SIGNED_IN"||event==="SIGNED_OUT"||event==="USER_UPDATED"||event==="INITIAL_SESSION"){
        setReady(false);
        queueMicrotask(()=>{if(mounted)void synchronize();});
      }
    })||{data:null};
    void synchronize();
    return()=>{mounted=false;sequence.current++;data?.subscription.unsubscribe();};
  },[]);

  const changeLanguage=async(next:InterfaceLanguage)=>{
    if(!interfaceLanguage(next))return;
    const previous=selection.current;
    ++sequence.current;
    selection.current=next;setLanguage(next);
    persistVisitorLanguage(next);updatePageLanguage(next);setSaving(true);
    try {
      const client=getSupabase();
      if(client) {
        const {data,error}=await client.auth.getUser();
        if(error)throw error;
        if(data.user){
          const result=await client.auth.updateUser({data:{ui_language:next}});
          if(result.error)throw result.error;
        }
      }
    }catch(error){
      selection.current=previous;setLanguage(previous);
      persistVisitorLanguage(previous);updatePageLanguage(previous);
      throw error;
    }finally{setSaving(false);setReady(true);}
  };
  const value:InterfaceContextValue={language,ready,saving,changeLanguage,
    translate:(key,values)=>t(language,key,values)};
  return <InterfaceContext.Provider value={value}>
    {ready?children:<div aria-busy="true" role="status" style={{minHeight:"100vh",display:"grid",placeItems:"center"}}>VMV Business</div>}
  </InterfaceContext.Provider>;
}
export function useInterfaceLanguage():InterfaceContextValue{
  const value=useContext(InterfaceContext);
  if(!value)throw new Error("InterfaceLanguageProvider is missing.");
  return value;
}
