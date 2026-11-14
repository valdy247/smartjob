# Admin Web — Testers and exact Vercel preview invitations

Project: `valdy247/smartjob`, shared branch `feat/vmv-smart-call-control-center`.
Verified Vercel project: `smartjob`, ID `prj_yeVaibe69wH77tUM2ZXphTHjzwfx` (team `team_8nteHLnX79fizQnfvEnSL4su`).
The pre-implementation READY preview was deployment `dpl_D4tY1CFuWKX9ywS3xsDffLG8xNtB`, commit `ce1beef`.

## Functionality

- Admin-only Testers tab. Server checks the authenticated account and `vmv_marketing_staff.role='admin'` for every read/write.
- Create/edit/deactivate contacts; country-code entry, E.164 and normalized email; database unique indexes on both; email opt-in, timestamp and source of SMS consent, opt-out handling.
- Live Vercel API check, exact project, team, GitHub repository and branch; target must be Preview (not production), READY only. Shows the latest unfinished build separately.
- Project protection check; if password/SSO/trusted IP is enabled or state cannot be verified, sending is blocked. VMV app authentication is independent.
- Explicit confirmation shows recipients, chosen channels and the pinned immutable deploy URL/SHA. No automatic notifications from Git commits.
- Server-side snapshot verification before preparing a send. Each send batch saves a request UUID, deployment identity, URL, SHA, creator, channel and time.
- Email via Resend API: single addressee per request, verified sender must be acknowledged, HTML button plus visible exact URL; provider idempotency key per delivery attempt.
- SMS via Twilio REST: explicit test SMS sender/messaging service separate from a voice line; configured enable flag, consent required, STOP opt-out webhook, signed status callbacks.
- States: pending / processing / accepted / delivered / failed / unknown. Acceptance is not delivery. Only explicit failed deliveries can be retried (up to 3 attempts), unknown is not retried blindly. Same preview already accepted/delivered/unknown for the same tester and channel is skipped.
- A maximum of 15 testers per manual send, four batches per admin per hour and fifty records in 24h; concurrent requests serialized in PostgreSQL. Existing queued state is durable; a retry with the same request key resumes pending records. No background tasks are spawned after HTTP response.
- Signed provider webhook verification (Resend Svix / Twilio X-Twilio-Signature), delivery-state upgrades, provider event keys and STOP suppression. No secret or message body goes into audit events.

## Server environment configuration (names only)

Core Vercel API:
- `VERCEL_API_TOKEN`: restricted read token with project and deployment read access for the linked project. No secret appears in the browser.

Email:
- `RESEND_API_KEY`
- `VMV_TESTER_FROM_EMAIL` (sender verified in Resend)
- `VMV_TESTER_FROM_VERIFIED=true` **only after verification**.
- `RESEND_WEBHOOK_SECRET` optional for delivery confirmation; configure webhook path `/api/admin/testers/webhooks/resend`.

SMS:
- `VMV_TESTER_SMS_ENABLED=true` only after a valid permitted sender, compliance review and approved consent.
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_MESSAGING_SERVICE_SID` (preferred) or `TWILIO_TESTER_SMS_FROM` (authorized SMS-enabled E.164 number)
- `VMV_TESTER_PUBLIC_BASE_URL`: stable HTTPS callback origin with the webhook route `/api/admin/testers/webhooks/twilio`. Configure inbound STOP to the same signed route when applicable.

Existing `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY` remain server-gated; do not expose secret keys to the browser.

No SMS number was purchased and no real email/SMS was sent during development. Creating a sender, verifying Resend, registering A2P messaging or changing Vercel protection needs the authorized owner.

## Database migrations

- `supabase/sql/vmv_admin_testers.sql`: Testers, batches, deliveries, audit, transactional upsert, prepare, claim and finish functions with service-role-only access.
- `supabase/sql/vmv_admin_tester_webhooks.sql`: webhook dedupe registry and service-role-only access.
- Migrations applied to connected Supabase. Synthetic SQL test for create, deduped batch, claim and accepted status was executed inside BEGIN/ROLLBACK.

## Test limitations and rollout

- Preview build/TypeScript must be verified for the exact resulting SHA.
- Mock tests cover source invariants; actual end-to-end user admin/auth, provider webhook receipt, protected preview access, mobile layout and provider response semantics still require a pilot.
- Real live send requires the user to explicitly provide a single approved tester and provider credentials configured server-side. Never test delivery against an unsolicited third party.
- A queued request is persisted and resumable, but the first launch processes a bounded group of at most 15 deliveries within the confirmed HTTP request. No Vercel background work is assumed after the response. An interrupted/unknown attempt is never automatically resent; manual review is required.
- Provider webhook endpoints must be configured and signed. A 60-second signed attachment URL is unrelated to preview access.
- External integrations remain pending until independently verified; do not claim delivery from provider acceptance.

## First manual send

1. Open `/admin`, sign in with an authorized admin, select **Testers**.
2. Add a named tester, email and/or an E.164 phone. Record consent; choose channel and save.
3. Click **Buscar actualización**; check READY, SHA, message and any more recent build.
4. Select a recipient or select all eligible. Choose email or SMS if configured.
5. Click **Enviar último preview**, review version, actual recipients and message, and confirm.
6. Observe the send history. **Aceptado** means only provider acceptance; **Entregado** requires signed provider confirmation. Retry **Fallido**, never **Desconocido**, until verified.
