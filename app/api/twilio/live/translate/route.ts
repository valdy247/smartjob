import { createHmac,timingSafeEqual } from "node:crypto";
import { NextRequest,NextResponse } from "next/server";
import { compareNumbers } from "@/lib/qa";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(req:NextRequest){
 const key=process.env.TWILIO_AUTH_TOKEN;
 const stamp=req.headers.get("x-smartjob-timestamp")||"";
 const sig=req.headers.get("x-smartjob-signature")||"";
 if(!key||!/^1[0-9]{9}$/.test(stamp)||Math.abs(Date.now()/1000-Number(stamp))>30||!/^[a-f0-9]{64}$/.test(sig))return NextResponse.json({error:"unauthorized"},{status:403});
 const body=await req.text();
 if(body.length>2400)return NextResponse.json({error:"too_large"},{status:413});
 const digest=createHmac("sha256",key).update("smartjob-bridge-v1\n"+stamp+"\n"+body).digest();
 if(!timingSafeEqual(digest,Buffer.from(sig,"hex")))return NextResponse.json({error:"unauthorized"},{status:403});
 let item:{original?:unknown;role?:unknown};
 try{item=JSON.parse(body);}catch{return NextResponse.json({error:"invalid_json"},{status:400});}
 if((item.role!=="customer"&&item.role!=="professional")||typeof item.original!=="string"||item.original.length>400||!item.original.trim()){
  return NextResponse.json({error:"invalid_input"},{status:400});
 }
 const direct=Boolean(process.env.OPENAI_API_KEY);
 const auth=process.env.OPENAI_API_KEY||process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN||req.headers.get("x-vercel-oidc-token");
 if(!auth)return NextResponse.json({error:"translation_not_configured"},{status:503});
 const source=item.role==="customer"?"English":"Spanish";
 const target=item.role==="customer"?"Spanish":"English";
 try{
  const response=await fetch(direct?"https://api.openai.com/v1/chat/completions":"https://ai-gateway.vercel.sh/v1/chat/completions",{
   method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+auth},
   body:JSON.stringify({model:direct?(process.env.OPENAI_MODEL||"gpt-4.1-mini"):"openai/"+(process.env.OPENAI_MODEL||"gpt-4.1-mini"),
    temperature:0,max_tokens:220,response_format:{type:"json_object"},
    messages:[{role:"system",content:"You are a professional phone interpreter for a bakery. Translate faithfully from "+source+" to "+target+". Return ONLY a JSON object with key 'translation'. Preserve names, flavors, allergies, prices, amounts, intent and questions. Never answer a question, omit, or add facts. Use concise natural speech."},{role:"user",content:item.original}]
   }),signal:AbortSignal.timeout(5500),cache:"no-store"
  });
  if(!response.ok){console.error("Smart Job live translation HTTP",response.status);return NextResponse.json({error:"model_unavailable"},{status:502});}
  const data=await response.json();
  const value=JSON.parse(data.choices?.[0]?.message?.content||"{}")?.translation;
  if(typeof value!=="string"||!value.trim()||value.length>600||compareNumbers(item.original,value)){
   return NextResponse.json({error:"translation_invalid"},{status:422});
  }
  return NextResponse.json({translation:value.trim()},{headers:{"Cache-Control":"no-store"}});
 }catch(e){
  console.error("Smart Job live translation failed",e instanceof Error?e.name:"unknown");
  return NextResponse.json({error:"model_failed"},{status:502});
 }
}
