import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";

export const runtime="nodejs";
export const maxDuration=20;

const bucket="smartjob-web-images";
const filenamePattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:webp|jpg|png)$/;
const respond=(data:Record<string,unknown>,status=200)=>NextResponse.json(data,{
 status,headers:{"Cache-Control":"no-store"}
});

export async function POST(request:NextRequest){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL||"";
 const publishable=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||"";
 const secret=process.env.SUPABASE_SECRET_KEY||"";
 if(!url||!publishable||!secret)return respond({error:"La biblioteca no está disponible ahora."},503);

 const authorization=request.headers.get("authorization")||"";
 const token=authorization.startsWith("Bearer ")?authorization.slice(7):"";
 if(!token||token.length>8000)return respond({error:"Inicia sesión para eliminar esta imagen."},401);

 let payload:{filename?:unknown};
 try{payload=await request.json();}catch{return respond({error:"Solicitud inválida."},400);}
 const filename=typeof payload.filename==="string"?payload.filename:"";
 if(!filenamePattern.test(filename))return respond({error:"Nombre de archivo inválido."},400);

 const authClient=createClient(url,publishable,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:auth,error:authError}=await authClient.auth.getUser(token);
 if(authError||!auth.user||auth.user.is_anonymous)return respond({error:"Sesión inválida."},403);

 // Never accept an owner ID, storage bucket or full path from the browser.
 const path=auth.user.id+"/"+filename;
 const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});

 // Protect any saved draft, public site, historical revision or classic site
 // before permanently removing the underlying object.
 const {data:inUse,error:checkError}=await admin.rpc("smartjob_web_media_in_use",{p_asset:path});
 if(checkError||typeof inUse!=="boolean")
  return respond({error:"No se pudo verificar si esta imagen está en uso. No se eliminó."},503);
 if(inUse)return respond({
  error:"Esta imagen se utiliza en una web guardada, publicada o en su historial. Retírala de las páginas y conserva las versiones que la necesiten antes de eliminarla.",
  code:"IMAGE_IN_USE"
 },409);

 const {data:files,error:listError}=await admin.storage.from(bucket).list(auth.user.id,{
  search:filename,limit:100
 });
 if(listError)return respond({error:"No se pudo verificar el archivo. No se eliminó."},503);
 if(!files?.some(item=>item.name===filename))
  return respond({error:"Esta imagen ya no está en la biblioteca.",code:"IMAGE_NOT_FOUND"},404);

 const {error:removeError}=await admin.storage.from(bucket).remove([path]);
 if(removeError)return respond({error:"No se pudo eliminar la imagen. Inténtalo nuevamente."},503);
 return respond({deleted:true,filename});
}
