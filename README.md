# Smart Job

**Tu idioma. Tu trabajo. Sin límites.**

Next.js 16 + React 19 + Supabase Auth/RLS + OpenAI interpretation/assistant + ElevenLabs voice. Mobile-first responsive web MVP, ready for Vercel.

## Product

**Smart Job** opens with an animated branded splash, then a secure signup/login/reset-password flow. Onboarding captures first name, last name, phone, occupation, location, professional languages, and the name of the assistant (e.g., Juan).

Once authenticated, the product has two primary tabs:

1. **Traductor Live**: a two-person in-room interpreter and a private professional assistant. User taps mic to start and taps to stop (push-to-talk); no fake real-time simultaneous audio. Test via text entry as well. Professional can say "Juan, dile al cliente que cobro $150 más materiales", and the customer hears a natural translation; "Juan, ¿cuánto crees que cobre por esta puerta?" stays a private advisory message. A customer reply is interpreted for the professional. Conversation history stays only in React memory for the session, clearing on exit. Natural TTS from ElevenLabs when configured, or explicitly degraded browser speech synthesis.
2. **Llamadas**: customer-facing concept and account-specific phone configuration. Phone audio-bridge service is **not yet live**; does not intercept the native phone app, activate call forwarding, or simulate a phone connection. A webhook responds with not-configured notice for accidental use.

## Project & security

Supabase instance is *temporarily shared with other applications*. This project only owns:
- \`public.smartjob_profiles\`
- \`public.smartjob_contexts\`
- \`public.smartjob_call_settings\`

Each has row-level security for authenticated owners, with \`auth.uid()\` checks. Nothing changes other apps' tables. Supabase Auth identity pool is shared (later move to a dedicated project). The browser uses only a **publishable** key. Server calls verify bearer tokens with Supabase getUser before using LLM or voice APIs. Never expose OpenAI or ElevenLabs API keys in a public environment variable. Warning: No production-grade distributed abuse protection yet. Add per-user quotas, billing and auditing prior to public launch.

### Environment variables

Copy \`.env.example\` to \`.env.local\`, configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (publishable, safe for the client).

Server secrets:
- OPENAI_API_KEY; OPENAI_MODEL (defaults gpt-4.1-mini)
- ELEVENLABS_API_KEY
- ELEVENLABS_VOICE_ES, ELEVENLABS_VOICE_EN (voice IDs)
- ELEVENLABS_TTS_MODEL (defaults eleven_flash_v2_5; no claim to be using Eleven v4 Turbo streaming)

Twilio fields are placeholders; the bidirectional media bridge is not built. Don't point customer lines at the Twilio webhook before implementing the phone bridge.

### Supabase Auth settings

On the reused Supabase project, **allowlist your Vercel preview / production URL** in Authentication → URL Configuration → Redirect URLs, while preserving existing web apps. Do not replace the Site URL if that would break another app. Email confirmation is controlled by the existing shared auth project and should remain enabled. Recover-password links use current origin.

### Translate & voice

1. Browser MediaRecorder records one speaker, microphone permission requested after explicit consent.
2. POST /api/voice/transcribe sends audio to ElevenLabs **Scribe v2** batch STT, not a streaming websocket. Latency will include recording, transcription, the LLM, and TTS.
3. POST /api/assistant uses a structured JSON prompt (professional vs customer), user job context and recent conversation. It can give private professional advice or relay to the client. Basic number QA blocks relayed speech when numerals differ; human confirmation is available.
4. POST /api/voice/speak invokes ElevenLabs Flash v2.5, configured voice IDs. If voice generation is unavailable the app uses **browser speech synthesis**, not ElevenLabs, and must be treated as fallback.
5. App keeps recent turns in memory only. Job context is saved under RLS. Third parties receive speech/text when consented; users must inform the other speaker.

**Caution:** AI can mishear numbers, voices, names, prices, units or instructions. Professional advice is conditional, not a licensed trade inspection or price quote. Emergency/safety-critical instructions require confirmation.

## Local testing

\`\`\`bash
npm install
npm run typecheck
npm run build
npm run dev
\`\`\`

Deploy from GitHub \`valdy247/smartjob\` to Vercel. Configure environment variables in Vercel Project Settings; redeploy if they changed. Do not enable phone routes as a production service until a dedicated Twilio media relay is running.

## Current limitations

- Voice capture uses push-to-talk and batch STT; not truly simultaneous streaming.
- No live phone bridging or Twilio number procurement.
- No image-based door inspection or verified local labor-rate feed.
- No distributed request rate limits or per-user AI budget yet.
- MVP has 2 modes, no billing, no production monitoring.
