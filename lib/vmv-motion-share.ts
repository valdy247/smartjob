import {createHmac,timingSafeEqual} from "node:crypto";

// A short, authenticated bearer token. No database credentials or signed object URLs are included.
const uuid="[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const allowedPath=new RegExp("^"+uuid+"/"+uuid+"/(?:final\\.(?:mp4|webm)|versions/"+uuid+"\\.(?:mp4|webm))$","i");
const secondsInWeek=7*24*60*60;
function key():Buffer|null{
 const secret=process.env.VMV_MOTION_SHARE_SECRET||process.env.SUPABASE_SECRET_KEY;
 return secret&&secret.length>=24?createHmac("sha256",secret).update("vmv-motion-share-v1").digest():null;
}
export function createMotionShareToken(path:string,now=Date.now()):
 {token:string;expiresAt:string}|null{
 const k=key();
 if(!k||!allowedPath.test(path)||!Number.isFinite(now))return null;
 const expiry=Math.floor(now/1000)+secondsInWeek;
 const data=Buffer.from(JSON.stringify({v:1,p:path,e:expiry})).toString("base64url");
 const signature=createHmac("sha256",k).update(data).digest("base64url");
 return {token:data+"."+signature,expiresAt:new Date(expiry*1000).toISOString()};
}
export function readMotionShareToken(token:string,now=Date.now()):
 {path:string;filename:string;expiresAt:string}|null{
 const k=key();
 if(!k||typeof token!=="string"||token.length>512||
  !/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/.test(token))return null;
 const [data,mac]=token.split(".");
 const expected=createHmac("sha256",k).update(data).digest();
 let actual:Buffer;
 try{actual=Buffer.from(mac,"base64url");}catch{return null;}
 if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return null;
 try{
  const value=JSON.parse(Buffer.from(data,"base64url").toString("utf8")) as
   {v?:unknown;p?:unknown;e?:unknown};
  const expiry=value.e,nowSeconds=Math.floor(now/1000);
  if(value.v!==1||typeof value.p!=="string"||!allowedPath.test(value.p)||
   typeof expiry!=="number"||!Number.isInteger(expiry)||
   expiry<=nowSeconds||expiry>nowSeconds+secondsInWeek+60)return null;
  const parts=value.p.split("/"),extension=value.p.endsWith(".mp4")?"mp4":"webm";
  return {path:value.p,filename:"VMV-Motion-"+parts[1].slice(0,8)+"."+extension,
   expiresAt:new Date(expiry*1000).toISOString()};
 }catch{return null;}
}