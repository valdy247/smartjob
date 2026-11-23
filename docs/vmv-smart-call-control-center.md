# VMV Business · Smart Call Control Center (review branch)

## Product change
- The iOS app keeps incoming calls, existing CallKit/Twilio call screen, and the live in-person interpreter.
- Its navigation now has **Inicio / Servicios / Llamadas / Traductor / Cuenta**.
- Servicios lists Smart Call as a native interactive module; the remaining eight modules are clearly marked in development, without fake configuration forms or automatic browser redirects.
- Smart Call native tabs: Overview (route, language pair, plan minutes), Settings (editable owner language/customer language/assistant name and eligible voice/greeting preferences), and Activity (recent calls).
- App-to-web handoff for Smart Call goes to `/es/workspace/smart-call/` on VMV Business; other modules retain the existing limited preview.
- Visible app brand is **VMV Business**. The bundle identifier, EAS project, scheme and signing entitlements are unchanged.

## Shared data & constraints
- No new Supabase project, credentials or database schema. Use the existing account and owner-RLS for account settings and history.
- Voice/greeting changes use the existing `/api/billing/preferences` service. The backend verifies the current plan and only permits Pro/Premium editing. CORS has been restricted to the VMV Business origin and its Vercel preview hosts for the browser version.
- Language and assistant-name changes update only their existing settings row under owner RLS. No native/UI toggle writes to phone routes, forwarding, billing, or IVR.
- A line existing in the database does NOT prove real incoming-call delivery.
- Native and browser sessions are independent, but use the same Supabase Auth identity.
- Public module catalogs are metadata, not evidence of a service entitlement.
- This change is based on the `feat/vmv-business-web-handoff` draft branch, which is itself unmerged. It must not be merged directly into main before the dependency is reviewed.

## Required QA before a public release
1. Verify `apps/ios` TypeScript and backend bridge tests via CI.
2. Run EAS internal preview with authorized Apple signing credentials. Prior EAS credentials access was blocked, not a compile failure.
3. On a physical iPhone, validate PushKit, incoming calls while open/locked, accept/reject, CallKit, transcript/translation, and voice registration.
4. With test accounts, verify owner isolation and update synchronization between iOS and VMV Business web.
5. Validate disabled premium controls on Starter and working Pro/Premium saves, greeting length rules, invalid/expired sessions and API failures.
6. Check five-tab navigation at small iPhone widths, large text, screen-reader focus, keyboard behavior, and sign-out.
7. Verify the new web route is deployed before enabling the app deep link in any public release.

**Status:** code on a review branch; Vercel validates the Next.js web build, not iOS native functionality. Don't claim phone delivery or production readiness until the physical-device checks pass.


## Authenticated browser iPhone preview (/vista-app)

This route is now a **working account-controlled Smart Call dashboard**, not a mock. It uses the existing Supabase Auth session (email/password, browser storage separate from native iOS), verifies identity with getUser, and loads existing owner-only rows from smartjob_profiles, smartjob_call_settings, smartjob_phone_routes, smartjob_provisioning_requests and smartjob_call_sessions.

### Authoritative minute source
The internal native iOS Preview is pinned to a dedicated pilot API deployment. The current smartjob control-center Vercel preview does NOT carry that pilot branch's billing administration secret or Twilio credentials, so displaying a locally computed balance would have been misleading.

A **server-side authenticated, fixed-upstream proxy** was added at /api/vista-app/smart-call:
- Validates the caller with authenticatedUser and Smart Job profile membership before forwarding a bearer token to the same immutable pilot API origin used by apps/ios/session.ts.
- GET requests /api/billing/overview, /api/ios/account-overview and /api/billing/preferences upstream; each independently reports {ok,status,data}. A failed balance request is shown as unavailable, never replaced with a fictitious zero.
- POST accepts only the permitted premium voice/greeting fields and forwards to the upstream API, whose Pro/Premium checks and greeting validation are authoritative.
- This proxy never accepts a caller-provided URL or external path, never forwards cookies, never exposes server credentials, always disables caching, and does NOT proxy Twilio call actions, phone provisioning, payment transactions or unrestricted billing writes.
- The UI shows available, included, used, reserved, rollover, topups, temporary hold and renewal period as reported by the server. Balances are read-only and cannot be altered by the browser.

### Direct owner changes
- UPDATE only desired_language, caller_language, assistant_name and updated_at on an existing smartjob_call_settings row restricted by user_id and Supabase RLS.
- The browser does not change any phone route, forwarding mode, provisioning request, trial entitlement, subscription or minute ledger.
- Voices and greetings remain writable only when the upstream server confirms Pro/Premium eligibility.

### Other user-facing areas
- Five navigation tabs, real phone line/verification/forwarding indicators and RLS-scoped recent calls.
- The existing LivePanel web translator is embedded under Traductor; it uses its own consent and API availability safeguards. It is **not** equivalent to native iPhone CallKit incoming phone calls.
- Manual refresh and a bounded refresh of minutes/recent activity when browser tab becomes visible (or every 45 seconds).
- The browser shows only the sign-in form until authenticated, and clears private data on sign-out or change of Supabase account.

### Acceptance still required
- Test with an authorized Smart Call account whose pilot API has billing information and an eligible Pro/Premium account for premium voice changes.
- Compare minute breakdown on /vista-app with iPhone Preview using the same account and confirm reservations/topups match.
- Change assistant settings in web, refresh on iPhone, and vice versa. Verify no other user's data are visible when switching identities.
- Verify browser translator permissions and backend availability independently.
- The Vercel Next.js build and unauthenticated page response are not proof of a successful signed-in end-to-end test.
