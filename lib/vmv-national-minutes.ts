// Starter's domestic voice quota is independent of translated-call minutes.
// Every mutation is an atomic Postgres RPC, not client-side read/modify/write.
// Disabled outside an explicitly allowlisted Preview pilot until production QA.
import {billingAdmin,billingEnabledFor,eligible,getBillingAccount,type BillingAccount} from "@/lib/vmv-billing";

export const STARTER_NATIONAL_MINUTES=150;
export type NationalMinutes={
 enabled:boolean;included:number;used:number;reserved:number;available:number;
 periodStart:string|null;periodEnd:string|null;
};
export const nationalPilotFor=(uid:string)=>Boolean(
 process.env.VERCEL_ENV==="preview"&&
 process.env.SMARTJOB_NATIONAL_MINUTES_ENABLED==="true"&&
 billingEnabledFor(uid)
);
const periodReady=(account:BillingAccount|null)=>Boolean(
 account?.plan_code==="starter"&&eligible(account)&&
 account?.current_period_start&&account.current_period_end&&
 Date.parse(account.current_period_start)<Date.now()
);
const empty:NationalMinutes={enabled:false,included:0,used:0,reserved:0,available:0,periodStart:null,periodEnd:null};

export async function nationalMinutes(uid:string,account?:BillingAccount|null):Promise<NationalMinutes>{
 const a=account===undefined?await getBillingAccount(uid):account;
 if(!a||a.plan_code!=="starter")return empty;
 const configured=nationalPilotFor(uid);
 if(!periodReady(a))return {...empty,periodEnd:a.current_period_end||null};
 if(!configured)return {
  enabled:false,included:STARTER_NATIONAL_MINUTES,used:0,reserved:0,available:0,
  periodStart:a.current_period_start,periodEnd:a.current_period_end
 };
 const db=billingAdmin();if(!db)throw Error("national_wallet_unavailable");
 const cleanup=await db.rpc("smartjob_national_reap",{p_user_id:uid});
 if(cleanup.error)throw Error("national_wallet_unavailable");
 const {data,error}=await db.from("smartjob_national_periods")
  .select("included_minutes,used_minutes,reserved_minutes,period_end")
  .eq("user_id",uid).eq("period_start",a.current_period_start).maybeSingle();
 if(error)throw Error("national_wallet_unavailable");
 const included=data?.included_minutes??STARTER_NATIONAL_MINUTES;
 const used=data?.used_minutes??0,reserved=data?.reserved_minutes??0;
 return {
  enabled:true,included,used,reserved,
  available:Math.max(0,included-used-reserved),
  periodStart:a.current_period_start,periodEnd:a.current_period_end
 };
}
export async function nationalAvailable(uid:string,account?:BillingAccount|null):Promise<boolean>{
 const a=account===undefined?await getBillingAccount(uid):account;
 if(!a||a.plan_code!=="starter")return false;
 if(!nationalPilotFor(uid))return true; // Pending feature: do not silently turn on quotas.
 try{return (await nationalMinutes(uid,a)).available>0;}catch{return false;}
}
// Null means national accounting isn't switched on for this pilot owner.
// Zero means an active quota denied the call. Never fail open after RPC errors.
export async function claimNational(uid:string,callKey:string,maxMinutes=10):Promise<number|null>{
 if(!nationalPilotFor(uid))return null;
 const db=billingAdmin();if(!db)return 0;
 const {data,error}=await db.rpc("smartjob_national_claim",{
  p_user_id:uid,p_call_key:callKey,p_max_minutes:maxMinutes
 });
 if(error){console.error("VMV national claim unavailable",error.code);return 0;}
 return Number.isInteger(data)&&data>0&&data<=10?data:0;
}
export async function settleNational(callKey:string,seconds:number):Promise<boolean>{
 const db=billingAdmin();if(!db)return false;
 if(!Number.isInteger(seconds)||seconds<0||seconds>14400)return false;
 const {data,error}=await db.rpc("smartjob_national_settle",{
  p_call_key:callKey,p_duration_seconds:seconds
 });
 if(error||!Number.isInteger(data)||data<0){
  console.error("VMV national settlement unavailable",error?.code||"invalid_result");
  return false;
 }
 return true;
}
