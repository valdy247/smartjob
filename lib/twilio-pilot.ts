import { createCipheriv,createDecipheriv,createHash,createHmac,randomBytes,timingSafeEqual } from "node:crypto";
import { NextRequest,NextResponse } from "next/server";
export const PILOT_BASE = "https://smartjob-xi.vercel.app";
const XML_HEADERS={"Content-Type":"text/xml; charset=utf-8","Cache-Control":"no-store"};
export function xmlEscape(text:string):string{
 return text.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&apos;");
}
export function twiml(xml:string,status=200):NextResponse {
 return new NextResponse('<?xml version="1.0" encoding="utf-8"?><Response>'+xml+'</Response>',{status,headers:XML_HEADERS});
}
export function say(message:string,locale:"es-ES"|"en-US"="es-ES"):string{
 return '<Say language="'+locale+'">'+xmlEscape(message)+'</Say>';
}
export function gather(turn:number):string{
 if(turn>4)return say("Fin de esta prueba. Gracias por llamar.")+"<Hangup/>";
 return '<Gather input="speech" language="es-US" speechTimeout="auto" timeout="8" method="POST" action="'+PILOT_BASE+'/api/twilio/translate?turn='+turn+'">'+
  (turn===1?say("Habla en español después de este mensaje. Escucharás la traducción en inglés."):say("Otra frase, o cuelga."))+
  '</Gather>'+say("No se escuchó voz. Adiós.")+'<Hangup/>';
}
export async function authenticTwilio(req:NextRequest,expectedTo?:string):Promise<URLSearchParams|null>{
 const token=process.env.TWILIO_AUTH_TOKEN;
 const sig=req.headers.get("x-twilio-signature");
 if(!token||!sig)return null;
 if(req.method!=="GET"&&req.method!=="POST")return null;
 let params:URLSearchParams;
 if(req.method==="GET"){
  // For Twilio GET webhooks, all signed fields are part of the query string.
  params=new URL(req.url).searchParams;
 }else{
  if(!req.headers.get("content-type")?.includes("application/x-www-form-urlencoded"))return null;
  const body=await req.text();
  if(body.length>16000)return null;
  params=new URLSearchParams(body);
 }
 const url=new URL(req.url);
 const base=process.env.TWILIO_WEBHOOK_BASE_URL||PILOT_BASE;
 const signedUrl=new URL(url.pathname+url.search,base).toString();
 let data=signedUrl;
 if(req.method==="POST"){
  const fields=[...new Set(params.keys())].sort();
  for(const field of fields)for(const value of params.getAll(field).sort())data+=field+value;
 }
 const expected=createHmac("sha1",token).update(data).digest();
 let actual:Buffer;try{actual=Buffer.from(sig,"base64");}catch{return null;}
 if(actual.length!==expected.length||!timingSafeEqual(expected,actual))return null;
 const account=process.env.TWILIO_ACCOUNT_SID;
 const number=expectedTo||process.env.TWILIO_NUMBER;
 if(account&&params.get("AccountSid")!==account)return null;
 if(number&&params.get("To")!==number)return null;
 if(!/^CA[0-9a-f]{32}$/i.test(params.get("CallSid")||""))return null;
 return params;
}
function encryptionKey():Buffer{
 const twilio=process.env.TWILIO_AUTH_TOKEN, eleven=process.env.ELEVENLABS_API_KEY;
 if(!twilio||!eleven)throw Error("Missing credentials");
 return createHash("sha256").update("smartjob-pilot-audio-v1:"+twilio+":"+eleven).digest();
}
export function sealAudio(text:string):string{
 const body=JSON.stringify({text:text.slice(0,550),expires:Date.now()+90000});
 const nonce=randomBytes(12),cipher=createCipheriv("aes-256-gcm",encryptionKey(),nonce);
 const encrypted=Buffer.concat([cipher.update(body,"utf8"),cipher.final()]);
 return Buffer.concat([nonce,encrypted,cipher.getAuthTag()]).toString("base64url");
}
export function readAudio(token:string):string|null{
 try{
  if(token.length<40||token.length>2700)return null;
  const input=Buffer.from(token,"base64url");if(input.length<30)return null;
  const nonce=input.subarray(0,12),tag=input.subarray(input.length-16);
  const decipher=createDecipheriv("aes-256-gcm",encryptionKey(),nonce);
  decipher.setAuthTag(tag);
  const raw=Buffer.concat([decipher.update(input.subarray(12,input.length-16)),decipher.final()]).toString("utf8");
  const value=JSON.parse(raw);
  if(typeof value.expires!=="number"||value.expires<Date.now()||value.expires>Date.now()+100000)return null;
  if(typeof value.text!=="string"||value.text.length>550||!value.text.trim())return null;
  return value.text;
 }catch{return null;}
}
export function hasPilotConfiguration(oidcToken?:string|null):boolean{
 return Boolean(process.env.TWILIO_AUTH_TOKEN&&process.env.ELEVENLABS_API_KEY&&(
  process.env.OPENAI_API_KEY||process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN||oidcToken
 ));
}
