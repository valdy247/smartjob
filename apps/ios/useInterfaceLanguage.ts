import {useEffect,useRef,useState} from "react";
import {NativeModules,Platform} from "react-native";
import * as SecureStore from "expo-secure-store";
import type {Session} from "@supabase/supabase-js";
import {supabase} from "./session";
import {accountLanguage,interfaceLanguage,t,visitorLanguage,INTERFACE_LANGUAGE_KEY,
 type InterfaceLanguage,type MessageKey} from "../../lib/i18n";

function deviceLanguage():string{
 if(Platform.OS==="ios"){
  const settings=NativeModules.SettingsManager?.settings as
   {AppleLanguages?:string[];AppleLocale?:string}|undefined;
  if(settings?.AppleLanguages?.[0])return settings.AppleLanguages[0];
  if(settings?.AppleLocale)return settings.AppleLocale;
 }
 return Intl.DateTimeFormat().resolvedOptions().locale||"en-US";
}
/** UI preference only. Never writes spoken call or agent language fields. */
export function useNativeInterfaceLanguage(session:Session|null,sessionLoaded:boolean){
 const [language,setLanguage]=useState<InterfaceLanguage>("es");
 const [syncedFor,setSyncedFor]=useState<string|null>(null);
 const [saving,setSaving]=useState(false);
 const revision=useRef(0);
 const currentAccount=session?.user.id||"visitor";
 useEffect(()=>{
  if(!sessionLoaded)return;
  let live=true;
  const ticket=++revision.current;
  setSyncedFor(null);
  void (async()=>{
   let stored:string|null=null;
   try{stored=await SecureStore.getItemAsync(INTERFACE_LANGUAGE_KEY);}catch{}
   const fallback=visitorLanguage(stored,deviceLanguage());
   let selected=accountLanguage(session?.user.user_metadata as Record<string,unknown>|undefined);
   if(session?.user&&supabase){
    try{
     const {data,error}=await supabase.auth.getUser();
     if(!error&&data.user?.id===session.user.id){
      selected=accountLanguage(data.user.user_metadata as Record<string,unknown>)||selected;
      if(!selected){
       const updated=await supabase.auth.updateUser({data:{ui_language:fallback}});
       if(!updated.error)selected=accountLanguage(updated.data.user?.user_metadata)||fallback;
      }
     }
    }catch{/* Keep local locale if the account is temporarily unreachable. */}
   }
   if(!live||ticket!==revision.current)return;
   const resolved=selected||fallback;
   setLanguage(resolved);setSyncedFor(currentAccount);
   try{await SecureStore.setItemAsync(INTERFACE_LANGUAGE_KEY,resolved);}catch{}
  })();
  return()=>{live=false;revision.current++;};
 },[sessionLoaded,currentAccount]);
 async function changeLanguage(next:InterfaceLanguage){
  if(!interfaceLanguage(next))return;
  const previous=language;
  ++revision.current;
  setLanguage(next);setSyncedFor(currentAccount);setSaving(true);
  try{
   await SecureStore.setItemAsync(INTERFACE_LANGUAGE_KEY,next);
   if(session?.user&&supabase){
    const {data,error}=await supabase.auth.getUser();
    if(error||data.user?.id!==session.user.id)throw error||Error("Session not verified");
    const result=await supabase.auth.updateUser({data:{ui_language:next}});
    if(result.error)throw result.error;
   }
  }catch(error){
   setLanguage(previous);
   try{await SecureStore.setItemAsync(INTERFACE_LANGUAGE_KEY,previous);}catch{}
   throw error;
  }finally{setSaving(false);}
 }
 return {language,ready:sessionLoaded&&syncedFor===currentAccount,saving,
  changeLanguage,translate:(key:MessageKey,values?:Record<string,string|number>)=>t(language,key,values)};
}
