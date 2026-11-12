/** Web Services — validated content shape shared by the editor and public renderer. */
import {categoryById,categoryLabel} from "./vmv-business-categories";
export type WebPalette="violet"|"mint"|"amber"|"ink";
export type WebTemplate="editorial"|"showcase"|"minimal";
export type WebSiteContent={
 business:string;headline:string;eyebrow:string;intro:string;about:string;
 services:string;email:string;phone:string;address:string;action:string;
 categoryId:string;heroImage:string;gallery:string[];
 palette:WebPalette;template:WebTemplate;
};
export const defaultWebContent:WebSiteContent={
 business:"",headline:"",eyebrow:"",intro:"",about:"",
 services:"",email:"",phone:"",address:"",action:"Contáctanos",
 categoryId:"",heroImage:"",gallery:[],
 palette:"violet",template:"editorial"
};
const limits:Record<Exclude<keyof WebSiteContent,"palette"|"template"|"gallery">,number>={
 business:100,headline:180,eyebrow:70,intro:400,about:900,services:450,email:180,
 phone:36,address:250,action:45,categoryId:65,heroImage:450
};
const paletteValues:WebPalette[]=["violet","mint","amber","ink"];
const templateValues:WebTemplate[]=["editorial","showcase","minimal"];
export const paletteStyles:Record<WebPalette,{accent:string,light:string,ink:string}>={
 violet:{accent:"#8256de",light:"#f0e8ff",ink:"#262039"},
 mint:{accent:"#168a6f",light:"#e1f8ef",ink:"#192d29"},
 amber:{accent:"#a76d1d",light:"#fff1cd",ink:"#332a1e"},
 ink:{accent:"#252333",light:"#e9e9ef",ink:"#242333"}
};
export function normalizeWebContent(input:unknown):WebSiteContent{
 const source=input&&typeof input==="object"&&!Array.isArray(input)?input as Record<string,unknown>:{};
 const result={...defaultWebContent};
 for(const key of Object.keys(limits) as (keyof typeof limits)[]){
  if(typeof source[key]==="string"){
   const clean=source[key].slice(0,limits[key]).trim();
   if(key==="categoryId")result.categoryId=categoryById(clean)?.id||"";
   else if(key==="heroImage")result.heroImage=safeWebImageUrl(clean)||"";
   else result[key]=clean;
  }
 }
 if(Array.isArray(source.gallery))result.gallery=source.gallery.filter((url):url is string=>typeof url==="string")
  .map(url=>safeWebImageUrl(url)||"").filter(Boolean).slice(0,4);
 if(paletteValues.includes(source.palette as WebPalette))result.palette=source.palette as WebPalette;
 if(templateValues.includes(source.template as WebTemplate))result.template=source.template as WebTemplate;
 return result;
}
export function webServices(content:WebSiteContent):string[]{
 return content.services.split(/\r?\n/).map(s=>s.trim()).filter(Boolean).slice(0,6);
}
export function webEmail(content:WebSiteContent):string|null {
 const email=content.email.trim();
 return /^[^\s@<>:?#]+@[^\s@<>:?#]+\.[^\s@<>:?#]+$/.test(email)?email:null;
}
export function webPhone(content:WebSiteContent):string|null{
 const phone=content.phone.trim().replace(/[^\d+]/g,"");
 return /^\+?\d{7,15}$/.test(phone)?phone:null;
}

/** Only VMV's own public asset bucket is renderable: no arbitrary remote URLs. */
export function safeWebImageUrl(value:string):string|null{
 try{
  const expected=process.env.NEXT_PUBLIC_SUPABASE_URL;
  if(!expected||value.length>450)return null;
  const url=new URL(value);
  if(url.origin!==new URL(expected).origin||url.search||url.hash)return null;
  const path="/storage/v1/object/public/smartjob-web-images/";
  if(!url.pathname.startsWith(path))return null;
  const asset=url.pathname.slice(path.length);
  if(!/^[a-f0-9-]{36}\/[a-f0-9-]{36}\.(jpg|png|webp)$/.test(asset))return null;
  return url.toString();
 }catch{return null;}
}
export function webCategory(content:WebSiteContent):string{
 return categoryLabel(content.categoryId,content.eyebrow||"TU NEGOCIO · TU IDENTIDAD");
}
