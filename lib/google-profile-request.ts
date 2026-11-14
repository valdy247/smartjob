import {contactPhoneE164} from "./contact-phone";
export type GoogleKind="storefront"|"service_area"|"hybrid";
export type GoogleHour={closed:boolean;start:string;end:string};
export type GoogleData={
 action:"create"|"claim"|"improve";kind:GoogleKind;googleCategory:string;otherCategories:string;
 street:string;unit:string;city:string;region:string;postal:string;country:string;serviceAreas:string;
 phone:string;secondaryPhone:string;description:string;services:string;products:string;
 bookingUrl:string;existingProfileUrl?:string;openingDate:string;hoursEnabled:boolean;hours:GoogleHour[];
};

export type GoogleValidationIssue={step:number;key:"googleCategory"|"address"|"serviceAreas"|"phone"|"hours"|"country"|"description"|"date"|"length"|"booking"|"existing"};
export function googleProfileIssue(v:GoogleData,step?:number):GoogleValidationIssue|null {
 const at=(s:number)=>step===undefined||step===s;
 if(at(0)&&!v.googleCategory.trim())return {step:0,key:"googleCategory"};
 if(at(1)&&!/^([A-Z]{2})$/.test(v.country))return {step:1,key:"country"};
 if(at(1)&&v.kind!=="service_area"&&[v.street,v.city,v.region,v.postal].some(x=>!x.trim()))return {step:1,key:"address"};
 if(at(1)&&v.kind!=="storefront"&&!v.serviceAreas.trim())return {step:1,key:"serviceAreas"};
 if(at(2)&&[v.phone,v.secondaryPhone].some(x=>x.trim()&&!contactPhoneE164(x,v.country)))return {step:2,key:"phone"};
 if(at(2)&&v.bookingUrl.trim()&&!googleProfileLink(v.bookingUrl))return {step:2,key:"booking"};
 if(at(0)&&v.action!=="create"&&v.existingProfileUrl?.trim()&&!googleProfileLink(v.existingProfileUrl))return {step:0,key:"existing"};
 if(at(3)&&v.hoursEnabled&&(!Array.isArray(v.hours)||v.hours.length!==7||!v.hours.some(h=>!h.closed)||v.hours.some(h=>!h||typeof h.closed!=="boolean"||(!h.closed&&(!/^([01]\d|2[0-3]):[0-5]\d$/.test(h.start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(h.end)||h.start===h.end)))))return {step:3,key:"hours"};
 if(at(3)&&v.action==="create"&&v.openingDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(v.openingDate)||!Number.isFinite(Date.parse(v.openingDate+"T00:00:00Z"))||new Date(v.openingDate+"T00:00:00Z").toISOString().slice(0,10)!==v.openingDate))return {step:3,key:"date"};
 if(at(4)&&(v.description.length>750||/(?:https?:\/\/|www\.)/i.test(v.description)))return {step:4,key:"description"};
 for(const [s,key,limit] of [[0,"googleCategory",100],[0,"otherCategories",250],[0,"existingProfileUrl",500],[1,"street",250],[1,"unit",250],[1,"city",250],[1,"region",250],[1,"postal",250],[1,"serviceAreas",400],[2,"bookingUrl",250],[4,"services",900],[4,"products",900]] as const){
  if(at(s)&&String(v[key]||"").length>limit)return {step:s,key:"length"};
 }
 return null;
}
export function normalizeGoogleProfile(v:GoogleData):GoogleData {
 const clean={...v,country:v.country.trim().toUpperCase(),existingProfileUrl:v.action==="create"?"":v.existingProfileUrl,openingDate:v.action==="create"?v.openingDate:"",
 phone:v.phone.trim()?contactPhoneE164(v.phone,v.country)||v.phone:"",
 secondaryPhone:v.secondaryPhone.trim()?contactPhoneE164(v.secondaryPhone,v.country)||v.secondaryPhone:""};
 return v.kind==="service_area"?{...clean,street:"",unit:"",city:"",region:"",postal:""}:clean;
}
export function googlePhotoHeader(bytes:Uint8Array,mime:string):boolean {
 return mime==="image/png"?[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v):mime==="image/jpeg"&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
}
export async function googlePhotoKey(file:Blob):Promise<string>{
 const bytes=await file.arrayBuffer();
 if(!googlePhotoHeader(new Uint8Array(bytes),file.type))throw new Error("Invalid photo content");
 const hash=await crypto.subtle.digest("SHA-256",bytes);
 return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,"0")).join("");
}

export function googleProfileLink(value:unknown):string|null {
 if(typeof value!=="string"||!value.trim())return null;
 try{const url=new URL(value.trim());return url.protocol==="https:"&&!url.username&&!url.password&&url.hostname?url.href:null;}catch{return null;}
}
