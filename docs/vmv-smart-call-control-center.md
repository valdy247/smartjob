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
