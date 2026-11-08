import { NextRequest,NextResponse } from "next/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export function GET(req:NextRequest){
 const en=process.env.SMARTJOB_DUO_EN_PHONE||"";
 const es=process.env.SMARTJOB_DUO_ES_PHONE||"";
 const valid=(s:string)=>/^\+[1-9]\d{7,14}$/.test(s);
 const status={
  englishPhone:valid(en),
  spanishPhone:valid(es),
  distinct:valid(en)&&valid(es)&&en!==es,
  twilio:Boolean(process.env.TWILIO_AUTH_TOKEN&&process.env.TWILIO_NUMBER),
  translation:Boolean(process.env.OPENAI_API_KEY||process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN||req.headers.get("x-vercel-oidc-token")),
 };
 const ready=Object.values(status).every(Boolean);
 return NextResponse.json({ready,checks:status,mode:"two-inbound-call-legs-turn-based",webhook:"https://smartjob-xi.vercel.app/api/twilio/duo"},{headers:{"Cache-Control":"no-store"}});
}
