import "react-native-url-polyfill/auto";
import {createClient} from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";

const url=process.env.EXPO_PUBLIC_SUPABASE_URL||"";
const key=process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY||"";

// Persist Supabase sessions in the iOS Keychain, not plain-text AsyncStorage.
// Chunking avoids the iOS SecureStore individual-item size limit.
const normalize=(id:string)=>"smartjob."+id.replace(/[^a-zA-Z0-9._-]/g,"_");
const maxChunk=1700;
const storage={
  async getItem(name:string){
    const prefix=normalize(name);
    const count=Number(await SecureStore.getItemAsync(prefix+".count"));
    if(!Number.isInteger(count)||count<1||count>20)return null;
    const parts:string[]=[];
    for(let i=0;i<count;i++){
      const chunk=await SecureStore.getItemAsync(prefix+"."+i);
      if(chunk===null)return null;
      parts.push(chunk);
    }
    return parts.join("");
  },
  async setItem(name:string,value:string){
    const prefix=normalize(name);
    const previous=Number(await SecureStore.getItemAsync(prefix+".count"))||0;
    const chunks=value.match(/[\s\S]{1,1700}/g)||[];
    if(chunks.length>20)throw new Error("Sesión demasiado grande para almacenamiento seguro.");
    for(let i=0;i<chunks.length;i++)await SecureStore.setItemAsync(prefix+"."+i,chunks[i]);
    for(let i=chunks.length;i<Math.min(previous,20);i++)await SecureStore.deleteItemAsync(prefix+"."+i);
    await SecureStore.setItemAsync(prefix+".count",String(chunks.length));
  },
  async removeItem(name:string){
    const prefix=normalize(name);
    const count=Number(await SecureStore.getItemAsync(prefix+".count"))||0;
    await SecureStore.deleteItemAsync(prefix+".count");
    for(let i=0;i<Math.min(count,20);i++)await SecureStore.deleteItemAsync(prefix+"."+i);
  }
};

export const configured=Boolean(url&&key);
// Internal Preview talks only to the isolated pilot API. Production builds keep their configured URL.
const pilotApi="https://smartjob-git-feat-live-v2-produ-44ed8c-valdys-projects-b97fc7a6.vercel.app";
// Safety: Preview builds must never fall back to the unrelated production API.
// EAS development environment can carry a production EXPO_PUBLIC_SMARTJOB_API;
// explicit pilot selection wins to preserve correct assets, billing and phone routing.
export const api=process.env.EXPO_PUBLIC_SMARTJOB_PREVIEW==="true"
  ?pilotApi
  :(process.env.EXPO_PUBLIC_SMARTJOB_API||"https://smartjob-xi.vercel.app");
export const supabase=configured?createClient(url,key,{
  auth:{storage,autoRefreshToken:true,persistSession:true,detectSessionInUrl:false}
}):null;
