"use client";
export type CreativeImageItem={
 id:string;createdAt:number;style:string;prompt:string;blob:Blob;
};
const dbName="vmv-creative-image-history",store="images",maxItems=20;
function openStore():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
  if(typeof indexedDB==="undefined"){reject(Error("history_unavailable"));return;}
  const req=indexedDB.open(dbName,1);
  req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(store))req.result.createObjectStore(store,{keyPath:"id"});};
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(req.error||Error("history_unavailable"));
 });
}
export async function saveCreativeImage(blob:Blob,style:string,prompt:string){
 const db=await openStore();
 try{
  await new Promise<void>((resolve,reject)=>{
   const tx=db.transaction(store,"readwrite"),object=tx.objectStore(store);
   object.put({id:crypto.randomUUID(),createdAt:Date.now(),style,prompt:prompt.slice(0,4000),blob} satisfies CreativeImageItem);
   const all=object.getAll();
   all.onsuccess=()=>{
    const rows=(all.result as CreativeImageItem[]).sort((a,b)=>b.createdAt-a.createdAt);
    for(const row of rows.slice(maxItems))object.delete(row.id);
   };
   tx.oncomplete=()=>resolve();
   tx.onerror=()=>reject(tx.error||Error("history_unavailable"));
   tx.onabort=()=>reject(tx.error||Error("history_unavailable"));
  });
 }finally{db.close();}
}
export async function listCreativeImages():Promise<CreativeImageItem[]>{
 const db=await openStore();
 try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction(store,"readonly"),req=tx.objectStore(store).getAll();
  req.onsuccess=()=>resolve((req.result as CreativeImageItem[]).sort((a,b)=>b.createdAt-a.createdAt));
  req.onerror=()=>reject(req.error||Error("history_unavailable"));
 });}finally{db.close();}
}
export async function removeCreativeImage(id:string):Promise<void>{
 const db=await openStore();
 try{await new Promise<void>((resolve,reject)=>{
  const tx=db.transaction(store,"readwrite");tx.objectStore(store).delete(id);
  tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||Error("history_unavailable"));
 });}finally{db.close();}
}
