import {billingAdmin} from "@/lib/vmv-billing";

export const videoHeaders={"Cache-Control":"no-store"} as const;
export const videoEnabled=()=>process.env.VERCEL_ENV==="preview"&&
 process.env.VMV_VIDEO_PILOT_ENABLED==="true";
export const videoAllowed=(owner:string)=>videoEnabled()&&
 /^[0-9a-f-]{36}$/i.test(owner)&&
 process.env.VMV_VIDEO_ALLOWED_OWNER_ID===owner;
export const videoReady=()=>videoEnabled()&&Boolean((process.env.RUNWAYML_API_SECRET||"").trim());

export const validUuid=(value:unknown):value is string=>typeof value==="string"&&
 /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const version="2024-11-06",base="https://api.dev.runwayml.com/v1";
export type VideoModel="gen4.5"|"kling";
export type VideoMode="text"|"image";
export type VideoRatio="1280:720"|"720:1280";
export type VideoInput={prompt:string;mode:VideoMode;model:VideoModel;ratio:VideoRatio;duration:5|10;imageUrl:string};
export function parseVideoInput(raw:unknown):VideoInput|null{
 if(!raw||typeof raw!=="object")return null;
 const b=raw as Record<string,unknown>;
 const prompt=typeof b.prompt==="string"?b.prompt.trim():"";
 if(prompt.length<3||prompt.length>1000||!["text","image"].includes(String(b.mode))||
  !["gen4.5","kling"].includes(String(b.model))||
  !["1280:720","720:1280"].includes(String(b.ratio))||![5,10].includes(Number(b.duration)))return null;
 let imageUrl="";
 if(b.mode==="image"){
  if(typeof b.imageUrl!=="string"||b.imageUrl.length>4200000)return null;
  const match=/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(b.imageUrl);
  if(!match)return null;
  const bytes=Buffer.from(match[2],"base64");
  if(bytes.length<1024||bytes.length>3*1024*1024)return null;
  const isJpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  const isPng=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const isWebp=bytes.toString("ascii",0,4)==="RIFF"&&bytes.toString("ascii",8,12)==="WEBP";
  if(!(match[1]==="jpeg"&&isJpg||match[1]==="png"&&isPng||match[1]==="webp"&&isWebp))return null;
  imageUrl=b.imageUrl;
 }
 return {prompt,mode:b.mode as VideoMode,model:b.model as VideoModel,
  ratio:b.ratio as VideoRatio,duration:b.duration as 5|10,imageUrl};
}
export const providerFailure=(status:number)=>status===402?"runway_credits_required":
 status===429?"runway_rate_limited":status===401||status===403?"runway_access_denied":
 status===400||status===422?"runway_parameters_or_model_rejected":
 status>=500?"runway_service_unavailable":"runway_request_failed";
function headers(){return {
 Authorization:"Bearer "+(process.env.RUNWAYML_API_SECRET||""),
 "X-Runway-Version":version,"Content-Type":"application/json"
};}
export class RunwayError extends Error{constructor(public code:string,public status:number){super(code);}}
export async function startRunway(input:VideoInput){
 const model=input.model==="kling"?"kling3.0_pro":"gen4.5";
 const ratio=input.model==="kling"?
  (input.ratio==="1280:720"?"1920:1080":"1080:1920"):input.ratio;
 const payload={
  model,promptText:input.prompt,ratio,duration:input.duration,
  ...(input.mode==="image"?{promptImage:input.imageUrl}:{}),
  ...(input.model==="kling"?{audio:true}:{})
 };
 const response=await fetch(base+(input.mode==="image"?"/image_to_video":"/text_to_video"),{
  method:"POST",headers:headers(),body:JSON.stringify(payload),cache:"no-store",
  signal:AbortSignal.timeout(24000)
 });
 const result=await response.json().catch(()=>null);
 if(!response.ok)throw new RunwayError(providerFailure(response.status),response.status);
 if(typeof result?.id!=="string"||!validTaskId(result.id))
  throw new RunwayError("runway_task_invalid",502);
 return result.id as string;
}
export const validTaskId=(id:unknown):id is string=>typeof id==="string"&&
 /^[a-zA-Z0-9_-]{8,100}$/.test(id);
export async function pollRunway(taskId:string){
 if(!validTaskId(taskId))throw new RunwayError("runway_task_invalid",400);
 const r=await fetch(base+"/tasks/"+encodeURIComponent(taskId),{
  headers:headers(),cache:"no-store",signal:AbortSignal.timeout(17000)
 });
 if(!r.ok)throw new RunwayError(providerFailure(r.status),r.status);
 const data=await r.json().catch(()=>null);
 const status=String(data?.status||"").toUpperCase();
 if(!["PENDING","THROTTLED","RUNNING","SUCCEEDED","FAILED","CANCELED"].includes(status))
  throw new RunwayError("runway_status_invalid",502);
 const output=Array.isArray(data?.output)?data.output.find((u:unknown)=>{
  if(typeof u!=="string"||u.length>2300)return false;
  try{const url=new URL(u);return url.protocol==="https:"&&!url.username&&!url.password;}catch{return false;}
 }):null;
 return {status,outputUrl:typeof output==="string"?output:null};
}
export function videoDb(){const db=billingAdmin();if(!db)throw Error("video_database_unavailable");return db;}
