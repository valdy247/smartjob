# VMV Call — OpenAI Realtime Translate media bridge (private pilot)

This service **replaces Twilio ConversationRelay**, preserving Twilio solely for phone transport and Twilio Voice SDK. Speech recognition, translation and synthesized speech are handled by OpenAI `gpt-realtime-translate`.

## End-to-end incoming call

Caller → VMV Twilio number → Twilio IVR (press **1** for English) → phone routing and quota validation in Vercel Preview → Twilio calls the owner **iOS SDK client** → owner answers → separate `<Connect><Stream>` on each call leg → this WebSocket bridge → **two isolated OpenAI realtime translation sessions** (en→es and es→en) → translated audio sent back to the opposite phone leg.

Normal Spanish calls use the direct Twilio Voice SDK and do not incur OpenAI translation costs.

## Hosting: Render web service

- Repository: `valdy247/smartjob` branch `feat/live-v2-production-foundations` **after the reviewed PR is merged**
- Root: `services/live-bridge`
- Build: `npm install`
- Start: `npm start`
- Health check: `/health`
- Deploy manually to this **existing Render service**; the GitHub push by itself does **not** deploy Render because `autoDeployTrigger: off`.
- Existing `PUBLIC_WS_URL` must match public `wss://<render-host>/relay`.
- Existing `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`.
- **Add secret** `OPENAI_API_KEY` in the Render dashboard (never in GitHub or ChatGPT).
- Set `SMARTJOB_REALTIME_TRANSLATE_ENABLED=true` on Render only when the correct key and updated code are present.
- For first call set `SMARTJOB_MAX_CONCURRENT_CALLS=1` and `SMARTJOB_MAX_CALL_SECONDS=180` (or a smaller per-call cap).
- `/health` returns HTTP 503 when the translation engine is not configured; the Vercel API refuses to create the telephone bridge in this state.

## Vercel Preview test gate (not public billing)

The one test owner is identified **only** by the existing encrypted `SMARTJOB_BILLING_TEST_OWNER_ID`. In the branch-specific Preview environment, configure:
- `SMARTJOB_REALTIME_PILOT_ENABLED=true`
- `SMARTJOB_BILLING_ENFORCEMENT_ENABLED=true`
- `SMARTJOB_STRIPE_MODE=test`
- `SMARTJOB_TEST_CALL_CAP_SECONDS=180`
- `TWILIO_WEBHOOK_BASE_URL` must exactly match the deployed **preview** webhook origin used by Twilio (important for signature validation and callbacks)
- `SMARTJOB_LIVE_WS_URL` is `PUBLIC_WS_URL`.
- `SMARTJOB_IOS_VOICE_ENABLED=true`, `SMARTJOB_MULTI_TENANT_ENABLED=true`, and the iOS Push Credential must match the installed signed iOS build.

Only the whitelisted user with a valid TEST subscription **and a positive VMV minute balance** can make test calls. The incoming-only Twilio Voice SDK token is limited to the authenticated user. Public and production calls remain blocked without a validated Stripe LIVE subscription. Test user minutes are reserved and settled using existing `smartjob_call_sessions` RPCs.

## Twilio number webhook and iPhone

1. In Twilio Console, configure the test Twilio number's **A CALL COMES IN** webhook as HTTP POST to the preview origin `/api/twilio/live/voice`. Do not point it to an old production endpoint.
2. The same Preview origin must be `TWILIO_WEBHOOK_BASE_URL`. Be aware a Vercel deployment URL may change; use a verified stable alias if possible.
3. The test owner's enabled `smartjob_phone_routes` row must match that Twilio number and have `receive_method=ios_app`.
4. Build/sign the Expo app with `EXPO_PUBLIC_SMARTJOB_API=<same Preview origin>` and correct APNs/Twilio credential; install on a physical iPhone. Expo Go cannot run Twilio Voice.
5. Open VMV Call → **Llamadas** → **Conectar iPhone** (verify `CONECTADA`). From another number call the VMV Twilio number → press 1 (English) → accept the incoming call. Speak English on the caller side; the VMV owner should hear Spanish, and reply Spanish to translate to English.
6. Verify first-audio latency, bidirectional clarity, disconnected calls, charging and remaining VMV minutes. Do not advertise production readiness without real tests.

## Security and operational limits

- No AI API key in browser or app; it lives on Render.
- Twilio's signed WebSocket upgrade and signed call route parameters are verified before OpenAI sessions start.
- No caller speech, translation or transcripts are logged/stored by the bridge.
- One concurrent interpreted call and 3-minute hard cap for pilot; no unbounded buffering.
- If either phone leg disconnects, terminate OpenAI sessions and hang up both phone legs.
- The WebSocket service is **stateful and single-instance**. Do not horizontally scale before implementing room affinity/coordination.
- All production paid gates remain fail-closed. Twilio may still charge for number rental/inbound attempts and the owner is responsible for provider-side budgets.
- iOS CallKit PushKit and voice testing need a real device; server unit tests cannot simulate carrier/Apple delivery.

## Tests

Run `node --test services/live-bridge/*.test.mjs`, `npm run typecheck`, and a Next.js build. Review in Preview before enabling the Twilio number webhook.
