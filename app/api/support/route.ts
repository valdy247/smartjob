import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
import {billingAdmin} from "@/lib/vmv-billing";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
const reply=(data:Record<string,unknown>,status=200)=>NextResponse.json(data,{status,headers});
type Source="support"|"marketing"|"provisioning"|"domain";
const sources=new Set<Source>(["support","marketing","provisioning","domain"]);
const uuid=(v:unknown):v is string=>typeof v==="string"&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
const num=(v:string|null,max=100,fallback=20)=>Math.min(max,Math.max(1,Number.parseInt(v||"",10)||fallback));
const page=(v:string|null)=>Math.max(1,Math.min(100000,Number.parseInt(v||"",10)||1));
const parse=(e:unknown)=>{
 const error=String((e as {message?:string})?.message||"");
 if(error.includes("ticket_limit"))return {error:"Se alcanzó el límite de 10 tickets en 24 horas.",status:429};
 if(error.includes("message_limit"))return {error:"Límite diario de mensajes alcanzado.",status:429};
 if(error.includes("case_closed"))return {error:"Este caso está cerrado. Crea un ticket relacionado.",status:409};
 if(error.includes("forbidden"))return {error:"No tienes acceso a este caso.",status:403};
 if(error.includes("case_not_found"))return {error:"Caso inexistente.",status:404};
 if(error.includes("invalid_related_ticket"))return {error:"El seguimiento debe pertenecer a un caso finalizado de tu cuenta.",status:400};
 if(error.includes("invalid_message")||error.includes("invalid_ticket"))return {error:"Revisa el contenido enviado.",status:400};
 return {error:"No se pudo completar la operación.",status:503};
};
async function context(req:NextRequest){
 const uid=await authenticatedUser(req);
 if(!uid)return {error:"Inicia sesión para abrir soporte.",status:401} as const;
 const db=billingAdmin();
 if(!db)return {error:"Soporte no configurado.",status:503} as const;
 return {uid,db};
}
async function owned(db:NonNullable<ReturnType<typeof billingAdmin>>,uid:string,source:Source,id:string){
 const table=({support:"vmv_admin_tickets",marketing:"vmv_marketing_requests",provisioning:"smartjob_provisioning_requests",domain:"smartjob_builder_domain_requests"} as const)[source];
 const ownColumn=source==="provisioning"?"user_id":"owner_id";
 const r=await db.from(table).select("id,status").eq("id",id).eq(ownColumn,uid).maybeSingle();
 if(r.error)throw Error("ownership_unavailable");
 return r.data;
}
export async function GET(req:NextRequest){
 const auth=await context(req);
 if("error" in auth)return reply({error:auth.error},auth.status);
 const {db,uid}=auth;
 const url=new URL(req.url),q=url.searchParams;
 const view=q.get("view")||"list";
 try{
 if(view==="list"){
  const p=page(q.get("page")),size=num(q.get("size"),40,20);
  const r=await db.from("vmv_admin_case_index")
    .select("source,id,title,description,service,status,created_at,updated_at,due_at",{count:"exact"})
    .eq("owner_id",uid).order("updated_at",{ascending:false}).order("id",{ascending:true})
    .range((p-1)*size,p*size-1);
  if(r.error)throw Error("list_unavailable");
  const settings=await db.from("vmv_admin_settings").select("value").eq("key","support_defaults").maybeSingle();
  return reply({cases:r.data||[],total:r.count||0,page:p,pages:Math.max(1,Math.ceil((r.count||0)/size)),
   welcome:settings.data?.value?.welcome_message||null});
 }
 if(view==="case"){
  const source=q.get("source") as Source,id=q.get("id");
  if(!sources.has(source)||!uuid(id))return reply({error:"Caso inválido."},400);
  const own=await owned(db,uid,source,id);
  if(!own)return reply({error:"Caso no disponible."},404);
  const info=await db.from("vmv_admin_case_index")
    .select("source,id,title,description,service,status,created_at,updated_at,due_at")
    .eq("source",source).eq("id",id).eq("owner_id",uid).maybeSingle();
  if(info.error||!info.data)return reply({error:"Solicitud no disponible."},404);
  return reply({case:info.data});
 }
 if(view==="thread"||view==="history"){
  const source=q.get("source") as Source,id=q.get("id");
  if(!sources.has(source)||!uuid(id))return reply({error:"Caso inválido."},400);
  const check=await owned(db,uid,source,id);
  if(!check)return reply({error:"Caso inexistente."},404);
  const history=view==="history",size=num(q.get("size"),60,30);
  const before=q.get("before"),beforeId=q.get("beforeId");
  let stmt=history?db.from("vmv_admin_case_history").select("id,action,summary,created_at")
   :db.from("vmv_admin_messages").select("id,author_id,body,created_at");
  stmt=stmt.eq("source",source).eq("source_id",id);
  if(history)stmt=stmt.eq("visibility","shared");
  else stmt=stmt.eq("kind","message");
  if(before&&Number.isFinite(Date.parse(before))&&beforeId){
   if((history&&/^\d+$/.test(beforeId))||(!history&&uuid(beforeId)))
    stmt=stmt.or("created_at.lt."+before+",and(created_at.eq."+before+",id.lt."+beforeId+")");
   else return reply({error:"Cursor inválido."},400);
  }
  const data=await stmt.order("created_at",{ascending:false}).order("id",{ascending:false}).limit(size+1);
  if(data.error)throw Error("thread_unavailable");
  return reply({items:(data.data||[]).slice(0,size).reverse(),hasMore:(data.data||[]).length>size,
   status:check.status,ownerId:uid});
 }
 if(view==="notifications"){
  const [notes,total]=await Promise.all([
   db.from("vmv_admin_notifications").select("id,source,source_id,kind,title,created_at,read_at")
    .eq("recipient_id",uid).order("created_at",{ascending:false}).limit(80),
   db.from("vmv_admin_notifications").select("id",{count:"exact",head:true})
    .eq("recipient_id",uid).is("read_at",null)
  ]);
  if(notes.error||total.error)throw Error("notifications_unavailable");
  return reply({notifications:notes.data||[],unread:total.count||0});
 }
 return reply({error:"Vista inválida."},404);
 }catch{return reply({error:"No se pudo consultar el centro de ayuda."},503);}
}
export async function POST(req:NextRequest){
 const auth=await context(req);
 if("error" in auth)return reply({error:auth.error},auth.status);
 const {db,uid}=auth;
 let body:Record<string,unknown>;
 try{body=await req.json();if(!body||typeof body!=="object"||Array.isArray(body))throw Error();}
 catch{return reply({error:"Solicitud inválida."},400);}
 if(body.action==="mark_notification"){
  if(typeof body.id!=="number"||!Number.isSafeInteger(body.id))return reply({error:"Aviso inválido."},400);
  const saved=await db.from("vmv_admin_notifications").update({read_at:new Date().toISOString()})
   .eq("recipient_id",uid).eq("id",body.id).select("id").maybeSingle();
  if(saved.error||!saved.data)return reply({error:"Aviso no disponible."},404);
  return reply({ok:true});
 }
 if(body.action==="create"){
  const {subject,description,service_code,request_key,related_ticket_id}=body;
  if(typeof subject!=="string"||typeof description!=="string"||
   typeof service_code!=="string"||!uuid(request_key)||
   (related_ticket_id!==null&&related_ticket_id!==undefined&&!uuid(related_ticket_id)))
   return reply({error:"Completa los datos del ticket y su referencia de envío."},400);
  const r=await db.rpc("vmv_admin_create_ticket",{
   p_actor:uid,p_request_key:request_key,p_subject:subject,p_description:description,
   p_service:service_code,p_related:related_ticket_id||null
  });
  if(r.error){const failure=parse(r.error);return reply({error:failure.error},failure.status);}
  return reply(r.data as Record<string,unknown>,201);
 }
 if(body.action==="message"){
  const source=body.source as Source,id=body.id;
  if(!sources.has(source)||!uuid(id)||!uuid(body.request_key)||typeof body.message!=="string")
   return reply({error:"Mensaje o referencia inválidos."},400);
  const r=await db.rpc("vmv_admin_append_message",{
   p_actor:uid,p_source:source,p_id:id,p_kind:"message",p_body:body.message,
   p_request_key:body.request_key
  });
  if(r.error){const failure=parse(r.error);return reply({error:failure.error},failure.status);}
  return reply({...r.data,notificationSent:false});
 }
 return reply({error:"Acción inexistente."},404);
}