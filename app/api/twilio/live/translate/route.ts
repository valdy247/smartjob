import {createHmac,timingSafeEqual} from "node:crypto";
import {NextRequest,NextResponse} from "next/server";
import {compareNumbers} from "@/lib/qa";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const langs=["en-US","es-ES"] as const;
const fail=(reason:string,status:number)=>NextResponse.json({error:reason},
  {status,headers:{"Cache-Control":"no-store"}});

// This endpoint is NOT public translation access. Only the authenticated
// Render ConversationRelay bridge may spend OpenAI tokens for a paid call.
export async function POST(req:NextRequest){
  const secret=process.env.TWILIO_AUTH_TOKEN||"";
  const stamp=req.headers.get("x-smartjob-timestamp")||"";
  const sig=req.headers.get("x-smartjob-signature")||"";
  if(!secret||!/^1\d{9}$/.test(stamp)||Math.abs(Date.now()/1000-Number(stamp))>30||
     !/^[a-f\d]{64}$/i.test(sig))return fail("unauthorized",403);
  const body=await req.text();
  if(body.length>3000)return fail("too_large",413);
  const expected=createHmac("sha256",secret).update("vmv-conversationrelay-translate-v1\n"+
    stamp+"\n"+body).digest();
  const received=Buffer.from(sig,"hex");
  if(received.length!==expected.length||!timingSafeEqual(received,expected))
    return fail("unauthorized",403);
  let item:{original?:unknown;sourceLanguage?:unknown;targetLanguage?:unknown};
  try{item=JSON.parse(body);}catch{return fail("invalid_json",400);}
  if(typeof item.original!=="string"||!item.original.trim()||
     item.original.length>500||!langs.includes(item.sourceLanguage as "en-US"|"es-ES")||
     !langs.includes(item.targetLanguage as "en-US"|"es-ES")||
     item.sourceLanguage===item.targetLanguage)return fail("invalid_input",400);
  // Prefer direct OpenAI when configured; otherwise use Vercel AI Gateway's
  // project-scoped OIDC token (the original working translation path).
  const direct=/^sk-/.test(process.env.OPENAI_API_KEY||"");
  const auth=direct?process.env.OPENAI_API_KEY:
    (process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN);
  if(!auth)return fail("translation_not_configured",503);
  const source=item.sourceLanguage==="en-US"?"English":"Spanish";
  const target=item.targetLanguage==="en-US"?"English":"Spanish";
  try{
    const res=await fetch(direct?"https://api.openai.com/v1/chat/completions":
      "https://ai-gateway.vercel.sh/v1/chat/completions",{
      method:"POST",
      headers:{"Content-Type":"application/json","Authorization":"Bearer "+auth},
      body:JSON.stringify({model:direct?"gpt-4.1-mini":"openai/gpt-4.1-mini",temperature:0,max_tokens:260,
        response_format:{type:"json_object"},
        messages:[
          {role:"system",content:"You are a professional live telephone interpreter. Translate accurately from "+
            source+" into "+target+". Respond ONLY with a JSON object containing a string 'translation'."+
            " Never answer the question yourself or invent facts. Preserve names, prices, numbers,"+
            " medical or allergy warnings, measurements, dates, times and meaning."+
            " Keep the translated expression short and natural."},
          {role:"user",content:item.original}
        ]}),
      signal:AbortSignal.timeout(6500),cache:"no-store"
    });
    if(!res.ok){console.error("VMV translation provider HTTP",res.status);return fail("model_unavailable",502);}
    const value=(await res.json()).choices?.[0]?.message?.content;
    let parsed:{translation?:unknown};
    try{parsed=JSON.parse(String(value||"{}"));}catch{return fail("translation_invalid",422);}
    const translated=parsed.translation;
    if(typeof translated!=="string"||!translated.trim()||translated.length>700||
       compareNumbers(item.original,translated))return fail("translation_invalid",422);
    return NextResponse.json({translation:translated.trim()},
      {headers:{"Cache-Control":"no-store"}});
  }catch(err){
    console.error("VMV translation request failed",err instanceof Error?err.name:"unknown");
    return fail("model_failed",502);
  }
}
