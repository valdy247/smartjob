import { NextRequest, NextResponse } from "next/server";
import { authenticatedUser, consumeCredit } from "@/lib/auth-server";
import { assistantPrompt, supportedLanguages } from "@/lib/ai-prompt";
import { compareNumbers } from "@/lib/qa";
import type { JobContext, Actor, AiTurn } from "@/lib/types";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  const userId = await authenticatedUser(req);
  if (!userId) return NextResponse.json({ error: "Sesión inválida. Inicia sesión otra vez." }, { status: 401 });
  const gatewayToken = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || req.headers.get("x-vercel-oidc-token");
  const tokenForModel = process.env.OPENAI_API_KEY || gatewayToken;
  const throughGateway = !process.env.OPENAI_API_KEY;
  if (!tokenForModel) return NextResponse.json({ error: "No hay proveedor de IA configurado. Activa Vercel AI Gateway u OpenAI." }, { status: 503 });
  try {
    const body = await req.json();
    const text = String(body.text || "").trim().slice(0,2400);
    if (!text) return NextResponse.json({ error: "No hay voz ni texto para procesar." }, { status: 400 });
    if (!await consumeCredit(req,"ai")) return NextResponse.json({error:"Límite de 40 consultas diarias alcanzado o no tienes permiso de uso. Inténtalo mañana."},{status:429});
    const actor: Actor = body.actor === "customer" ? "customer" : "owner";
    const context: JobContext = {
      job_type: String(body.context?.job_type||"").slice(0,100), city:String(body.context?.city||"").slice(0,90),
      state:String(body.context?.state||"").slice(0,90), zip:String(body.context?.zip||"").slice(0,30),
      client_name:String(body.context?.client_name||"").slice(0,80),
      dimensions:String(body.context?.dimensions||"").slice(0,200),
      materials:String(body.context?.materials||"").slice(0,400), details:String(body.context?.details||"").slice(0,1000)
    };
    const recent = Array.isArray(body.history) ? (body.history as AiTurn[]).slice(-6) : [];
    const owner = supportedLanguages[String(body.ownerLanguage)] ? String(body.ownerLanguage) : "es";
    const customer = supportedLanguages[String(body.customerLanguage)] ? String(body.customerLanguage) : "en";
    const prompt = assistantPrompt(actor, String(body.assistantName || "Juan").slice(0,40), owner, customer, context, recent);
    const response = await fetch(throughGateway ? "https://ai-gateway.vercel.sh/v1/chat/completions" : "https://api.openai.com/v1/chat/completions", {
      method:"POST",
      headers:{ "Authorization":"Bearer "+tokenForModel, "Content-Type":"application/json" },
      body: JSON.stringify({
        model: throughGateway ? "openai/" + (process.env.OPENAI_MODEL || "gpt-4.1-mini") : (process.env.OPENAI_MODEL || "gpt-4.1-mini"),
        temperature:0.15, response_format:{type:"json_object"},
        max_tokens:750,
        messages:[{role:"system",content:prompt},{role:"user",content:text}]
      }),
      signal:AbortSignal.timeout(27000)
    });
    if (!response.ok) {console.error("OpenAI HTTP",response.status);return NextResponse.json({error:"No fue posible procesar esta solicitud. Intenta de nuevo."},{status:502});}
    const json = await response.json();
    const content = json.choices?.[0]?.message?.content ?? "{}";
    const result = JSON.parse(content);
    const mode = actor === "customer" ? "interpret" : (["relay","advice"].includes(result.mode) ? result.mode : "advice");
    const language = mode==="relay" ? customer : owner;
    const say = String(result.say || "").trim().slice(0,3000);
    if (!say) throw new Error("empty response");
    const warning = mode==="relay" || mode==="interpret" ? compareNumbers(text,say):null;
    const blocked = Boolean(warning || result.review);
    return NextResponse.json({ mode, say, language, note:String(result.note||"").slice(0,250), warning:warning || (result.review?"Revisa el mensaje antes de reproducir.":null), blocked });
  } catch(e) {console.error("assistant route failed",e instanceof Error?e.message:"unknown");return NextResponse.json({error:"Error al procesar la conversación."},{status:500});}
}
