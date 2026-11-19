import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
import {videoAllowed,videoDb,videoHeaders,validUuid} from "@/lib/vmv-video-generator";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const reply=(data:Record<string,unknown>,status=200)=>NextResponse.json(data,{status,headers:videoHeaders});
const str=(v:unknown,n:number)=>typeof v==="string"?v.trim().slice(0,n):"";
export async function POST(req:NextRequest){
 const owner=await authenticatedUser(req);
 if(!owner||!videoAllowed(owner))return reply({error:"video_not_enabled_for_account"},403);
 const body=await req.json().catch(()=>null);
 const niche=str(body?.niche,160),audience=str(body?.audience,180),goal=str(body?.goal,180);
 const style=str(body?.style,25),freq=Number(body?.frequency);
 if(niche.length<3||!["realistic","cinematic","animated","product"].includes(style)||
  ![1,3,5,7].includes(freq))return reply({error:"complete_pilot_settings"},400);
 const id=body?.id;
 if(id!==null&&id!==undefined&&!validUuid(id))return reply({error:"invalid_pilot"},400);
 const db=videoDb();
 let result;
 const payload={niche,audience,goal,style,frequency:freq,status:"paused",
  next_run_at:null,updated_at:new Date().toISOString()};
 if(id){
  result=await db.from("vmv_video_pilots").update(payload).eq("id",id).eq("owner_id",owner).select("*").maybeSingle();
 }else{
  result=await db.from("vmv_video_pilots").insert({...payload,owner_id:owner}).select("*").single();
 }
 if(result.error||!result.data)return reply({error:"pilot_save_unavailable"},503);
 return reply({pilot:result.data});
}
