import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
import {videoDb,validUuid} from "@/lib/vmv-video-generator";
import {completedOwnedVideo,newShareToken,sharePath,noStoreHeaders} from "@/lib/vmv-studio-video-sharing";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const reply=(body:Record<string,unknown>,status=200)=>NextResponse.json(body,{status,headers:noStoreHeaders});
async function ownedVideoId(req:NextRequest){
 const id=req.nextUrl.searchParams.get("id");
 return validUuid(id)?id:null;
}
export async function GET(req:NextRequest){
 const owner=await authenticatedUser(req);
 if(!owner)return reply({error:"authentication_required"},401);
 const id=await ownedVideoId(req);
 if(!id)return reply({error:"studio_invalid_id"},400);
 try{
  if(!await completedOwnedVideo(owner,id))return reply({error:"studio_video_not_shareable"},404);
  const {data,error}=await videoDb().from("vmv_studio_video_shares")
   .select("token").eq("job_id",id).eq("owner_id",owner).maybeSingle();
  if(error)return reply({error:"studio_share_unavailable"},503);
  return reply({path:data?sharePath(data.token):null});
 }catch{return reply({error:"studio_share_unavailable"},503);}
}
export async function POST(req:NextRequest){
 const owner=await authenticatedUser(req);
 if(!owner)return reply({error:"authentication_required"},401);
 const body=await req.json().catch(()=>null);
 const id=body?.id;
 if(!validUuid(id)||body?.confirmPublicSharing!==true)
  return reply({error:"studio_share_confirmation_required"},400);
 try{
  if(!await completedOwnedVideo(owner,id))
   return reply({error:"studio_video_not_shareable"},409);
  const db=videoDb();
  const {data:prior,error:lookupError}=await db.from("vmv_studio_video_shares")
   .select("token").eq("job_id",id).eq("owner_id",owner).maybeSingle();
  if(lookupError)return reply({error:"studio_share_unavailable"},503);
  if(prior)return reply({path:sharePath(prior.token)});
  const token=newShareToken();
  const {error:insertError}=await db.from("vmv_studio_video_shares")
   .insert({job_id:id,owner_id:owner,token});
  if(insertError){
   if(insertError.code!=="23505")return reply({error:"studio_share_unavailable"},503);
   // Two requests creating the same link at once return one stable link.
   const {data,error}=await db.from("vmv_studio_video_shares")
    .select("token").eq("job_id",id).eq("owner_id",owner).maybeSingle();
   return error||!data?reply({error:"studio_share_unavailable"},503):
    reply({path:sharePath(data.token)});
  }
  return reply({path:sharePath(token)},201);
 }catch{return reply({error:"studio_share_unavailable"},503);}
}
export async function DELETE(req:NextRequest){
 const owner=await authenticatedUser(req);
 if(!owner)return reply({error:"authentication_required"},401);
 const id=await ownedVideoId(req);
 if(!id)return reply({error:"studio_invalid_id"},400);
 try{
  const db=videoDb();
  const {data:owned,error:readError}=await db.from("vmv_studio_jobs")
   .select("id").eq("id",id).eq("owner_id",owner).maybeSingle();
  if(readError)return reply({error:"studio_share_unavailable"},503);
  if(!owned)return reply({error:"studio_not_found"},404);
  const {error}=await db.from("vmv_studio_video_shares")
   .delete().eq("job_id",id).eq("owner_id",owner);
  return error?reply({error:"studio_share_unavailable"},503):reply({path:null});
 }catch{return reply({error:"studio_share_unavailable"},503);}
}
