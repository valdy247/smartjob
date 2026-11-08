import { NextRequest } from "next/server";
import { authenticTwilio, PILOT_BASE, say, twiml } from "@/lib/twilio-pilot";
import { compareNumbers } from "@/lib/qa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Trial-safe experimental bridge. Both people must call the Twilio number
// individually. Each leg hears only synthesized translation, not raw audio.
// No audio streams, direct dialing, recordings, conference or persistence.
type Role="en"|"es";
const number=(value:string|undefined)=>/^\+[1-9]\d{7,14}$/.test(value||"")?value!:"";
const escaped=(value:string)=>value.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
const path=PILOT_BASE+"/api/twilio/duo";

function next(role:Role,turn:number,first=false):string {
 if(turn>7)return say(role==="en"?"End of the test. Thank you.":"Fin de la prueba. Gracias.",role==="en"?"en-US":"es-ES")+"<Hangup/>";
 const english=role==="en";
 const start=first
  ? english
   ?"Welcome to Smart Job. For this test, Mayuli will call the same Smart Job number. Speak in English once she has joined. Your English is translated into Spanish. You will hear her responses in English."
   :"Bienvenida a Smart Job. Para esta prueba, la otra persona también llama al número de Smart Job. Habla en español. Escucharás sus mensajes traducidos al español."
  : "";
 const prompt=first?start:"";
 const locale=english?"en-US":"es-ES";
 const speechLocale=english?"en-US":"es-US";
 const action=path+"?mode=speak&role="+role+"&turn="+turn;
 const intro=prompt?say(prompt,locale):"";
 return '<Gather input="speech" language="'+speechLocale+'" speechTimeout="auto" timeout="20" actionOnEmptyResult="true" method="POST" action="'+action+'">'+intro+'</Gather>'+
 say(english?"The test is ending. Please call back if needed.":"La prueba está terminando. Vuelve a llamar si lo necesitas.",locale)+"<Hangup/>";
}
function resultXml(inner:string){return twiml(inner);}
function config() {
 const en=number(process.env.SMARTJOB_DUO_EN_PHONE);
 const es=number(process.env.SMARTJOB_DUO_ES_PHONE);
 const twilio=number(process.env.TWILIO_NUMBER);
 return {en,es,twilio,valid:Boolean(en&&es&&twilio&&en!==es&&twilio!==en&&twilio!==es&&process.env.TWILIO_AUTH_TOKEN)};
}
async function twinCall(account:string,otherFrom:string,ourCallSid:string,twilio:string):Promise<string|null>{
 const auth=process.env.TWILIO_AUTH_TOKEN||"";
 const endpoint=new URL("https://api.twilio.com/2010-04-01/Accounts/"+account+"/Calls.json");
 endpoint.search=new URLSearchParams({To:twilio,Status:"in-progress",PageSize:"20"}).toString();
 const res=await fetch(endpoint,{headers:{Authorization:"Basic "+Buffer.from(account+":"+auth).toString("base64")},signal:AbortSignal.timeout(2000),cache:"no-store"});
 if(!res.ok){console.error("Smart Job duo call lookup HTTP",res.status);return null;}
 const data=await res.json();
 const candidates=(Array.isArray(data.calls)?data.calls:[]).filter(
  (call:{sid?:string;from?:string;to?:string;direction?:string;status?:string})=>
   call.sid!==ourCallSid&&call.from===otherFrom&&call.to===twilio&&call.status==="in-progress"&&
   call.direction==="inbound"
 );
 if(candidates.length!==1)return null;
 const peer=candidates[0].sid;
 return /^CA[0-9a-f]{32}$/i.test(peer)?peer:null;
}
async function translation(original:string,role:Role,oidc:string|null):Promise<string|null>{
 const direct=Boolean(process.env.OPENAI_API_KEY);
 const auth=process.env.OPENAI_API_KEY||process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN||oidc;
 if(!auth)return null;
 const source=role==="en"?"English":"Spanish",target=role==="en"?"Spanish":"English";
 const response=await fetch(direct?"https://api.openai.com/v1/chat/completions":"https://ai-gateway.vercel.sh/v1/chat/completions",{
  method:"POST",headers:{Authorization:"Bearer "+auth,"Content-Type":"application/json"},
  body:JSON.stringify({
   model:direct?(process.env.OPENAI_MODEL||"gpt-4.1-mini"):"openai/"+(process.env.OPENAI_MODEL||"gpt-4.1-mini"),
   temperature:0,max_tokens:240,response_format:{type:"json_object"},
   messages:[
    {role:"system",content:"You are a faithful live phone interpreter. Translate the user's "+source+" spoken text into natural "+target+" for a bakery customer conversation. Answer ONLY valid JSON with key translation. Preserve amounts, prices, names, intentions, units, quantities, flavors, allergens and context. Do not answer a question, explain or embellish."},
    {role:"user",content:original}
   ]
  }),
  signal:AbortSignal.timeout(3200)
 });
 if(!response.ok){console.error("Smart Job duo translate HTTP",response.status);return null;}
 const result=await response.json();
 const targetText=JSON.parse(result.choices?.[0]?.message?.content||"{}").translation;
 if(typeof targetText!=="string"||!targetText.trim()||targetText.length>600||compareNumbers(original,targetText))return null;
 return targetText.trim();
}
async function deliver(account:string,peer:string,translated:string,role:Role,turn:number):Promise<boolean>{
 const other:Role=role==="en"?"es":"en";
 const locale=other==="en"?"en-US":"es-ES";
 const xml='<?xml version="1.0" encoding="UTF-8"?><Response>'+say(translated,locale)+next(other,Math.min(turn+1,7))+'</Response>';
 const post=new URLSearchParams({Twiml:xml});
 const response=await fetch("https://api.twilio.com/2010-04-01/Accounts/"+account+"/Calls/"+peer+".json",{
  method:"POST",
  headers:{"Content-Type":"application/x-www-form-urlencoded",Authorization:"Basic "+Buffer.from(account+":"+(process.env.TWILIO_AUTH_TOKEN||"")).toString("base64")},
  body:post.toString(),signal:AbortSignal.timeout(2300),cache:"no-store"
 });
 if(!response.ok){console.error("Smart Job duo delivery HTTP",response.status);return false;}
 return true;
}
export async function POST(req:NextRequest){
 const modeHint=new URL(req.url).searchParams.get("mode")||"entry";
 console.info("Smart Job duo webhook received",req.method,modeHint);
 const data=await authenticTwilio(req);
 if(!data){
  console.error("Smart Job duo webhook signature/parameters rejected",req.method,modeHint);
  return resultXml(say("Smart Job could not verify this call.","en-US")+"<Hangup/>");
 }
 console.info("Smart Job duo webhook validated",req.method,modeHint);
 const c=config();
 if(!c.valid)return resultXml(say("La prueba entre dos teléfonos todavía no está configurada.")+"<Hangup/>");
 const from=data.get("From")||"";
 const role:Role|null=from===c.en?"en":from===c.es?"es":null;
 if(!role)return resultXml(say("Este número no está autorizado para la prueba.")+"<Hangup/>");
 const account=data.get("AccountSid")||"";
 const callSid=data.get("CallSid")||"";
 if(!/^AC[0-9a-f]{32}$/i.test(account))return resultXml("<Hangup/>");
 const loc=role==="en"?"en-US":"es-ES";
 const mode=new URL(req.url).searchParams.get("mode")||"entry";
 if(mode==="entry")return resultXml(next(role,1,true));
 if(mode!=="speak")return resultXml("<Hangup/>");
 const turn=Number(new URL(req.url).searchParams.get("turn")||"1");
 if(!Number.isInteger(turn)||turn<1||turn>7)return resultXml("<Hangup/>");
 if(new URL(req.url).searchParams.get("role")!==role)return resultXml("<Hangup/>");
 const speech=(data.get("SpeechResult")||"").trim().slice(0,360);
 if(!speech)return resultXml(next(role,turn+1));
 const otherNumber=role==="en"?c.es:c.en;
 try {
  const peer=await twinCall(account,otherNumber,callSid,c.twilio);
  if(!peer)return resultXml(say(role==="en"?"Mayuli is not connected yet. Ask her to call Smart Job.":"El cliente todavía no está conectado. Pídele que llame al número de Smart Job.",loc)+next(role,turn+1));
  const target=await translation(speech,role,req.headers.get("x-vercel-oidc-token"));
  if(!target)return resultXml(say(role==="en"?"The translation failed. Please repeat.":"No pude traducir. Repite tu frase.",loc)+next(role,turn+1));
  const delivered=await deliver(account,peer,target,role,turn);
  if(!delivered)return resultXml(say(role==="en"?"The other phone could not receive the message.":"El otro teléfono no pudo recibir el mensaje.",loc)+next(role,turn+1));
  return resultXml(say(role==="en"?"Sent. Listen for Mayuli's reply.":"Mensaje enviado. Escucha la respuesta del cliente.",loc)+next(role,turn+1));
 }catch(error){
  console.error("Smart Job duo pilot failed",error instanceof Error?error.name:"unknown");
  return resultXml(say(role==="en"?"Temporary issue, please try again.":"Problema temporal. Inténtalo otra vez.",loc)+next(role,turn+1));
 }
}

// Twilio numbers can be configured to deliver the initial Voice webhook via GET.
// Request authentication still validates Twilio's signature over the entire URL.
export async function GET(req:NextRequest){return POST(req);}
