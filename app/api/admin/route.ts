import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
import {billingAdmin} from "@/lib/vmv-billing";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
const reply=(data:Record<string,unknown>,status=200)=>NextResponse.json(data,{status,headers});
type Source="marketing"|"support"|"provisioning"|"domain";
const sources=new Set<Source>(["marketing","support","provisioning","domain"]);
const uuid=(value:unknown):value is string=>typeof value==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const text=(value:unknown,max=4000)=>typeof value==="string"?value.trim().slice(0,max+1):"";
const safeUrl=(value:unknown)=>{
 if(typeof value!=="string")return null;
 try{const u=new URL(value);return u.protocol==="https:"&&!u.username&&!u.password&&u.hostname?u.toString():null;}
 catch{return null;}
};
const sourceTable:Record<Source,string>={
 marketing:"vmv_marketing_requests",support:"vmv_admin_tickets",
 provisioning:"smartjob_provisioning_requests",domain:"smartjob_builder_domain_requests"
};
function normalize(source:Source,r:Record<string,unknown>){
 const service=source==="marketing"?String(r.service_code||"marketing"):
  source==="support"?String(r.service_code||"general"):
  source==="provisioning"?"smart_call":"domain";
 return {
  source,id:String(r.id),owner_id:String(r.owner_id||r.user_id||""),
  title:source==="marketing"?String(r.business_name||"Solicitud de Marketing"):
   source==="support"?String(r.subject||"Soporte"):
   source==="domain"?String(r.hostname||"Dominio"):
   "Solicitud de línea telefónica",
  service,status:String(r.status||"pending"),
  description:source==="marketing"?String(r.goal_text||""):
   source==="support"?String(r.description||""):
   source==="domain"?String(r.intent||"Solicitud de dominio"):
   "Revisión de aprovisionamiento",
  created_at:String(r.created_at||""),updated_at:String(r.updated_at||r.created_at||""),
  amount:source==="marketing"&&typeof r.quoted_price_cents==="number"?r.quoted_price_cents:null
 };
}
async function context(req:NextRequest){
 const uid=await authenticatedUser(req);
 if(!uid)return {error:"Sesión inválida o perfil inexistente.",status:401} as const;
 const db=billingAdmin();
 if(!db)return {error:"El servicio administrativo no está configurado.",status:503} as const;
 const {data,error}=await db.from("vmv_marketing_staff").select("role").eq("user_id",uid).maybeSingle();
 if(error||!data||!["admin","agent"].includes(data.role))return {error:"No tienes permisos de operador.",status:403} as const;
 return {db,uid,role:data.role as "admin"|"agent"};
}
async function lookup(db:NonNullable<ReturnType<typeof billingAdmin>>,source:Source,id:string){
 const result=await db.from(sourceTable[source]).select("*").eq("id",id).maybeSingle();
 if(result.error)throw Error("case_lookup_failed");
 return result.data as Record<string,unknown>|null;
}
async function log(db:NonNullable<ReturnType<typeof billingAdmin>>,uid:string,action:string,source:Source,sourceId:string,detail:Record<string,unknown>={}){
 const saved=await db.from("vmv_admin_audit").insert({actor_id:uid,action,source,source_id:sourceId,detail});
 if(saved.error)console.error("Admin audit unavailable",saved.error.code);
 return !saved.error;
}
const accountName=(r:Record<string,unknown>)=>
 [r.first_name,r.last_name].filter(x=>typeof x==="string"&&x.trim()).join(" ")||String(r.business_name||"Cuenta VMV");

export async function GET(req:NextRequest){
 const auth=await context(req);
 if("error" in auth)return reply({error:auth.error},auth.status);
 const {db,role,uid}=auth;
 const url=new URL(req.url),view=url.searchParams.get("view")||"overview";
 try{
 if(view==="overview"){
  const [m,t,p,d,meta,staff,errors]=await Promise.all([
   db.from("vmv_marketing_requests").select("id,owner_id,service_code,business_name,goal_text,status,quoted_price_cents,created_at,updated_at",{count:"exact"}).order("updated_at",{ascending:false}).limit(150),
   db.from("vmv_admin_tickets").select("id,owner_id,subject,description,service_code,status,created_at,updated_at",{count:"exact"}).order("updated_at",{ascending:false}).limit(150),
   db.from("smartjob_provisioning_requests").select("id,user_id,status,created_at,updated_at",{count:"exact"}).order("created_at",{ascending:false}).limit(100),
   db.from("smartjob_builder_domain_requests").select("id,owner_id,hostname,intent,status,created_at,updated_at",{count:"exact"}).order("created_at",{ascending:false}).limit(100),
   db.from("vmv_admin_case_meta").select("source,source_id,assigned_to,priority,due_at,updated_at").limit(1000),
   db.from("vmv_marketing_staff").select("user_id,role,granted_at").limit(100),
   db.from("smartjob_call_sessions").select("bridge_sid",{count:"exact",head:true}).not("error_code","is",null).gte("started_at",new Date(Date.now()-30*86400000).toISOString())
  ]);
  const core=[m,t,p,d,meta,staff];
  if(core.some(x=>x.error))throw Error("database_read_failed");
  const refs=[...((m.data||[]) as Record<string,unknown>[]).map(r=>normalize("marketing",r)),
   ...((t.data||[]) as Record<string,unknown>[]).map(r=>normalize("support",r)),
   ...((p.data||[]) as Record<string,unknown>[]).map(r=>normalize("provisioning",r)),
   ...((d.data||[]) as Record<string,unknown>[]).map(r=>normalize("domain",r))];
  const md=new Map((meta.data||[]).map(x=>[x.source+":"+x.source_id,x]));
  const owners=[...new Set(refs.map(r=>r.owner_id).filter(uuid))].slice(0,500);
  const persons=owners.length?await db.from("smartjob_profiles").select("id,first_name,last_name,business_name").in("id",owners):{data:[],error:null};
  if(persons.error)throw Error("profiles_read_failed");
  const people=new Map(((persons.data||[]) as Record<string,unknown>[]).map(p=>[String(p.id),accountName(p)]));
  const cases=refs.map(r=>{
   const extra=md.get(r.source+":"+r.id);
   return {...r,client_name:people.get(r.owner_id)||"Cliente",priority:extra?.priority||"normal",
    assigned_to:extra?.assigned_to||null,due_at:extra?.due_at||null};
  }).sort((a,b)=>Date.parse(b.updated_at)-Date.parse(a.updated_at));
  return reply({role,actorId:uid,cases,staff:staff.data||[],total:(m.count||0)+(t.count||0)+(p.count||0)+(d.count||0),
    sources:{marketing:m.count||0,support:t.count||0,provisioning:p.count||0,domain:d.count||0},
    truncated:(m.count||0)>150||(t.count||0)>150||(p.count||0)>100||(d.count||0)>100,
    failedCalls30d:errors.error?null:(errors.count||0)});
 }
 if(view==="detail"){
  const source=url.searchParams.get("source") as Source,id=url.searchParams.get("id");
  if(!sources.has(source)||!uuid(id))return reply({error:"Caso no válido."},400);
  const record=await lookup(db,source,id);
  if(!record)return reply({error:"No existe este caso."},404);
  const [meta,messages,profile,acceptances]=await Promise.all([
   db.from("vmv_admin_case_meta").select("*").eq("source",source).eq("source_id",id).maybeSingle(),
   db.from("vmv_admin_messages").select("id,author_id,kind,body,created_at").eq("source",source).eq("source_id",id).order("created_at",{ascending:true}).limit(300),
   db.from("smartjob_profiles").select("id,first_name,last_name,business_name,phone,website_url,city,state,created_at").eq("id",String(record.owner_id||record.user_id)).maybeSingle(),
   source==="marketing"?db.from("vmv_marketing_quote_acceptances").select("quote_revision,quoted_price_cents,accepted_at").eq("request_id",id).order("accepted_at",{ascending:false}).limit(20):Promise.resolve({data:[],error:null})
  ]);
  if(meta.error||messages.error||profile.error||acceptances.error)throw Error("detail_read_failed");
  return reply({case:normalize(source,record),record,meta:meta.data||null,messages:messages.data||[],profile:profile.data||null,
    acceptances:acceptances.data||[]});
 }
 if(view==="media"){
  const id=url.searchParams.get("id"),path=url.searchParams.get("path");
  if(!uuid(id)||!path||path.length>500)return reply({error:"Imagen no válida."},400);
  const record=await lookup(db,"marketing",id);
  if(!record)return reply({error:"Solicitud inexistente."},404);
  const google=record.google_profile_data as {media?:{path?:string}[]}|null;
  if(!Array.isArray(google?.media)||!google.media.some(m=>m.path===path)||!path.startsWith(String(record.owner_id)+"/"+id+"/"))
   return reply({error:"Archivo no autorizado."},403);
  const signed=await db.storage.from("vmv-google-media").createSignedUrl(path,90);
  if(signed.error||!signed.data?.signedUrl)return reply({error:"Imagen temporalmente inaccesible."},503);
  return reply({url:signed.data.signedUrl,expiresIn:90});
 }
 if(view==="team"){
  const [staff,profiles]=await Promise.all([
   db.from("vmv_marketing_staff").select("user_id,role,granted_at").order("granted_at",{ascending:true}).limit(150),
   db.from("smartjob_profiles").select("id,first_name,last_name,business_name").limit(300)
  ]);
  if(staff.error||profiles.error)throw Error("staff_read_failed");
  const pm=new Map((profiles.data||[]).map(p=>[p.id,p]));
  return reply({staff:(staff.data||[]).map(s=>({...s,name:pm.has(s.user_id)?accountName(pm.get(s.user_id)!):"Operador VMV"})),canManage:role==="admin"});
 }
 if(view==="clients"){
  if(role!=="admin")return reply({error:"Solo administradores."},403);
  const [profiles,billing]=await Promise.all([
   db.from("smartjob_profiles").select("id,first_name,last_name,business_name,phone,website_url,city,state,created_at",{count:"exact"}).order("created_at",{ascending:false}).limit(250),
   db.from("smartjob_billing_accounts").select("user_id,plan_code,status,stripe_mode").limit(250)
  ]);
  if(profiles.error||billing.error)throw Error("clients_read_failed");
  const bm=new Map((billing.data||[]).map(b=>[b.user_id,b]));
  return reply({clients:(profiles.data||[]).map(p=>({...p,display_name:accountName(p),billing:bm.get(p.id)||null})),total:profiles.count||0,truncated:(profiles.count||0)>250});
 }
 if(view==="billing"){
  if(role!=="admin")return reply({error:"Solo administradores."},403);
  const [accounts,errors]=await Promise.all([
   db.from("smartjob_billing_accounts").select("user_id,plan_code,status,stripe_mode,current_period_end,included_minutes,used_minutes,reserved_minutes,rollover_minutes,topup_minutes,updated_at").order("updated_at",{ascending:false}).limit(250),
   db.from("smartjob_call_sessions").select("bridge_sid,owner_id,status,error_code,started_at",{count:"exact"}).not("error_code","is",null).order("started_at",{ascending:false}).limit(30)
  ]);
  if(accounts.error||errors.error)throw Error("billing_read_failed");
  return reply({accounts:accounts.data||[],failures:errors.data||[],failureCount:errors.count||0,
   note:"Lectura operativa. Stripe TEST no confirma pagos reales ni concede servicios."});
 }
 if(view==="activity"){
  if(role!=="admin")return reply({error:"Solo administradores."},403);
  const events=await db.from("vmv_admin_audit")
   .select("id,actor_id,action,source,source_id,created_at")
   .order("created_at",{ascending:false}).limit(80);
  if(events.error)throw Error("audit_read_failed");
  return reply({events:events.data||[]});
 }
 if(view==="settings"){
  if(role!=="admin")return reply({error:"Solo administradores."},403);
  const settings=await db.from("vmv_admin_settings").select("key,value,updated_at").limit(10);
  if(settings.error)throw Error("settings_read_failed");
  return reply({settings:settings.data||[]});
 }
 return reply({error:"Vista inexistente."},404);
 }catch(e){console.error("Admin GET",e instanceof Error?e.message:"unknown");return reply({error:"No se pudo consultar el panel administrativo."},503);}
}

export async function POST(req:NextRequest){
 const auth=await context(req);
 if("error" in auth)return reply({error:auth.error},auth.status);
 const {db,uid,role}=auth;
 let body:Record<string,unknown>;
 try{body=await req.json();if(!body||Array.isArray(body)||typeof body!=="object")throw Error();}
 catch{return reply({error:"Solicitud inválida."},400);}
 const action=text(body.action,60);
 const source=body.source as Source,id=body.id;
 const validCase=sources.has(source)&&uuid(id);
 const requireCase=async()=>{
  if(!validCase)throw Error("invalid_case");
  const existing=await lookup(db,source,id as string);
  if(!existing)throw Error("case_not_found");
  return existing;
 };
 try{
 if(action==="set_meta"){
  await requireCase();
  const priority=body.priority;
  if(typeof priority!=="string"||!["low","normal","high","urgent"].includes(priority))return reply({error:"Prioridad no válida."},400);
  const assignee=body.assigned_to===null||body.assigned_to===""?null:body.assigned_to;
  if(assignee!==null){
   if(!uuid(assignee))return reply({error:"Responsable no válido."},400);
   const check=await db.from("vmv_marketing_staff").select("user_id").eq("user_id",assignee).maybeSingle();
   if(check.error||!check.data)return reply({error:"El responsable debe ser un operador autorizado."},400);
  }
  let dueAt:string|null=null;
  if(body.due_at!==null&&body.due_at!==""&&body.due_at!==undefined){
   if(typeof body.due_at!=="string"||!Number.isFinite(Date.parse(body.due_at)))return reply({error:"Fecha inválida."},400);
   dueAt=new Date(body.due_at).toISOString();
  }
  const result=await db.from("vmv_admin_case_meta").upsert({
   source,source_id:id,assigned_to:assignee,priority,due_at:dueAt,updated_at:new Date().toISOString()
  },{onConflict:"source,source_id"}).select("source_id").single();
  if(result.error)throw Error("meta_write_failed");
  const audited=await log(db,uid,"case_assigned",source,id as string,{priority,assigned_to:assignee,due_at:dueAt});
  return reply({ok:true,audited});
 }
 if(action==="send_message"){
  await requireCase();
  const message=text(body.message,4000);
  if(message.length<1||message.length>4000)return reply({error:"El mensaje debe contener entre 1 y 4,000 caracteres."},400);
  const kind=body.kind==="internal_note"?"internal_note":"message";
  if(["provisioning","domain"].includes(source)&&kind==="message")
   return reply({error:"Este servicio todavía no tiene mensajería pública. Utiliza una nota interna."},400);
  // Messages are append-only; never accept a caller-supplied author or target owner.
  const inserted=await db.from("vmv_admin_messages").insert({
   source,source_id:id,author_id:uid,kind,body:message
  }).select("id").single();
  if(inserted.error)throw Error("message_write_failed");
  await log(db,uid,kind==="internal_note"?"internal_note_added":"customer_message_added",source,id as string,{message_id:inserted.data.id});
  return reply({ok:true,id:inserted.data.id,notificationSent:false});
 }
 if(action==="update_ticket"){
  const record=await requireCase();
  if(source!=="support")return reply({error:"Solo válido para soporte."},400);
  const status=body.status;
  if(typeof status!=="string"||!["new","in_progress","needs_customer","resolved","closed"].includes(status))
   return reply({error:"Estado no válido."},400);
  const update=await db.from("vmv_admin_tickets")
   .update({status,updated_at:new Date().toISOString(),closed_at:status==="closed"?new Date().toISOString():null})
   .eq("id",id).eq("updated_at",record.updated_at).select("id").maybeSingle();
  if(update.error)throw Error("ticket_write_failed");
  if(!update.data)return reply({error:"El caso cambió. Actualiza antes de guardar."},409);
  const audited=await log(db,uid,"ticket_status",source,id as string,{from:record.status,to:status});
  return reply({ok:true,audited});
 }
 if(action==="update_marketing"){
  const record=await requireCase();
  if(source!=="marketing")return reply({error:"Solo válido para Marketing."},400);
  const updatedAt=body.updated_at;
  if(typeof updatedAt!=="string"||updatedAt!==record.updated_at)return reply({error:"El caso cambió. Actualiza."},409);
  const operation=body.operation;
  let patch:Record<string,unknown>;
  if(operation==="quote"){
   const cents=body.amount_cents;
   const note=text(body.quote_note,1500);
   if(typeof cents!=="number"||!Number.isSafeInteger(cents)||cents<0||cents>100000000||note.length<8||note.length>1500)
    return reply({error:"Precio o alcance no válidos. Describe qué incluye el presupuesto (mínimo 8 caracteres)."},400);
   if(!["received","quoted","needs_customer"].includes(String(record.status)))return reply({error:"Este caso ya pasó de cotización."},409);
   patch={quoted_price_cents:cents,quote_note:note,status:"quoted",staff_update:"Presupuesto disponible. Pendiente de aprobación del cliente."};
  }else if(operation==="status"){
   const state=body.status;
   if(typeof state!=="string"||!["received","approved","in_progress","needs_customer","verified","cancelled"].includes(state))
    return reply({error:"Estado no permitido."},400);
   const staffUpdate=text(body.note,1500);
   if(staffUpdate.length>1500)return reply({error:"La nota supera el máximo."},400);
   patch={status:state,staff_update:staffUpdate||null};
   if(state==="verified"){
    const proof=safeUrl(body.evidence_url);
    if(!proof||proof.length>750)return reply({error:"La entrega exige evidencia HTTPS válida."},400);
    patch.evidence_url=proof;patch.verified_at=new Date().toISOString();
   }
  }else return reply({error:"Operación no permitida."},400);
  // Existing marketing trigger verifies approvals and quote revisions; do not bypass.
  const result=await db.from("vmv_marketing_requests").update(patch)
   .eq("id",id).eq("updated_at",updatedAt).select("id,updated_at,quote_revision").maybeSingle();
  if(result.error){console.error("Marketing admin transition",result.error.code);return reply({error:"El cambio fue rechazado. Comprueba aprobación, estado y evidencia."},409);}
  if(!result.data)return reply({error:"El caso se modificó. Actualiza."},409);
  const audited=await log(db,uid,operation==="quote"?"marketing_quote":"marketing_state",source,id as string,{operation,status:patch.status,revision:result.data.quote_revision});
  return reply({ok:true,audited});
 }
 if(action==="set_staff"){
  if(role!=="admin")return reply({error:"Solo administradores."},403);
  const target=body.user_id,nextRole=body.role;
  if(!uuid(target)||!["admin","agent","remove"].includes(String(nextRole)))return reply({error:"Usuario o rol inválido."},400);
  if(nextRole==="remove"&&target===uid)return reply({error:"No puedes revocar tu propio acceso."},400);
  if(nextRole==="agent"&&target===uid)return reply({error:"No puedes rebajar tu propio rol desde aquí."},400);
  if(nextRole!=="remove"){
   const [identity,profile]=await Promise.all([
    db.auth.admin.getUserById(target),
    db.from("smartjob_profiles").select("id").eq("id",target).maybeSingle()
   ]);
   if(identity.error||!identity.data.user||!identity.data.user.email_confirmed_at||profile.error||!profile.data)
    return reply({error:"Solo se pueden autorizar cuentas VMV verificadas."},400);
  }
  let result:{error:{code?:string}|null};
  if(nextRole==="remove"){
   const admins=await db.from("vmv_marketing_staff").select("user_id").eq("role","admin");
   if(admins.error||((admins.data||[]).length<=1&&target===(admins.data||[])[0]?.user_id))
    return reply({error:"Debe mantenerse al menos un administrador."},409);
   result=await db.from("vmv_marketing_staff").delete().eq("user_id",target);
  }else result=await db.from("vmv_marketing_staff").upsert({user_id:target,role:nextRole},{onConflict:"user_id"});
  if(result.error)throw Error("staff_write_failed");
  const audited=await log(db,uid,"staff_role","support",target,{role:nextRole});
  return reply({ok:true,audited});
 }
 if(action==="update_settings"){
  if(role!=="admin")return reply({error:"Solo administradores."},403);
  const defaultDays=body.sla_days;
  if(typeof defaultDays!=="number"||!Number.isInteger(defaultDays)||defaultDays<1||defaultDays>30)return reply({error:"SLA entre 1 y 30 días."},400);
  const message=text(body.welcome_message,500);
  if(message.length>500)return reply({error:"Mensaje demasiado largo."},400);
  const value={sla_days:defaultDays,welcome_message:message};
  const result=await db.from("vmv_admin_settings").upsert({
   key:"support_defaults",value,updated_by:uid,updated_at:new Date().toISOString()
  },{onConflict:"key"});
  if(result.error)throw Error("settings_write_failed");
  const audited=await log(db,uid,"settings_updated","support",uid,{key:"support_defaults"});
  return reply({ok:true,audited});
 }
 return reply({error:"Acción no admitida."},404);
 }catch(e){
  const message=e instanceof Error?e.message:"unknown";
  console.error("Admin POST",message);
  if(message==="invalid_case")return reply({error:"Referencia inválida."},400);
  if(message==="case_not_found")return reply({error:"Caso inexistente."},404);
  return reply({error:"La operación no pudo completarse de forma segura."},503);
 }
}