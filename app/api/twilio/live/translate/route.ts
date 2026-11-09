import {createHmac,timingSafeEqual} from "node:crypto";
import {NextRequest,NextResponse} from "next/server";
import {compareNumbers} from "@/lib/qa";
export const runtime="nodejs";
export const dynamic="force-dynamic";

type TranslationRequest={original?:unknown;role?:unknown;sourceLanguage?:unknown;stream?:unknown};
const blockedForStreaming=/[$€£%]|\d|(?<![\p{L}\d])(?:alérgic[oa]s?|alergias?|sesenta|setenta|ochenta|noventa|cuarenta|cincuenta|treinta|cientos?|millones?|millions?|hundreds?|date|fecha|tomorrow|mañana|yesterday|ayer|today|hoy|monday|tuesday|wednesday|thursday|friday|saturday|sunday|lunes|martes|miércoles|jueves|viernes|sábado|domingo|january|february|march|april|may|june|july|august|september|october|november|december|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|allerg(?:y|ies|ic|ia|ias)|peanut|nuts?|gluten|milk|dairy|egg|huevo|leche|nuez|cacahuate|maní|precio|price|cost|dollar|dólar|dólares|pesos?|euros?|cent|kilos?|kilograms?|pounds?|libras?|grams?|gramos?|ounces?|onzas?|veinte|twenty|one|two|three|four|five|six|seven|eight|nine|ten|hundred|thousand|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|cien|mil|half|quarter|medio|media|hora|hour|minute|minuto)(?![\p{L}\d])/iu;

function provider(){
  const direct=Boolean(process.env.OPENAI_API_KEY);
  const auth=process.env.OPENAI_API_KEY||process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN;
  return {auth,url:direct?"https://api.openai.com/v1/chat/completions":"https://ai-gateway.vercel.sh/v1/chat/completions",
    model:direct?(process.env.OPENAI_MODEL||"gpt-4.1-mini"):"openai/"+(process.env.OPENAI_MODEL||"gpt-4.1-mini")};
}
const instructions=(role:"customer"|"professional",sourceLanguage?:"en-US"|"es-ES")=>{
  const source=sourceLanguage?(sourceLanguage==="en-US"?"English":"Spanish"):(role==="customer"?"English":"Spanish");
  const target=source==="English"?"Spanish":"English";
  return "You are a precise real-time interpreter for a live phone call. Translate each complete utterance from "+source+" to "+target+
    ". Produce fluent, idiomatic, conversational "+target+" while preserving the speaker's intent, tone, pronouns, tense, questions, names, negatives, uncertainty, prices, numbers, medication and allergy details exactly. "+
    "Translate what was said, not what you think was meant. Never answer the other person or add information. "+
    "Keep the sentence concise and complete; do not translate fragment by fragment. "+
    "Output ONLY the translation without labels, quotes, markdown or explanations.";
};
function streamResponse(work:(emit:(item:Record<string,unknown>)=>void,signal:AbortSignal)=>Promise<void>,signal:AbortSignal){
  const encoder=new TextEncoder();
  const stream=new ReadableStream<Uint8Array>({
    async start(controller){
      let closed=false;
      const emit=(item:Record<string,unknown>)=>{
        if(!closed&&!signal.aborted)controller.enqueue(encoder.encode(JSON.stringify(item)+"\n"));
      };
      try{
        await work(emit,signal);
        if(!signal.aborted)emit({done:true});
      }catch(e){
        // Log a bounded classification, never source speech, translated text or credentials.
        const reason=e instanceof Error?e.message:"unknown";
        const safe=/^(provider_http_\d{3}|provider_limit|provider_line_limit|provider_stream_incomplete|provider_stream_error|provider_invalid_response|translation_quality_check|translation_too_long|translation_unavailable|translation_empty|translation_timeout|AbortError)$/;
        console.error("Smart Job translation streaming failed",safe.test(reason)?reason:(e instanceof Error?e.name:"unknown"));
        if(!signal.aborted)emit({error:"translation_unavailable"});
      }finally{
        closed=true;try{controller.close();}catch{}
      }
    }
  });
  return new Response(stream,{status:200,headers:{"Content-Type":"application/x-ndjson; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
}
async function verifiedTranslation(original:string,role:"customer"|"professional",sourceLanguage:"en-US"|"es-ES"|undefined,auth:string,url:string,model:string,signal:AbortSignal){
  const res=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+auth},
    body:JSON.stringify({model,temperature:0,max_tokens:220,response_format:{type:"json_object"},messages:[
      {role:"system",content:instructions(role,sourceLanguage)+" Return a JSON object with exactly one key: translation."},
      {role:"user",content:original}
    ]}),signal,cache:"no-store"});
  if(!res.ok)throw new Error("provider_http_"+res.status);
  const value=JSON.parse((await res.json()).choices?.[0]?.message?.content||"{}")?.translation;
  if(typeof value!=="string"||!value.trim()||value.length>600||compareNumbers(original,value))throw new Error("translation_quality_check");
  return value.trim();
}
async function streamingTranslation(original:string,role:"customer"|"professional",sourceLanguage:"en-US"|"es-ES"|undefined,auth:string,url:string,model:string,signal:AbortSignal,emit:(item:Record<string,unknown>)=>void){
  const res=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+auth},
    body:JSON.stringify({model,stream:true,temperature:0,max_tokens:220,messages:[
      {role:"system",content:instructions(role,sourceLanguage)}, {role:"user",content:original}
    ]}),signal,cache:"no-store"});
  if(!res.ok||!res.body)throw new Error("provider_http_"+res.status);
  const reader=res.body.getReader(),decoder=new TextDecoder();
  let raw="",total="",finished=false,bytes=0;
  try{
    while(!finished){
      const part=await reader.read();
      if(part.done)break;
      bytes+=part.value.byteLength;
      if(bytes>40000)throw new Error("provider_limit");
      raw+=decoder.decode(part.value,{stream:true});
      let p;
      while((p=raw.indexOf("\n"))>=0){
        const line=raw.slice(0,p).trim();raw=raw.slice(p+1);
        if(!line.startsWith("data:"))continue;
        const data=line.slice(5).trim();
        if(data==="[DONE]"){finished=true;break;}
        if(!data)continue;
        const value=JSON.parse(data);
        const token=value.choices?.[0]?.delta?.content;
        if(typeof token==="string"&&token){
          total+=token;
          if(total.length>600)throw new Error("translation_too_long");
          // Buffer until the whole utterance is validated. Sending partial
          // tokens to speech synthesis can distort meaning before the context arrives.
        }
        if(value.error)throw new Error("provider_stream_error");
        if(value.choices?.[0]?.finish_reason==="content_filter")throw new Error("provider_stream_error");
      }
      if(raw.length>2500)throw new Error("provider_line_limit");
    }
    if(!finished||!total.trim())throw new Error("provider_stream_incomplete");
    if(compareNumbers(original,total))throw new Error("translation_quality_check");
    emit({token:total.trim()});
  }finally{reader.releaseLock();}
}
export async function POST(req:NextRequest){
  const secret=process.env.TWILIO_AUTH_TOKEN,stamp=req.headers.get("x-smartjob-timestamp")||"",
    signature=req.headers.get("x-smartjob-signature")||"";
  if(!secret||!/^1\d{9}$/.test(stamp)||Math.abs(Date.now()/1000-Number(stamp))>30||!/^[a-f0-9]{64}$/.test(signature))
    return NextResponse.json({error:"unauthorized"},{status:403});
  const body=await req.text();
  if(body.length>2400)return NextResponse.json({error:"too_large"},{status:413});
  const digest=createHmac("sha256",secret).update("smartjob-bridge-v1\n"+stamp+"\n"+body).digest();
  if(!timingSafeEqual(digest,Buffer.from(signature,"hex")))return NextResponse.json({error:"unauthorized"},{status:403});
  let item:TranslationRequest;
  try{item=JSON.parse(body);}catch{return NextResponse.json({error:"invalid_json"},{status:400});}
  if((item.role!=="customer"&&item.role!=="professional")||typeof item.original!=="string"||item.original.length>400||!item.original.trim())
    return NextResponse.json({error:"invalid_input"},{status:400});
  const {auth:configuredAuth,url,model}=provider();
  const auth=configuredAuth||req.headers.get("x-vercel-oidc-token");
  if(!auth)return NextResponse.json({error:"translation_not_configured"},{status:503});
  const original=item.original,role=item.role;
  if(item.sourceLanguage!==undefined&&!["en-US","es-ES"].includes(String(item.sourceLanguage)))return NextResponse.json({error:"unsupported_language"},{status:400});
  const sourceLanguage=item.sourceLanguage as "en-US"|"es-ES"|undefined;
  if(item.stream===true){
    return streamResponse(async(emit,signal)=>{
      if(blockedForStreaming.test(original)){
        const translation=await verifiedTranslation(original,role,sourceLanguage,auth,url,model,signal);
        emit({token:translation});
      }else {
        try{
          await streamingTranslation(original,role,sourceLanguage,auth,url,model,signal,emit);
        }catch(e){
          // Streaming failures can be transient. Try once without streaming,
          // with the existing number-preservation check, before notifying callers.
          if(signal.aborted)throw e;
          const reason=e instanceof Error?e.message:"unknown";
          if(/^provider_http_(400|401|402|403|404|422)$/.test(reason))throw e;
          console.warn("Smart Job streaming fallback",/^(provider_http_\d{3}|provider_stream_incomplete|provider_stream_error|translation_quality_check)$/.test(reason)?reason:"stream_error");
          const translation=await verifiedTranslation(original,role,sourceLanguage,auth,url,model,signal);
          emit({token:translation});
        }
      }
    },req.signal);
  }
  try{
    const translation=await verifiedTranslation(original,role,sourceLanguage,auth,url,model,req.signal);
    return NextResponse.json({translation},{headers:{"Cache-Control":"no-store"}});
  }catch(e){
    console.error("Smart Job live verified translation failed",e instanceof Error?e.name:"unknown");
    return NextResponse.json({error:"model_unavailable"},{status:502});
  }
}
