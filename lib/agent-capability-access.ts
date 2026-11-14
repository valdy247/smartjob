import type {WizardDraft} from "../app/vista-app/ai-agents/AgentSetupWizard";
import {inspectAgent} from "../app/vista-app/ai-agents/agentQuality";

/** Setup readiness is distinct from activation, payment and channel permissions. */
export function agentSetupDestination(agent:WizardDraft|null,businessId:string|null):string|null {
 if(businessId&&agent&&inspectAgent(agent).requiredPassed)return null;
 const query=new URLSearchParams({tab:"account",setup:"agent"});
 if(businessId)query.set("business",businessId);
 return "/vista-app?"+query.toString();
}
