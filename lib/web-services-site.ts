/** Web Services — validated content shape shared by the editor and public renderer. */
export type WebPalette="violet"|"mint"|"amber"|"ink";
export type WebTemplate="editorial"|"showcase"|"minimal";
export type WebSiteContent={
 business:string;headline:string;eyebrow:string;intro:string;about:string;
 services:string;email:string;phone:string;address:string;action:string;
 palette:WebPalette;template:WebTemplate;
};
export const defaultWebContent:WebSiteContent={
 business:"",headline:"",eyebrow:"ESTUDIO / SERVICIOS",intro:"",about:"",
 services:"",email:"",phone:"",address:"",action:"Contáctanos",
 palette:"violet",template:"editorial"
};
const limits:Record<Exclude<keyof WebSiteContent,"palette"|"template">,number>={
 business:100,headline:180,eyebrow:70,intro:400,about:900,services:450,email:180,
 phone:36,address:250,action:45
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
  if(typeof source[key]==="string")result[key]=source[key].slice(0,limits[key]).trim();
 }
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
