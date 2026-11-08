import { NextRequest } from "next/server";
import { authenticTwilio,gather,hasPilotConfiguration,PILOT_BASE,say,sealAudio,twiml } from "@/lib/twilio-pilot";
import { compareNumbers } from "@/lib/qa";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(req:NextRequest){
 const params=await authenticTwilio(req);
 if(!params)return twiml(say("No autorizado.")+"<Hangup/>",403);
 const turn=Number(new URL(req.url).searchParams.get("turn")||"1");
 if(!Number.isInteger(turn)||turn<1||turn>4)return twiml("<Hangup/>");
 if(!hasPilotConfiguration())return twiml(say("El traductor todavía no está configurado.")+"<Hangup/>");
 const original=(params.get("SpeechResult")||"").trim().slice(0,400);
 if(!original)return twiml(say("No entendí. Intenta otra vez.")+gather(turn+1));
 const direct=Boolean(process.env.OPENAI_API_KEY);
 const auth=process.env.OPENAI_API_KEY||process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN;
 const url=direct?"https://api.openai.com/v1/chat/completions":"https://ai-gateway.vercel.sh/v1/chat/completions";
 try{
  const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+auth},
   body:JSON.stringify({
    model:direct?(process.env.OPENAI_MODEL||"gpt-4.1-mini"):"openai/"+(process.env.OPENAI_MODEL||"gpt-4.1-mini"),
    temperature:0,max_tokens:220,response_format:{type:"json_object"},
    messages:[{role:"system",content:"You translate Spanish spoken by an adult into natural, precise US English. Return ONLY JSON with key 'translation'. Translate faithfully; no advice, answers, opinions, omissions, additional content, names changes, rounding or changes to any numbers, quantities, prices or currencies. Convert number words into digits when the source is numerical. Do not invent missing words."},{role:"user",content:original}]
   }),signal:AbortSignal.timeout(4100)
  });
  if(!response.ok){console.error("Smart Job pilot translation HTTP",response.status);return twiml(say("No pude traducir. Intenta de nuevo.")+gather(turn+1));}
  const data=await response.json(),obj=JSON.parse(data.choices?.[0]?.message?.content||"{}");
  const translated=String(obj.translation||"").trim().slice(0,550);
  if(!translated||compareNumbers(original,translated)){
   return twiml(say("No pude verificar las cantidades. Repite esa frase.")+gather(turn+1));
  }
  const encrypted=sealAudio(translated);
  return twiml('<Play>'+PILOT_BASE+'/api/twilio/audio?token='+encrypted+'</Play>'+gather(turn+1));
 }catch(e){
  console.error("Smart Job pilot translation error",e instanceof Error?e.name:"unknown");
  return twiml(say("Hubo un problema al traducir. Inténtalo otra vez.")+gather(turn+1));
 }
}
