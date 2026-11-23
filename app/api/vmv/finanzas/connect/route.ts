import {NextRequest,NextResponse} from "next/server";
import {checkedAccount,financeContext,merchantRow,safeOrigin,stripePlatform,synchronize,testAvailable,uuid}
 from "@/lib/vmv-finances/connect";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const respond=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"no-store"}});
export async function POST(req:NextRequest){
 if(!testAvailable())return respond({error:"Stripe Connect de prueba no está configurado."},503);
 const origin=safeOrigin();
 if(!origin)return respond({error:"La URL segura de retorno no está configurada."},503);
 let businessId="",action="";
 try{const body=await req.json();businessId=String(body?.businessId||"");action=String(body?.action||"");}
 catch{return respond({error:"Solicitud inválida."},400);}
 if(!uuid.test(businessId)||!["onboard","dashboard"].includes(action))
  return respond({error:"Solicitud inválida."},400);
 const ctx=await financeContext(req,businessId,action==="onboard");
 if(!ctx||!ctx.workspace)return respond({error:"Negocio no autorizado. Inicia sesión nuevamente."},403);
 if(ctx.business.country!=="US")return respond({error:"El piloto Stripe Connect solo acepta negocios de Estados Unidos."},403);
 try{
  const merchant=await merchantRow(ctx);
  let id=String(merchant?.provider_account_id||"");
  if(!id){
   if(action!=="onboard")return respond({error:"Conecta primero Stripe."},409);
   const fields=new URLSearchParams({
    type:"express",country:"US",
    "capabilities[card_payments][requested]":"true",
    "capabilities[transfers][requested]":"true",
    "metadata[vmv_owner_id]":ctx.owner,
    "metadata[vmv_business_id]":businessId,
    "metadata[vmv_workspace_id]":ctx.workspace.id
   });
   // A duplicate click must not create two financial accounts.
   const created=await stripePlatform("accounts","POST",fields,"vmv-finance-test-"+businessId);
   id=String(created.id||"");
   if(!/^acct_[A-Za-z0-9]+$/.test(id)||created.livemode!==false)
    return respond({error:"Stripe no pudo crear una cuenta segura."},502);
   const {error}=await ctx.admin.from("vmv_ai_merchant_payments").upsert({
    business_id:ctx.workspace.id,owner_id:ctx.owner,provider:"stripe_connect",
    provider_account_id:id,livemode:false,verified_by_server:false,
    can_accept_payments:false,updated_at:new Date().toISOString()
   },{onConflict:"business_id"});
   if(error)return respond({error:"No se pudo guardar el vínculo con Stripe. Intenta nuevamente."},503);
  }
  const account=await checkedAccount(id,ctx.owner,businessId);
  const state=await synchronize(ctx,account);
  if(action==="dashboard"){
   if(!state.ready)return respond({error:"Completa primero la verificación de Stripe."},409);
   const login=await stripePlatform("accounts/"+encodeURIComponent(id)+"/login_links","POST",new URLSearchParams());
   const url=String(login.url||"");
   if(!/^https:\/\/connect\.stripe\.com\//.test(url))
    return respond({error:"Stripe no pudo abrir el panel del negocio."},502);
   return respond({url,mode:"test"});
  }
  // Stripe-hosted KYC; do not collect government IDs, bank numbers, or passwords.
  const back=origin+"/vista-app/finanzas?business="+encodeURIComponent(businessId);
  const link=await stripePlatform("account_links","POST",new URLSearchParams({
   account:id,type:"account_onboarding",
   return_url:back+"&stripe=return",
   refresh_url:back+"&stripe=retry"
  }));
  const url=String(link.url||"");
  if(!/^https:\/\/connect\.stripe\.com\//.test(url))
   return respond({error:"No se pudo abrir la verificación segura."},502);
  return respond({url,mode:"test",ready:state.ready});
 }catch{
  return respond({error:"Stripe no pudo iniciar la verificación. Inténtalo de nuevo."},503);
 }
}
