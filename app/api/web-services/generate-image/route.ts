import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {categoryLabel} from "@/lib/vmv-business-categories";
export const runtime="nodejs";
export const maxDuration=60;
const bucket="smartjob-web-images";
const headers={"Cache-Control":"no-store"};
const json=(data:Record<string,unknown>,status=200)=>NextResponse.json(data,{status,headers});
function config(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL||"";
 const publicKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||"";
 const secret=process.env.SUPABASE_SECRET_KEY||"";
 const openAi=process.env.OPENAI_API_KEY||"";
 const owner=process.env.VMV_WEB_AI_TEST_OWNER_ID||"";
 const enabled=process.env.VMV_WEB_AI_IMAGES_ENABLED==="true"&&Boolean(url&&publicKey&&secret&&openAi&&owner);
 return {enabled,url,publicKey,secret,openAi,owner};
}
async function authenticate(req:NextRequest,settings:ReturnType<typeof config>){
 const auth=req.headers.get("authorization")||"";
 const token=auth.startsWith("Bearer ")?auth.slice(7):"";
 if(!token||token.length>8000)return null;
 const client=createClient(settings.url,settings.publicKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await client.auth.getUser(token);
 return error||!data.user||data.user.is_anonymous?null:data.user;
}
export async function GET(req:NextRequest){
 const s=config();
 if(!s.enabled)return json({enabled:false});
 const user=await authenticate(req,s);
 return json({enabled:!!user&&user.id===s.owner});
}
export async function POST(req:NextRequest){
 const s=config();
 if(!s.enabled)return json({error:"La generación de imágenes aún no está activada"},503);
 const user=await authenticate(req,s);
 if(!user||user.id!==s.owner)return json({error:"Sin autorización para generar imágenes"},403);
 let body:{prompt?:unknown;business?:unknown;categoryId?:unknown};
 try{body=await req.json();}catch{return json({error:"Solicitud inválida"},400);}
 const prompt=typeof body.prompt==="string"?body.prompt.trim():"";
 if(prompt.length<8||prompt.length>450)return json({error:"Describe la imagen entre 8 y 450 caracteres"},400);
 const name=typeof body.business==="string"?body.business.slice(0,100):"";
 const category=categoryLabel(typeof body.categoryId==="string"?body.categoryId:"");
 const admin=createClient(s.url,s.secret,{auth:{persistSession:false,autoRefreshToken:false}});
 // Atomic quota is enforced inside Postgres, not in browser memory.
 const {data:reserved,error:quotaError}=await admin.rpc("smartjob_web_ai_claim_slot",{p_owner:user.id});
 if(quotaError)return json({error:"No se pudo comprobar el límite de imágenes"},503);
 if(reserved!==true)return json({error:"Se alcanzó el límite diario de generación"},429);
 try{
  const generation=await fetch("https://api.openai.com/v1/images/generations",{
   method:"POST",
   headers:{"Authorization":"Bearer "+s.openAi,"Content-Type":"application/json"},
   body:JSON.stringify({
    model:"gpt-image-2",
    prompt:"Crea una fotografía de portada original y profesional para un sitio web de negocio. Estilo editorial premium, composición limpia, calidad comercial. Sin marcas conocidas, sin texto, sin logotipos, sin marcas de agua. Negocio: "+name+". Sector: "+category+". Solicitud visual: "+prompt,
    n:1,size:"1024x1024",quality:"low",output_format:"webp"
   }),
   signal:AbortSignal.timeout(53000)
  });
  if(!generation.ok)return json({error:"No se pudo generar la imagen"},502);
  const data=await generation.json() as {data?:Array<{b64_json?:string}>};
  const b64=data.data?.[0]?.b64_json;
  if(!b64||b64.length>9500000)return json({error:"La imagen generada no pudo procesarse"},502);
  const bytes=Buffer.from(b64,"base64");
  if(bytes.length===0||bytes.length>5242880)return json({error:"La imagen es demasiado grande"},502);
  const path=user.id+"/"+crypto.randomUUID()+".webp";
  const upload=await admin.storage.from(bucket).upload(path,bytes,{
   contentType:"image/webp",cacheControl:"3600",upsert:false
  });
  if(upload.error)return json({error:"No se pudo guardar la imagen generada"},502);
  const {data:result}=admin.storage.from(bucket).getPublicUrl(path);
  return json({url:result.publicUrl});
 }catch{
  return json({error:"No se pudo generar la imagen"},502);
 }
}
