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
 let body:{prompt?:unknown;business?:unknown;categoryId?:unknown;kind?:unknown;
  action?:unknown;businessId?:unknown;productName?:unknown;description?:unknown};
 try{body=await req.json();}catch{return json({error:"Solicitud inválida"},400);}
 const prompt=typeof body.prompt==="string"?body.prompt.trim():"";
 if(prompt.length<8||prompt.length>450)return json({error:"Describe la imagen entre 8 y 450 caracteres"},400);
 const name=typeof body.business==="string"?body.business.slice(0,100):"";
 const category=categoryLabel(typeof body.categoryId==="string"?body.categoryId:"");
 const kind=["logo","cover","gallery","product"].includes(String(body.kind))?String(body.kind):"cover";
 const isProduct=kind==="product";
 const productName=typeof body.productName==="string"?body.productName.trim().slice(0,120):"";
 const productDetails=typeof body.description==="string"?body.description.trim().slice(0,500):"";
 const admin=createClient(s.url,s.secret,{auth:{persistSession:false,autoRefreshToken:false}});
 if(isProduct){
  // Image tools belong to the authenticated owner's AI Agents workspace.
  const businessId=typeof body.businessId==="string"?body.businessId:"";
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(businessId))
   return json({error:"Negocio inválido"},400);
  const {data:workspace,error:workspaceError}=await admin.from("vmv_ai_businesses")
   .select("id").eq("id",businessId).eq("owner_id",user.id).maybeSingle();
  if(workspaceError||!workspace)return json({error:"No tienes acceso a este catálogo"},403);
 }
 if(body.action==="improve"){
  if(!isProduct)return json({error:"Esta acción es solo para fotografías de productos"},400);
  try{
   const response=await fetch("https://api.openai.com/v1/chat/completions",{
    method:"POST",
    headers:{"Authorization":"Bearer "+s.openAi,"Content-Type":"application/json"},
    body:JSON.stringify({model:"gpt-4.1-mini",temperature:0.55,max_completion_tokens:180,
     messages:[
      {role:"system",content:"Mejora en español un prompt para crear una sola fotografía comercial realista de producto, con fondo y luz profesional. Respeta exactamente el producto descrito; no inventes ingredientes, características, cantidades, ofertas o marcas. No pidas texto, etiquetas, precios ni marcas de agua dentro de la imagen. Devuelve únicamente el prompt mejorado, máximo 450 caracteres."},
      {role:"user",content:"Producto: "+productName+"\nDescripción: "+productDetails+"\nPrompt: "+prompt}
     ]}),
    signal:AbortSignal.timeout(20000)
   });
   if(!response.ok)return json({error:"No se pudo mejorar el prompt"},502);
   const data=await response.json() as {choices?:Array<{message?:{content?:string|null}}>};
   const enhanced=String(data.choices?.[0]?.message?.content||"").trim()
    .replace(/^["“]|["”]$/g,"").trim().slice(0,450);
   if(enhanced.length<8)return json({error:"No se recibió un prompt mejorado"},502);
   return json({prompt:enhanced});
  }catch{return json({error:"No se pudo mejorar el prompt"},502);}
 }
 if(body.action!==undefined&&body.action!=="generate")
  return json({error:"Acción no válida"},400);
 const kindInstruction=kind==="product"?
  "Crea UNA fotografía comercial profesional del PRODUCTO descrito. Imagen original realista, producto protagonista y enfocado, iluminación de estudio natural, fondo limpio, composición cuadrada apta para catálogo web. Respeta exactamente los detalles confirmados, evita inventar ingredientes, tamaños, adornos, logotipos, textos, precios o marcas de agua.":
  kind==="logo"?
  "Diseña UN SÍMBOLO GRÁFICO ORIGINAL para la identidad de este negocio, estilo logo vectorial minimalista con geometría sólida, fondo de color liso o transparente si el modelo lo permite. NO hagas fotografía, NO escribas palabras ni letras, NO copies marcas, NO inventes el nombre del negocio en la imagen. Debe distinguirse a tamaño pequeño.":
  kind==="cover"?
  "Crea UNA fotografía de portada profesional, original y cinematográfica de alta calidad, composición limpia y espacio libre para el encabezado, acorde a productos y servicios confirmados. SIN palabras, textos, precios ni marcas de agua.":
  "Crea UNA fotografía original para galería de sitio web, realista y de alta calidad, productos o servicios auténticos, detalles y luz profesional. SIN palabras, textos, precios ni marcas de agua.";
 // The owner's product-photo pilot has no daily application quota for now.
 // All other Web Services image types retain their existing atomic quota.
 if(!isProduct){
  const {data:reserved,error:quotaError}=await admin.rpc("smartjob_web_ai_claim_slot",{p_owner:user.id});
  if(quotaError)return json({error:"No se pudo comprobar el límite de imágenes"},503);
  if(reserved!==true)return json({error:"Se alcanzó el límite diario de generación"},429);
 }
 try{
  const generation=await fetch("https://api.openai.com/v1/images/generations",{
   method:"POST",
   headers:{"Authorization":"Bearer "+s.openAi,"Content-Type":"application/json"},
   body:JSON.stringify({
    model:"gpt-image-2",
    prompt:kindInstruction+" Negocio: "+name+". Sector: "+category+
     (isProduct?". Producto: "+productName+". Descripción aprobada: "+productDetails:"")+
     ". Solicitud visual: "+prompt,
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
