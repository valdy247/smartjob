// VMV Call subscription catalogue. Prices are proposals until Stripe test-mode
// prices, taxes and App Store compliance are approved. Never trust a client price.
import {createClient} from "@supabase/supabase-js";

export type PlanCode="starter"|"pro"|"premium";
export const PLAN_CATALOG={
 starter:{name:"Starter",usdCents:999,minutes:20,topupCentsPerMinute:39,rolloverCap:0,customVoice:false,customGreeting:false},
 pro:{name:"Pro",usdCents:1999,minutes:45,topupCentsPerMinute:32,rolloverCap:0,customVoice:true,customGreeting:true},
 premium:{name:"Premium",usdCents:4999,minutes:130,topupCentsPerMinute:27,rolloverCap:65,customVoice:true,customGreeting:true}
} as const;
export const isPlan=(s:unknown):s is PlanCode=>typeof s==="string"&&Object.hasOwn(PLAN_CATALOG,s);
export const TOPUP_CATALOG={
 starter:{minutes:20,usdCents:780},
 pro:{minutes:30,usdCents:960},
 premium:{minutes:60,usdCents:1620}
} as const;
export const topupPriceEnv=(plan:PlanCode):string=>
 process.env[{starter:"STRIPE_TOPUP_STARTER",pro:"STRIPE_TOPUP_PRO",
 premium:"STRIPE_TOPUP_PREMIUM"}[plan]]||"";
export type BillingAccount={
 user_id:string;plan_code:string;status:string;stripe_customer_id:string|null;
 stripe_subscription_id:string|null;current_period_end:string|null;included_minutes:number;
 used_minutes:number;reserved_minutes:number;rollover_minutes:number;topup_minutes:number;
 test_held_minutes:number;test_hold_until:string|null
};
// Preview-only trial gate. The global toggle alone cannot enforce quotas on
// arbitrary users or on production; explicit test account matching is required.
export const billingEnabledFor=(userId:string)=>Boolean(
 process.env.SMARTJOB_BILLING_ENFORCEMENT_ENABLED==="true"&&
 process.env.SMARTJOB_STRIPE_MODE==="test"&&
 /^[a-f0-9-]{36}$/i.test(process.env.SMARTJOB_BILLING_TEST_OWNER_ID||"")&&
 process.env.SMARTJOB_BILLING_TEST_OWNER_ID===userId
);
export function billingAdmin(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,secret=process.env.SUPABASE_SECRET_KEY;
 return url&&secret?createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}}):null;
}
export async function getBillingAccount(uid:string):Promise<BillingAccount|null>{
 const db=billingAdmin();if(!db)return null;
 const {data,error}=await db.from("smartjob_billing_accounts")
  .select("user_id,plan_code,status,stripe_customer_id,stripe_subscription_id,current_period_end,included_minutes,used_minutes,reserved_minutes,rollover_minutes,topup_minutes,test_held_minutes,test_hold_until")
  .eq("user_id",uid).maybeSingle();
 if(error){console.error("VMV billing account read",error.code);return null;}
 return data as BillingAccount|null;
}
export const eligible=(account:BillingAccount|null)=>Boolean(account&&
 ["active","trialing"].includes(account.status)&&
 account.current_period_end&&Date.parse(account.current_period_end)>Date.now());
export const testMinutesHeld=(a:BillingAccount|null)=>a?.test_hold_until&&
 Date.parse(a.test_hold_until)>Date.now()?a.test_held_minutes:0;
export const balance=(a:BillingAccount|null)=>a?
 Math.max(0,a.included_minutes+a.rollover_minutes+a.topup_minutes-a.used_minutes-a.reserved_minutes-testMinutesHeld(a)):0;
export async function claimCallMinutes(bridge:string,uid:string,maxMinutes=10){
 const db=billingAdmin();if(!db)return 0;
 const released=await db.rpc("smartjob_reap_call_reservations",{p_user_id:uid});
 if(released.error){console.error("VMV stale call recovery failed",released.error.code);return 0;}
 const {data,error}=await db.rpc("smartjob_claim_call_quota",{
  p_bridge_sid:bridge,p_user_id:uid,p_max_minutes:maxMinutes
 });
 if(error){console.error("VMV call quota unavailable",error.code);return 0;}
 return Number.isInteger(data)&&data>0?data:0;
}
export async function settleCallMinutes(bridge:string,seconds:number){
 const db=billingAdmin();if(!db)return false;
 const {error}=await db.rpc("smartjob_settle_call_quota",{
  p_bridge_sid:bridge,p_seconds:Math.max(0,Math.min(86400,Math.floor(seconds)))
 });
 if(error){console.error("VMV call settlement unavailable",error.code);return false;}
 return true;
}
export const priceEnv=(plan:PlanCode):string=>{
 const key={starter:"STRIPE_PRICE_STARTER",pro:"STRIPE_PRICE_PRO",premium:"STRIPE_PRICE_PREMIUM"}[plan];
 return process.env[key]||"";
};
export const stripeTestReady=()=>process.env.SMARTJOB_STRIPE_MODE==="test"&&
 /^sk_test_/.test(process.env.STRIPE_SECRET_KEY||"");
