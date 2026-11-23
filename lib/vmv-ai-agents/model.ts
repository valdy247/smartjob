import {generateText} from "ai";
import {gateway} from "@ai-sdk/gateway";

type AgentMessage={role:"user"|"assistant";content:string};
type AskOptions={
 system:string;
 messages:AgentMessage[];
 maxOutputTokens?:number;
 temperature?:number;
 timeoutMs?:number;
};

/**
 * AI Gateway's SDK resolves short-lived Vercel OIDC authentication at runtime.
 * The OIDC token need not appear in process.env.VERCEL_OIDC_TOKEN; the previous
 * manual env check incorrectly rejected valid Preview deployments.
 */
export function aiAgentModelPathAvailable(){
 return Boolean(process.env.OPENAI_API_KEY||process.env.AI_GATEWAY_API_KEY||
   (process.env.VERCEL_ENV==="preview"&&process.env.VERCEL==="1"));
}

function modelName(){
 const requested=(process.env.VMV_AI_VOICE_MODEL||"openai/gpt-4.1-mini").trim();
 // Keep the pilot confined to its audited, budgeted text model.
 return requested==="gpt-4.1-mini"||requested==="openai/gpt-4.1-mini"
  ?"openai/gpt-4.1-mini":"openai/gpt-4.1-mini";
}

export async function askAiAgent({system,messages,maxOutputTokens=170,temperature=0.2,
 timeoutMs=7000}:AskOptions):Promise<string>{
 if(!aiAgentModelPathAvailable())throw Error("AI provider authentication not configured");
 const model=modelName();
 if(process.env.OPENAI_API_KEY){
  const response=await fetch("https://api.openai.com/v1/chat/completions",{
   method:"POST",cache:"no-store",
   headers:{"Content-Type":"application/json",Authorization:"Bearer "+process.env.OPENAI_API_KEY},
   body:JSON.stringify({model:"gpt-4.1-mini",
    messages:[{role:"system",content:system},...messages],
    max_tokens:maxOutputTokens,temperature,store:false}),
   signal:AbortSignal.timeout(timeoutMs)
  });
  if(!response.ok)throw Error("OpenAI provider returned HTTP "+response.status);
  const result=await response.json();
  const answer=result?.choices?.[0]?.message?.content;
  if(typeof answer!=="string"||!answer.trim())throw Error("OpenAI returned an empty response");
  return answer.trim();
 }
 // Vercel AI SDK 7 + Gateway 4 refresh and obtain OIDC automatically, rather
 // than reading a token from process.env (where it may not be visible).
 const result=await generateText({
  model:gateway(model),
  system,messages,
  temperature,maxOutputTokens,
  abortSignal:AbortSignal.timeout(timeoutMs)
 });
 if(!result.text.trim())throw Error("AI Gateway returned an empty response");
 return result.text.trim();
}

/** Tiny live request, owner-authenticated by the caller; not just an env-var check. */
export async function probeAiAgentModel():Promise<boolean>{
 try{
  const text=await askAiAgent({
   system:"Answer with exactly the word READY. No other text.",
   messages:[{role:"user",content:"Reply READY"}],
   maxOutputTokens:9,temperature:0,timeoutMs:6500
  });
  return text.toUpperCase().replace(/[.\s]/g,"")==="READY";
 }catch(error){
  const kind=error instanceof Error?error.name:"unknown";
  console.warn("[vmv-ai-agent] model probe failed",kind);
  return false;
 }
}
