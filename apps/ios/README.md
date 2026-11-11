# Smart Job for iPhone — early native receiver

This Expo / React Native app contains a real Twilio Voice SDK integration, but it
is NOT yet provisioned and must not be promoted as a working phone service.

Uses:
- Expo SDK 54, React Native 0.81.5.
- Official Twilio Voice React Native SDK 1.8.1 with the Expo config plugin.
- iOS CallKit and PushKit through Twilio's native integration.
- Supabase email/password session in the iOS Keychain.
- A server-issued, one-hour, incoming-only Twilio access token.
- The live translation bridge in services/live-bridge.

## Build in a test device

Use a physical iPhone. Expo Go will not run the Twilio native module.

1. Set a unique Apple bundle identifier in app.json. The current com.valdy247.smartjob is a candidate, not proof of Apple ownership. Use the exact identifier for Apple Developer certificates.
2. Configure iOS Voice-over-IP Push certificates from Apple Developer (separate sandbox and production credentials) and upload each certificate to Twilio as a Push Credential. Never commit private keys.
3. In the existing Vercel Smart Job project, store these **server-only** values, not in Expo:
   - TWILIO_ACCOUNT_SID (already in the web project)
   - TWILIO_API_KEY_SID (a Twilio API Key SID starting SK)
   - TWILIO_API_KEY_SECRET
   - TWILIO_IOS_PUSH_CREDENTIAL_SID (CR prefix, matching build environment)
   - SUPABASE_SECRET_KEY (the existing Smart Job Supabase project, never public)
   - SMARTJOB_IOS_VOICE_ENABLED=true **only in an isolated staging test**
   - SMARTJOB_MULTI_TENANT_ENABLED=true **only in an isolated staging test**
4. Copy .env.example to .env, fill public Supabase URL/key and the public Smart Job API origin. Do not copy any Twilio or Supabase private keys into the app.
5. On Windows, use **EAS cloud builds**: do not run local iOS `expo prebuild` / Xcode builds. Clone/check out this feature branch, enter `apps/ios`, run `npm install` and `npx expo install expo-dev-client`, then `npx expo install --check`. Log in to Expo (`npx eas-cli login`), initialize the EAS project (`npx eas-cli init`, which sets a real `extra.eas.projectId`), and register the physical test iPhone (`npx eas-cli device:create`). Start a signed cloud build with `npx eas-cli build --platform ios --profile development`; follow the EAS Apple Developer prompts and install using the resulting internal-distribution link. The physical device must be included in its ad hoc provisioning profile. For development use `aps-environment=development` and a Twilio **sandbox** Push Credential. For TestFlight use `aps-environment=production` and a separate production Push Credential. This step requires signing, environment setup, and testing; it is not yet performed.
6. Install the signed development build on Mayuli's iPhone, sign in with her Smart Job account and register the device. If account route is not approved, the app displays that status instead of registering any number.
7. To test the full translated call, an operator must create and verify a route record for Mayuli, set receive_method=ios_app and enabled=true in an isolated test environment, and connect its technical Twilio number. Only after the call endpoint, account limits, and background pushes are proven should Verizon forwarding be enabled.

## Why a unique internal Twilio number is still needed

The public number remains Mayuli's Verizon number. For incoming translation, Verizon forwards the voice leg to a technical Twilio destination assigned to her account. Twilio uses that technical number to select the correct owner, then calls her native Smart Job iPhone identity through VoIP. This avoids redialing the forwarded Verizon number into a loop.

Without forwarding or porting, an ordinary app cannot automatically join a call already answered in the native Verizon phone dialer. The app's call screen runs separately using CallKit.

## Critical test cases

- Correct account identity and route; no registration if the account is unapproved.
- VoIP push while app foreground, background, locked and terminated.
- Accept/reject in native CallKit, and disconnect from app. Verify both Twilio call legs terminate.
- Interrupt English/Spanish utterances, rapid speech, amounts and no-answer timeout.
- Check microphone, Bluetooth, audio route, poor network, token refresh, multiple devices, expired app token, CallKit conflicts.
- Security: different user cannot fetch a token for another user's receiver; no arbitrary app dialing, no customer self-activation, no keys in Expo.
- Verify voice charge, translation latency and call failures. App/Render share one test room by default.
- Never test by enabling Verizon forwarding on a user's only phone until iOS reception is proven in a physical device.

## Related files

- apps/ios/App.tsx — native app
- apps/ios/session.ts — Supabase Keychain auth
- app/api/ios/voice-token/route.ts — authenticated incoming-only Twilio Voice JWT
- app/api/twilio/live/voice/route.ts — calls Twilio client identity for enabled ios_app routes
- app/api/twilio/live/partner/route.ts — verifies receiver identity
- services/live-bridge/server.mjs — signed dual-language relay

## Launch limitations

The iPhone application is source code only. It has not been built, signed, installed or tested on an actual iPhone. Apple VoIP certificate, Push Credentials, user provisioning, and live translation integration validation are required. Android is not implemented in this milestone. Do not switch the existing production Twilio webhook to this staging version without an agreed test plan.

## Call screen (build 9)

The in-call experience is deliberately minimal and familiar: **Silencio**, **Teclado**, **Altavoz**, **Transcripción** and **Finalizar llamada**. The native Twilio Voice SDK controls are wired to real operations:
- Mute/unmute: `Call.mute(boolean)` with the SDK's confirmed return value.
- DTMF keypad: `Call.sendDigits(digit)` during the current call.
- Speaker toggle: `Voice.getAudioDevices()`, then `AudioDevice.select()`. Selection errors are displayed; there is no fake UI switch.
- Tapping Transcripción blurs the active screen and shows a growing chat in the account's owner language: the translated customer speech and the owner's original recognized speech. Opening the panel later fetches earlier turns of that active call.
- Transcript text is **only in Render RAM** for the duration of the paired call, never written to Supabase, audio files or logs. Render clears the buffer when either leg ends. The owner-only proxy validates the Supabase session, pilot account, route and exact outbound CallSid, then signs a 25-second HMAC authorization to the live bridge. Never send the Render secret to iOS.

This feature is **test-owner only** behind `SMARTJOB_BILLING_TEST_OWNER_ID`; it remains unavailable to other tenants. Both participants should be informed that translation includes temporary on-screen text. It is not a saved transcript or recording.

### Acceptance test on a physical iPhone

1. Build and install a signed **0.4.4 (9)** iOS preview from the branch containing the feature. An Expo Go session or JavaScript-only update cannot enable a new `expo-blur` native dependency.
2. Verify PushKit/CallKit delivery; open VMV CALL via the notification, then answer. Keep an eye on the existing Supabase pilot diagnostic events.
3. Silencio on/off: remote caller must stop and resume hearing the owner.
4. Altavoz on/off: verify iPhone acoustic output changes and status reflects actual selected device.
5. Teclado: send e.g. 1, 2, # over in-call DTMF; verify the receiving IVR or Twilio diagnostics.
6. With two speakers in different languages, open Transcripción. Verify each chat turn is in the owner's language and labeled correctly, including turns spoken **before** opening it.
7. Close chat, return to call, hang up and verify both legs close, billing is settled and no chat text is accessible afterwards.
8. Attempt another user's token, a forged outbound SID and unsigned bridge request; they must return only error codes without transcript text.

**Not verified until a real signed iPhone build and actual bilingual call pass.** The app package must be signed with Apple/EAS credentials accessible to the build account.
