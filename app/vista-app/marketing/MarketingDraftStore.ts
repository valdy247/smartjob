import type {GoogleMedia,GoogleData} from "./GoogleProfileWizard";
import type {WebRepairData} from "./WebRepairStudio";
import type {DirectoryData} from "./DirectoryDiscovery";

// An unauthenticated draft stays in this tab; authenticated drafts are isolated by account.
// Never store passwords, tokens, identity documents, or payment details in either store.
const LEGACY_KEY="vmv-marketing-request-draft-v1";
const KEY="vmv-marketing-draft-v2";
const MEDIA_DB="vmv-marketing-draft-media";
const MAX_AGE=48*60*60*1000;
export type StoredMarketingDraft={
 version:2;savedAt:number;requestId:string;ownerId:string|null;service:string;
 step:number;googleStep:number;webStage?:number;consent?:boolean;name:string;site:string;category:string;goal:string;
 reviewInput:string;reviewTone:"cordial"|"breve";reviewMode?:"respond"|"request";reviewLink:string;reviewReply:string;
 googleData:GoogleData;webRepair:WebRepairData;directoryData?:DirectoryData;
};
export const guestDraftKey=KEY+":guest";
const ownerKey=(uid:string)=>KEY+":owner:"+uid;
const storageFor=(uid:string|null)=>uid?localStorage:sessionStorage;
const storeKey=(uid:string|null)=>uid?ownerKey(uid):guestDraftKey;
const valid=(value:unknown):value is StoredMarketingDraft=>{
 if(!value||typeof value!=="object")return false;
 const d=value as Partial<StoredMarketingDraft>;
 return d.version===2&&typeof d.requestId==="string"&&
 /^[a-f0-9-]{36}$/i.test(d.requestId)&&typeof d.savedAt==="number"&&
 Date.now()-d.savedAt<MAX_AGE&&d.step!==undefined&&d.step>=1&&d.step<=3;
};
export function readMarketingDraft(uid:string|null):StoredMarketingDraft|null{
 try{
  const storage=storageFor(uid),key=storeKey(uid),raw=storage.getItem(key);
  if(!raw)return null;
  const value=JSON.parse(raw) as unknown;
  if(!valid(value)||value.ownerId!==uid){storage.removeItem(key);if(value&&typeof value==="object"&&typeof (value as {requestId?:unknown}).requestId==="string")void clearMarketingDraft(uid,(value as {requestId:string}).requestId);return null;}
  return value;
 }catch{return null;}
}
export function writeMarketingDraft(value:StoredMarketingDraft):boolean{
 try{storageFor(value.ownerId).setItem(storeKey(value.ownerId),JSON.stringify(value));return true;}
 catch{return false;}
}
// A guest draft is moved to the verified account only when this tab initiated login.
export function markGuestLoginPending(){
 try{sessionStorage.setItem(KEY+":login-pending","1");}catch{}
}
export function transferGuestDraft(uid:string):StoredMarketingDraft|null{
 try{
  if(sessionStorage.getItem(KEY+":login-pending")!=="1")return null;
  sessionStorage.removeItem(KEY+":login-pending");
  const guest=readMarketingDraft(null);
  if(!guest)return null;
  const existing=readMarketingDraft(uid);
  if(existing)return existing;
  const next={...guest,ownerId:uid,savedAt:Date.now()};
  if(!writeMarketingDraft(next))return null;
  sessionStorage.removeItem(guestDraftKey);
  return next;
 }catch{return null;}
}
export function migrateLegacyDraft():StoredMarketingDraft|null{
 try{
  const raw=localStorage.getItem(LEGACY_KEY);
  if(!raw)return null;
  const old=JSON.parse(raw) as Partial<StoredMarketingDraft> & {consent?:boolean};
  if(!old||typeof old.savedAt!=="number"||Date.now()-old.savedAt>MAX_AGE||!old.service||!old.name)return null;
  if(old.step===undefined||old.step<1||old.step>3)return null;
  const next:StoredMarketingDraft={
   version:2,savedAt:Date.now(),requestId:crypto.randomUUID(),ownerId:null,
   service:old.service,step:old.step,googleStep:old.googleStep||0,
   name:old.name,site:old.site||"",category:old.category||"other",
   goal:old.goal||"",reviewInput:old.reviewInput||"",reviewTone:old.reviewTone||"cordial",
   reviewLink:"",reviewReply:"",googleData:old.googleData as GoogleData,
   webRepair:old.webRepair as WebRepairData,directoryData:old.directoryData
  };
  if(writeMarketingDraft(next)){localStorage.removeItem(LEGACY_KEY);return next;}
 }catch{}
 return null;
}
function openMedia():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
  if(typeof indexedDB==="undefined")return reject(Error("No hay almacenamiento de imágenes"));
  const r=indexedDB.open(MEDIA_DB,2);
  r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains("files"))r.result.createObjectStore("files");};
  r.onsuccess=()=>resolve(r.result);
  r.onerror=()=>reject(r.error||Error("No disponible"));
 });
}
const mediaKey=(requestId:string)=>"media:"+requestId;
export async function readDraftMedia(requestId:string):Promise<GoogleMedia|null>{
 const db=await openMedia();
 try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction("files","readonly");const q=tx.objectStore("files").get(mediaKey(requestId));
  q.onsuccess=()=>resolve(q.result?.media||null);q.onerror=()=>reject(q.error);
 });}finally{db.close();}
}
export async function saveDraftMedia(requestId:string,media:GoogleMedia):Promise<void>{
 const db=await openMedia();
 try{await new Promise<void>((resolve,reject)=>{
  const tx=db.transaction("files","readwrite");
  tx.objectStore("files").put({media,updatedAt:Date.now()},mediaKey(requestId));
  tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
 });}finally{db.close();}
}
export async function clearMarketingDraft(uid:string|null,requestId:string):Promise<void>{
 try{storageFor(uid).removeItem(storeKey(uid));}catch{}
 try{const db=await openMedia();try{await new Promise<void>((resolve,reject)=>{
  const tx=db.transaction("files","readwrite");tx.objectStore("files").delete(mediaKey(requestId));
  tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
 });}finally{db.close();}}catch{}
}
