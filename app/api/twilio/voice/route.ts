import { NextResponse } from "next/server";
// Phone media bridging is NOT implemented in the web MVP.
// Never silently forward an untranslated call or claim the translation is active.
export const runtime = "nodejs";
export async function POST() {
  const message = process.env.TWILIO_NUMBER
    ? "The Smart Job translation line is not active yet. Please contact the professional directly."
    : "Smart Job phone translation has not been configured.";
  const escaped = message.replace(/&/g,"&amp;").replace(/</g,"&lt;");
  return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response><Say language="en-US">'+escaped+'</Say><Hangup/></Response>',{
    status:200,headers:{"Content-Type":"text/xml","Cache-Control":"no-store"}
  });
}
