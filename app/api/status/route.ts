import {NextResponse,NextRequest} from "next/server";
import {liveReady} from "@/lib/twilio-live";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export function GET(req:NextRequest){
  return NextResponse.json({
    auth:Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
    ai:Boolean(process.env.OPENAI_API_KEY||process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN||req.headers.get("x-vercel-oidc-token")),
    speech:Boolean(process.env.ELEVENLABS_API_KEY||process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN),
    voices:Boolean(process.env.ELEVENLABS_VOICE_ES&&process.env.ELEVENLABS_VOICE_EN),
    telephone:liveReady(),
    note:"La telefonía puede estar configurada a nivel de servidor sin que exista una línea activa para cada usuario."
  },{headers:{"Cache-Control":"no-store"}});
}
