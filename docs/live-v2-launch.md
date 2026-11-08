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


## Bring Your Own Number (BYON): core product requirement

The number displayed to the customer is always the **professional's existing number**. The professional selects a carrier, conditional/all-call forwarding, and an answering channel, then requests setup. Registering a number **does not** prove ownership, route inbound voice, activate any forwarding, or create an invoice.

### Verizon pilot

- Conditional forwarding: dial *71 followed by the 10-digit assigned Smart Job relay number. The Verizon phone continues to ring as usual; only busy/no-answer calls forward after several rings. These calls are translated ONLY if a separate verified recipient answers on Smart Job.
- Full forwarding: dial *72 and the assigned Smart Job relay number. The usual Verizon phone does not ring directly while full forwarding is enabled. The recipient must answer through a second number not forwarded to Smart Job or the upcoming native Smart Job app.
- Cancel forwarding: dial *73 from the Verizon phone.
- Do not tell users to enable forwarding until they receive a unique assigned relay destination, app endpoint/alternate recipient, verified consent and a successful test. Text messages are not redirected by Verizon voice call forwarding.
- Neither mode allows invisible interception/translation of a call already answered in the native Verizon dialer. Native carrier call audio cannot be programmatically replaced by an ordinary web app.

### Provisioning architecture for any supported carrier

1. Sign up and enter the existing public number, carrier, translation pair, preferred mode and receiving channel. Data is stored in smartjob_provisioning_requests (status pending, phone_verified_at null) with RLS. No calls or numbers are purchased.
2. Verify phone control with a short-lived OTP through a managed verify provider (not yet integrated). Reject reuse of a verified public number by a different account.
3. Check carrier supports the requested forwarding behavior; for ordinary wireless, a dedicated Twilio relay number provides reliable per-account routing. Twilio's ForwardedFrom field is carrier-dependent and must not be trusted as an account selector. Avoid sharing one relay number across unrelated accounts without a different verified routing signal.
4. Provision relay number only after charges and consent are approved, then configure carrier forwarding externally. Verify that the forwarding reaches the assigned relay number.
5. Provide a **distinct receiving endpoint**:
   - Initially, a second verified phone number different from the public forwarded phone.
   - Preferred: a native Smart Job mobile VoIP client using Twilio Voice SDK plus iOS PushKit/CallKit and Android call integration, with authenticated per-user identity, push notifications, and background call acceptance. A normal browser tab is insufficient for reliable background reception on mobile.
6. Only enable forwarding and activate the public route once the provider endpoint has passed live-call tests. For voicemail, busy and network failures, provide fallback and rollback without losing normal client calls.
7. Prevent forwarding loops in DB (forwarding_mode != none implies public_number != destination_phone). Never fall back to calling a forwarded number. Persist a distinct original public number, relay number and receiving method.
8. For calls forwarded by the carrier, the Twilio To number is the technical relay number, **not** necessarily the public original number. Keep public_number in the account route. Verify caller ID; carrier forwarding may alter From.
9. SMS stays with the current carrier when only voice is forwarded. Porting to Twilio is a separate explicit process that transfers management of voice and messaging. Twilio hosted messaging alone does not add Twilio Voice to an unported number.
10. Pricing includes an assigned Twilio number, forwarded inbound call, the second app/PSTN call leg, ConversationRelay and AI; present billing and cancellation terms before activation.

**Critical roadmap:** the current translated call handler still dials a verified PSTN destination. Native in-app call acceptance and identity binding are **not yet implemented**; do not enable same-phone forwarding until they are built and tested. A registered user's normal native Verizon phone calls are not silently translated.

### Verification and safety requirements

Phone ownership verification, payment authorization, caller consent, audit events, app receiver availability, rate limiting, per-account use restrictions, and carrier-specific activation testing are all required before self-serve live provisioning. The operator currently approves activation manually. Each new requested connection is explicitly pending until these safeguards exist.
