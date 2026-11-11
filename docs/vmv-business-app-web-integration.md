# Smart Call iOS ↔ VMV Business web handoff

## What this branch adds

- Uses the existing Supabase Auth identity; no new credentials, signup forms or phone activation steps.
- The native `apps/ios/businessWorkspace.ts` loads the public `https://vmv-business-design.vercel.app/service-catalog.json` registry and validates the nine known service IDs and paths.
- On the app settings page: **VMV BUSINESS → Plataforma web** opens the Smart Call management destination; **Catálogo de servicios** lists other service categories and their honest planned/pilot status.
- Link targets are built from a fixed HTTPS origin and allowlisted module IDs. Access tokens, user IDs, phone numbers and session data are NEVER included in URLs.
- An installed app can receive `smartjob://calls` or `smartjob://services` links. The native screen route is only activated after an existing Supabase user session is present.
- The existing Next.js Smart Call workspace now includes a link to the new VMV Business management page.
- Existing Twilio Voice SDK setup, translation bridge and billing code are unchanged.

## Supabase integration

The VMV Business Vite website and the Smart Call native and Next.js app use the same project `wrnlhjujsbigculndivs` and public publishable credentials. No new Supabase project was created.

The VMV Business `workspace/` website now supports existing-account email/password login and read-only authenticated data from existing, owner-restricted tables: `smartjob_profiles`, `smartjob_phone_routes`, `smartjob_call_settings`, `smartjob_call_sessions` and `smartjob_billing_accounts`.

**Not yet automatic SSO:** Native SecureStore and browser sessions have different storage. Users sign into the website with their same Supabase account; never pass app tokens in a deep link. This is deliberate until a reviewed, protected browser/mobile handoff exists.

## Build / acceptance tasks before shipping

1. Run `cd apps/ios && npm install && npm run typecheck` on the feature branch.
2. Run the existing Smart Call call/bridge tests from the repo root: `npm run bridge:test`.
3. Build an **internal preview** with EAS, not production/TestFlight, until basic checks pass.
4. Sign in to the native app with a test account and verify Settings → VMV Business → catalog.
5. Tap Smart Call and verify the browser asks for the same Supabase credentials when no browser session exists.
6. Verify the web displays **only that account's** profile, line status, plan and call count.
7. Verify log out in browser does not sign out the iOS app, and `smartjob://calls` returns to the Calls tab.
8. Re-test real inbound calls, PushKit background invitations, calling UI and translation in the pre-existing pilot before promoting.
9. Do not update the four-step signup wizard in this branch: account question review remains phase 3.

## Security limitations

- The public catalog is descriptive, not authoritative for service subscriptions/entitlements.
- The web summary is read-only and existing rows are access-protected by owner RLS.
- Future business/employee multi-tenancy, permission grants, active module subscriptions and editing phone/AI configurations require reviewed server-side authorization and migrations.
- No billing values, Twilio settings or secrets should be modified or replicated by this feature branch.
