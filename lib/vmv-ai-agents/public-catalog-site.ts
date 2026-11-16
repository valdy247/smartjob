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
 image_path:string|null;updated_at:string;
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
  // The "Ambos" wizard generates explicit service-* entries alongside products.
  // Preserve those service cards when live catalog products replace the snapshot.
  const existing=Array.isArray(node.props?.items)?node.props.items:[];
  const serviceCards=existing.flatMap((item:unknown)=>{
   if(!item||typeof item!=="object")return [];
   const card=item as {id?:unknown;title?:unknown};
   if(typeof card.id!=="string"||!/^service-\\d{1,2}$/.test(card.id)||
      typeof card.title!=="string"||!card.title.trim())return [];
   return [{id:card.id,title:card.title.slice(0,120),description:"",price:"",
    alt:card.title.slice(0,120),image:""}];
  });
  return {...node,props:{...node.props,items:[...catalog,...serviceCards].slice(0,40),showPrices:"yes"}};
 });
 if(!replaced&&catalog.length){
  // An existing site can connect an inventory even if it has no product grid.
  const contactIndex=content.findIndex(node=>node.type==="Contact");
  const location=contactIndex<0?content.length:contactIndex;
  content.splice(location,0,{type:"OfferingGrid",props:{
   id:"linked-inventory-catalog",title:"Nuestros productos",description:"",
   items:catalog,layout:"grid",padding:"normal",surface:"light",
   columns:"3",showPrices:"yes"
  }});
  replaced=true;
 }
 return replaced?{...document,content}:document;
}
