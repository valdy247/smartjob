import {NextRequest,NextResponse} from "next/server";
import {checkedAccount,financeContext,merchantRow,safeOrigin,stripePlatform,stripeStatus,synchronize,testAvailable,uuid}
 from "@/lib/vmv-finances/connect";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const response=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"no-store"}});
export async function GET(req:NextRequest){
 const businessId=req.nextUrl.searchParams.get("businessId")||"";
 if(!uuid.test(businessId))return response({error:"Negocio inválido."},400);
 const ctx=await financeContext(req,businessId);
 if(!ctx)return response({error:"Inicia sesión con la cuenta propietaria de este negocio."},401);
 try{
  const merchant=await merchantRow(ctx);
  const configured=testAvailable()&&Boolean(safeOrigin());
  const id=String(merchant?.provider_account_id||"");
  if(!id)return response({business:ctx.business.name,configured,connected:false,mode:"test"});
  if(!configured)return response({business:ctx.business.name,configured:false,connected:true,ready:false,
   mode:"test",message:"Faltan credenciales del entorno de prueba."});
  const account=await checkedAccount(id,ctx.owner,ctx.business.id);
  const state=await synchronize(ctx,account);
  let availableCents:number|null=null,pendingCents:number|null=null,payouts:unknown[]=[];
  if(state.ready){
   try{
    // Read only, direct on the connected account. Never a VMV pooled wallet.
    const secret=process.env.VMV_AI_COMMERCE_STRIPE_SECRET_KEY||"";
    const headers={Authorization:"Bearer "+secret,"Stripe-Account":id};
    const [balances,history]=await Promise.all([
     fetch("https://api.stripe.com/v1/balance",{headers,cache:"no-store",signal:AbortSignal.timeout(7500)}),
     fetch("https://api.stripe.com/v1/payouts?limit=5",{headers,cache:"no-store",signal:AbortSignal.timeout(7500)})
    ]);
    if(balances.ok){const b=await balances.json();
     availableCents=(b.available||[]).filter((x:{currency:string})=>x.currency==="usd")
      .reduce((sum:number,x:{amount:number})=>sum+x.amount,0);
     pendingCents=(b.pending||[]).filter((x:{currency:string})=>x.currency==="usd")
      .reduce((sum:number,x:{amount:number})=>sum+x.amount,0);
    }
    if(history.ok){const p=await history.json();payouts=Array.isArray(p.data)?
     p.data.slice(0,5).map((x:{id:string,amount:number,status:string,arrival_date:number,currency:string})=>({
      id:x.id,amountCents:x.amount,status:x.status,arrivalDate:x.arrival_date,currency:x.currency
     })):[];}
   }catch{/* Status still loads if Stripe balance reporting is unavailable. */}
  }
  return response({business:ctx.business.name,configured:true,...state,availableCents,pendingCents,payouts});
 }catch{return response({business:ctx.business.name,configured:testAvailable(),connected:true,
   ready:false,mode:"test",error:"La conexión necesita revisión. Intenta actualizar más tarde."},503);}
}
