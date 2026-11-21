# Web Services Studio — signed-in website publisher (pilot)

**Repository/branch:** `valdy247/smartjob` / `feat/vmv-smart-call-control-center`.

## Implemented
- Web Services -> **Crear mi web** in the shared `/vista-app` simulator.
- Per-owner, persistent content and branded template/color editing using the same existing Supabase Auth instance.
- Separate draft and published records: `public.smartjob_web_sites` is owner-private; `public.smartjob_web_publications` contains explicitly published public data only.
- Generate and share a public site at `/sites/[slug]` on the current deployment host; allow publishing updates or unpublishing.
- Only text and validated contact links are rendered, via React. No HTML injection, no arbitrary scripts, no custom images, no fake lead counts.
- Owner-only RLS for private records and publication writes; anonymous readers can access published material only.

## Supabase changes
Migration applied to project `wrnlhjujsbigculndivs`: `smartjob_web_studio_publisher_v1`.
RLS policies: 4 owner CRUD policies for drafts and 3 owner write + 1 public read policies for publications. No changes to existing Smart Call or billing tables.

## Validation performed
- Next.js/Vercel preview build READY on shared branch after an unrelated Marketing stylesheet import was resolved by that module's concurrent worker.
- Supabase RLS and grants inspected; anon has no SELECT on private drafts, anon can SELECT public publications.
- In a SQL transaction using the project's authenticated role, INSERT on both tables and SELECT of created records succeeded. The transaction was rolled back; both tables remained empty.
- A real browser sign-in/edit/publish/open/unpublish end-to-end test remains required. Without that test, do not claim fully production validated.

## Release boundaries
- **Preview pilot only**, not a commercial website hosting launch.
- Plan entitlements, one-time Stripe checkout, content abuse mitigation/moderation, custom domains, image uploads, email/lead capture, team roles and production monitoring remain unimplemented.
- Before promoting to production, implement authenticated server-side paid entitlement gating for publishing, abuse/rate limits, backup/rollback and appropriate custom-domain security; do not ship unlimited free hosting by accident.
- Vercel previews can have platform-level protection; a site URL on a protected preview is not necessarily accessible to the general public.
- No Home, Smart Call, Translator, Stripe or Twilio changes in this implementation. The existing Web Services service component supplies the entry point.
