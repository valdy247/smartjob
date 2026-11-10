import {NextResponse} from "next/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
// The former ConversationRelay / GPT-4.1 mini request-per-utterance pipeline
// is retired. The private Realtime pilot translates directly on the secure
// audio worker; no Vercel text-translation endpoint is permitted to spend.
export async function POST(){
 return NextResponse.json({error:"legacy_translation_retired",engine:"openai-realtime-translate"},
  {status:410,headers:{"Cache-Control":"no-store"}});
}
