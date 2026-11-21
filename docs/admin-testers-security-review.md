# Cyber handoff — Admin Testers (13 Nov 2026)

Scope: VMV Business `valdy247/smartjob`, shared feature branch. Security review requested before enabling live delivery.

## Enforced protections

- `/api/admin/testers`: account session validated against Supabase Auth, profile existence, and `vmv_marketing_staff.role=admin` on every read/write.
- Database tables containing contact PII are RLS-enabled with no anon/authenticated grants; server uses service credential. SQL functions recheck the administrative role.
- Emails normalized; E.164 phone validation, duplicate-safe unique indexes. Email opt-in and timestamp/source of SMS consent are persisted; STOP webhooks revoke SMS eligibility.
- Email/SMS provider keys and Vercel API token never enter client bundles. Vercel project, team, repository and branch are pinned; Ready and preview only; protection must be verified off or sends remain blocked.
- The admin must confirm exact recipients/channels/deployment before sending. Deployment URL and SHA persist in an immutable batch snapshot.
- Provider accepts are distinct from delivered. Only failures permit explicit retries; `unknown` is not automatically retried.
- Atomic database claim and finalization; per-admin hour/day limits, per-deployment advisory locks and request idempotency; no stateful work after HTTP response. Pending sends can be resumed.
- Resend webhook signatures verified with timestamp and constant-time HMAC; Twilio signed URL/form verified with account token. No plaintext secret logs.
- Audit events contain actor/action/reference/provider status, without storing email body or provider credentials.

## Additional QA / threat model items for Cyber

1. Use authorized test accounts and test provider credentials to verify anon and agent rejection, admin-only access and role revocation mid-session.
2. Simulate two admins preparing the same deployment + tester concurrently; expect one set of deliveries.
3. Test 15 recipients, 4 batches/hour, 50/day, retries under network timeouts and unknown delivery states.
4. Probe email spoofing and international phone validation; verify unauthorized consent changes are rejected and STOP prevents further dispatch.
5. Verify sender domain, Twilio messaging service/A2P compliance and provider webhook URLs/secret rotation before enabling live sends.
6. Validate a protected Preview deployment: no password, secret or bypass token may be emailed; no automatic disabling of Vercel protection.
7. Confirm response-time and signed webhook trust under proxying on a stable HTTPS public base.
8. Inspect data retention/deletion requirements for recipient contact data and outbound send history.

No live messages were sent during implementation. `VMV_TESTER_FROM_VERIFIED` and `VMV_TESTER_SMS_ENABLED` must not be enabled merely because environment variables exist.

## Outstanding limitations

- The interface intentionally caps one manually confirmed dispatch at 15 recipients. More recipients require separate reviewed batches.
- A provider request that times out becomes `unknown` and cannot be retried until manually reconciled.
- If a function terminates during processing, already-`processing` records remain as unresolved until a human reviews them; pending can be resumed.
- Dynamic preview access protection is read from the project settings; verify special deployment-specific protection policies in a pilot before mass sends.
