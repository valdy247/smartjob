# VMV CALL — Low-latency translated calls (pilot)

## Purpose
Reduce the approximately five-second post-speech wait reported during bilingual test calls without omitting critical facts.

## Changes
- Prefer Deepgram Flux end-of-turn recognition with confidence 0.8 and a 1.5-second silence ceiling. Existing 800 ms segmentation is available with `SMARTJOB_RELAY_FLUX_ENABLED=false` (Next.js/Vercel).
- OpenAI GPT-4.1 mini streaming text completions for *short, ordinary, low-risk speech*. Start sending complete-word chunks to Twilio ConversationRelay before the model finishes; terminate every cycle with `last:true`.
- Preserve the prior verified, non-streamed JSON translator for numbers, prices, dates, quantities, allergies and other sensitive terms.
- Complete-response fallback if streaming fails before any audio is emitted. If a stream fails after partial audio, close it with a localized repeat request rather than silently hanging.
- At Render startup, verify that the configured OpenAI key actually supports streaming; if not, use only the prior verified translator.
- Log per-turn `queueMs`, `modelMs`, `promptToFirstTextMs` and `promptToLastTextMs`, without user names, phone numbers, spoken content, translations or API keys.

## Disable independently
- Render: `SMARTJOB_RELAY_STREAM_TRANSLATION_ENABLED=false` disables streaming text to speech (requires redeploy).
- Vercel: `SMARTJOB_RELAY_FLUX_ENABLED=false` switches back to the previous 800 ms end-of-turn behaviour (requires redeploy).

## Validation
- Unit tests of segmentation, SSE with arbitrarily fragmented CRLF packets, timeouts, high-risk gating, exact final tokens, interruptions.
- Real WebSocket integration simulation with both authenticated Twilio legs, mocked OpenAI completions and streamed response. This does **not** reproduce real cellular networks or TTS latency.
- Real customer-to-iPhone translated call must be tested before claiming latency improvements. Measure from the **last audible syllable** to the **first audible translated syllable** on both legs; include ordinary phrases and critical numbers and prices.
- Correlate Render's prompt-to-first-text timing with Twilio Voice Insights's `stt_latency`, `first_token_received`, `tts_latency` and `start_of_agent_speech` for bottlenecks outside the application.

**Acceptance target:** clear, complete two-way translation with materially less perceived delay than the five-second baseline and correct billing, not a hard guarantee of one second. Stop or roll back if words get cut off or a voice reply is incomplete.
