// Safely classify Vercel AI Gateway failures without logging prompts,
// credentials, URLs, raw provider messages, or upstream response bodies.
const TYPES=new Set([
 "quota_for_entity_exceeded","insufficient_funds","payment_required",
 "billing_not_enabled","customer_verification_required","access_denied",
 "invalid_api_key","rate_limit_exceeded","unsupported_model"
]);
const asObject=value=>value&&typeof value==="object"&&!Array.isArray(value)?value:null;
const parseBody=value=>{
 if(typeof value==="string"&&value.length<=16000){
  try{return asObject(JSON.parse(value));}catch{return null;}
 }
 return asObject(value);
};
const safeType=value=>{
 if(typeof value!=="string")return null;
 const normalized=value.trim().toLowerCase().replace(/[- ]/g,"_");
 return TYPES.has(normalized)?normalized:null;
};
const scopeFromMessage=value=>{
 if(typeof value!=="string")return null;
 if(/(?:project budget exceeded|project.+quota|project.+budget limit)/i.test(value))return "project";
 if(/(?:team budget exceeded|team.+quota|team.+budget limit)/i.test(value))return "team";
 if(/(?:user budget exceeded|member budget exceeded|user.+quota)/i.test(value))return "user";
 if(/(?:api[_ -]?key.+(?:quota|budget)|quota limit exceeded for ["']?api_key)/i.test(value))return "api_key";
 return null;
};
export function classifyGatewayVideoFailure(err){
 const nodes=[];
 let current=asObject(err);
 for(let depth=0;depth<4&&current;depth++){
  nodes.push(current);
  current=asObject(current.cause);
 }
 let status=null,type=null,budgetScope=null;
 for(const node of nodes){
  if(status===null){
   const candidates=[node.statusCode,node.status,asObject(node.response)?.status];
   for(const v of candidates){
    if(typeof v==="number"&&Number.isInteger(v)&&v>=100&&v<600){status=v;break;}
   }
  }
  const payloads=[node,parseBody(node.responseBody),parseBody(node.data),
   parseBody(asObject(node.response)?.body)].filter(Boolean);
  for(const payload of payloads){
   const error=asObject(payload.error);
   const candidates=[error?.type,error?.code,payload.type,payload.code,payload.reason];
   if(!type)for(const candidate of candidates){const candidateType=safeType(candidate);if(candidateType){type=candidateType;break;}}
   if(!budgetScope)budgetScope=scopeFromMessage(error?.message)||scopeFromMessage(payload.message);
  }
 }
 let error="seedance_gateway_unavailable";
 if(status===401||status===403||type==="access_denied"||type==="invalid_api_key")error="ai_gateway_auth_not_configured";
 else if(type==="quota_for_entity_exceeded")error="ai_gateway_budget_exceeded";
 else if(type==="insufficient_funds")error="ai_gateway_funds_unavailable";
 else if(type==="customer_verification_required"||type==="billing_not_enabled"||type==="payment_required")error="ai_gateway_billing_restricted";
 else if(status===402)error="ai_gateway_payment_rejected";
 else if(status===400||status===422)error="seedance_invalid_parameters";
 else if(status===429||type==="rate_limit_exceeded")error="ai_gateway_rate_limited";
 return {error,status,providerType:type,budgetScope};
}
