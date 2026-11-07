import { NextRequest, NextResponse } from "next/server";
import { authenticatedUser } from "@/lib/auth-server";
export const runtime = "nodejs";
export async function POST(req:NextRequest) {
  if (!await authenticatedUser(req)) return NextResponse.json({error:"Inicia sesión."},{status:401});
  if (!process.env.ELEVENLABS_API_KEY) return NextResponse.json({error:"ElevenLabs aún no está conectado."},{status:503});
  try {
    const form=await req.formData(), file=form.get("audio");
    if (!(file instanceof Blob) || file.size===0 || file.size>10_000_000) return NextResponse.json({error:"Audio inválido o demasiado grande."},{status:400});
    const forward=new FormData();
    forward.append("model_id","scribe_v2");
    forward.append("file",file,"audio.webm");
    const r=await fetch("https://api.elevenlabs.io/v1/speech-to-text",{
      method:"POST", headers:{"xi-api-key":process.env.ELEVENLABS_API_KEY},body:forward,signal:AbortSignal.timeout(30000)
    });
    if(!r.ok) {console.error("Eleven STT",r.status);return NextResponse.json({error:"No se pudo reconocer el audio. Inténtalo de nuevo."},{status:502});}
    const data=await r.json();
    return NextResponse.json({text:String(data.text||"").trim(),language:data.language_code||null});
  } catch {return NextResponse.json({error:"Error al transcribir audio."},{status:500});}
}
