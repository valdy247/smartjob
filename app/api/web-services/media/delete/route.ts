import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";

export const runtime="nodejs";
export const maxDuration=20;

const bucket="smartjob-web-images";
const filenamePattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:webp|jpg|png)$/;
const respond=(data:Record<string,unknown>,status=200)=>NextResponse.json(data,{
 status,headers:{"Cache-Control":"no-store"}
});

async function authenticate(request:NextRequest){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL||"";
 const publishable=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||"";
 const secret=process.env.SUPABASE_SECRET_KEY||"";
 if(!url||!publishable||!secret){
  return {ok:false as const,response:respond({error:"La biblioteca no está disponible ahora."},503)};
 }
 const authorization=request.headers.get("authorization")||"";
 const token=authorization.startsWith("Bearer ")?authorization.slice(7):"";
 if(!token||token.length>8000){
  return {ok:false as const,response:respond({error:"Inicia sesión para administrar tus fotos."},401)};
 }
 const authClient=createClient(url,publishable,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:auth,error:authError}=await authClient.auth.getUser(token);
 if(authError||!auth.user||auth.user.is_anonymous){
  return {ok:false as const,response:respond({error:"Sesión inválida."},403)};
 }
 const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 return {ok:true as const,ownerId:auth.user.id,admin};
}

/** Files hidden from the library remain available to old published pages and revisions. */
export async function GET(request:NextRequest){
 const auth=await authenticate(request);
 if(!auth.ok)return auth.response;
 const {data,error}=await auth.admin.from("smartjob_web_media_hidden")
  .select("filename").eq("owner_id",auth.ownerId).limit(2000);
 if(error)return respond({error:"No se pudo consultar la biblioteca."},503);
 return respond({hidden:(data||[]).map(row=>row.filename)});
}

/** Delete from this user's library, but never break other pages referring to the image. */
export async function POST(request:NextRequest){
 const auth=await authenticate(request);
 if(!auth.ok)return auth.response;

 let payload:{filename?:unknown};
 try{payload=await request.json();}catch{return respond({error:"Solicitud inválida."},400);}
 const filename=typeof payload.filename==="string"?payload.filename:"";
 if(!filenamePattern.test(filename))return respond({error:"Nombre de archivo inválido."},400);

 // Owner path is always taken from the verified token, never client-supplied.
 const path=auth.ownerId+"/"+filename;
 const {data:files,error:listError}=await auth.admin.storage.from(bucket).list(auth.ownerId,{
  search:filename,limit:100
 });
 if(listError)return respond({error:"No se pudo verificar la foto."},503);
 if(!files?.some(file=>file.name===filename)){
  return respond({error:"Esta foto ya no existe en la biblioteca.",code:"IMAGE_NOT_FOUND"},404);
 }

 const {data:inUse,error:checkError}=await auth.admin.rpc("smartjob_web_media_in_use",{p_asset:path});
 if(checkError||typeof inUse!=="boolean"){
  return respond({error:"No se pudo revisar el uso de la foto. No se eliminó."},503);
 }

 // Initial business intake is another authoritative usage of this photo. A logo,
 // cover, or work image can exist here before the first Puck page is created.
 // Do not physically remove a file referenced by one of those fields.
 const {data:intake,error:intakeError}=await auth.admin.from("smartjob_web_intake_media")
  .select("logo_url,cover_url,work_url").eq("owner_id",auth.ownerId).maybeSingle();
 if(intakeError)return respond({error:"No se pudo comprobar el uso de la foto en el negocio."},503);
 const referencedInIntake=Object.values(intake||{}).some(value=>
  typeof value==="string"&&value.split("?")[0].endsWith("/"+path));

 if(inUse||referencedInIntake){
  // A saved intake, draft, published page, or revision needs the bytes.
  // Hide it from the owner's picker, without affecting another place where it is used.
  const {error:archiveError}=await auth.admin.from("smartjob_web_media_hidden")
   .upsert({owner_id:auth.ownerId,filename},{onConflict:"owner_id,filename"});
  if(archiveError)return respond({error:"No se pudo retirar esta foto de la biblioteca."},503);
  return respond({deleted:true,archived:true,filename});
 }

 const {error:removeError}=await auth.admin.storage.from(bucket).remove([path]);
 if(removeError)return respond({error:"No se pudo eliminar la foto."},503);
 return respond({deleted:true,archived:false,filename});
}
