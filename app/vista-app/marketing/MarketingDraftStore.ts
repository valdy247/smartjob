import type {GoogleMedia} from "./GoogleProfileWizard";
import type {GoogleData} from "./GoogleProfileWizard";
import type {WebRepairData} from "./WebRepairStudio";
import type {DirectoryData} from "./DirectoryDiscovery";

export const DRAFT_KEY="vmv-marketing-request-draft-v1";
const DB_NAME="vmv-marketing-draft-media";
const MAX_AGE=48*60*60*1000;
export type StoredMarketingDraft={
 version:1;savedAt:number;service:string;step:number;googleStep:number;
 name:string;site:string;category:string;goal:string;reviewInput:string;reviewTone:"cordial"|"breve";
 consent:boolean;googleData:GoogleData;webRepair:WebRepairData;directoryData?:DirectoryData;
};
export function readMarketingDraft():StoredMarketingDraft|null{
 try{
  const value=localStorage.getItem(DRAFT_KEY);
  if(!value)return null;
  const record=JSON.parse(value) as StoredMarketingDraft;
  if(record.version!==1||!Number.isFinite(record.savedAt)||Date.now()-record.savedAt>MAX_AGE||record.step<1||record.step>3){
   localStorage.removeItem(DRAFT_KEY);return null;
  }
  return record;
 }catch{return null;}
}
export function writeMarketingDraft(record:StoredMarketingDraft):boolean{
 try{localStorage.setItem(DRAFT_KEY,JSON.stringify(record));return true;}
 catch{return false;}
}
function openMediaDb():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
  if(typeof indexedDB==="undefined"){reject(Error("Almacenamiento de fotos no disponible"));return;}
  const request=indexedDB.open(DB_NAME,1);
  request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains("files"))request.result.createObjectStore("files");};
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error||Error("No fue posible abrir las fotos guardadas"));
 });
}
export async function readDraftMedia():Promise<GoogleMedia|null>{
 const db=await openMediaDb();
 try{return await new Promise<GoogleMedia|null>((resolve,reject)=>{
  const tx=db.transaction("files","readonly");
  const req=tx.objectStore("files").get("draft");
  req.onsuccess=()=>resolve(req.result?.media||null);
  req.onerror=()=>reject(req.error);
 });}finally{db.close();}
}
export async function saveDraftMedia(media:GoogleMedia):Promise<void>{
 const db=await openMediaDb();
 try{await new Promise<void>((resolve,reject)=>{
  const tx=db.transaction("files","readwrite");
  tx.objectStore("files").put({media,updatedAt:Date.now()},"draft");
  tx.oncomplete=()=>resolve();
  tx.onerror=()=>reject(tx.error||Error("No se pudieron guardar las imágenes"));
  tx.onabort=()=>reject(tx.error||Error("No se pudieron guardar las imágenes"));
 });}finally{db.close();}
}
export async function clearMarketingDraft():Promise<void>{
 try{localStorage.removeItem(DRAFT_KEY);}catch{}
 try{
  const db=await openMediaDb();
  try{await new Promise<void>((resolve,reject)=>{
   const tx=db.transaction("files","readwrite");
   tx.objectStore("files").delete("draft");
   tx.oncomplete=()=>resolve();
   tx.onerror=()=>reject(tx.error);
  });}finally{db.close();}
 }catch{}
}
