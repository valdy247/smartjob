import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
import {videoAllowed,videoDb,videoHeaders,validUuid} from "@/lib/vmv-video-generator";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const maxDuration=45;
const fail=(error:string,status=400)=>NextResponse.json({error},{status,headers:videoHeaders});
function safeProviderUrl(value:unknown){
 if(typeof value!=="string"||value.length>2300)return null;
 try{
  const u=new URL(value),host=u.hostname.toLowerCase();
  if(u.protocol!=="https:"||u.username||u.password||u.port)return null;
  if(!["runwayml.com","runwayml.ai","googleapis.com","cloudfront.net","amazonaws.com"].some(d=>host===d||host.endsWith("."+d)))return null;
  return u.toString();
 }catch{return null;}
}
export async function GET(req:NextRequest){
 const owner=await authenticatedUser(req);
 if(!owner||!videoAllowed(owner))return fail("unauthorized",401);
 const id=req.nextUrl.searchParams.get("id");
 if(!validUuid(id))return fail("invalid_job",400);
 const db=videoDb();
 const {data,error}=await db.from("vmv_video_jobs")
  .select("status,output_url").eq("owner_id",owner).eq("id",id).maybeSingle();
 if(error||!data)return fail("video_job_not_found",404);
 if(data.status!=="SUCCEEDED")return fail("video_not_ready",409);
 const url=safeProviderUrl(data.output_url);
 if(!url)return fail("download_provider_link_unavailable",422);
 try{
  const upstream=await fetch(url,{cache:"no-store",redirect:"manual",signal:AbortSignal.timeout(30000)});
  if(!upstream.ok||!upstream.body)return fail("download_expired_or_unavailable",502);
  const bytes=Number(upstream.headers.get("content-length")||0);
  if(bytes>85_000_000)return fail("download_too_large",413);
  const reader=upstream.body.getReader();
  let size=0;
  const stream=new ReadableStream<Uint8Array>({
   async pull(controller){
    try{
     const result=await reader.read();
     if(result.done){controller.close();return;}
     size+=result.value.byteLength;
     if(size>85_000_000){await reader.cancel();controller.error(Error("download_too_large"));return;}
     controller.enqueue(result.value);
    }catch(e){controller.error(e);}
   },
   async cancel(){await reader.cancel();}
  });
  return new Response(stream,{headers:{
   "Content-Type":"video/mp4",
   "Content-Disposition":'attachment; filename="vmv-video-'+id.slice(0,8)+'.mp4"',
   "Cache-Control":"no-store",
   "X-Content-Type-Options":"nosniff"
  }});
 }catch{return fail("download_expired_or_unavailable",502);}
}
