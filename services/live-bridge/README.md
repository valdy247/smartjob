# Smart Job Live Bridge (pilot)

Separate Node.js WebSocket server for **two isolated Twilio Conversation Relay legs**. This is experimental; do not use with real customers before testing, consent and operational hardening.

## Hosting

Deploy as an always-running Web Service (for example, Render), not a Vercel Function.

- Repository: `valdy247/smartjob`
- Root directory: `services/live-bridge`
- Build: `npm install`
- Start: `npm start`
- Health: `/health`
- Instance count: 1 (state lives in process memory; no horizontal scaling)

Set these server-side environment variables **only in the hosting provider**:

- `TWILIO_ACCOUNT_SID`: your Twilio account SID
- `TWILIO_AUTH_TOKEN`: your secret Twilio auth token
- `TWILIO_NUMBER`: Smart Job's Twilio number as E.164
- `SMARTJOB_DUO_EN_PHONE`: English-speaking pilot caller number (E.164)
- `SMARTJOB_DUO_ES_PHONE`: Mayuli's Spanish-speaking pilot number (E.164)
- `PUBLIC_WS_URL`: public `wss://YOUR-APP.onrender.com/relay`
- `SMARTJOB_TRANSLATE_URL` (optional): defaults to `https://smartjob-xi.vercel.app/api/twilio/live/translate`
- `PORT` (optional; hosting supplies it)

Never put secrets in repository files or NEXT_PUBLIC variables. The server authenticates Twilio's initial WebSocket upgrade with the exact WSS URL and auth token. Each Conversation Relay `setup` must have a matching account and caller/receiver number.

## Vercel configuration

Separately, in the Smart Job project's Production env vars:

- `SMARTJOB_LIVE_WS_URL`: the same `PUBLIC_WS_URL`
- `SMARTJOB_LIVE_ENABLED`: set to `true` **only after the WebSocket host has been deployed and tested**

The new inbound webhook endpoint is `https://smartjob-xi.vercel.app/api/twilio/live/voice` (HTTP POST). It dials the allowlisted professional number via the Twilio Voice REST API, and both call legs use `<ConversationRelay>` with a shared bridge ID.

**Do not change the existing phone number webhook until testing and validation are complete.**

## Current pilot limitations

This is a single-conversation proof-of-concept, not a finished low-latency interpreter. It uses separate voice transcription/synthesis legs. Translation is performed by the server-side Vercel AI Gateway API route; Twilio handles STT and voice playback. The design intentionally does not mix raw speech; each participant hears the translated synthesized speech. Only one two-person conversation is supported at once. No recordings or transcripts are stored. It has no Redis persistence, production account management, advanced interruption handling, call termination synchronization or billing controls. Test both languages, disconnections, silence, provider failure, content safety and delay before exposing to customers.
