// Production billing is fail-closed. A single owner-specific Preview pilot may use
// their existing TEST minute balance only when explicitly enabled on the server.
// Neither Stripe TEST subscriptions nor user metadata can unlock public production.
import {balance,eligible,getBillingAccount,billingEnabledFor,billingAdmin,type BillingAccount} from "@/lib/vmv-billing";
import {nationalPilotFor,nationalAvailable} from "@/lib/vmv-national-minutes";

export type PaidCapability="direct_call"|"translated_call"|"ai";

export function realBillingConfigured():boolean {
 return process.env.SMARTJOB_STRIPE_MODE==="live" &&
  /^sk_live_[A-Za-z0-9]+$/.test(process.env.STRIPE_SECRET_KEY||"") &&
  process.env.SMARTJOB_PAID_SERVICES_ENABLED==="true";
}
export function confirmedSubscription(account:BillingAccount|null):boolean {
 return Boolean(account&&account.stripe_mode==="live"&&eligible(account)&&
  /^cus_[A-Za-z0-9]+$/.test(account.stripe_customer_id||"")&&
  /^sub_[A-Za-z0-9]+$/.test(account.stripe_subscription_id||"")&&
  ["starter","pro","premium"].includes(account.plan_code));
}
// This pilot is scoped by deployment environment AND an explicit user UUID,
// never by a spoofable request header, profile field, or client-supplied flag.
export function ownerPreviewPilot(account:BillingAccount|null):boolean {
 return Boolean(account&&
  process.env.VERCEL_ENV==="preview"&&
  process.env.SMARTJOB_REALTIME_PILOT_ENABLED==="true"&&
  billingEnabledFor(account.user_id)&&
  account.stripe_mode==="test"&&eligible(account)&&
  ["starter","pro","premium"].includes(account.plan_code)&&
  (balance(account)>0||nationalPilotFor(account.user_id)));
}
export function allowSpendWithAccount(account:BillingAccount|null,capability:PaidCapability):boolean {
 if(ownerPreviewPilot(account))return capability==="direct_call"&&nationalPilotFor(account!.user_id)?true:balance(account)>0;
 if(!realBillingConfigured()||!confirmedSubscription(account))return false;
 return capability==="direct_call"||balance(account)>0;
}
export async function paidServiceAllowed(uid:string,capability:PaidCapability):Promise<boolean> {
 if(!/^[a-f\d-]{36}$/i.test(uid))return false;
 if(!realBillingConfigured()&&!(
  process.env.VERCEL_ENV==="preview"&&
  process.env.SMARTJOB_REALTIME_PILOT_ENABLED==="true"&&
  billingEnabledFor(uid)))return false;
 let account=await getBillingAccount(uid);
 // A lost Twilio completion callback must not lock all paid minutes forever.
 // Reap only already-terminal sessions older than the database grace period;
 // never release an in-progress call's reserved balance.
 if(account&&eligible(account)&&balance(account)===0){
  const db=billingAdmin();
  if(db){
   const {error}=await db.rpc("smartjob_reap_call_reservations",{p_user_id:uid});
   if(error)console.error("VMV reserved call recovery unavailable",error.code||"unknown");
   else account=await getBillingAccount(uid);
  }
 }
 if(!allowSpendWithAccount(account,capability))return false;
 if(capability==="direct_call"&&account?.plan_code==="starter"&&nationalPilotFor(uid))
  return nationalAvailable(uid,account);
 return true;
}
