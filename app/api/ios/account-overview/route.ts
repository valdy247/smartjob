import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {authenticatedUser} from "@/lib/auth-server";
import {getBillingAccount,billingEnabledFor,balance,eligible as billingEligible} from "@/lib/vmv-billing";
import {languageMenuEnabled} from "@/lib/vmv-ivr";
import {allowSpendWithAccount,ownerPreviewPilot} from "@/lib/vmv-entitlements";
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
  db.from("smartjob_call_sessions").select("duration_seconds,started_at,status,call_mode").eq("owner_id",uid).gte("started_at",new Date(Date.now()-30*86400000).toISOString()).limit(500)
 ]);
 if(routes.error||verification.error||calls.error)return NextResponse.json({error:"usage_unavailable"},{status:503,headers});
 const route=routes.data;
 const verified=Boolean(verification.data?.phone_verified_at);
 const eligible=verified&&route?.receive_method==="ios_app"&&route.enabled===true
   &&/^\+1\d{10}$/.test(route.twilio_number||"")
   &&/^\+1\d{10}$/.test(route.destination_phone||"")
   &&route.twilio_number!==route.destination_phone;
 const duration=(calls.data||[]).reduce((sum,c)=>sum+Math.max(0,Math.min(86400,c.duration_seconds||0)),0);
 const billingAccount=await getBillingAccount(uid);
 const paid=allowSpendWithAccount(billingAccount,"direct_call");
 const pilot=ownerPreviewPilot(billingAccount);
 const count=(calls.data||[]).length;
 const completed=(calls.data||[]).filter(c=>c.status==="completed").length;
 const directCalls=(calls.data||[]).filter(c=>c.call_mode==="direct").length;
 const translatedCalls=(calls.data||[]).filter(c=>c.call_mode!=="direct").length;
 const translatedSeconds=(calls.data||[]).filter(c=>c.call_mode!=="direct").reduce((sum,c)=>sum+Math.max(0,Math.min(86400,c.duration_seconds||0)),0);
 const menuPrepared=Boolean(eligible&&paid&&languageMenuEnabled()&&process.env.SMARTJOB_IOS_VOICE_ENABLED==="true");

 return NextResponse.json({
  verified,connectedToApp:Boolean(paid&&route?.receive_method==="ios_app"&&route.enabled===true),
  forwardingReady:Boolean(eligible&&paid),
  menuPrepared,menuVerifiedByRealCall:false,
  publicPhone:paid&&eligible?route?.destination_phone:null,
  twilioPhone:route?.twilio_number||null,
  carrier:verification.data?.carrier||null,
  forwardingReported:route?.forwarding_mode!=="none"&&Boolean(route?.forwarding_mode),
  usage:{periodDays:30,calls:count,completed,directCalls,translatedCalls,seconds:duration,minutes:Math.ceil(duration/60),translatedMinutes:Math.ceil(translatedSeconds/60),metering:"indicative"},
  billing:{enabled:true,active:paid,pilot,
    plan:billingAccount?.plan_code||"none",availableMinutes:balance(billingAccount),
    message:pilot?"Prueba privada: minutos VMV activados y limitados.":paid?"Suscripción real verificada.":"Recepción bloqueada hasta confirmar un pago real y completar la activación."},
  nextAction:pilot?"Conectar iPhone y llamar a tu número VMV; marca 1 para traducción.":paid&&eligible?"Conecta tu iPhone y prueba la recepción.":"Elegir un plan, completar configuración y esperar activación tras pago real."
 },{headers});
}
