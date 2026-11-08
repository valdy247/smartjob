import { NextResponse } from "next/server";
import { liveReady } from "@/lib/twilio-live";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return NextResponse.json({
    ready: liveReady(),
    mode: "two-leg-live-translation-pilot",
    pilotOnly: true,
    twilioWebhookChanged: false,
    next: liveReady() ? "Verify Render PUBLIC_WS_URL before changing the Twilio inbound webhook" : "Complete production configuration",
  }, { headers: { "Cache-Control": "no-store" } });
}
