import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
import {billingAdmin} from "@/lib/vmv-billing";
import {getLatestTesterPreview,verifyTesterDeployment,sendTesterPreview,channelReadiness,type DeliverySnapshot,type TesterDeployment} from "@/lib/vmv-testers";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
const reply=(value:Record<string,unknown>,status=200)=>NextResponse.json(value,{status,headers});
const uuid=(v:unknown):v is string=>typeof v==="string"&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
const safeError=(e:unknown)=>{
 const s=String((e as {message?:string})?.message||e||"");
 if(s.includes("VERCEL_API_TOKEN_NOT_CONFIGURED"))return "Falta VERCEL_API_TOKEN en el servidor.";
 if(s.includes("VERCEL_PROJECT_MISMATCH"))return "El proyecto de Vercel no coincide con smartjob.";
 if(s.includes("DEPLOYMENT_NOT_SENDABLE"))return "El despliegue no está READY, no coincide o requiere resolver su protección.";
 if(s.includes("send_rate_limited"))return "Límite de envíos alcanzado. Reintenta más tarde.";
 if(s.includes("no_eligible_testers"))return "No hay testers activos, autorizados y pendientes de esta versión/canal.";
 if(s.includes("conflict"))return "El tester cambió en otra sesión. Actualiza antes de guardar.";
 if(s.includes("tester_no_longer_eligible"))return "Este destinatario ya no puede recibir por ese canal.";
 if(s.includes("23505")||s.includes("duplicate key"))return "Ya existe un tester con ese correo o teléfono.";
 return "No se completó la operación. Comprueba el estado e inténtalo de nuevo.";
};
async function auth(req:NextRequest){
 const userId=await authenticatedUser(req);
 if(!userId)return {error:"Inicia sesión.",status:401} as const;
 const db=billingAdmin();
 if(!db)return {error:"El servidor no está configurado.",status:503} as const;
 const access=await db.from("vmv_marketing_staff").select("role").eq("user_id",userId).maybeSingle();
 if(access.error||access.data?.role!=="admin")return {error:"Solo administradores VMV.",status:403} as const;
 return {db,userId};
}
type Client=NonNullable<ReturnType<typeof billingAdmin>>;
async function processDelivery(db:Client,actor:string,id:string,deployment:TesterDeployment, retry=false){
 const claim=await db.rpc("vmv_admin_tester_claim",{p_actor:actor,p_id:id,p_retry:retry});
 if(claim.error||!claim.data)return {id,state:"failed",error:"claim_rejected"};
 const c=claim.data as {attempt_key:string;address:string;channel:"email"|"sms"};
 const test=await db.from("vmv_admin_tester_deliveries").select("tester_id").eq("id",id).single();
 if(test.error||!test.data)return {id,state:"unknown",error:"tester_unavailable"};
 const person=await db.from("vmv_admin_testers").select("name").eq("id",test.data.tester_id).single();
 const details:DeliverySnapshot={id,channel:c.channel,address:c.address,name:person.data?.name||"Tester"};
 const sent=await sendTesterPreview(details,deployment,c.attempt_key);
 const finish=await db.rpc("vmv_admin_tester_finish",{
  p_actor:actor,p_id:id,p_attempt:c.attempt_key,p_state:sent.state,
  p_provider:sent.provider,p_provider_id:sent.providerId,p_error:sent.error
 });
 return {id,state:finish.error?"unknown":sent.state,error:finish.error?"persist_failed":sent.error};
}
async function batchSend(db:Client,actor:string,batchId:string,deployment:TesterDeployment, retryId?:string){
 let query=db.from("vmv_admin_tester_deliveries").select("id,state").eq("batch_id",batchId).order("created_at",{ascending:true});
 if(retryId)query=query.eq("id",retryId);
 const result=await query;
 if(result.error)throw Error("delivery_list_failed");
 const chosen=(result.data||[]).filter(r=>r.state===(retryId?"failed":"pending"));
 const output:{id:string;state:string;error?:string|null}[]=[];
 for(let i=0;i<chosen.length;i+=3){
  const part=await Promise.all(chosen.slice(i,i+3).map(r=>processDelivery(db,actor,r.id,deployment,Boolean(retryId))));
  output.push(...part);
 }
 return output;
}
export async function GET(req:NextRequest){
 const access=await auth(req);
 if("error" in access)return reply({error:access.error},access.status);
 const {db}=access;
 try{
  const view=new URL(req.url).searchParams.get("view")||"overview";
  if(view==="preview"){
   try{return reply({preview:await getLatestTesterPreview(),channels:channelReadiness()});}
   catch(e){return reply({preview:null,channels:channelReadiness(),previewError:safeError(e)});}
  }
  if(view==="testers"||view==="overview"){
   const testers=await db.from("vmv_admin_testers").select("id,name,email,phone_e164,preferred_channel,active,email_opt_in,email_opted_out_at,sms_consent_at,sms_consent_source,sms_opted_out_at,updated_at,created_at").order("created_at",{ascending:false}).limit(200);
   if(testers.error)throw Error("testers_read_failed");
   if(view==="testers")return reply({testers:testers.data||[]});
   const [batches,deliveries,preview]=await Promise.all([
    db.from("vmv_admin_tester_batches").select("id,created_by,deployment_id,deployment_url,deployment_sha,deployment_message,created_at,channel_mode").order("created_at",{ascending:false}).limit(30),
    db.from("vmv_admin_tester_deliveries").select("id,batch_id,tester_id,channel,address_snapshot,state,provider,provider_id,error_code,attempt_count,created_at,updated_at").order("created_at",{ascending:false}).limit(180),
    getLatestTesterPreview().then(preview=>({preview,error:null})).catch(e=>({preview:null,error:safeError(e)}))
   ]);
   if(batches.error||deliveries.error)throw Error("history_unavailable");
   return reply({testers:testers.data||[],batches:batches.data||[],deliveries:deliveries.data||[],
     preview:preview.preview,previewError:preview.error,channels:channelReadiness()});
  }
  if(view==="history"){
   const [batches,deliveries]=await Promise.all([
    db.from("vmv_admin_tester_batches").select("*").order("created_at",{ascending:false}).limit(50),
    db.from("vmv_admin_tester_deliveries").select("id,batch_id,tester_id,channel,address_snapshot,state,provider,provider_id,error_code,attempt_count,created_at,updated_at").order("created_at",{ascending:false}).limit(300)
   ]);
   if(batches.error||deliveries.error)throw Error("history_unavailable");
   return reply({batches:batches.data||[],deliveries:deliveries.data||[]});
  }
  return reply({error:"Consulta inválida."},404);
 }catch{return reply({error:"No se pudo cargar Testers."},503);}
}
export async function POST(req:NextRequest){
 const access=await auth(req);
 if("error" in access)return reply({error:access.error},access.status);
 const {db,userId}=access;
 let body:Record<string,unknown>;
 try{body=await req.json();if(!body||Array.isArray(body)||typeof body!=="object")throw Error();}
 catch{return reply({error:"Datos inválidos."},400);}
 if(body.action==="save"){
  const id=body.id===null||body.id===undefined?null:body.id;
  if((id!==null&&!uuid(id))||typeof body.name!=="string"||typeof body.email!=="string"||
    typeof body.phone!=="string"||typeof body.preferred_channel!=="string"||
    typeof body.active!=="boolean"||typeof body.email_opt_in!=="boolean"||typeof body.sms_consent!=="boolean")
   return reply({error:"Completa los campos correctamente."},400);
  const email=body.email.trim().toLowerCase(),phone=body.phone.trim();
  if((!email&&!phone)||email.length>254||phone.length>16||body.name.trim().length>100||
    (email!==""&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))||
    (phone!==""&&!/^\+[1-9][0-9]{7,14}$/.test(phone)))
   return reply({error:"Correo o teléfono inválidos."},400);
  if(body.sms_consent===true&&phone&&!String(body.sms_source||"").trim())
   return reply({error:"Registra el origen del consentimiento SMS."},400);
  const result=await db.rpc("vmv_admin_tester_save",{
   p_actor:userId,p_id:id,p_name:body.name,p_email:email,p_phone:phone,
   p_preferred:body.preferred_channel,p_active:body.active,p_email_opt_in:body.email_opt_in,
   p_sms_consent:body.sms_consent,p_sms_source:String(body.sms_source||"").slice(0,120),
   p_expected:typeof body.expected_updated_at==="string"?body.expected_updated_at:null
  });
  if(result.error)return reply({error:safeError(result.error)},/23505|conflict/.test(result.error.message)?409:400);
  return reply({ok:true,id:result.data});
 }
 if(body.action==="send"){
  if(!uuid(body.request_key)||typeof body.deployment_id!=="string"||!Array.isArray(body.ids)||
    body.ids.length<1||body.ids.length>15||!body.ids.every(uuid)||new Set(body.ids).size!==body.ids.length||
    !["auto","email","sms"].includes(String(body.channel_mode)))
   return reply({error:"Revisa la versión, selección y canal."},400);
  try{
   const {deployment}=await verifyTesterDeployment(body.deployment_id);
   const ids=body.ids as string[];
   const selected=await db.from("vmv_admin_testers").select("id,preferred_channel").in("id",ids).eq("active",true);
   if(selected.error)throw Error("testers_read_failed");
   const channels=channelReadiness();
   const requires=(selected.data||[]).map(t=>body.channel_mode==="auto"?t.preferred_channel:body.channel_mode);
   if(requires.some(c=>!channels[c as "email"|"sms"]))
    return reply({error:"Un canal seleccionado no está configurado. Elige un canal disponible."},409);
   const prepared=await db.rpc("vmv_admin_tester_prepare",{
    p_actor:userId,p_key:body.request_key,p_deployment:deployment.id,
    p_url:deployment.url,p_sha:deployment.sha,p_message:deployment.message,
    p_created:new Date(deployment.createdAt).toISOString(),p_mode:body.channel_mode,p_testers:ids
   });
   if(prepared.error)return reply({error:safeError(prepared.error)},409);
   const batchId=String((prepared.data as {batch_id:string}).batch_id);
   const results=await batchSend(db,userId,batchId,deployment);
   return reply({ok:true,batchId,results,reused:Boolean((prepared.data as {reused?:boolean}).reused)});
  }catch(e){return reply({error:safeError(e)},409);}
 }
 if(body.action==="resume"){
  if(!uuid(body.batch_id))return reply({error:"Lote inválido."},400);
  try{
   const stored=await db.from("vmv_admin_tester_batches").select("*").eq("id",body.batch_id).single();
   if(stored.error||!stored.data)return reply({error:"Lote inexistente."},404);
   const {deployment}=await verifyTesterDeployment(stored.data.deployment_id);
   if(deployment.sha!==stored.data.deployment_sha||deployment.url!==stored.data.deployment_url)
    return reply({error:"La versión no coincide con el lote."},409);
   const results=await batchSend(db,userId,stored.data.id,deployment);
   return reply({ok:true,results});
  }catch(e){return reply({error:safeError(e)},409);}
 }
 if(body.action==="retry"){
  if(!uuid(body.delivery_id))return reply({error:"Envío inválido."},400);
  try{
   const target=await db.from("vmv_admin_tester_deliveries")
    .select("id,batch_id,state,attempt_count").eq("id",body.delivery_id).single();
   if(target.error||!target.data||target.data.state!=="failed"||target.data.attempt_count>=3)
    return reply({error:"Este envío no admite reintentos."},409);
   const batch=await db.from("vmv_admin_tester_batches").select("*").eq("id",target.data.batch_id).single();
   if(batch.error||!batch.data)return reply({error:"Historial no disponible."},404);
   const {deployment}=await verifyTesterDeployment(batch.data.deployment_id);
   if(deployment.sha!==batch.data.deployment_sha||deployment.url!==batch.data.deployment_url)
    return reply({error:"La versión guardada ya no coincide."},409);
   const results=await batchSend(db,userId,batch.data.id,deployment,target.data.id);
   return reply({ok:true,results});
  }catch(e){return reply({error:safeError(e)},409);}
 }
 return reply({error:"Operación no válida."},404);
}
