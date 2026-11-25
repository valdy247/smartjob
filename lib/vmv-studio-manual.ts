export type ManualMotion="animate"|"zoom"|"still";
export type ManualQuality="turbo"|"high";
export const MAX_MANUAL_SCENES=12;
export const MAX_MANUAL_UPLOAD_BYTES=2_500_000;
export const manualImagePath=(owner:string,projectId:string,index:number)=>
 owner+"/"+projectId+"/image_"+index+".jpg";
export const validManualMotion=(motion:unknown):motion is ManualMotion=>
 motion==="animate"||motion==="zoom"||motion==="still";
export const validManualQuality=(quality:unknown):quality is ManualQuality=>
 quality==="turbo"||quality==="high";
export const manualPrice=(motions:ManualMotion[],quality:ManualQuality)=>
 2+motions.reduce((cost,m)=>cost+(m==="animate"?(quality==="high"?13:5):
  m==="zoom"?1:0),0);
export function validManualStoryboard(scenes:unknown):scenes is {
 prompt:string;motion:ManualMotion}[]{
 return Array.isArray(scenes)&&scenes.length>=3&&scenes.length<=MAX_MANUAL_SCENES&&
 scenes.every(s=>s&&typeof s==="object"&&
 typeof s.prompt==="string"&&s.prompt.trim().length>=20&&s.prompt.length<=950&&
 validManualMotion(s.motion));
}
/** Reject non-JPEG content or malformed/dangerous dimensions before storage. */
export function readManualJpegDimensions(bytes:Uint8Array){
 if(bytes.length<1024||bytes.length>MAX_MANUAL_UPLOAD_BYTES||
  bytes[0]!==0xff||bytes[1]!==0xd8)return null;
 let i=2;
 while(i<bytes.length-10){
  if(bytes[i]!==0xff)return null;
  while(bytes[i]===0xff)i++;
  const marker=bytes[i++];
  if(marker===0xd9||marker===0xda)break;
  if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;
  if(i+2>bytes.length)return null;
  const length=bytes[i]*256+bytes[i+1];
  if(length<2||i+length>bytes.length)return null;
  if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){
   if(length<7)return null;
   const height=bytes[i+3]*256+bytes[i+4],width=bytes[i+5]*256+bytes[i+6];
   return width>=300&&width<=5000&&height>=300&&height<=7000?{width,height}:null;
  }
  i+=length;
 }
 return null;
}
