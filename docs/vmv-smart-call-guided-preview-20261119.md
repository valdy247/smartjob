# VMV Smart Call guided setup — 19 Nov 2026

This implementation is on **feat/vmv-smart-call-control-center** only. Do NOT promote to production without signed inbound-call testing and owner approval.

## Wizard
- Business selection and existing line.
- The existing line is the only immediately configurable route.
- Existing/new alternative numbers now open an owner-scoped request form. Existing numbers require ownership verification; new US numbers may be searched read-only from Twilio when a verified pilot account and credentials are available. Selecting a number is not a purchase or a reservation. Requests are recorded as pending, never activated.
- Four customer-contact modes: AI-first, human-first then AI when a verified forwarding destination exists, translation-only, or direct human-only (no AI/translation credits).
- Principal agent assignment switch, in-wizard readiness and explicit AI disclosure approval; never creates another agent.
- Owner-defined Spanish/English greetings, DTMF digits, post-selection messages and schedule.
- Curated ElevenLabs voice samples in Spanish and English for all plan levels during testing. Voice IDs validated server-side. Preview uses Twilio's default voice until ElevenLabs Say compatibility is explicitly armed.
- Simulate a day/time and menu key without initiating calls. Final owner review uses optimistic revision guard.
- Video Generator: entry page now offers Generate video and History. Product selection is opt-in.

## Database
- `vmv_smart_call_menu_20261119`: owner-IVR menu_config JSONB on existing call-settings row, backward-compatible default, RLS retained.
- `vmv_smart_call_line_requests_20261119`: owner-scoped and business-scoped line request table, INSERT/SELECT only under RLS, no provider mutations.
- `vmv_smart_call_direct_only_20261119`: permits owner direct-only policy; validation requires direct menu.
- Existing Twilio phone-number route, usage ledger, credits, phone choices and production settings are untouched.

## Twilio routing
- Only the existing signed `/api/vmv/ai-agents/test-number` Preview pilot was extended.
- Requires `VERCEL_ENV=preview`, exact owner match to `VMV_AI_TEST_OWNER_ID`, `VMV_AI_VOICE_PILOT_ENABLED=true`, the previously recorded original webhook and a valid HMAC.
- **NEW additional flag: `VMV_SMART_CALL_GUIDED_IVR_ENABLED=true`** is required before the new menu is used. It is **NOT set** by this change.
- Once armed, 1 (configurable) → direct iOS phone call via the existing national-minute claim with NO translation/agent credits. 2 → signed redirect into established Smart Call English translation. 3 → the verified AI phone agent and its existing voice-call quota.
- If a capability is unavailable, it is not announced, and invalid digits do not start a paid AI service.
- The original webhook is preserved. No provider-number VoiceUrl was changed. If the guided flag is absent, the established pilot router remains in effect and direct-only policies fall back to the existing Smart Call webhook.
- `VMV_SMART_CALL_ELEVENLABS_SAY_ENABLED=true` is separately required for Twilio to synthesize selected ElevenLabs voices, since account/voice availability must be verified via real calls. This flag is NOT set.
- Neither flag should be turned on without owner approval, a secure staged environment and an explicit rollback plan.

## Pending operational verification
1. Verify Twilio number webhook, signed POST validation and registered account SID. Ensure the original VoiceUrl, VoiceMethod and fallback are backed up.
2. Confirm Preview can reach the original Smart Call speech/translation route and proof validation, including exactly one receipt/charge for translation and national-minute claims on direct calls.
3. Make controlled calls to each DTMF route (ES direct, EN translated, AI in both languages, no input, invalid input, after-hours, human no-answer) and verify no unwanted provider charges.
4. Listen to both ElevenLabs voices via Twilio `<Say>` before arming voice flag; a public MP3 preview alone doesn't prove provider support.
5. Verify existing/new-number search and requests with an authenticated pilot owner; never purchase a number until a separate, user-visible total cost and explicit authorization are implemented.
6. Confirm no call, recording, order, reservation, or auto-charge was silently created. No end-to-end live call is claimed by compilation tests.

## Rollback
Unset `VMV_SMART_CALL_GUIDED_IVR_ENABLED` and `VMV_SMART_CALL_ELEVENLABS_SAY_ENABLED` (or keep them unset); restore the original Twilio VoiceUrl if it had separately been changed. Recheck direct calls and translation on original Smart Call. Do not delete shared data or other service routes.
