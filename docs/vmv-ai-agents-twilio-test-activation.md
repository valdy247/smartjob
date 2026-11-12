# AI Agents · Test on the existing Twilio number

Status: **NOT LIVE — do not switch the number yet**.
Only deploy on `feat/vmv-smart-call-control-center` Preview; do not promote to production.

## Completed
- Applied the additive migration `vmv_ai_agents_test_voice_foundation_20261111` to connected Supabase project `wrnlhjujsbigculndivs`: seven dedicated `vmv_ai_*` tables with owner RLS and a 5-call/day, 8-turn, 4-minute test quota. No existing Smart Call schema or data changed.
- Created one draft-purpose, active-in-study agent **Asistente VMV · Prueba** for the sole existing enabled Smart Call phone-route owner (not for other tenants). The agent announces AI identity and does not perform reservations, payments or inventory mutations.
- All Twilio voice and menu handlers remain within `app/api/vmv/ai-agents/` and use `lib/vmv-ai-agents/twilio-test.ts` to verify Twilio HMAC signatures against the **AI-only** `VMV_AI_TEST_BASE_URL`. There are no changes to `/api/twilio/live/voice` or Home.
- Created **branch-scoped Preview** variables `VMV_AI_TEST_OWNER_ID`, `VMV_AI_TEST_BASE_URL`, `VMV_AI_VOICE_PILOT_ENABLED=false`. No production environment variables were changed.

## Still blocked (required before switching Twilio)
1. On the shared branch's Vercel Preview environment, securely provide existing `TWILIO_AUTH_TOKEN`, `TWILIO_ACCOUNT_SID` and `SUPABASE_SECRET_KEY` through Vercel settings, **not in chat or GitHub**. They currently exist only in another preview branch / production as protected values and cannot be cloned by the connected Vercel actions. Do not broaden an unrelated branch's secret scopes.
2. Record and verify the existing Twilio IncomingPhoneNumber voice webhook URL and the `PN...` number SID from the Twilio account before changing anything. Preserve the original webhook in private configuration as `VMV_AI_ORIGINAL_VOICE_WEBHOOK` (Preview, branch-scoped). The number should be in the same Twilio account and already linked to the owner.
3. Confirm the preview URL is accessible publicly to Twilio (deployment protection/bypass, if relevant), and verify a POST request with Twilio HMAC authentication.
4. Insert an explicitly enrolled `vmv_ai_voice_routes` record with the existing phone number, verified `AC...` account SID, verified owner and test agent, explicit approval flags; start with `enabled=false`. Do not invent or hardcode a provider SID.
5. Only after all other checks pass, enable the row, set `VMV_AI_VOICE_PILOT_ENABLED=true` in the shared branch Preview, and redeploy Preview.
6. Switch only that verified test number's **A Call Comes In → Voice Webhook** (POST) to:
`https://smartjob-git-feat-vmv-smart-cal-fcbaa4-valdys-projects-b97fc7a6.vercel.app/api/vmv/ai-agents/test-number`
   The new menu routes **1 → original Smart Call URL**, **2 → AI Agents**; otherwise it uses the original Smart Call URL. If AI routing is not ready, the backend redirects to the original webhook. Do not use the preview's Smart Call handler as an unverified fallback.
7. Test a real inbound call from an authorized test caller, select 2, confirm AI disclosure, short Spanish speech, response latency and safety. Also test 1, no choice, 6th daily call (pilot allows 5 per day), model error and fallback. Check Twilio and Gateway spending after test. Never claim live operation without a successful inbound test.

## Rollback
1. In Twilio, restore exactly the original `VoiceUrl` and `VoiceMethod` (or prior Voice Application SID if applicable).
2. Disable the `vmv_ai_voice_routes` test row.
3. Set Preview `VMV_AI_VOICE_PILOT_ENABLED=false` and redeploy.
4. Validate incoming Smart Call again; compare with original call path.

## Scope and security
- Never expose Twilio token, Supabase secret or AI Gateway credentials in a URL, browser bundle, issue, commit or user-facing log.
- No live purchases, appointment booking, calendar access, personal inventory, call recording or autonomous mutations.
- This is a read-only informational voice agent. All AI voice activity is short-lived and requires an owner-bound test route, Twilio signature validation, server-side daily cap and explicit enablement. Vercel Gateway automatically supplies OIDC in server deployments when available.
- Twilio number settings themselves are **not accessible** from the presently connected apps in ChatGPT; do not assert the number has been switched or call tests have passed. There is no connected Twilio management tool.
