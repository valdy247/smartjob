import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {authenticatedUser} from "@/lib/auth-server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store"};
export async function GET(req:NextRequest){
 const uid=await authenticatedUser(req);
 if(!uid)return NextResponse.json({error:"unauthorized"},{status:401,headers});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL||"";
 const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||"";
 const bearer=req.headers.get("authorization")||"";
 if(!url||!key||!bearer)return NextResponse.json({error:"not_configured"},{status:503,headers});
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:bearer}}});
 const [routes,verification,calls]=await Promise.all([
  db.from("smartjob_phone_routes").select("id,twilio_number,receive_method,enabled,forwarding_mode,destination_phone").eq("user_id",uid).eq("enabled",true).limit(1).maybeSingle(),
  db.from("smartjob_provisioning_requests").select("phone_verified_at,carrier,answer_method,status").eq("user_id",uid).order("created_at",{ascending:false}).limit(1).maybeSingle(),
  db.from("smartjob_call_sessions").select("duration_seconds,started_at,status").eq("owner_id",uid).gte("started_at",new Date(Date.now()-30*86400000).toISOString()).limit(500)
 ]);
 if(routes.error||verification.error||calls.error)return NextResponse.json({error:"usage_unavailable"},{status:503,headers});
 const route=routes.data;
 const verified=Boolean(verification.data?.phone_verified_at);
 const eligible=verified&&route?.receive_method==="ios_app"&&route.enabled===true
   &&/^\+1\d{10}$/.test(route.twilio_number||"")
   &&/^\+1\d{10}$/.test(route.destination_phone||"")
   &&route.twilio_number!==route.destination_phone;
 const duration=(calls.data||[]).reduce((sum,c)=>sum+Math.max(0,Math.min(86400,c.duration_seconds||0)),0);
 const count=(calls.data||[]).length;
 const completed=(calls.data||[]).filter(c=>c.status==="completed").length;
 return NextResponse.json({
  verified,connectedToApp:route?.receive_method==="ios_app"&&route.enabled===true,
  forwardingReady:eligible,
  publicPhone:eligible?route?.destination_phone:null,
  twilioPhone:route?.twilio_number||null,
  carrier:verification.data?.carrier||null,
  forwardingReported:route?.forwarding_mode!=="none"&&Boolean(route?.forwarding_mode),
  usage:{periodDays:30,calls:count,completed,seconds:duration,minutes:Math.ceil(duration/60),metering:"indicative"},
  billing:{enabled:false,message:"La facturación automatizada todavía no está habilitada."},
  nextAction:eligible?"Activar manualmente el desvío en el operador y confirmar con una llamada real.":"Verificar el número y activar primero la recepción iOS."
 },{headers});
}
