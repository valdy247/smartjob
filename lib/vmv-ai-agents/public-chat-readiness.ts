type AgentForPublicChat={
 name:string;purpose:string;kind:string;configuration:Record<string,string>;
};
/** Opting in to Chat is independent of the phone and global studio status.
 * Only agents with the minimum business and customer-safety configuration
 * may be exposed to visitors. */
export function publicChatReadiness(agent:AgentForPublicChat):{
 ready:boolean;reason:string;
}{
 const c=agent.configuration||{};
 const has=(key:string)=>typeof c[key]==="string"&&Boolean(c[key].trim());
 if(!agent.name.trim()||!agent.purpose.trim()||!has("business_name")||!has("industry"))
  return {ready:false,reason:"Completa la identidad y el negocio de tu agente."};
 if(!has("country")||!(has("city")||has("location"))||
  !(c.country==="Otro país"?has("region_other"):has("state")))
  return {ready:false,reason:"Completa la ubicación del negocio."};
 if(!(has("human_review")||has("handoff"))||
  !(has("data_scope")||has("personal_data")))
  return {ready:false,reason:"Configura la derivación humana y privacidad."};
 if(agent.kind==="support"&&!(has("support_topics")||has("support_faq")))
  return {ready:false,reason:"Completa las preguntas frecuentes del agente."};
 return {ready:true,reason:""};
}
