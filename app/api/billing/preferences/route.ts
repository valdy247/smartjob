import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
import {billingAdmin,eligible,getBillingAccount} from "@/lib/vmv-billing";
import {isVoice,sanitizedGreeting,choices} from "@/lib/vmv-voices";
import {noStore} from "@/lib/vmv-stripe";
export const runtime="nodejs";export const dynamic="force-dynamic";
async function context(req:NextRequest){
 const uid=await authenticatedUser(req);if(!uid)return null;
 const account=await getBillingAccount(uid);
 const editable=eligible(account)&&["pro","premium"].includes(account?.plan_code||"");
 return {uid,editable,db:billingAdmin()};
}
export async function GET(req:NextRequest){
 const ctx=await context(req);
 if(!ctx)return NextResponse.json({error:"unauthorized"},{status:401,headers:noStore});
 if(!ctx.db)return NextResponse.json({error:"unavailable"},{status:503,headers:noStore});
 const {data,error}=await ctx.db.from("smartjob_call_preferences")
  .select("voice_customer,voice_owner,greeting_customer,greeting_owner")
  .eq("user_id",ctx.uid).maybeSingle();
 if(error)return NextResponse.json({error:"unavailable"},{status:503,headers:noStore});
 return NextResponse.json({editable:ctx.editable,choices,
  settings:data||{voice_customer:"default",voice_owner:"default",greeting_customer:"",greeting_owner:""},
  message:ctx.editable?"Las preferencias se aplicarán a nuevas llamadas.":
   "La personalización de voces y saludos está disponible con Pro o Premium activo."
 },{headers:noStore});
}
export async function POST(req:NextRequest){
 const ctx=await context(req);
 if(!ctx)return NextResponse.json({error:"unauthorized"},{status:401,headers:noStore});
 if(!ctx.editable)return NextResponse.json({error:"plan_required"},{status:403,headers:noStore});
 if(!ctx.db)return NextResponse.json({error:"unavailable"},{status:503,headers:noStore});
 const body=await req.json().catch(()=>null);
 if(!body||!isVoice(body.voice_customer)||!isVoice(body.voice_owner))
  return NextResponse.json({error:"invalid_voice"},{status:400,headers:noStore});
 const greeting_customer=sanitizedGreeting(body.greeting_customer);
 const greeting_owner=sanitizedGreeting(body.greeting_owner);
 if(greeting_customer===null||greeting_owner===null)
  return NextResponse.json({error:"invalid_greeting"},{status:400,headers:noStore});
 const {error}=await ctx.db.from("smartjob_call_preferences").upsert({
   user_id:ctx.uid,voice_customer:body.voice_customer,voice_owner:body.voice_owner,
   greeting_customer,greeting_owner,updated_at:new Date().toISOString()
 },{onConflict:"user_id"});
 if(error){console.error("VMV preferences store failed",error.code);
  return NextResponse.json({error:"unavailable"},{status:503,headers:noStore});}
 return NextResponse.json({saved:true},{headers:noStore});
}
