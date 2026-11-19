import {NextRequest,NextResponse} from "next/server";
import {authenticatedUser} from "@/lib/auth-server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private,no-store"};
const respond=(data:Record<string,unknown>,status=200)=>NextResponse.json(data,{status,headers});
/** Read-only Twilio inventory; never creates a PhoneNumber purchase. */
export async function GET(req:NextRequest){
 const uid=await authenticatedUser(req);
 if(!uid)return respond({error:"Inicia sesión en VMV."},401);
 if(process.env.VERCEL_ENV!=="preview"||process.env.VMV_AI_TEST_OWNER_ID!==uid)
  return respond({error:"La búsqueda de números solo está abierta para el piloto autorizado."},403);
 const area=req.nextUrl.searchParams.get("area")||"";
 if(!/^[2-9][0-9]{2}$/.test(area))return respond({error:"Introduce un código de área de tres dígitos."},400);
 const sid=process.env.TWILIO_ACCOUNT_SID||"";
 const token=process.env.TWILIO_AUTH_TOKEN||"";
 if(!/^AC[0-9a-f]{32}$/i.test(sid)||!token)
  return respond({error:"El proveedor de números todavía no está disponible en este Preview."},503);
 const query=new URLSearchParams({AreaCode:area,VoiceEnabled:"true",PageSize:"8"});
 try{
  const url="https://api.twilio.com/2010-04-01/Accounts/"+sid+
   "/AvailablePhoneNumbers/US/Local.json?"+query;
  const res=await fetch(url,{method:"GET",headers:{
   Authorization:"Basic "+Buffer.from(sid+":"+token).toString("base64")
  },cache:"no-store",signal:AbortSignal.timeout(6500)});
  if(!res.ok){console.warn("[vmv-number-search] provider error",res.status);
   return respond({error:"Twilio no pudo consultar números disponibles ahora mismo."},502);}
  const body=await res.json();
  const numbers=(Array.isArray(body.available_phone_numbers)?body.available_phone_numbers:[])
   .filter((n:Record<string,unknown>)=>typeof n.phone_number==="string"&&/^\+1\d{10}$/.test(n.phone_number))
   .slice(0,8).map((n:Record<string,unknown>)=>({
    phone:String(n.phone_number),location:String(n.locality||"").slice(0,70),
    region:String(n.region||"").slice(0,40)}));
  return respond({numbers,notice:"Disponibilidad momentánea, no reservada. Costos y tasas pendientes de confirmación."});
 }catch{return respond({error:"El proveedor no respondió. Intenta de nuevo más tarde."},503);}
}
