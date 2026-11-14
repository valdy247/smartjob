import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
import {billingAdmin} from "@/lib/vmv-billing";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const noStore={"Cache-Control":"private, no-store"};
const reply=(body:Record<string,unknown>,status=200)=>NextResponse.json(body,{status,headers:noStore});
type Source="marketing"|"support"|"provisioning"|"domain";
const sources=new Set<Source>(["marketing","support","provisioning","domain"]);
const tables:Record<Source,string>={marketing:"vmv_marketing_requests",support:"vmv_admin_tickets",provisioning:"smartjob_provisioning_requests",domain:"smartjob_builder_domain_requests"};
const uuid=(v:unknown):v is string=>typeof v==="string"&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
const safeDate=(v:unknown)=>typeof v==="string"&&v.length<80&&Number.isFinite(Date.parse(v))?v:null;
const limit=(value:string|null,max=100,fallback=25)=>Math.min(max,Math.max(1,Number.parseInt(value||"",10)||fallback));
const pageNumber=(value:string|null)=>Math.min(100000,Math.max(1,Number.parseInt(value||"",10)||1));
const queryTerm=(value:string|null)=>(value||"").trim().replace(/[%_(),.\\]/g,"").slice(0,100);
const name=(p:Record<string,unknown>)=>[p.first_name,p.last_name].filter(v=>typeof v==="string"&&v.trim()).join(" ")||String(p.business_name||"Cuenta VMV");
const messageFor=(error:unknown)=>{
 const raw=String((error as {message?:string})?.message||"");
 const keys:Record<string,[string,number]>={
  conflict:["El registro cambió. Se conservaron tus datos: actualiza el caso y vuelve a revisar.",409],
  forbidden:["No tienes permiso para esta operación.",403],
  case_not_found:["Este caso ya no está disponible.",404],
  invalid_case:["Referencia de caso inválida.",400],
  invalid_transition:["No se permite esa transición de estado.",409],
  case_closed:["Este caso está finalizado; crea un ticket relacionado.",409],
  last_admin_denied:["Debe permanecer al menos un administrador activo.",409],
  self_revocation_denied:["No puedes revocar ni reducir tu propio acceso.",409],
  invalid_quote:["Revisa el precio y el alcance.",400],
  invalid_evidence:["La entrega requiere una URL HTTPS de evidencia.",400],
  invalid_priority:["La prioridad es inválida.",400],
  invalid_assignee:["Selecciona un operador autorizado.",400],
  invalid_due:["Fecha límite inválida.",400],
  unverified_account:["La cuenta requiere un perfil VMV y correo verificado.",400],
  invalid_settings:["Verifica los ajustes de soporte.",400],
  invalid_staff:["Rol o usuario no válido.",400]
 };
 const match=Object.entries(keys).find(([code])=>raw.includes(code));
 return match?{message:match[1][0],status:match[1][1]}:{message:"No se pudo completar la operación.",status:503};
};
async function context(req:NextRequest){
 const uid=await authenticatedUser(req);
 if(!uid)return {error:"Inicia sesión con una cuenta VMV.",status:401} as const;
 const db=billingAdmin();
 if(!db)return {error:"Servidor administrativo no configurado.",status:503} as const;
 const staff=await db.from("vmv_marketing_staff").select("role").eq("user_id",uid).maybeSingle();
 if(staff.error||!staff.data||!["admin","agent"].includes(staff.data.role))return {error:"Acceso administrativo no autorizado.",status:403} as const;
 return {db,uid,role:staff.data.role as "agent"|"admin"};
}
async function findCase(db:NonNullable<ReturnType<typeof billingAdmin>>,source:Source,id:string){
 const r=await db.from(tables[source]).select("*").eq("id",id).maybeSingle();
 if(r.error)throw Error("case_read_failed");
 return r.data as Record<string,unknown>|null;
}
const requiredCase=(url:URL)=>{
 const source=url.searchParams.get("source") as Source,id=url.searchParams.get("id");
 return sources.has(source)&&uuid(id)?{source,id}:null;
};
const newer=(value:unknown)=>typeof value==="string"&&Number.isFinite(Date.parse(value))?value:null;
export async function GET(req:NextRequest){
 const auth=await context(req);
 if("error" in auth)return reply({error:auth.error},auth.status);
 const {uid,role,db}=auth;
 const url=new URL(req.url),q=url.searchParams,view=q.get("view")||"overview";
 try{
 if(view==="overview"){
  const [metrics,staff,errors]=await Promise.all([
   db.rpc("vmv_admin_queue_metrics"),
   db.from("vmv_marketing_staff").select("user_id,role,granted_at,updated_at").order("granted_at",{ascending:true}).limit(500),
   db.from("smartjob_call_sessions").select("bridge_sid",{head:true,count:"exact"})
     .not("error_code","is",null).gte("started_at",new Date(Date.now()-30*86400000).toISOString())
  ]);
  if(metrics.error||staff.error)throw Error("overview_read_failed");
  return reply({role,actorId:uid,metrics:metrics.data,staff:staff.data||[],failedCalls30d:errors.error?null:errors.count||0});
 }
 if(view==="cases"){
  const page=pageNumber(q.get("page")),size=limit(q.get("size"),60,25);
  let stmt=db.from("vmv_admin_case_index")
   .select("source,id,owner_id,title,description,service,status,created_at,updated_at,amount,assigned_to,priority,due_at,client_name",{count:"exact"});
  const source=q.get("source"),service=q.get("service"),state=q.get("state"),priority=q.get("priority"),
   assignee=q.get("assignee"),owner=q.get("owner"),sort=q.get("sort"),term=queryTerm(q.get("q"));
  if(source&&source!=="all"){
   if(!sources.has(source as Source))return reply({error:"Origen inválido."},400);
   stmt=stmt.eq("source",source);
  }
  if(service&&service!=="all")stmt=stmt.eq("service",service.slice(0,80));
  if(priority&&priority!=="all"){
   if(!["low","normal","high","urgent"].includes(priority))return reply({error:"Prioridad inválida."},400);
   stmt=stmt.eq("priority",priority);
  }
  if(assignee==="unassigned")stmt=stmt.is("assigned_to",null);
  else if(assignee==="self")stmt=stmt.eq("assigned_to",uid);
  else if(assignee&&assignee!=="all"){if(!uuid(assignee))return reply({error:"Responsable inválido."},400);stmt=stmt.eq("assigned_to",assignee);}
  if(owner){if(!uuid(owner))return reply({error:"Cliente inválido."},400);stmt=stmt.eq("owner_id",owner);}
  if(state==="new")stmt=stmt.in("status",["new","received","pending"]);
  else if(state==="working")stmt=stmt.in("status",["in_progress","approved","contacted"]);
  else if(state==="waiting")stmt=stmt.in("status",["needs_customer","quoted"]);
  else if(state==="done")stmt=stmt.in("status",["closed","resolved","cancelled","verified","activated","completed"]);
  if(q.get("due")==="soon")stmt=stmt.lt("due_at",new Date(Date.now()+48*3600000).toISOString())
    .not("status","in","(closed,resolved,cancelled,verified,activated,completed)");
  else if(q.get("due")==="overdue")stmt=stmt.lt("due_at",new Date().toISOString())
    .not("status","in","(closed,resolved,cancelled,verified,activated,completed)");
  if(term)stmt=stmt.or("title.ilike.%"+term+"%,description.ilike.%"+term+"%,client_name.ilike.%"+term+"%,id.eq."+ (uuid(term)?term:"00000000-0000-0000-0000-000000000000"));
  const result=await stmt.order(sort==="oldest"?"created_at":"updated_at",{ascending:sort==="oldest"})
   .order("id",{ascending:true}).range((page-1)*size,page*size-1);
  if(result.error)throw Error("queue_read_failed");
  return reply({cases:result.data||[],page,size,total:result.count||0,
   pages:Math.max(1,Math.ceil((result.count||0)/size)),complete:true});
 }
 if(view==="detail"){
  const c=requiredCase(url);
  if(!c)return reply({error:"Caso inválido."},400);
  const record=await findCase(db,c.source,c.id);
  if(!record)return reply({error:"Caso no encontrado."},404);
  const owner=String(record.owner_id||record.user_id||"");
  const [meta,messages,profile,acceptances,history]=await Promise.all([
   db.from("vmv_admin_case_meta").select("*").eq("source",c.source).eq("source_id",c.id).maybeSingle(),
   db.from("vmv_admin_messages").select("id,author_id,kind,body,created_at")
    .eq("source",c.source).eq("source_id",c.id)
    .order("created_at",{ascending:false}).order("id",{ascending:false}).limit(41),
   db.from("smartjob_profiles").select("id,first_name,last_name,business_name,phone,website_url,city,state,created_at").eq("id",owner).maybeSingle(),
   c.source==="marketing"?db.from("vmv_marketing_quote_acceptances").select("quote_revision,quoted_price_cents,accepted_at")
    .eq("request_id",c.id).order("accepted_at",{ascending:false}).limit(40):Promise.resolve({data:[],error:null}),
   db.from("vmv_admin_case_history").select("id,actor_id,action,summary,visibility,created_at,detail")
     .eq("source",c.source).eq("source_id",c.id)
     .order("created_at",{ascending:false}).order("id",{ascending:false}).limit(41)
  ]);
  if(meta.error||messages.error||profile.error||acceptances.error||history.error)throw Error("detail_failed");
  const info=await db.from("vmv_admin_case_index").select("*").eq("source",c.source).eq("id",c.id).single();
  if(info.error||!info.data)throw Error("case_details_failed");
  return reply({case:info.data,record,meta:meta.data||null,profile:profile.data||null,
   acceptances:acceptances.data||[],
   messages:(messages.data||[]).slice(0,40).reverse(),messagesHasMore:(messages.data||[]).length>40,
   history:(history.data||[]).slice(0,40).reverse(),historyHasMore:(history.data||[]).length>40});
 }
 if(view==="thread"||view==="history"){
  const c=requiredCase(url);
  if(!c)return reply({error:"Caso inválido."},400);
  if(!await findCase(db,c.source,c.id))return reply({error:"Caso no encontrado."},404);
  const before=newer(q.get("before")),beforeId=q.get("beforeId");
  const size=limit(q.get("size"),100,40);
  const isThread=view==="thread";
  let stmt=isThread?db.from("vmv_admin_messages").select("id,author_id,kind,body,created_at")
   :db.from("vmv_admin_case_history").select("id,actor_id,action,summary,visibility,created_at,detail");
  stmt=stmt.eq("source",c.source).eq("source_id",c.id);
  // Stable two-field cursor: older timestamp, or equal timestamp with smaller id.
  if(before&&beforeId){
   if(isThread&&uuid(beforeId))stmt=stmt.or("created_at.lt."+before+",and(created_at.eq."+before+",id.lt."+beforeId+")");
   else if(!isThread&&/^\d+$/.test(beforeId))stmt=stmt.or("created_at.lt."+before+",and(created_at.eq."+before+",id.lt."+beforeId+")");
   else return reply({error:"Cursor inválido."},400);
  }
  const fetched=await stmt.order("created_at",{ascending:false}).order("id",{ascending:false}).limit(size+1);
  if(fetched.error)throw Error("thread_failed");
  return reply({items:(fetched.data||[]).slice(0,size).reverse(),hasMore:(fetched.data||[]).length>size});
 }
 if(view==="media"){
  const c=requiredCase(url),path=q.get("path");
  if(!c||c.source!=="marketing"||!path||path.length>500)return reply({error:"Imagen no válida."},400);
  const r=await findCase(db,"marketing",c.id);
  if(!r)return reply({error:"Solicitud inexistente."},404);
  const gp=r.google_profile_data as {media?:{path?:string}[]}|null;
  if(!Array.isArray(gp?.media)||!gp.media.some(m=>m.path===path)||!path.startsWith(String(r.owner_id)+"/"+c.id+"/"))
   return reply({error:"No tienes acceso a esta fotografía."},403);
  const signed=await db.storage.from("vmv-google-media").createSignedUrl(path,60);
  if(signed.error||!signed.data?.signedUrl)return reply({error:"Foto no disponible."},503);
  return reply({url:signed.data.signedUrl,expiresIn:60});
 }
 if(view==="team"){
  const r=await db.from("vmv_marketing_staff").select("user_id,role,granted_at,updated_at").order("granted_at",{ascending:true}).limit(500);
  if(r.error)throw Error("team_failed");
  const ids=(r.data||[]).map(x=>x.user_id);
  const profiles=ids.length?await db.from("smartjob_profiles").select("id,first_name,last_name,business_name").in("id",ids)
   :{data:[],error:null};
  if(profiles.error)throw Error("profiles_failed");
  const people=new Map((profiles.data||[]).map(x=>[x.id,x]));
  return reply({staff:(r.data||[]).map(x=>({...x,name:people.has(x.user_id)?name(people.get(x.user_id)!):"Operador"})),
   canManage:role==="admin",actorId:uid});
 }
 if(view==="clients"){
  if(role!=="admin")return reply({error:"Solo administradores."},403);
  const page=pageNumber(q.get("page")),size=limit(q.get("size"),60,25),term=queryTerm(q.get("q"));
  let stmt=db.from("smartjob_profiles")
    .select("id,first_name,last_name,business_name,phone,website_url,city,state,created_at",{count:"exact"});
  if(term)stmt=stmt.or("first_name.ilike.%"+term+"%,last_name.ilike.%"+term+"%,business_name.ilike.%"+term+"%,city.ilike.%"+term+"%");
  const r=await stmt.order("created_at",{ascending:false}).order("id",{ascending:true})
    .range((page-1)*size,page*size-1);
  if(r.error)throw Error("clients_failed");
  const ids=(r.data||[]).map(x=>x.id);
  const billing=ids.length?await db.from("smartjob_billing_accounts")
    .select("user_id,plan_code,status,stripe_mode").in("user_id",ids):{data:[],error:null};
  if(billing.error)throw Error("billing_failed");
  const bm=new Map((billing.data||[]).map(x=>[x.user_id,x]));
  return reply({clients:(r.data||[]).map(x=>({...x,display_name:name(x),billing:bm.get(x.id)||null})),
    page,size,total:r.count||0,pages:Math.max(1,Math.ceil((r.count||0)/size))});
 }
 if(view==="billing"||view==="services"){
  if(role!=="admin")return reply({error:"Solo administradores."},403);
  const [accounts,failures,agents,sites,lines]=await Promise.all([
   db.from("smartjob_billing_accounts").select("user_id,plan_code,status,stripe_mode,current_period_end,included_minutes,used_minutes,reserved_minutes,rollover_minutes,topup_minutes,updated_at")
    .order("updated_at",{ascending:false}).limit(250),
   db.from("smartjob_call_sessions").select("bridge_sid,owner_id,status,error_code,started_at",{count:"exact"})
    .not("error_code","is",null).order("started_at",{ascending:false}).limit(30),
   db.from("vmv_ai_agents").select("id,status,owner_id,created_at",{count:"exact"}).order("created_at",{ascending:false}).limit(100),
   db.from("smartjob_builder_sites").select("id",{count:"exact",head:true}),
   db.from("smartjob_phone_routes").select("id,enabled",{count:"exact"}).limit(250)
  ]);
  if(accounts.error||failures.error||agents.error||sites.error||lines.error)throw Error("service_summary_failed");
  const statusMap:Record<string,number>={};
  for(const a of agents.data||[])statusMap[a.status]=(statusMap[a.status]||0)+1;
  return reply({accounts:accounts.data||[],failures:failures.data||[],failureCount:failures.count||0,
   aiAgentsTotal:agents.count||0,aiAgentsSampleStatuses:statusMap,websitesTotal:sites.count||0,
   linesTotal:lines.count||0,activeLineSample:(lines.data||[]).filter(x=>x.enabled).length,
   note:"Suscripciones TEST no equivalen a cobros reales. Los totales de estados de agentes y líneas activos pueden ser parciales si superan el límite de lectura."});
 }
 if(view==="settings"||view==="activity"){
  if(role!=="admin")return reply({error:"Solo administradores."},403);
  if(view==="settings"){
   const result=await db.from("vmv_admin_settings").select("key,value,updated_at").limit(10);
   if(result.error)throw Error("settings_failed");
   return reply({settings:result.data||[]});
  }
  const logs=await db.from("vmv_admin_audit").select("id,actor_id,action,source,source_id,created_at")
   .order("created_at",{ascending:false}).limit(100);
  if(logs.error)throw Error("history_failed");
  return reply({events:logs.data||[]});
 }
 if(view==="notifications"){
  const [list,count]=await Promise.all([
   db.from("vmv_admin_notifications").select("id,source,source_id,kind,title,created_at,read_at")
    .eq("recipient_id",uid).order("created_at",{ascending:false}).limit(80),
   db.from("vmv_admin_notifications").select("id",{count:"exact",head:true})
    .eq("recipient_id",uid).is("read_at",null)
  ]);
  if(list.error||count.error)throw Error("notifications_failed");
  return reply({notifications:list.data||[],unread:count.count||0});
 }
 return reply({error:"Vista no encontrada."},404);
 }catch(e){console.error("VMV admin read",e instanceof Error?e.message:"unknown");return reply({error:"No se pudo cargar la información. Reintenta."},503);}
}
export async function POST(req:NextRequest){
 const auth=await context(req);
 if("error" in auth)return reply({error:auth.error},auth.status);
 const {db,uid,role}=auth;
 let body:Record<string,unknown>;
 try{body=await req.json();if(!body||typeof body!=="object"||Array.isArray(body))throw Error();}
 catch{return reply({error:"Solicitud inválida."},400);}
 const action=body.action;
 const source=body.source;
 const id=body.id;
 if(action==="mark_notification"){
  if(typeof body.notification_id!=="number"||!Number.isSafeInteger(body.notification_id))
    return reply({error:"Notificación inválida."},400);
  const r=await db.from("vmv_admin_notifications").update({read_at:new Date().toISOString()})
   .eq("id",body.notification_id).eq("recipient_id",uid).select("id").maybeSingle();
  if(r.error||!r.data)return reply({error:"Notificación no disponible."},404);
  return reply({ok:true});
 }
 if(action==="send_message"){
  if(!sources.has(source as Source)||!uuid(id)||!uuid(body.request_key)||
    !["message","internal_note"].includes(String(body.kind))||
    typeof body.message!=="string"||!body.message.trim()||body.message.length>4000)
   return reply({error:"Mensaje no válido."},400);
  const r=await db.rpc("vmv_admin_append_message",{
   p_actor:uid,p_source:source,p_id:id,p_kind:body.kind,
   p_body:body.message,p_request_key:body.request_key
  });
  if(r.error){const problem=messageFor(r.error);return reply({error:problem.message},problem.status);}
  return reply({...r.data,notificationSent:false});
 }
 if(!["set_meta","update_ticket","update_marketing","set_staff","update_settings"].includes(String(action)))
  return reply({error:"Acción no disponible."},404);
 const operation=action==="set_meta"?"case_meta":
  action==="update_ticket"?"ticket_status":
  action==="update_marketing"?(body.operation==="quote"?"marketing_quote":"marketing_status"):
  action==="set_staff"?"staff":"settings";
 if(action==="set_staff"||action==="update_settings"){
  if(role!=="admin")return reply({error:"Solo administradores."},403);
 }else if(!sources.has(source as Source)||!uuid(id)){
  return reply({error:"Caso inválido."},400);
 }
 let payload:Record<string,unknown>={};
 let targetSource=typeof source==="string"?source:null,targetId=uuid(id)?id:null;
 const expected=typeof body.expected_updated_at==="string"?body.expected_updated_at:null;
 if(action==="set_meta"){
  payload={priority:body.priority,assigned_to:body.assigned_to||null,due_at:body.due_at||null};
 }else if(action==="update_ticket"){
  payload={status:body.status};
 }else if(action==="update_marketing"){
  if(body.operation==="quote"){
   if(typeof body.amount_cents!=="number"||!Number.isSafeInteger(body.amount_cents)||
      typeof body.quote_note!=="string")return reply({error:"Importe inválido."},400);
   payload={amount_cents:body.amount_cents,quote_note:body.quote_note};
  }else payload={status:body.status,note:body.note,evidence_url:body.evidence_url};
 }else if(action==="set_staff"){
  if(!uuid(body.user_id))return reply({error:"Identificador inválido."},400);
  targetSource="support";targetId=body.user_id;
  payload={user_id:body.user_id,role:body.role};
 }else{
  targetSource="support";targetId=uid;
  payload={sla_days:body.sla_days,welcome_message:body.welcome_message};
 }
 const r=await db.rpc("vmv_admin_apply",{
  p_actor:uid,p_action:operation,p_source:targetSource,p_id:targetId,
  p_expected:expected,p_data:payload
 });
 if(r.error){const problem=messageFor(r.error);return reply({error:problem.message,conflict:problem.status===409},problem.status);}
 return reply(r.data as Record<string,unknown>);
}