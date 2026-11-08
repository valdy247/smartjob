import { NextResponse } from "next/server";
import { hasPilotConfiguration,PILOT_BASE } from "@/lib/twilio-pilot";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export function GET(){
 return NextResponse.json({
  configured:hasPilotConfiguration(),
  twilio:Boolean(process.env.TWILIO_AUTH_TOKEN),
  elevenlabs:Boolean(process.env.ELEVENLABS_API_KEY),
  translation:Boolean(process.env.OPENAI_API_KEY||process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN),
  webhook:PILOT_BASE+"/api/twilio/voice",
  mode:"single-caller-spanish-to-english-voice-translation-pilot",
  twoParty:false
 },{headers:{"Cache-Control":"no-store"}});
}
