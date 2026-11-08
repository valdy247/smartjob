import { NextRequest } from "next/server";
import { authenticTwilio,gather,hasPilotConfiguration,say,twiml } from "@/lib/twilio-pilot";
export const runtime="nodejs";
export const dynamic="force-dynamic";

// Phase 1: safely test one phone calling Smart Job and hearing its
// Spanish-to-English ElevenLabs interpretation in the SAME call.
// It is intentionally not presented as two-party simultaneous interpretation.
export async function POST(req:NextRequest){
 const params=await authenticTwilio(req);
 if(!params)return twiml(say("No autorizado.")+"<Hangup/>",403);
 if(!hasPilotConfiguration(req.headers.get("x-vercel-oidc-token")))return twiml(say("Smart Job aún necesita configurar sus servicios de voz.")+"<Hangup/>");
 return twiml(say("Smart Job. Prueba de traducción telefónica.")+gather(1));
}
