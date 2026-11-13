import {NextRequest,NextResponse} from "next/server";
import {createClient,type SupabaseClient} from "@supabase/supabase-js";
import {businessWeek,checkCallPolicy,decideCall,initialCallPolicy,
 localParts,localPreview,type CallPolicy} from "@/lib/vmv-ai-agents/call-policy";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const reply=(data:Record<string,unknown>,status=200)=>NextResponse.json(data,
 {status,headers:{"Cache-Control":"private,no-store"}});
type Context={
 db:SupabaseClient;owner:string;
 route:{id:string;twilio_number:string;destination_phone:string;enabled:boolean};
 selected:{id:string;status:string;kind:string;configuration:Record<string,string>}|null;
 version:number;policy:CallPolicy;forwardReady:boolean;businessReady:boolean;
};
async function context(req:NextRequest):Promise<Context>{
 const token=req.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1]||"";
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const anon=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!token||!url||!anon)throw Error("AUTH:Inicia sesión en VMV.");
 const db=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false},
  global:{headers:{Authorization:"Bearer "+token}}});
 const {data:identity,error:authError}=await db.auth.getUser(token);
 if(authError||!identity.user||identity.user.is_anonymous)throw Error("AUTH:Sesión no válida.");
 const owner=identity.user.id;
 const {data:routes,error:routeError}=await db.from("smartjob_phone_routes")
  .select("id,twilio_number,destination_phone,enabled")
  .eq("user_id",owner).eq("enabled",true).limit(2);
 if(routeError)throw Error("DATABASE:No se pudo consultar tu línea.");
 if(!routes||routes.length!==1)throw Error("ROUTE:Elige una cuenta con exactamente una línea activa.");
 const route=routes[0];
 const [s,p]=await Promise.all([
  db.from("vmv_ai_phone_selections").select("agent_id")
   .eq("route_id",route.id).eq("owner_id",owner).maybeSingle(),
  db.from("vmv_ai_call_settings").select("*")
   .eq("route_id",route.id).eq("owner_id",owner).maybeSingle()
 ]);
 if(s.error||p.error)throw Error("DATABASE:La configuración telefónica no pudo consultarse.");
 const id=s.data?.agent_id;
 let selected:Context["selected"]=null;
 if(id){
  const {data,error}=await db.from("vmv_ai_agents")
   .select("id,status,kind,configuration").eq("id",id).eq("owner_id",owner)
   .maybeSingle();
  if(error)throw Error("DATABASE:No se pudo consultar el agente seleccionado.");
  selected=data as Context["selected"];
 }
 const forwardReady=/^\+[1-9]\d{7,14}$/.test(route.destination_phone)&&
  route.destination_phone!==route.twilio_number;
 return {db,owner,route,selected,version:p.data?.version??0,
  policy:p.data?checkCallPolicy(p.data):initialCallPolicy,forwardReady,
  businessReady:!!businessWeek(selected?.configuration||null)};
}
function failure(error:unknown){
 const msg=error instanceof Error?error.message:"No se pudo consultar la línea.";
 const [reason,...rest]=msg.split(":");
 const status=reason==="AUTH"?401:reason==="ROUTE"?409:reason==="DATABASE"?503:400;
 return reply({error:rest.length?rest.join(":"):msg},status);
}
export async function GET(req:NextRequest){
 try{
  const ctx=await context(req);
  return reply({
   maskedPhone:"••• "+ctx.route.twilio_number.slice(-4),
   selectedAgentId:ctx.selected?.id||null,
   agentActive:ctx.selected?.status==="active",
   forwardReady:ctx.forwardReady,
   businessHoursReady:ctx.businessReady,
   version:ctx.version,policy:ctx.policy,source:ctx.version?"saved":"legacy_menu",
   note:ctx.version?"La configuración se aplicará a la próxima llamada.":
    "La línea conserva el menú original hasta que guardes una nueva configuración."
  });
 }catch(e){return failure(e);}
}
function preflight(ctx:Context,p:CallPolicy){
 if(p.agent_enabled){
  if(!ctx.selected||ctx.selected.status!=="active")
   throw Error("Selecciona y activa primero un agente real.");
  const cfg=ctx.selected.configuration||{};
  if(cfg.call_disclosure!=="Sí"&&cfg.call_consent!=="Sí")
   throw Error("Falta autorizar el aviso de asistente de inteligencia artificial.");
  if(cfg.channel!=="Teléfono"&&cfg.channel!=="Teléfono y chat"&&
   !(ctx.selected.kind==="calls"&&!cfg.channel))
   throw Error("El agente debe permitir el canal telefónico.");
 }
 if(p.use_business_hours&&!ctx.businessReady)
  throw Error("Completa primero los horarios del negocio en el asistente o usa un horario personalizado.");
 if(p.agent_enabled&&p.agent_mode==="after_no_answer"&&!ctx.forwardReady)
  throw Error("No hay teléfono de destino verificado para intentar contactar primero con una persona.");
 if(p.outside_action==="translation"&&!p.translation_enabled)
  throw Error("Activa traducción o elige un mensaje de cierre fuera de horario.");
}
export async function PUT(req:NextRequest){
 try{
  const ctx=await context(req);
  let input:{policy?:unknown;version?:unknown};
  try{input=await req.json();}catch{throw Error("No se pudo leer la configuración.");}
  const policy=checkCallPolicy(input?.policy);
  preflight(ctx,policy);
  if(!Number.isInteger(input.version)||input.version!==ctx.version)
   return reply({error:"Esta configuración cambió en otro dispositivo. Actualiza antes de guardar."},409);
  const row={...policy,owner_id:ctx.owner,route_id:ctx.route.id};
  let saved;
  if(ctx.version===0){
   saved=await ctx.db.from("vmv_ai_call_settings").insert(row)
    .select("*").maybeSingle();
  }else{
   saved=await ctx.db.from("vmv_ai_call_settings").update(policy)
    .eq("route_id",ctx.route.id).eq("owner_id",ctx.owner)
    .eq("version",ctx.version).select("*").maybeSingle();
  }
  if(saved.error){
   if(saved.error.code==="23505")return reply({error:"La configuración cambió en otra sesión. Actualiza la página."},409);
   throw Error("DATABASE:No se pudo guardar la configuración telefónica.");
  }
  if(!saved.data)return reply({error:"La configuración cambió en otra sesión. Recarga antes de guardar."},409);
  return reply({ok:true,version:saved.data.version,
   policy:checkCallPolicy(saved.data),notice:"Guardado para la siguiente llamada. No se modificó Twilio."});
 }catch(e){return failure(e);}
}
export async function POST(req:NextRequest){
 try{
  const ctx=await context(req);
  const body=await req.json() as {policy?:unknown;day?:string;time?:string};
  const policy=checkCallPolicy(body.policy);
  const week=policy.use_business_hours?businessWeek(ctx.selected?.configuration||null):policy.schedule;
  if(!week)throw Error("El horario del negocio aún no está definido.");
  const sample=body.day&&body.time?
   localPreview(body.day as Parameters<typeof localPreview>[0],body.time):
   localParts(new Date(),policy.time_zone);
  const decision=decideCall(policy,sample,week);
  const safeDecision=decision.agentAvailable&&(!ctx.selected||ctx.selected.status!=="active")?
   {...decision,action:decision.translationAvailable?"translation":"message",reason:"disabled"}:
   decision;
  return reply({decision:safeDecision,day:sample.day,
   time:body.time||null,zone:policy.time_zone,
   selectedAgentReady:ctx.selected?.status==="active",
   noAnswerAvailable:ctx.forwardReady,
   note:"Simulación de reglas. No llama ni cambia la configuración del número."});
 }catch(e){return failure(e);}
}
