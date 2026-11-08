import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
import {PLAN_CATALOG,TOPUP_CATALOG,topupPriceEnv,getBillingAccount,balance,eligible,priceEnv,stripeTestReady,
 type PlanCode} from "@/lib/vmv-billing";
import {noStore} from "@/lib/vmv-stripe";
const isPlanCode=(x:string):x is PlanCode=>x==="starter"||x==="pro"||x==="premium";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(req:NextRequest){
 const uid=await authenticatedUser(req);
 if(!uid)return NextResponse.json({error:"unauthorized"},{status:401,headers:noStore});
 const account=await getBillingAccount(uid);
 const plans=Object.entries(PLAN_CATALOG).map(([id,p])=>({
  id,name:p.name,priceCents:p.usdCents,minutes:p.minutes,
  topupCentsPerMinute:p.topupCentsPerMinute,rolloverCap:p.rolloverCap,
  customVoice:p.customVoice,customGreeting:p.customGreeting
 }));
 const selected=account?.plan_code||"none";
 const topup=isPlanCode(selected)?TOPUP_CATALOG[selected]:null;
 const taxReady=["automatic","not_collected"].includes(process.env.SMARTJOB_TAX_MODE||"");
 const canCheckout=stripeTestReady()&&taxReady&&
  (Object.keys(PLAN_CATALOG) as PlanCode[]).every(p=>/^price_/.test(priceEnv(p)));
 return NextResponse.json({
  plans,plan:account?.plan_code||"none",status:account?.status||"inactive",
  subscriptionActive:eligible(account),periodEnd:account?.current_period_end||null,
  minutes:{included:account?.included_minutes||0,used:account?.used_minutes||0,
   reserved:account?.reserved_minutes||0,rollover:account?.rollover_minutes||0,
   topup:account?.topup_minutes||0,available:balance(account)},
  topup:topup?{plan:selected,minutes:topup.minutes,priceCents:topup.usdCents,
    available:eligible(account)&&stripeTestReady()&&taxReady&&
      /^price_[a-zA-Z0-9]+$/.test(topupPriceEnv(selected as PlanCode))}:null,
  billingMode:"test",canCheckout,hasPortal:Boolean(account?.stripe_customer_id)&&stripeTestReady(),
  note:canCheckout?"Pagos de prueba habilitados, sin cargos reales.":
   "Planes disponibles como vista previa. Los cobros todavía no están habilitados."
 },{headers:noStore});
}
