import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
import {videoAllowed,videoDb,videoHeaders,validUuid} from "@/lib/vmv-video-generator";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=30;
const reply=(data:Record<string,unknown>,status=200)=>
 NextResponse.json(data,{status,headers:videoHeaders});
const publicFields="id,pilot_id,topic,style,seconds,narration,subtitles,language,status,phase,progress,title,output_path,failure_code,created_at,updated_at,finished_at";
type RenderRow={id:string;output_path:string|null;[key:string]:unknown};
async function present(row:RenderRow){
 const {output_path,...safe}=row;
 if(!output_path||row.status!=="completed")return {...safe,videoUrl:null};
 if(!output_path.startsWith(String(row.owner_id||""))){
  // Never trust a stored path; it must use the owner's exact ID below.
 }
 const {data,error}=await videoDb().storage.from("vmv-pilot-renders")
  .createSignedUrl(output_path,3600);
 return {...safe,videoUrl:error?null:data?.signedUrl||null};
}
export async function GET(req:NextRequest){
 const owner=await authenticatedUser(req);
 if(!owner||!videoAllowed(owner))return reply({error:"video_not_enabled_for_account"},403);
 try{
  const query=videoDb().from("vmv_pilot_render_jobs").select(publicFields)
   .eq("owner_id",owner);
  const id=req.nextUrl.searchParams.get("id");
  if(id){
   if(!validUuid(id))return reply({error:"invalid_render_job"},400);
   const {data,error}=await query.eq("id",id).maybeSingle();
   if(error)return reply({error:"pilot_render_unavailable"},503);
   if(!data)return reply({error:"render_not_found"},404);
   const render=data as RenderRow;
   if(render.output_path&&!render.output_path.startsWith(owner+"/"+render.id+".mp4"))
    return reply({error:"render_path_invalid"},503);
   return reply({job:await present(render)});
  }
  const {data,error}=await query.order("created_at",{ascending:false}).limit(12);
  if(error)return reply({error:"pilot_render_unavailable"},503);
  const jobs=await Promise.all((data||[]).map(async r=>{
   const row=r as RenderRow;
   if(row.output_path&&!row.output_path.startsWith(owner+"/"+row.id+".mp4"))
    return {...row,output_path:undefined,videoUrl:null};
   return present(row);
  }));
  return reply({jobs});
 }catch{return reply({error:"pilot_render_unavailable"},503);}
}
export async function POST(req:NextRequest){
 const owner=await authenticatedUser(req);
 if(!owner||!videoAllowed(owner))return reply({error:"video_not_enabled_for_account"},403);
 // Fail closed if the durable media worker is not explicitly enabled.
 if(process.env.VMV_PILOT_RENDER_ENABLED!=="true")
  return reply({error:"pilot_worker_not_ready"},503);
 const body=await req.json().catch(()=>null);
 const pilotId=body?.pilotId,clientKey=body?.clientKey;
 const topic=typeof body?.topic==="string"?body.topic.trim():"";
 const audience=typeof body?.audience==="string"?body.audience.trim():"";
 const goal=typeof body?.goal==="string"?body.goal.trim():"";
 const style=body?.style,seconds=Number(body?.seconds);
 if(!validUuid(pilotId)||!validUuid(clientKey)||body?.confirmCost!==true||
  topic.length<3||topic.length>220||audience.length>180||goal.length>180||
  !["stickman","realistic","cinematic","animated","product"].includes(style)||
  ![15,30,60].includes(seconds)||typeof body?.narration!=="boolean"||
  typeof body?.subtitles!=="boolean"||!["es","en"].includes(body?.language))
  return reply({error:"invalid_render_request"},400);
 try{
  const db=videoDb();
  const {data,error}=await db.rpc("vmv_pilot_render_enqueue",{
   p_owner:owner,p_pilot:pilotId,p_key:clientKey,
   p_topic:topic,p_audience:audience,p_goal:goal,p_style:style,
   p_seconds:seconds,p_narration:body.narration,p_subtitles:body.subtitles,
   p_language:body.language
  });
  if(error){
   const code=String(error.message||"");
   if(code.includes("pilot_render_daily_limit"))return reply({error:"pilot_render_daily_limit"},429);
   if(code.includes("pilot_render_active_limit"))return reply({error:"pilot_render_active_limit"},409);
   if(code.includes("pilot_render_owner_or_style"))return reply({error:"pilot_render_invalid_owner"},403);
   return reply({error:"pilot_render_unavailable"},503);
  }
  if(!validUuid(data))return reply({error:"pilot_render_unavailable"},503);
  return reply({id:data,status:"queued"},202);
 }catch{return reply({error:"pilot_render_unavailable"},503);}
}
