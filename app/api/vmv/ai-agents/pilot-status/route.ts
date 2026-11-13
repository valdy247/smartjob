import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {billingAdmin} from "@/lib/vmv-billing";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const reply=(data:Record<string,unknown>,status=200)=>NextResponse.json(data,{
 status,headers:{"Cache-Control":"no-store, private"}
});

export async function GET(req:NextRequest){
 const token=req.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const publishable=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 const owner=process.env.VMV_AI_TEST_OWNER_ID||"";
 if(!token||!url||!publishable)return reply({error:"Sesión de VMV requerida."},401);
 const client=createClient(url,publishable,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:identity,error}=await client.auth.getUser(token);
 if(error||!identity.user||identity.user.is_anonymous)return reply({error:"Sesión inválida."},401);
 if(!owner||identity.user.id!==owner)return reply({error:"Disponible únicamente para la cuenta piloto."},403);
 const db=billingAdmin();
 if(!db)return reply({error:"Conexión de servidor Supabase no configurada."},503);
 const {data:routes,error:phoneError}=await db.from("smartjob_phone_routes")
   .select("id,twilio_number,enabled").eq("user_id",owner).eq("enabled",true).limit(2);
 if(phoneError||!routes||routes.length!==1)
   return reply({error:"No existe una única línea telefónica activa para este piloto."},409);
 const route=routes[0];
 const [{data:selection},{data:binding}]=await Promise.all([
   db.from("vmv_ai_phone_selections").select("agent_id").eq("route_id",route.id)
     .eq("owner_id",owner).maybeSingle(),
   db.from("vmv_ai_voice_routes")
     .select("agent_id,enabled,verified_ownership,disclosure_approved,approved_at")
     .eq("twilio_number",route.twilio_number).eq("owner_id",owner).maybeSingle()
 ]);
 const agentId=selection?.agent_id;
 const {data:agent}=agentId?await db.from("vmv_ai_agents")
   .select("id,status,kind,configuration")
   .eq("id",agentId).eq("owner_id",owner).maybeSingle():{data:null};
 const setup=agent?.configuration as Record<string,string>|undefined;
 const configured=!!(
  agent?.status==="active"&&setup?.business_name&&setup?.industry&&setup?.city&&
  setup?.country&&(setup?.state||setup?.region_other)&&
  (setup?.human_review||setup?.handoff)&&(setup?.data_scope||setup?.personal_data)&&
  (setup?.call_disclosure==="Sí"||setup?.call_consent==="Sí")&&
  (setup?.channel==="Teléfono"||setup?.channel==="Teléfono y chat"||
   (!setup?.channel&&agent?.kind==="calls"))
 );
 const original=process.env.VMV_AI_ORIGINAL_VOICE_WEBHOOK||"";
 let validOriginal=false;
 try{
  const parsed=new URL(original);
  validOriginal=parsed.protocol==="https:"&&parsed.hostname.endsWith(".vercel.app")&&
   parsed.pathname==="/api/twilio/live/voice"&&!parsed.username&&!parsed.password;
 }catch{}
 const configuredBase=process.env.VMV_AI_TEST_BASE_URL||"";
 const hosting=process.env.VERCEL_ENV==="preview";
 const model=Boolean(process.env.OPENAI_API_KEY||process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN);
 const credentials=Boolean(process.env.TWILIO_AUTH_TOKEN&&db);
 const pilot=process.env.VMV_AI_VOICE_PILOT_ENABLED==="true";
 const autoEnroll=process.env.VMV_AI_VOICE_AUTO_ENROLL==="true";
 const checks=[
  {key:"owner",label:"Agente autorizado por el propietario",ok:configured},
  {key:"credentials",label:"Credenciales de servidor presentes",ok:credentials},
  {key:"model",label:"Credenciales del motor IA presentes",ok:model},
  {key:"fallback",label:"URL original de Smart Call conservada",ok:validOriginal},
  {key:"preview",label:"Limitado al entorno Preview",ok:hosting},
  {key:"pilot",label:"Piloto telefónico habilitado",ok:pilot},
  {key:"enrollment",label:"Inscripción automática del piloto habilitada",ok:autoEnroll},
  {key:"base",label:"Dominio de webhook configurado",ok:configuredBase.startsWith("https://")}
 ];
 const linked=!!(binding?.enabled&&binding?.verified_ownership&&binding?.disclosure_approved&&
  binding?.approved_at&&binding.agent_id===agentId);
 return reply({
  phoneLast4:String(route.twilio_number||"").slice(-4),
  checks,codePrepared:checks.every(c=>c.ok),
  routeLinked:linked,
  pilotConfigured:pilot&&autoEnroll&&configured,
  inboundCallVerified:false,
  providerWebhookVerified:false,
  instruction:"La verificación real del número, la firma y el webhook se completa con Twilio. Este diagnóstico no demuestra una llamada recibida.",
  // Do not expose the number or account identifiers in the response.
  previewEndpoint:configuredBase+"/api/vmv/ai-agents/test-number"
 });
}
