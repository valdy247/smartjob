import {NextResponse} from "next/server";
import {videoStudioWorkerProbe} from "@/lib/vmv-studio-cloud-readiness";
export const dynamic="force-dynamic";
export const runtime="nodejs";
export const maxDuration=20;
export async function GET(req:Request){
 if(process.env.VERCEL_ENV!=="preview")return NextResponse.json({ready:false},{status:404});
 const result=await videoStudioWorkerProbe("none",new URL(req.url).searchParams.get("mode")==="single");
 return NextResponse.json(result,{status:result.ready?200:503,headers:{"Cache-Control":"no-store"}});
}
