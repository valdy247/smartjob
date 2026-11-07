import { NextRequest,NextResponse } from "next/server";
import { authenticatedUser, consumeCredit } from "@/lib/auth-server";
export const runtime = "nodejs";
export async function POST(req:NextRequest){
  if(!await authenticatedUser(req))return NextResponse.json({error:"Inicia sesión."},{status:401});
  const key=process.env.ELEVENLABS_API_KEY;
  if(!key)return NextResponse.json({error:"ElevenLabs no está configurado."},{status:503});
  try {
    const data=await req.json();
    const text=String(data.text||"").slice(0,1300);
    const lang=data.language==="en"?"en":"es";
    const voice=lang==="en"?process.env.ELEVENLABS_VOICE_EN:process.env.ELEVENLABS_VOICE_ES;
    if(!voice) return NextResponse.json({error:"Configura el ID de voz para "+lang+" en Vercel."},{status:503});
    if(!text.trim())return NextResponse.json({error:"Texto vacío."},{status:400});
    if(!await consumeCredit(req,"voice"))return NextResponse.json({error:"Límite de audio diario alcanzado o acceso denegado."},{status:429});
    const r=await fetch("https://api.elevenlabs.io/v1/text-to-speech/"+encodeURIComponent(voice),{
      method:"POST",headers:{"xi-api-key":key,"Content-Type":"application/json","Accept":"audio/mpeg"},
      body:JSON.stringify({text,model_id:process.env.ELEVENLABS_TTS_MODEL||"eleven_flash_v2_5",
        voice_settings:{stability:0.55,similarity_boost:0.75}}),signal:AbortSignal.timeout(25000)
    });
    if(!r.ok){console.error("Eleven TTS",r.status);return NextResponse.json({error:"No fue posible generar la voz."},{status:502});}
    return new NextResponse(await r.arrayBuffer(),{headers:{"Content-Type":"audio/mpeg","Cache-Control":"no-store"}});
  } catch{return NextResponse.json({error:"Error al generar audio."},{status:500});}
}
