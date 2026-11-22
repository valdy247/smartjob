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
 const model=body?.model??"gen4.5",delivery=body?.delivery??"download";
 const monthlyBudget=Number(body?.monthly_budget_cents??0);
 if(niche.length<3||!["stickman","realistic","cinematic","animated","product"].includes(style)||
  ![1,3,5,7].includes(freq)||!["gen4.5","kling"].includes(model)||
  !["download","social_draft"].includes(delivery)||
  ![0,1500,3000,6000].includes(monthlyBudget))return reply({error:"complete_pilot_settings"},400);
 const seed=typeof body?.creative_seed==="string"?body.creative_seed.trim():"";
 const videoId=typeof body?.research_video_id==="string"?body.research_video_id:"";
 const scanId=body?.research_scan_id??null;
 if(seed.length>450||(videoId&&!/^[A-Za-z0-9_-]{11}$/.test(videoId))||
  (scanId!==null&&!validUuid(scanId))||Boolean(seed)!==Boolean(videoId)||
  Boolean(videoId)!==Boolean(scanId))return reply({error:"invalid_radar_inspiration"},400);
 const id=body?.id;
 if(id!==null&&id!==undefined&&!validUuid(id))return reply({error:"invalid_pilot"},400);
 const db=videoDb();
 if(scanId){
  const source=await db.from("vmv_video_radar_scans").select("id,ideas")
   .eq("id",scanId).eq("owner_id",owner).eq("status","ready").maybeSingle();
  if(source.error||!source.data||!Array.isArray(source.data.ideas)||
   !source.data.ideas.some((idea:{sourceId?:string})=>idea.sourceId===videoId))
   return reply({error:"invalid_radar_inspiration"},400);
 }
 let result;
 // Saving a plan is NEVER permission to schedule generation, spend credits, or publish.
 const payload={niche,audience,goal,style,frequency:freq,model,
  monthly_budget_cents:monthlyBudget,delivery,
  creative_seed:seed,research_video_id:videoId,research_scan_id:scanId,status:"paused",
  next_run_at:null,updated_at:new Date().toISOString()};
 if(id){
  result=await db.from("vmv_video_pilots").update(payload).eq("id",id).eq("owner_id",owner).select("*").maybeSingle();
 }else{
  result=await db.from("vmv_video_pilots").insert({...payload,owner_id:owner}).select("*").single();
 }
 if(result.error||!result.data)return reply({error:"pilot_save_unavailable"},503);
 return reply({pilot:result.data});
}
