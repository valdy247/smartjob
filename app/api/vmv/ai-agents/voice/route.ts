import type {NextRequest} from "next/server";
import {handleAiVoice} from "@/lib/vmv-ai-agents/voice-runtime";

export const runtime="nodejs";
export const dynamic="force-dynamic";

// Voice is isolated from Smart Call. No webhook or provider routing changes here.
export async function POST(request:NextRequest){
 return handleAiVoice(request);
}
