export type GatewayVideoFailure = {
 error:"ai_gateway_auth_not_configured"|"ai_gateway_budget_exceeded"|
 "ai_gateway_funds_unavailable"|"ai_gateway_billing_restricted"|
 "ai_gateway_payment_rejected"|"seedance_invalid_parameters"|
 "ai_gateway_rate_limited"|"seedance_gateway_unavailable";
 status:number|null;
 providerType:string|null;
 budgetScope:"project"|"team"|"user"|"api_key"|null;
};
export declare function classifyGatewayVideoFailure(error:unknown):GatewayVideoFailure;
