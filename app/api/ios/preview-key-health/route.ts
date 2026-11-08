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
  const raw=await fetch(url+"/rest/v1/smartjob_phone_routes?select=id&limit=1",{
    method:"GET",cache:"no-store",signal:AbortSignal.timeout(7000),
    headers:{"apikey":key,"Authorization":"Bearer "+key,"Accept":"application/json"}
  });
  const rawBody=(await raw.text()).slice(0,600);
  const status=raw.status;
  const rawProblem=raw.ok?"none":/invalid api key/i.test(rawBody)?"invalid_api_key":/invalid jwt/i.test(rawBody)?"invalid_jwt":/permission denied/i.test(rawBody)?"permission_denied":/JWT/i.test(rawBody)?"jwt_other":/\bPGRST\d+\b/.test(rawBody)?"postgrest_error":"other";
  console.info("Smart Job preview database raw connectivity",{status,problem:rawProblem,contentType:raw.headers.get("content-type"),bodyLength:rawBody.length});
    const c=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {error}=await c.from("smartjob_phone_routes").select("id",{count:"exact",head:true}).limit(1);
  const message=(error?.message||"").toLowerCase();
  return NextResponse.json({keyType:kind,result:!error?"success":message.includes("invalid api key")?"invalid_api_key":message.includes("permission")?"permission_denied":"database_query_error",code:error?.code||null,problem:error?String(error.message||"Unknown error").replace(/sb_(?:secret|publishable)_[a-zA-Z0-9_-]+/g,"[redacted]").slice(0,180):null,status:error&&"status" in error?error.status:null,rawStatus:status,rawProblem},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({keyType:kind,result:"connection_error"},{status:503});}
}
