import type {Data} from "@puckeditor/core";
import type {CSSProperties} from "react";

export type ImageTarget={field:string;index?:number;itemId?:string};
export function imageTargetIndex(props:Record<string,unknown>,target:ImageTarget):number{
 if(!Array.isArray(props.items))return -1;
 if(target.itemId){
  const index=props.items.findIndex((item:unknown)=>Boolean(item)&&typeof item==="object"&&
   (item as Record<string,unknown>).id===target.itemId);
  // Never fall back to the old index when an identified item was removed.
  return index;
 }
 return typeof target.index==="number"&&props.items[target.index]!==undefined?target.index:-1;
}
export const IMAGE_SETTINGS={imageWidth:100,imageWidthMobile:100,imageRadius:16,
 imageOpacity:0,imageBorder:0,borderColor:"#30243F",imageMoveX:0,imageMoveY:0,
 imageMoveXMobile:0,imageMoveYMobile:0,imageAlign:"left",imageAlignMobile:"left"};
const finite=(value:unknown,fallback:number,min:number,max:number)=>
 typeof value==="number"&&Number.isFinite(value)?Math.max(min,Math.min(max,Math.round(value))):fallback;
export function normalizeImageSettings(source:Record<string,unknown>,radius=16):Record<string,unknown>{
 const result:Record<string,unknown>={};
 for(const [key,min,max,fallback] of [
  ["imageWidth",25,100,100],["imageWidthMobile",25,100,100],["imageRadius",0,80,radius],
  ["imageOpacity",0,100,0],["imageBorder",0,12,0],
  ["imageMoveX",-2000,2000,0],["imageMoveY",-2000,2000,0],
  ["imageMoveXMobile",-2000,2000,0],["imageMoveYMobile",-2000,2000,0]
 ] as const)result[key]=finite(source[key],fallback,min,max);
 result.borderColor=typeof source.borderColor==="string"&&/^#[\da-f]{6}$/i.test(source.borderColor)?source.borderColor:"#30243F";
 for(const key of ["imageAlign","imageAlignMobile"])
  result[key]=["left","center","right"].includes(String(source[key]))?source[key]:"left";
 return result;
}
export function imageSettingsStyle(source:Record<string,unknown>,radius=16):CSSProperties{
 const p=normalizeImageSettings(source,radius);
 const margins=(align:unknown)=>align==="center"?["auto","auto"]:align==="right"?["auto","0px"]:["0px","auto"];
 const desktop=margins(p.imageAlign),mobile=margins(p.imageAlignMobile);
 return {"--image-width":p.imageWidth+"%","--image-width-mobile":p.imageWidthMobile+"%",
  "--image-x":p.imageMoveX+"px","--image-y":p.imageMoveY+"px",
  "--image-x-mobile":p.imageMoveXMobile+"px","--image-y-mobile":p.imageMoveYMobile+"px",
  "--image-left":desktop[0],"--image-right":desktop[1],"--image-left-mobile":mobile[0],"--image-right-mobile":mobile[1],
  borderRadius:p.imageRadius+"px",borderWidth:p.imageBorder+"px",borderStyle:"solid",
  borderColor:String(p.borderColor),"--image-opacity":(100-Number(p.imageOpacity))/100} as CSSProperties;
}
export function imageTargets(type:string,props:Record<string,unknown>):Array<ImageTarget&{label:string}>{
 if(["ComposeImage","HeroVisual","Image"].includes(type))return [{field:type==="Image"?"url":"image",label:"Imagen"}];
 if(["OfferingGrid","PhotoGallery","ProjectShowcase","TeamGrid"].includes(type)&&Array.isArray(props.items))
  return props.items.map((item:Record<string,unknown>,index:number)=>({field:"image",index,
   itemId:typeof item.id==="string"&&item.id.length>=3?item.id:undefined,
   label:String(item.title||item.caption||item.alt||"Imagen "+(index+1))}));
 if(type==="BeforeAfter")return [{field:"beforeImage",label:"Antes"},{field:"afterImage",label:"Después"}];
 return [];
}
export function targetSettings(props:Record<string,unknown>,target:ImageTarget):Record<string,unknown>{
 if(target.index!==undefined||target.itemId){
  const index=imageTargetIndex(props,target);
  return index<0?{}:(props.items as Record<string,unknown>[])[index]||{};
 }
 if(target.field==="beforeImage"||target.field==="afterImage"){
  const value=props[target.field+"Settings"];
  return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
 }
 return props;
}
export function targetImage(props:Record<string,unknown>,target:ImageTarget):string{
 const value=target.index!==undefined||target.itemId?targetSettings(props,target)[target.field]:props[target.field];
 return typeof value==="string"?value:"";
}
/** Patch a block by ID, never by URL: reusing a file must not couple its placements. */
export function patchBuilderImage(data:Data,id:string,target:ImageTarget,patch:Record<string,unknown>):Data{
 let changed=false;
 const walk=(rows:Data["content"]):Data["content"]=>rows.map(node=>{
  const source=node.props as Record<string,unknown>;
  let props=source;
  if(source.id===id){
   if(target.index!==undefined||target.itemId){
    const index=imageTargetIndex(source,target);
    if(index<0)return node;
    props={...source,items:(source.items as Record<string,unknown>[]).map((item,i)=>i===index?{...item,...patch}:item)};
   }else if(target.field==="beforeImage"||target.field==="afterImage"){
    const { [target.field]:image,...settings }=patch;
    props={...source,...(image!==undefined?{[target.field]:image}:{}),
     [target.field+"Settings"]:{...targetSettings(source,target),...settings}};
   }else props={...source,...patch};
   changed=true;
  }
  for(const slot of ["content","left","right","third"])
   if(Array.isArray(props[slot]))props={...props,[slot]:walk(props[slot] as Data["content"])};
  return props===source?node:{...node,props};
 });
 const content=walk(data.content);
 return changed?{...data,content}:data;
}

export function imageDestinations(data:Data):Array<{id:string;slot:string;label:string}>{
 const result=[{id:"",slot:"content",label:"Página · Al final"}];
 let section=0,columns=0;
 const walk=(rows:Data["content"])=>{
  for(const node of rows){
   const props=node.props as Record<string,unknown>;
   if(node.type==="SectionLayout")result.push({id:String(props.id),slot:"content",label:"Sección "+(++section)});
   if(node.type==="ColumnsLayout"){
    columns++;
    for(const slot of ["left","right",...(props.columns==="3"?["third"]:[])])
     result.push({id:String(props.id),slot,label:"Columnas "+columns+" · "+({left:"Izquierda",right:"Derecha",third:"Tercera"}[slot])});
   }
   for(const key of ["content","left","right","third"])
    if(Array.isArray(props[key]))walk(props[key] as Data["content"]);
  }
 };
 walk(data.content);return result;
}
/** Relocate a standalone photo structurally so mobile can reflow it normally. */
export function moveBuilderImage(data:Data,id:string,parentId:string,slot:string):Data{
 if(!imageDestinations(data).some(d=>d.id===parentId&&d.slot===slot))return data;
 let found:Data["content"][number]|undefined;
 const remove=(rows:Data["content"]):Data["content"]=>rows.flatMap(node=>{
  if(node.props.id===id&&["Image","ComposeImage"].includes(node.type)){found=node;return [];}
  const props={...node.props} as Record<string,unknown>;
  for(const key of ["content","left","right","third"])
   if(Array.isArray(props[key]))props[key]=remove(props[key] as Data["content"]);
  return [{...node,props}];
 });
 let content=remove(data.content);
 if(!found)return data;
 const moved={...found,props:{...found.props,imageMoveX:0,imageMoveY:0,imageMoveXMobile:0,imageMoveYMobile:0}};
 if(!parentId)return {...data,content:[...content,moved]};
 const insert=(rows:Data["content"]):Data["content"]=>rows.map(node=>{
  const props={...node.props} as Record<string,unknown>;
  if(props.id===parentId){props[slot]=[...(props[slot] as Data["content"]||[]),moved];return {...node,props};}
  for(const key of ["content","left","right","third"])
   if(Array.isArray(props[key]))props[key]=insert(props[key] as Data["content"]);
  return {...node,props};
 });
 content=insert(content);return {...data,content};
}
