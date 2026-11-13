import type {Data} from "@puckeditor/core";
import {normalizeBuilderDocument,validateBuilderDocument} from "./web-builder-puck";

export type WebsiteStyleId="warm"|"impact"|"editorial";
export const WEBSITE_STYLES:{id:WebsiteStyleId;title:string;description:string}[]=[
 {id:"warm",title:"Luminoso",description:"Portada dividida, espacios claros y botones visibles"},
 {id:"impact",title:"Inmersivo",description:"Fotografía de fondo, colores profundos y títulos grandes"},
 {id:"editorial",title:"Editorial",description:"Tipografía protagonista, composición calmada y galería elegante"}
];
const OPTIONS={
 warm:{palette:"rose",font:"rounded",style:"warm",width:"regular",hero:"split",button:"solid",cards:"grid",gallery:"grid"},
 impact:{palette:"forest",font:"geometric",style:"dark",width:"wide",hero:"cover",button:"solid",cards:"mosaic",gallery:"mosaic"},
 editorial:{palette:"terracotta",font:"editorial",style:"editorial",width:"regular",hero:"editorial",button:"outline",cards:"list",gallery:"mosaic"}
} as const;

/**
 * A design change never generates replacement sections. It only changes known
 * visual props while copying all original content, IDs, URLs, products and slots.
 * Existing work remains intact and becomes a draft until the owner publishes.
 */
export function restyleWebsiteDocument(source:Data,styleId:WebsiteStyleId):Data{
 const issue=validateBuilderDocument(source);
 if(issue)throw new Error(issue);
 const before=normalizeBuilderDocument(source);
 const selected=OPTIONS[styleId];
 const tree=JSON.parse(JSON.stringify(before)) as Data;
 const root={...((tree.root?.props||{}) as Record<string,unknown>)};
 tree.root={...tree.root,props:{
  ...root,palette:selected.palette,font:selected.font,
  style:selected.style,width:selected.width
 }};
 const restyle=(items:Data["content"]):void=>{
  for(const item of items){
   const props=item.props as Record<string,unknown>;
   if(item.type==="HeroVisual"){
    props.layout=selected.hero;props.buttonStyle=selected.button;
    if(selected.hero==="cover")props.shade="strong";
   }
   if(item.type==="OfferingGrid")props.layout=selected.cards;
   if(item.type==="PhotoGallery"||item.type==="ProjectShowcase")props.layout=selected.gallery;
   for(const slot of ["content","left","right","third"]){
    if(Array.isArray(props[slot]))restyle(props[slot] as Data["content"]);
   }
  }
 };
 restyle(tree.content);
 const result=normalizeBuilderDocument(tree);
 const sameBlocks=(a:Data["content"],b:Data["content"]):boolean=>{
  if(a.length!==b.length)return false;
  return a.every((item,i)=>{
   if(item.type!==b[i].type||item.props.id!==b[i].props.id)return false;
   const sourceProps=item.props as Record<string,unknown>,newProps=b[i].props as Record<string,unknown>;
   for(const key of ["content","left","right","third"]){
    if(Array.isArray(sourceProps[key])&&!Array.isArray(newProps[key]))return false;
    if(Array.isArray(sourceProps[key])&&!sameBlocks(sourceProps[key] as Data["content"],newProps[key] as Data["content"]))return false;
   }
   for(const key of ["title","description","text","body","image","url","logo","email","phone","address",
    "first","second","third","items","gallery","quote","author","caption","alt"]){
    if(key==="third"&&Array.isArray(sourceProps[key]))continue;
    if(JSON.stringify(sourceProps[key])!==JSON.stringify(newProps[key]))return false;
   }
   return true;
  });
 };
 if(!sameBlocks(before.content,result.content)){
  throw new Error("El cambio de diseño no conservó todo el contenido. No se aplicó.");
 }
 return result;
}
