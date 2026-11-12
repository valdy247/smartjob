# VMV Business — Web Services 2.0 (Puck) — Pilot release notes

**Repository**: `valdy247/smartjob`  
**Only integration branch**: `feat/vmv-smart-call-control-center`  
**New editor**: `/web-studio`  
**Published website**: `/web/{siteSlug}` and `/web/{siteSlug}/{pageSlug}`  
**Legacy website**: `/sites/{slug}` (unchanged).

## Delivered in branch

- Pinned `@puckeditor/core@0.24.0` (MIT) with a full-width client-only editor rather than squeezing it inside the iPhone simulator.
- A safe block config shared by Puck editor and public renderer: Hero, Heading, Text, Image, Services, Benefits, CTA, Quote, Spacer, FAQ, Contact.
- Drag/drop via Puck, mobile/desktop previews, undo/redo via Puck, root theme color and typography, image selection/uploader with owner-only media listing, and optional AI image generation (AI remains disabled without provider credentials and owner allowance).
- New Supabase authenticated multi-site and multi-page data model, including titles/descriptions and unique page slugs.
- User-specific draft storage with optimistic version guard on save and an atomic, `SECURITY INVOKER` publish RPC writing public snapshot + immutable historical revision.
- Revision list and restoring a previous publication to an editable draft. Restoration never silently changes the live page.
- Published page navigation and responsive rendering, basic per-page SEO metadata and OG. Vercel Preview results are `noindex`.
- No breaking changes to old Web Services data. One-click optional import of a classic site as a new *unpublished* Puck draft, leaving the old live site unchanged.
- Five-site owner quota and 15-page/site quota enforced by database triggers during the pilot.
- User-authenticated real Vercel registrar availability, pricing and renewal quote from the public Registrar Search API.
- User-owned domain purchase/connection request records stored in Supabase without any charge.
- Domain verification and attachment backend implemented but **disabled by default**. A fail-closed `proxy.ts` routes only verified, service-role-approved hostnames when the explicit feature gate is enabled.
- In Web Services, “Editor visual 2.0” opens the new dedicated studio; “Editor clásico” and the existing requests inbox remain available.

## Database tables added

`smartjob_builder_sites` — owner-private site records.  
`smartjob_builder_pages` — owner-private editable pages and revisions for optimistic save.  
`smartjob_builder_public_pages` — public published JSON only.  
`smartjob_builder_revisions` — owner-private immutable publication snapshots.  
`smartjob_builder_domains` — private attachment status, verification details, error.  
`smartjob_builder_public_domains` — public minimal routing map; browser cannot write.  
`smartjob_builder_domain_requests` — owner-private request (purchase/connect) **without charging**.  
`smartjob_builder_publish_page` — atomic invoker RPC, authenticated only.

Old data tables are not overwritten.

## Domain connection deployment gate

The actual add/verify/domain SSL activation needs **all**:
- A Vercel project deployed to production with Puck public routes, and an authorized Vercel API token scoped to the corresponding project/team.
- `VMV_WEB_DOMAIN_CONNECTIONS_ENABLED=true` **only** after production review.
- `VMV_VERCEL_DOMAINS_TOKEN` as **server-only** secret, plus `VMV_WEB_VERCEL_TEAM_ID` when applicable.
- `SUPABASE_SECRET_KEY` server-only and `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` public.
- `VMV_WEB_VERCEL_PROJECT_ID` optionally overrides current project id.
- Owner explicitly initiates domain connection, completes domain TXT/A/CNAME verification, and requests a fresh verification check.
- The API writes a public domain-to-site mapping **only if** Vercel project ownership verification passes and DNS is not misconfigured.
- `proxy.ts` does not alter VMV normal hosts, `*.vercel.app`, `/api`, or Next static routes. With gate off it immediately passes all traffic through.

**Not activated** on this integration branch. No DNS or registrar changes have been made. Actual paid checkout, tax handling, buyer's registrant verification, renewal management, Stripe fulfillment webhook, cancellation/refunds and terms remain separate launch requirements. In this pilot **“Solicitar compra con VMV” is a recorded request, NOT a purchase or payment**. Do not advertise instant domain buying until that order path is implemented and tested.

## Verification and acceptance

- Next/Vercel branch compilation and typed routes must remain READY.
- Supabase domain and site tables must have owner RLS, while browser writes to `smartjob_builder_public_domains` are impossible.
- SQL rollback tests verify publishing via authenticated RPC and anonymous read of public snapshots, without creating permanent fake customers/sites.
- Manual browser QA needed for full Puck edit → save → publish → visit URL → revision restore → republish, media picker, classic migration, narrow-phone layout, domain quote and user permission boundaries.
- Domain SSL, actual purchases, Google Business Profile posting, payment entitlements, content moderation, exports, multilingual pages, blog, product catalog, ecommerce, notifications and AI automation are **not yet production-validated or complete**. Avoid making success claims for any of them.
- Before commercial launch: version retention limits, backups, deletion/export, published-content abuse monitoring, per-site rate limiting, customer/domain ownership and DNS recovery, and billing/entitlement checks.

## Safe rollout strategy

1. QA standalone Studio as pilot on shared branch.
2. Verify migration and publication for existing classic account without changing the original.
3. Add payments/entitlements, operational monitoring, retention and consent.
4. Deploy reviewed Puck hosting to production only with explicit owner authorization.
5. Configure restricted registrar token and Vercel team/project, then enable domain attachment and test a domain actually controlled by VMV.
6. Integrate customer checkout for domain registration with a paid-order webhook and idempotent backend purchase. Do not register names before verified payment and explicit buyer confirmation of price, registrant information, renewal settings and terms.


## Director milestone 1 — verified persistence loop (Nov 2026)

**Customer path:** /web-studio → create site and home page atomically → edit with Puck selection and contextual properties → save automatically or press Guardar → view draft locally on desktop/mobile → press Publicar explicitly → open /web/{slug} → modify draft → republish → optional historical revision restore.

**Correctness and safeguards:**
- `smartjob_builder_create_site` creates a site and its homepage in one SECURITY INVOKER transaction; failed drafts cannot leave orphaned empty sites. The legacy importer uses the same atomic API with a unique `legacy_source_slug` marker and does not change the original live website.
- Draft saves use optimistic page revision matching. They run after a 2.1s idle interval, never automatically update the public snapshot, and expose Guardando / Sin guardar / Borrador guardado / Error al guardar.
- A per-owner, per-page browser recovery snapshot provides explicit Recuperar or Usar versión guardada after an interrupted edit. Stale backups do not silently overwrite a newer server revision. This is browser-local best effort and not a substitute for server backup.
- Puck stays mounted when opening history/domain tabs, protecting its in-memory editing state. Separate preview renders current unsaved content without publishing.
- Published vs pending changes are shown separately from draft save status. Public links appear only after a verified snapshot exists.
- Direct `authenticated` INSERT/UPDATE/DELETE grants on published pages and write grants on immutable revisions have been revoked. Published snapshots and immutable revisions can only be created together through `smartjob_builder_publish_page`, which explicitly verifies `auth.uid()` and page ownership in the database. Its public SECURITY DEFINER designation is intentional; advisor warnings and future changes require human security review.
- `smartjob_builder_restore_revision` restores content/title/description atomically as a *draft* under the owner's RLS policy; public content remains the last confirmed publication until explicitly republished.
- Multi-page navigation uses separately persisted, published page slugs. Server rendering looks up the requested route independently for direct visits and reloads.

**Automated database regression:** `supabase/tests/vmv_web_studio_roundtrip.sql`, executed successfully inside a rolled-back transaction on the shared Supabase project. Checks atomic create, two published URLs, draft isolation, republishing, three immutable history records, restoration without live mutation, anonymous public reads and cross-owner RLS. Also confirmed direct live editing and history insertion grants are absent. This is not a signed-in browser test.

**Test limitations:** Full signed-in, real-browser E2E on iPhone and desktop, live upload/replace image, native media picker, screenshots and host-specific HTTP reloads still need manual QA. The shared preview requires the test account's own session. Mayuli Bakery's current website and domain were not changed, and no domain was registered or purchased.

**Still not ready for sale:** paid registrar checkout/ownership and renewal workflow, credentialed DNS+HTTPS activation, spam-resistant customer notifications, full rollback/retention administration, billing entitlements, and AI usage charging. Keep these disabled or explicitly marked not yet available.
