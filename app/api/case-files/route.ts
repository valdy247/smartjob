import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
import {billingAdmin} from "@/lib/vmv-billing";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
const reply=(body:Record<string,unknown>,status=200)=>NextResponse.json(body,{status,headers});
type Source="marketing"|"support"|"provisioning"|"domain";
const allowedSources=new Set<Source>(["marketing","support","provisioning","domain"]);
const table:Record<Source,string>={
 marketing:"vmv_marketing_requests",support:"vmv_admin_tickets",
 provisioning:"smartjob_provisioning_requests",domain:"smartjob_builder_domain_requests"
};
const allowed=new Map([["image/jpeg","jpg"],["image/png","png"],["image/webp","webp"],["application/pdf","pdf"]]);
const uuid=(v:unknown):v is string=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

async function authorize(req:NextRequest,source:unknown,id:unknown){
 const uid=await authenticatedUser(req);
 if(!uid)return {error:"Inicia sesión en VMV.",status:401} as const;
 if(!allowedSources.has(source as Source)||!uuid(id))return {error:"Solicitud inválida.",status:400} as const;
 const db=billingAdmin();
 if(!db)return {error:"Archivos no disponibles.",status:503} as const;
 const [staff,record]=await Promise.all([
  db.from("vmv_marketing_staff").select("role").eq("user_id",uid).maybeSingle(),
  db.from(table[source as Source]).select(source==="provisioning"?"id,user_id,status":"id,owner_id,status").eq("id",id).maybeSingle()
 ]);
 if(staff.error||record.error)return {error:"No se pudo verificar el acceso.",status:503} as const;
 if(!record.data)return {error:"Caso no encontrado.",status:404} as const;
 const isStaff=Boolean(staff.data&&["admin","agent"].includes(staff.data.role));
 const ownerRecord=record.data as Record<string,unknown>;
 const owner=String(ownerRecord.owner_id||ownerRecord.user_id||"");
 if(!isStaff&&(owner!==uid||!["support","marketing"].includes(String(source))))
  return {error:"No autorizado para este caso.",status:403} as const;
 return {db,uid,isStaff,source:source as Source,id:id as string,caseStatus:String(record.data.status||"")};
}
function matches(bytes:Uint8Array,mime:string){
 if(mime==="application/pdf")return bytes.length>4&&bytes[0]===37&&bytes[1]===80&&bytes[2]===68&&bytes[3]===70&&bytes[4]===45;
 if(mime==="image/png")return bytes.length>8&&[137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b);
 if(mime==="image/jpeg")return bytes.length>3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 if(mime==="image/webp")return bytes.length>12&&String.fromCharCode(...bytes.slice(0,4))==="RIFF"&&String.fromCharCode(...bytes.slice(8,12))==="WEBP";
 return false;
}
export async function GET(req:NextRequest){
 const url=new URL(req.url),fileId=url.searchParams.get("file");
 if(fileId){
  if(!uuid(fileId))return reply({error:"Archivo inválido."},400);
  const uid=await authenticatedUser(req),db=billingAdmin();
  if(!uid)return reply({error:"Inicia sesión."},401);
  if(!db)return reply({error:"Almacenamiento no disponible."},503);
  const attachment=await db.from("vmv_admin_attachments").select("*").eq("id",fileId).maybeSingle();
  if(attachment.error)return reply({error:"No se pudo verificar el archivo."},503);
  if(!attachment.data)return reply({error:"Archivo inexistente."},404);
  const auth=await authorize(req,attachment.data.source,attachment.data.source_id);
  if("error" in auth)return reply({error:auth.error},auth.status);
  const link=await db.storage.from("vmv-admin-files").createSignedUrl(attachment.data.object_path,60);
  if(link.error||!link.data?.signedUrl)return reply({error:"No se pudo abrir el archivo."},503);
  return reply({url:link.data.signedUrl,expiresIn:60});
 }
 const auth=await authorize(req,url.searchParams.get("source"),url.searchParams.get("id"));
 if("error" in auth)return reply({error:auth.error},auth.status);
 const list=await auth.db.from("vmv_admin_attachments")
  .select("id,source,source_id,uploader_id,filename,content_type,bytes,created_at")
  .eq("source",auth.source).eq("source_id",auth.id).order("created_at",{ascending:true}).limit(80);
 if(list.error)return reply({error:"No se pudieron consultar los archivos."},503);
 return reply({attachments:list.data||[]});
}
export async function POST(req:NextRequest){
 const contentLength=Number(req.headers.get("content-length")||0);
 if(Number.isFinite(contentLength)&&contentLength>4_000_000)return reply({error:"El archivo es demasiado grande (máximo 3 MB)."},413);
 let data:FormData;
 try{data=await req.formData();}catch{return reply({error:"Formulario inválido."},400);}
 const source=data.get("source"),id=data.get("id"),file=data.get("file");
 const auth=await authorize(req,source,id);
 if("error" in auth)return reply({error:auth.error},auth.status);
 if(!auth.isStaff&&["closed","resolved","verified","cancelled"].includes(auth.caseStatus))
  return reply({error:"El caso está finalizado."},409);
 if(!(file instanceof File)||file.size<1||file.size>3_145_728||!allowed.has(file.type))
  return reply({error:"Solo se admiten JPG, PNG, WEBP y PDF de máximo 3 MB."},400);
 const [usage,count]=await Promise.all([
  auth.db.from("vmv_admin_attachments").select("id",{count:"exact",head:true}).eq("uploader_id",auth.uid).gte("created_at",new Date(Date.now()-86400000).toISOString()),
  auth.db.from("vmv_admin_attachments").select("id",{count:"exact",head:true}).eq("source",auth.source).eq("source_id",auth.id)
 ]);
 if(usage.error||count.error)return reply({error:"No se pudieron comprobar los límites."},503);
 if((usage.count||0)>=20||(count.count||0)>=80)return reply({error:"Límite de archivos alcanzado."},429);
 const bytes=new Uint8Array(await file.arrayBuffer());
 if(!matches(bytes,file.type))return reply({error:"El contenido no corresponde al tipo de archivo indicado."},400);
 const original=file.name.replace(/[\\\/\x00-\x1f]/g,"_").slice(0,150)||"archivo";
 const objectPath=auth.source+"/"+auth.id+"/"+crypto.randomUUID()+"."+allowed.get(file.type);
 const uploaded=await auth.db.storage.from("vmv-admin-files").upload(objectPath,bytes,{
  contentType:file.type,upsert:false,cacheControl:"0"
 });
 if(uploaded.error)return reply({error:"No se pudo guardar el archivo privado."},503);
 const stored=await auth.db.from("vmv_admin_attachments").insert({
  source:auth.source,source_id:auth.id,uploader_id:auth.uid,object_path:objectPath,
  filename:original,content_type:file.type,bytes:file.size
 }).select("id,filename,bytes,created_at").single();
 if(stored.error){
  await auth.db.storage.from("vmv-admin-files").remove([objectPath]);
  return reply({error:"No se pudo registrar el archivo."},503);
 }
 if(auth.isStaff){
  await auth.db.from("vmv_admin_audit").insert({
   actor_id:auth.uid,action:"case_file_uploaded",source:auth.source,source_id:auth.id,
   detail:{file_id:stored.data.id}
  });
 }
 return reply({ok:true,attachment:stored.data},201);
}