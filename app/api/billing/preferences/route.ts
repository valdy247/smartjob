import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
import {billingAdmin,eligible,getBillingAccount} from "@/lib/vmv-billing";
import {isVoice,sanitizedGreeting,choices} from "@/lib/vmv-voices";
import {noStore} from "@/lib/vmv-stripe";
export const runtime="nodejs";export const dynamic="force-dynamic";
// Cross-origin access is limited to the VMV Business web property (including its Vercel previews).
// The authenticated owner check and plan-based authorization remain mandatory.
const originAllowed=(origin:string|null)=>!!origin&&(
 origin==="https://vmv-business-design.vercel.app" ||
 /^https:\/\/vmv-business-design-[a-z0-9-]+-valdys-projects-b97fc7a6\.vercel\.app$/.test(origin)
);
function headersFor(req:NextRequest):HeadersInit {
 const headers=new Headers(noStore);
 const origin=req.headers.get("origin");
 if(originAllowed(origin)){
  headers.set("Access-Control-Allow-Origin",origin!);
  headers.set("Vary","Origin");
  headers.set("Access-Control-Allow-Headers","Authorization, Content-Type");
  headers.set("Access-Control-Allow-Methods","GET, POST, OPTIONS");
 }
 return headers;
}
export function OPTIONS(req:NextRequest){
 return new NextResponse(null,{status:originAllowed(req.headers.get("origin"))?204:403,headers:headersFor(req)});
}
async function context(req:NextRequest){
 const uid=await authenticatedUser(req);if(!uid)return null;
 const account=await getBillingAccount(uid);
 const editable=eligible(account)&&["pro","premium"].includes(account?.plan_code||"");
 return {uid,editable,db:billingAdmin()};
}
export async function GET(req:NextRequest){
 const ctx=await context(req);
 if(!ctx)return NextResponse.json({error:"unauthorized"},{status:401,headers:headersFor(req)});
 if(!ctx.db)return NextResponse.json({error:"unavailable"},{status:503,headers:headersFor(req)});
 const {data,error}=await ctx.db.from("smartjob_call_preferences")
  .select("voice_customer,voice_owner,greeting_customer,greeting_owner")
  .eq("user_id",ctx.uid).maybeSingle();
 if(error)return NextResponse.json({error:"unavailable"},{status:503,headers:headersFor(req)});
 return NextResponse.json({editable:ctx.editable,choices,
  settings:data||{voice_customer:"default",voice_owner:"default",greeting_customer:"",greeting_owner:""},
  message:ctx.editable?"Las preferencias se aplicarán a nuevas llamadas.":
   "La personalización de voces y saludos está disponible con Pro o Premium activo."
 },{headers:headersFor(req)});
}
export async function POST(req:NextRequest){
 const ctx=await context(req);
 if(!ctx)return NextResponse.json({error:"unauthorized"},{status:401,headers:headersFor(req)});
 if(!ctx.editable)return NextResponse.json({error:"plan_required"},{status:403,headers:headersFor(req)});
 if(!ctx.db)return NextResponse.json({error:"unavailable"},{status:503,headers:headersFor(req)});
 const body=await req.json().catch(()=>null);
 if(!body||!isVoice(body.voice_customer)||!isVoice(body.voice_owner))
  return NextResponse.json({error:"invalid_voice"},{status:400,headers:headersFor(req)});
 const greeting_customer=sanitizedGreeting(body.greeting_customer);
 const greeting_owner=sanitizedGreeting(body.greeting_owner);
 if(greeting_customer===null||greeting_owner===null)
  return NextResponse.json({error:"invalid_greeting"},{status:400,headers:headersFor(req)});
 const {error}=await ctx.db.from("smartjob_call_preferences").upsert({
   user_id:ctx.uid,voice_customer:body.voice_customer,voice_owner:body.voice_owner,
   greeting_customer,greeting_owner,updated_at:new Date().toISOString()
 },{onConflict:"user_id"});
 if(error){console.error("VMV preferences store failed",error.code);
  return NextResponse.json({error:"unavailable"},{status:503,headers:headersFor(req)});}
 return NextResponse.json({saved:true},{headers:headersFor(req)});
}
