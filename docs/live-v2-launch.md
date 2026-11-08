# Smart Job Live v2 — Operating and launch guide

## Implemented on this branch

- Two independent Twilio ConversationRelay phone legs; raw speech is not passed between callers.
- English-Spanish interpretation. Low-risk phrases stream immediately; prices, quantities, measurements and allergy information are translated and checked before speech.
- Interruption detection and cancellation. Per-speaker bounded queues avoid dropping rapid phrases.
- Twilio echo filtering, reconnection, signed WebSocket upgrades, and signed tenant context.
- Authenticated end-of-call callbacks terminate the other leg; ten-minute limits and status logging.
- Owner-private number assignments and call history using Supabase RLS; tenant dialing is feature-gated.

## Flow

Customer calls an assigned Twilio number -> Vercel verifies Twilio signature and checks a route -> Twilio dials the verified professional -> each leg receives its own ConversationRelay WebSocket to Render -> Render requests authorized translation from Vercel -> Twilio synthesizes speech in the recipient's language.

Vercel sends a signed completion event to Render when a call finishes. No recordings or conversation transcripts are saved by Smart Job.

## Required configuration

Production Vercel (server-only):
- SMARTJOB_LIVE_ENABLED=true after checking the working pilot.
- SMARTJOB_LIVE_WS_URL=wss://smartjob-sfv5.onrender.com/relay
- SMARTJOB_MULTI_TENANT_ENABLED=false until customer phone number provisioning is ready.
- SUPABASE_SECRET_KEY is a server-only secret for the existing Smart Job Supabase project. **Never use NEXT_PUBLIC_ for this key or paste it into chats.** Without it, new tenant routing is intentionally off.
- SMARTJOB_MAX_CALL_SECONDS=600
- Existing TWILIO_AUTH_TOKEN and pilot phone allowlist remain in place.

Render (root services/live-bridge):
- PUBLIC_WS_URL=wss://smartjob-sfv5.onrender.com/relay
- Existing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_NUMBER, and two pilot phone numbers.
- SMARTJOB_MAX_CALL_SECONDS=600, SMARTJOB_MAX_CONCURRENT_CALLS=1 for the pilot.
- One instance only: rooms are stored in local memory, so do not horizontally scale without shared session storage.

## Database and user access

The file at supabase/sql/smartjob_live_v2.sql defines smartjob_phone_routes and smartjob_call_sessions. These tables are also present in the existing Smart Job Supabase project. RLS allows authenticated users to read their own records only. The browser cannot activate or modify phone assignments or insert call sessions.

## Provisioning a customer

1. Verify the user's identity, consent for AI-powered call interpretation, and control of their destination phone.
2. Obtain authorization for the monthly cost before purchasing or assigning a dedicated Twilio number. The customer cannot activate numbers by signing up.
3. Configure the dedicated Twilio number to POST https://smartjob-xi.vercel.app/api/twilio/live/voice
4. Create a server-side route record for the user's UUID, assigned Twilio E.164 number, verified destination number, and supported language pair; initially enabled=false.
5. Test the number and ensure all call expenses are covered. Only then set enabled=true and use the SMARTJOB_MULTI_TENANT_ENABLED gate.
6. The pilot is still allowlisted separately. The app does not yet process subscription payments or purchase numbers.

## Validation before a customer-facing launch

- Verify unit tests, Vercel preview build and a Render version:2 health response.
- Test English -> Spanish and Spanish -> English, rapid phrases and interruptions in both directions.
- Test exact quantities, dates, allergies, names and prices.
- Hang up each phone first, separately, and verify Twilio reports both legs terminated.
- Test failed translation provider, busy/voicemail/no-answer and invalid WebSocket signatures.
- Check daily/concurrent limits, private history isolation and no stored transcripts.
- Measure real call costs, relay minutes, model usage and end-to-end latency.
- Free Render can sleep for 50+ seconds; use an always-on host with monitoring before real users.
- Confirm legal consent notices, privacy terms and billing terms. This product must not be marketed for emergency calls.

## Rollback

Keep the proven pilot in production during review. Restore the last working Render commit and the old Twilio webhook if the new relay fails. Set SMARTJOB_MULTI_TENANT_ENABLED=false to turn off new client routing without disabling the known pilot.
