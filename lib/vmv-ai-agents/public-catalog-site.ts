import type {Data} from "@puckeditor/core";
import {safeWebImageUrl} from "@/lib/web-services-site";

const pathPattern=/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/;

/** Convert a canonical owner-uploaded object path to a safe first-party public URL.
 * Never consult the AI or a user-authored web card for this image. */
export function canonicalCatalogImageUrl(path:string|null|undefined,owner:string,business:string,base:string):string{
 if(!path||!pathPattern.test(path)||!path.startsWith(owner+"/"+business+"/"))return "";
 const url=base.replace(/\/$/,"")+"/storage/v1/object/public/vmv-catalog-images/"+path;
 return safeWebImageUrl(url)||"";
}
export type ApprovedInventoryProduct={
 id:string;name:string;description:string|null;price_cents:number;currency:string;
 image_path:string|null;
};
export function applyPublishedInventory(document:Data,products:ApprovedInventoryProduct[],
 owner:string,business:string,supabaseUrl:string):Data{
 const catalog=products.filter(p=>p.currency==="usd"&&p.name&&Number.isInteger(p.price_cents)&&
  p.price_cents>0).slice(0,40).map(p=>({
   id:p.id,title:p.name.slice(0,120),description:(p.description||"").slice(0,400),
   price:"$"+(p.price_cents/100).toFixed(2),alt:p.name.slice(0,120),
   image:canonicalCatalogImageUrl(p.image_path,owner,business,supabaseUrl),
   // Public canonical inventory cards always display the original photo as-is.
   catalogOriginal:true,imageRadius:0,imageBorder:0,imageOpacity:0,
   imageMoveX:0,imageMoveY:0,imageMoveXMobile:0,imageMoveYMobile:0
  }));
 let replaced=false;
 const content=document.content.map(node=>{
  // Explicit site-level link replaces only the main product section.
  if(node.type!=="OfferingGrid"||replaced)return node;
  replaced=true;
  return {...node,props:{...node.props,items:catalog,showPrices:"yes"}};
 });
 return replaced?{...document,content}:document;
}
