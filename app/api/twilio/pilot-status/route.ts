import { NextResponse,NextRequest } from "next/server";
import { hasPilotConfiguration,PILOT_BASE } from "@/lib/twilio-pilot";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export function GET(req:NextRequest){
 return NextResponse.json({
  configured:hasPilotConfiguration(req.headers.get("x-vercel-oidc-token")),
  twilio:Boolean(process.env.TWILIO_AUTH_TOKEN),
  elevenlabs:Boolean(process.env.ELEVENLABS_API_KEY),
  translation:Boolean(process.env.OPENAI_API_KEY||process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN||req.headers.get("x-vercel-oidc-token")),
  webhook:PILOT_BASE+"/api/twilio/voice",
  mode:"single-caller-spanish-to-english-voice-translation-pilot",
  twoParty:false
 },{headers:{"Cache-Control":"no-store"}});
}
