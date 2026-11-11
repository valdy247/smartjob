# VMV CALL — Dual Twilio ConversationRelay translation

This implementation restores the former **two-leg ConversationRelay + GPT-4.1 mini** interpretation architecture. **OpenAI Realtime is not used** for phone translation. One paid incoming telephone call creates two isolated ConversationRelay WebSocket sessions:

1. Mayuli calls the registered Twilio number.
2. The signed Next.js webhook checks active business routing, owner entitlement, translated-minute availability, and Render readiness.
3. Twilio calls the owner through **VMV CALL on iOS (Twilio Voice SDK)**.
4. On answer, Twilio transcribes each person's speech separately; Render translates directly using its server-side OpenAI key; Vercel is not on the translation hot path.
5. GPT-4.1 mini on Render translates en-US ⇄ es-ES, Twilio ElevenLabs TTS speaks the result on the opposite phone leg.
6. Twilio completion callbacks close both legs and call the existing Supabase minutes settlement RPC. Duration and charges require real-call verification.

## GitHub branch

Changes live on `fix/restore-conversationrelay-translation`. Review through a pull request against `feat/live-v2-production-foundations`; **do not switch a live Twilio number or deploy automatically**.

## Render: private live-bridge service

- Root: `services/live-bridge`
- Build: `npm install`
- Start: `npm start`
- Health: `GET /health` — returns `engine:"twilio-conversationrelay"`, HTTP 200 only when explicitly configured.
- `PUBLIC_WS_URL=wss://<your-render-host>/relay` (match the exact signed WebSocket handshake URL)
- `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` (secrets)
- `OPENAI_API_KEY` — existing Render-side OpenAI key, required for GPT-4.1 mini. Never expose it in a browser or GitHub.
- `SMARTJOB_CONVERSATION_RELAY_ENABLED=true` (**new opt-in**)
- `SMARTJOB_MAX_CONCURRENT_CALLS=1` and an appropriate `SMARTJOB_MAX_CALL_SECONDS`
- `SMARTJOB_REALTIME_TRANSLATE_ENABLED` and `SMARTJOB_TRANSLATE_URL` are obsolete; neither is needed for direct translation on Render.

## Vercel preview app

- `SMARTJOB_LIVE_ENABLED=true`
- `SMARTJOB_LIVE_WS_URL` matches Render's `PUBLIC_WS_URL`
- `TWILIO_WEBHOOK_BASE_URL` equals the public, stable Vercel preview origin used to validate Twilio signatures
- `TWILIO_NUMBER`, `TWILIO_AUTH_TOKEN`, `TWILIO_ACCOUNT_SID`
- A Vercel `OPENAI_API_KEY` is **not required** for live phone translation: Render calls OpenAI directly. The legacy signed Vercel endpoint is no longer on the live audio path.
- `SMARTJOB_MULTI_TENANT_ENABLED=true` and working Supabase route/account tables
- `SMARTJOB_IOS_VOICE_ENABLED=true`, matching Twilio iOS Push Credential SID and signed native iOS VMV CALL build
- For **the existing whitelisted test owner only**: `VERCEL_ENV=preview`, `SMARTJOB_REALTIME_PILOT_ENABLED=true` (legacy name for the entitlement gate, **not** the audio engine), `SMARTJOB_BILLING_ENFORCEMENT_ENABLED=true`, `SMARTJOB_STRIPE_MODE=test`, and `SMARTJOB_BILLING_TEST_OWNER_ID`. A valid TEST subscription must have positive translated minutes.
- The existing `SMARTJOB_TEST_SPANISH_TO_ENGLISH=true` pilot switch can reverse the languages for a Spanish-speaking caller; otherwise English callers translate into Spanish for the owner.
- Configure the Twilio number's incoming voice webhook (HTTP POST) to the **matching Preview** `/api/twilio/live/voice`. Check the connected `smartjob_phone_routes` row has `receive_method=ios_app`.

Do not activate public billing with test subscriptions. Production remains fail-closed without verified Stripe LIVE entitlements.

## Safety and functional testing

- No raw audio, speech transcripts, text of translations, keys, or phone numbers are logged by the bridge.
- Both WebSocket legs require valid Twilio signatures and cryptographically signed, bound route parameters; malformed or mismatched setup messages are rejected.
- At most one translation bridge per trial by default. WebSocket backlog is bounded, call duration is limited by Twilio outbound TimeLimit and the paid minutes claimed.
- Both legs are ended if the peer drops, the provider fails or the duration is reached.
- Verify the UI is connected on a real iPhone using TestFlight or a native iOS build; Expo Go is insufficient.
- Mayuli calls → owner answers on VMV CALL → each side hears translated speech in opposite language; test both language directions, 2–15 minute calls, rapid turns, interruptions, owner decline, no answer, and deliberate hangup.
- Verify a call reserves available minutes, consumes the correct rounded number of minutes on a **completed** outbound call, and releases unused minutes. Match DB ledger/call-session records with Twilio CallSid and final `CallDuration`, including duplicate or out-of-order callbacks.
- Run `npm run bridge:test`, `npm run typecheck`, `npm run build` and iOS typecheck. Provider credentials, Twilio onboarding, real calls and exact billing outcomes **cannot** be certified by static tests alone.

**Do not declare 100% working until a real, successful and billed iPhone call passes this checklist.**

## Confirmed 503 incident (2026-11-11 UTC)

A 50-second interpreted call connected both Twilio ConversationRelay legs, recognized 7 utterances but produced 0 translated responses because the Vercel translator returned HTTP 503 (no configured OpenAI/Gateway token). This patch removes the Vercel proxy from the critical path. Render now fails health checks when the existing server-side OpenAI key is missing; provider status errors are logged without recording speech text. The operator must confirm Render health, then complete one consented real iPhone call and reconcile billed minutes.
