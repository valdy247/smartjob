import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
export const dynamic = "force-dynamic";
export function GET(req:NextRequest) {
  return NextResponse.json({
    auth: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
    ai: Boolean(process.env.OPENAI_API_KEY || process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || req.headers.get("x-vercel-oidc-token")),
    speech: Boolean(process.env.ELEVENLABS_API_KEY),
    voices: Boolean(process.env.ELEVENLABS_VOICE_ES && process.env.ELEVENLABS_VOICE_EN),
    telephone: false,
    note: "Conectar un servidor de audio de telefonía bidireccional antes de habilitar llamadas."
  }, { headers: { "Cache-Control": "no-store" } });
}
