import {createHmac} from "node:crypto";
import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {authenticatedUser} from "@/lib/auth-server";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
const response=(body:unknown,status=200)=>NextResponse.json(body,{status,headers});
const callSid=/^CA[a-f\d]{32}$/i;

export async function GET(req:NextRequest){
  // This endpoint never exposes the Render signing secret or the caller's audio.
  const ownerId=await authenticatedUser(req);
  if(!ownerId)return response({error:"unauthorized"},401);
  // Pilot-only: the feature must not expose captions for other tenants yet.
  if(!process.env.SMARTJOB_BILLING_TEST_OWNER_ID||
     ownerId!==process.env.SMARTJOB_BILLING_TEST_OWNER_ID)
    return response({error:"not_enabled_for_account"},403);
  const outbound=req.nextUrl.searchParams.get("callSid")||"";
  const after=Number(req.nextUrl.searchParams.get("after")||"0");
  if(!callSid.test(outbound)||!Number.isSafeInteger(after)||after<0||after>100000)
    return response({error:"invalid_parameters"},400);

  const dbUrl=process.env.NEXT_PUBLIC_SUPABASE_URL||"";
  const serviceKey=process.env.SUPABASE_SECRET_KEY||"";
  const secret=process.env.TWILIO_AUTH_TOKEN||"";
  const ws=process.env.SMARTJOB_LIVE_WS_URL||"";
  if(!dbUrl||!serviceKey||!secret||!ws)return response({error:"not_configured"},503);
  const db=createClient(dbUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  // The outbound SID is the exact Twilio CallSid of the owner's current iOS call.
  // A subscriber can never look up another subscriber's live conversation.
  const {data:session,error}=await db.from("smartjob_call_sessions")
    .select("bridge_sid,owner_id,status,call_mode,route_id")
    .eq("owner_id",ownerId)
    .eq("outbound_sid",outbound)
    .eq("call_mode","translated")
    .in("status",["ringing","in-progress"]).eq("billing_settled",false)
    .maybeSingle();
  if(error)return response({error:"session_lookup_unavailable"},503);
  if(!session||!callSid.test(session.bridge_sid))return response({error:"call_not_active"},404);

  // This feature is isolated to existing, approved VMV CALL iPhone routes.
  const active=await db.from("smartjob_phone_routes")
    .select("id").eq("id",session.route_id).eq("user_id",ownerId)
    .eq("enabled",true).eq("receive_method","ios_app").maybeSingle();
  if(active.error||!active.data)return response({error:"route_not_authorized"},403);

  let render:URL;
  try{
    const parsed=new URL(ws);
    if(parsed.protocol!=="wss:"||parsed.pathname!=="/relay"||
       parsed.username||parsed.password||parsed.port&&parsed.port!=="443"||
       !/^[a-z0-9.-]+$/i.test(parsed.hostname)||
       parsed.hostname==="localhost")throw Error("invalid_render_url");
    render=new URL("https://"+parsed.host+"/internal/transcript");
  }catch{return response({error:"transcript_unavailable"},503);}
  render.searchParams.set("bridge",session.bridge_sid);
  render.searchParams.set("outbound",outbound);
  render.searchParams.set("after",String(after));
  const stamp=String(Math.floor(Date.now()/1000));
  const signature=createHmac("sha256",secret).update([
    "vmv-transcript-owner-v1",stamp,session.bridge_sid,outbound
  ].join("\n")).digest("hex");
  try{
    const result=await fetch(render.toString(),{
      method:"GET",headers:{"x-smartjob-timestamp":stamp,
        "x-smartjob-signature":signature},cache:"no-store",
      signal:AbortSignal.timeout(3500)
    });
    if(!result.ok)return response({error:"transcript_not_ready"},result.status===403?409:503);
    const data=await result.json();
    if(!Array.isArray(data.turns)||data.turns.length>80||
       !["es-ES","en-US"].includes(data.language))
      return response({error:"transcript_invalid"},502);
    return response({
      language:data.language,
      turns:data.turns,
      hasMore:data.hasMore===true,
      truncated:data.truncated===true
    });
  }catch{return response({error:"transcript_unavailable"},503);}
}
