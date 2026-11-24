import {NextRequest,NextResponse} from "next/server";
import {signedSharedVideo,validVideoShareToken,noStoreHeaders} from "@/lib/vmv-studio-video-sharing";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(req:NextRequest,context:{params:Promise<{token:string}>}){
 const {token}=await context.params;
 if(!validVideoShareToken(token))
  return NextResponse.json({error:"video_not_found"},{status:404,headers:noStoreHeaders});
 try{
  const download=req.nextUrl.searchParams.get("download")==="1";
  const signed=await signedSharedVideo(token,download);
  if(!signed)return NextResponse.json({error:"video_not_found"},{status:404,headers:noStoreHeaders});
  return NextResponse.redirect(signed,{status:307,headers:noStoreHeaders});
 }catch{
  return NextResponse.json({error:"video_temporarily_unavailable"},{status:503,headers:noStoreHeaders});
 }
}
