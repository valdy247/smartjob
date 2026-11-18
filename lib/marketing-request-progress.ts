/** Stage-based display only: these values describe workflow milestones, not actual work-time or a forecast. */
export type MarketingRequestStatus="received"|"quoted"|"approved"|"in_progress"|"needs_customer"|"verified"|"cancelled";
const milestones:Record<MarketingRequestStatus,number>={
 received:16,quoted:36,approved:60,in_progress:82,needs_customer:16,verified:100,cancelled:0
};
export function marketingRequestProgress(
 status:MarketingRequestStatus,
 quoteAccepted=false,
 history:readonly {status?:MarketingRequestStatus|null}[]=[]
):number{
 if(status==="cancelled")return 0;
 if(status==="verified")return 100;
 const prior=history.reduce((maximum,event)=>{
  const state=event?.status;
  if(!state||state==="cancelled"||state==="verified"||state==="needs_customer")return maximum;
  return Math.max(maximum,milestones[state]);
 },0);
 const current=status==="needs_customer"?0:milestones[status];
 return Math.max(16,Math.min(82,current,82)+(Math.max(prior,quoteAccepted?milestones.approved:0)>Math.max(16,current)?Math.max(prior,quoteAccepted?milestones.approved:0)-Math.max(16,current):0));
}
