import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
import {billingAdmin} from "@/lib/vmv-billing";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
const reply=(data:Record<string,unknown>,status=200)=>NextResponse.json(data,{status,headers});
const uuid=(v:unknown):v is string=>typeof v==="string"&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
const categories=new Set(["general","marketing","web_services","smart_call","ai_agents","billing","company_formation","other"]);
async function context(req:NextRequest){
 const uid=await authenticatedUser(req);
 if(!uid)return {error:"Inicia sesión en VMV Business.",status:401} as const;
 const db=billingAdmin();
 if(!db)return {error:"Soporte no disponible en este entorno.",status:503} as const;
 return {db,uid};
}
export async function GET(req:NextRequest){
 const auth=await context(req);
 if("error" in auth)return reply({error:auth.error},auth.status);
 const {db,uid}=auth;
 const url=new URL(req.url);
 const view=url.searchParams.get("view")||"list";
 try{
  if(view==="list"){
   const [tickets,marketing]=await Promise.all([
    db.from("vmv_admin_tickets").select("id,subject,description,service_code,status,created_at,updated_at").eq("owner_id",uid).order("updated_at",{ascending:false}).limit(80),
    db.from("vmv_marketing_requests").select("id,business_name,service_code,goal_text,status,quoted_price_cents,quote_revision,staff_update,evidence_url,created_at,updated_at").eq("owner_id",uid).order("updated_at",{ascending:false}).limit(80)
   ]);
   if(tickets.error||marketing.error)throw Error("list_unavailable");
   return reply({tickets:tickets.data||[],marketing:marketing.data||[]});
  }
  if(view==="thread"){
   const id=url.searchParams.get("id");
   const source=url.searchParams.get("source");
   if(!uuid(id)||!["support","marketing"].includes(source||""))return reply({error:"Caso no válido."},400);
   const check=source==="support"?
    await db.from("vmv_admin_tickets").select("id,status").eq("id",id).eq("owner_id",uid).maybeSingle():
    await db.from("vmv_marketing_requests").select("id,status").eq("id",id).eq("owner_id",uid).maybeSingle();
   if(check.error||!check.data)return reply({error:"Solicitud no disponible."},404);
   const messages=await db.from("vmv_admin_messages")
    .select("id,author_id,body,created_at").eq("source",source).eq("source_id",id)
    .eq("kind","message").order("created_at",{ascending:true}).limit(200);
   if(messages.error)throw Error("thread_unavailable");
   return reply({messages:messages.data||[],status:check.data.status,ownerId:uid});
  }
  return reply({error:"Consulta desconocida."},404);
 }catch{return reply({error:"No se pudieron cargar tus solicitudes."},503);}
}
export async function POST(req:NextRequest){
 const auth=await context(req);
 if("error" in auth)return reply({error:auth.error},auth.status);
 const {db,uid}=auth;
 let body:Record<string,unknown>;
 try{body=await req.json();if(!body||Array.isArray(body)||typeof body!=="object")throw Error();}
 catch{return reply({error:"Solicitud inválida."},400);}
 try{
 if(body.action==="create"){
  const subject=typeof body.subject==="string"?body.subject.trim():"";
  const description=typeof body.description==="string"?body.description.trim():"";
  const service_code=body.service_code;
  if(subject.length<5||subject.length>140||description.length<10||description.length>4000||
    typeof service_code!=="string"||!categories.has(service_code))
   return reply({error:"Completa el asunto, la descripción y el servicio."},400);
  const today=new Date(Date.now()-86400000).toISOString();
  const usage=await db.from("vmv_admin_tickets").select("id",{head:true,count:"exact"})
   .eq("owner_id",uid).gte("created_at",today);
  if(usage.error)return reply({error:"No se pudo comprobar el límite de solicitudes."},503);
  if((usage.count||0)>=10)return reply({error:"Has alcanzado el límite diario de 10 solicitudes de soporte."},429);
  const saved=await db.from("vmv_admin_tickets").insert({owner_id:uid,subject,description,service_code})
   .select("id,status").single();
  if(saved.error)return reply({error:"No se pudo registrar el ticket."},503);
  return reply({ok:true,id:saved.data.id,status:saved.data.status},201);
 }
 if(body.action==="message"){
  const id=body.id,source=body.source;
  const message=typeof body.message==="string"?body.message.trim():"";
  if(!uuid(id)||!["support","marketing"].includes(String(source))||!message||message.length>4000)
   return reply({error:"Mensaje o referencia inválidos."},400);
  const check=source==="support"?
   await db.from("vmv_admin_tickets").select("id,status").eq("id",id).eq("owner_id",uid).maybeSingle():
   await db.from("vmv_marketing_requests").select("id,status").eq("id",id).eq("owner_id",uid).maybeSingle();
  if(check.error||!check.data)return reply({error:"Solicitud inexistente."},404);
  if(["closed","resolved","verified","cancelled"].includes(check.data.status))
   return reply({error:"Este caso está finalizado. Crea un ticket de soporte si necesitas más ayuda."},409);
  const usage=await db.from("vmv_admin_messages").select("id",{head:true,count:"exact"})
   .eq("author_id",uid).gte("created_at",new Date(Date.now()-86400000).toISOString());
  if(usage.error)return reply({error:"No se pudo comprobar el límite de mensajes."},503);
  if((usage.count||0)>=80)return reply({error:"Límite de mensajes alcanzado. Inténtalo mañana."},429);
  const result=await db.from("vmv_admin_messages").insert({
   source,source_id:id,author_id:uid,kind:"message",body:message
  }).select("id").single();
  if(result.error)return reply({error:"No se pudo enviar el mensaje."},503);
  if(source==="support"&&check.data.status==="needs_customer")
   await db.from("vmv_admin_tickets").update({status:"in_progress",updated_at:new Date().toISOString()}).eq("id",id).eq("owner_id",uid);
  return reply({ok:true,id:result.data.id,notificationSent:false});
 }
 return reply({error:"Acción desconocida."},404);
 }catch{return reply({error:"La operación no pudo completarse."},503);}
}