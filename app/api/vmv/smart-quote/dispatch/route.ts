import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@supabase/supabase-js";
import {renderQuotePdf,type QuotePdfData,type QuoteTemplate,validTemplate} from "@/lib/vmv-smart-quote/pdf";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const email=/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const fail=(message:string,status=400)=>NextResponse.json({error:message},{status,headers:{"Cache-Control":"no-store"}});
const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]||c));
const mailReady=()=>Boolean(process.env.RESEND_API_KEY&&email.test(process.env.VMV_SMART_QUOTE_FROM_EMAIL||""));

export async function GET(){
 return NextResponse.json({enabled:mailReady(),pdf:true},
  {headers:{"Cache-Control":"no-store"}});
}
export async function POST(req:NextRequest){
 const token=req.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!token||!url||!key)return fail("Inicia sesión para usar Smart Quote.",401);
 if(Number(req.headers.get("content-length")||0)>10000)return fail("Solicitud demasiado grande.",413);
 let payload:{quoteId?:unknown;action?:unknown;message?:unknown};
 try{payload=await req.json() as typeof payload;}catch{return fail("Solicitud inválida.");}
 const quoteId=String(payload?.quoteId||"");
 if(!uuid.test(quoteId)||!["send","pdf"].includes(String(payload?.action)))return fail("Cotización o acción inválida.");
 const action=String(payload.action);
 const message=typeof payload.message==="string"?payload.message.trim():"";
 if(message.length>1000)return fail("El mensaje es demasiado largo.");
 const db=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false},
  global:{headers:{Authorization:"Bearer "+token}}});
 const {data:identity,error:authError}=await db.auth.getUser(token);
 if(authError||!identity.user||identity.user.is_anonymous)return fail("Sesión inválida.",401);
 const owner=identity.user.id;
 const {data:quote,error:quoteError}=await db.from("vmv_smart_quotes")
  .select("id,owner_id,business_id,status,revision,customer_name,customer_email,customer_phone,valid_until,lines,subtotal_cents,discount_cents,delivery_cents,tax_bps,tax_cents,deposit_bps,deposit_cents,total_cents,notes,design_template")
  .eq("id",quoteId).eq("owner_id",owner).maybeSingle();
 if(quoteError||!quote)return fail("No se pudo encontrar tu cotización.",404);
 const {data:business,error:businessError}=await db.from("vmv_marketing_businesses")
  .select("id,name").eq("id",quote.business_id).eq("owner_id",owner).maybeSingle();
 if(businessError||!business)return fail("El negocio no está disponible.",404);
 if(quote.status==="cancelled")return fail("Esta cotización fue cancelada.",409);
 const template:QuoteTemplate=validTemplate(quote.design_template)?quote.design_template:"modern";
 const pdf=renderQuotePdf(quote as QuotePdfData,business.name,template);
 if(action==="pdf")return new NextResponse(new Uint8Array(pdf),{headers:{
  "Content-Type":"application/pdf",
  "Content-Disposition":'attachment; filename="cotizacion-'+quoteId.slice(0,8)+'.pdf"',
  "Cache-Control":"no-store","X-Content-Type-Options":"nosniff"
 }});
 if(!mailReady())return fail("Falta configurar y verificar el remitente del servicio de correo.",503);
 if(quote.status!=="approved"||quote.valid_until<new Date().toISOString().slice(0,10))
  return fail("Solo se pueden enviar cotizaciones aprobadas y vigentes.",409);
 if(!email.test(quote.customer_email))return fail("Falta un correo válido del cliente.",400);
 const bodyText=message||("Hola "+quote.customer_name+",\n\n"+business.name+
  " te comparte la cotización solicitada. Adjunto encontrarás el PDF con los detalles y condiciones.");
 const html='<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:22px;color:#30263d">'+
  '<h1 style="font-size:22px;color:#65439b">'+escape(business.name)+'</h1>'+
  '<p style="white-space:pre-line;line-height:1.6">'+escape(bodyText)+'</p>'+
  '<p><strong>Total: $'+(Number(quote.total_cents)/100).toFixed(2)+
  ' USD</strong></p><p>Válida hasta: '+escape(String(quote.valid_until))+'</p>'+
  '<p style="color:#817b87;font-size:12px">Cotización adjunta. No es factura ni comprobante de pago.</p></div>';
 let response:Response;
 try{
  response=await fetch("https://api.resend.com/emails",{
   method:"POST",
   headers:{"Authorization":"Bearer "+process.env.RESEND_API_KEY,
    "Content-Type":"application/json",
    "Idempotency-Key":"vmv-smart-quote-"+quoteId+"-v"+quote.revision},
   body:JSON.stringify({from:process.env.VMV_SMART_QUOTE_FROM_EMAIL,
    to:[quote.customer_email],subject:"Cotización de "+business.name,
    html,attachments:[{filename:"cotizacion-"+quoteId.slice(0,8)+".pdf",content:pdf.toString("base64")}]})
  });
 }catch{return fail("El servicio de correo no respondió. La cotización sigue aprobada para revisar.",502);}
 const delivery=await response.json().catch(()=>({}));
 if(!response.ok||typeof delivery?.id!=="string")
  return fail("El proveedor de correo no aceptó el envío. La cotización sigue aprobada para revisar.",502);
 const {data:recorded,error:recordError}=await db.rpc("vmv_smart_quote_set_status",{
  p_quote_id:quoteId,p_action:"mark_sent_email"});
 if(recordError||recorded!==true){
  return NextResponse.json({accepted:true,recorded:false,
   message:"El proveedor aceptó el correo, pero faltó actualizar el historial. No vuelvas a enviarlo sin verificar."},
   {status:202,headers:{"Cache-Control":"no-store"}});
 }
 return NextResponse.json({accepted:true,recorded:true,
  message:"El proveedor de correo aceptó el envío. La entrega final aún puede estar pendiente."},
  {headers:{"Cache-Control":"no-store"}});
}
