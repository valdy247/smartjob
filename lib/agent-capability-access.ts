import type {WizardDraft} from "../app/vista-app/ai-agents/AgentSetupWizard";

/** Agent existence and agent readiness are different. Incomplete settings must
 * never send an existing business agent into a new creation flow. Readiness is
 * checked only when enabling a specific capability, not navigating to it. */
export function agentSetupDestination(agent:WizardDraft|null,businessId:string|null):string|null {
 if(businessId&&agent)return null;
 const query=new URLSearchParams({tab:"account",setup:"agent"});
 if(businessId)query.set("business",businessId);
 return "/vista-app?"+query.toString();
}
