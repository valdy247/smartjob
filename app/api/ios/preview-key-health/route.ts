import {NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
export const runtime="nodejs";
export const dynamic="force-dynamic";
// Temporary preview-only, read-only credential health check. No keys or customer data returned.
export async function GET(){
 if(process.env.VERCEL_ENV!=="preview")return NextResponse.json({error:"not_found"},{status:404});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL||"";
 const key=process.env.SUPABASE_SECRET_KEY||"";
 const kind=key.startsWith("sb_secret_")?"secret":key.startsWith("sb_publishable_")?"publishable":key.startsWith("eyJ")?"legacy":key?"unrecognized":"missing";
 if(!url||!key)return NextResponse.json({keyType:kind,result:"missing_configuration"},{status:503});
 try{
  const c=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {error}=await c.from("smartjob_phone_routes").select("id",{count:"exact",head:true}).limit(1);
  const message=(error?.message||"").toLowerCase();
  return NextResponse.json({keyType:kind,result:!error?"success":message.includes("invalid api key")?"invalid_api_key":message.includes("permission")?"permission_denied":"database_query_error",code:error?.code||null},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({keyType:kind,result:"connection_error"},{status:503});}
}
