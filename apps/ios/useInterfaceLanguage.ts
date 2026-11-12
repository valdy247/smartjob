import {useEffect,useMemo,useState,useSyncExternalStore} from "react";
import {AppState,NativeModules,Platform} from "react-native";
import * as SecureStore from "expo-secure-store";
import type {Session} from "@supabase/supabase-js";
import {supabase} from "./session";
import {t,INTERFACE_LANGUAGE_KEY,type InterfaceLanguage,type MessageKey} from "../../lib/i18n";
import {LanguagePreference} from "../../lib/i18n-preference";
function deviceLanguage():string{
 const settings=NativeModules.SettingsManager?.settings as {AppleLanguages?:string[];AppleLocale?:string}|undefined;
 return (Platform.OS==="ios"?(settings?.AppleLanguages?.[0]||settings?.AppleLocale):NativeModules.I18nManager?.localeIdentifier)||Intl.DateTimeFormat().resolvedOptions().locale||"en-US";
}
/** Same controller, catalog and account field as web. Never writes spoken language fields. */
export function useNativeInterfaceLanguage(session:Session|null,sessionLoaded:boolean){
 const preference=useMemo(()=>new LanguagePreference(supabase?.auth||null,{
  read:()=>SecureStore.getItemAsync(INTERFACE_LANGUAGE_KEY),write:language=>SecureStore.setItemAsync(INTERFACE_LANGUAGE_KEY,language)
 },deviceLanguage()),[]);
 const state=useSyncExternalStore(preference.subscribe,preference.getSnapshot);
 const currentAccount=session?.user.id||"visitor";
 const [syncedFor,setSyncedFor]=useState<string|null>(null);
 useEffect(()=>{
  if(!sessionLoaded)return;
  let active=true;preference.accountChanged(session?.user.id||null);
  void preference.refresh().then(()=>{if(active)setSyncedFor(currentAccount);});
  return()=>{active=false;};
 },[preference,sessionLoaded,currentAccount]);
 useEffect(()=>{
  const listener=AppState.addEventListener("change",value=>{if(value==="active"&&sessionLoaded)void preference.refresh();});
  return()=>listener.remove();
 },[preference,sessionLoaded]);
 return {...state,ready:sessionLoaded&&syncedFor===currentAccount&&state.ready,
  retry:()=>preference.refresh(),
  changeLanguage:async(next:InterfaceLanguage)=>{
   await preference.choose(next);
   if(preference.getSnapshot().error==="save")throw new Error("Language save failed");
  },translate:(key:MessageKey,values?:Record<string,string|number>)=>t(state.language,key,values)};
}
