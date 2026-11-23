# VMV central business — Marketing integration handoff

## Implementation scope
- The canonical business data source is **public.vmv_marketing_businesses**, not `smartjob_profiles` or `vmv_ai_businesses`. Those are optional source suggestions; import requires explicit user selection and `source_system/source_record_id` avoids importing the same source twice.
- UI: `/vista-app/marketing/negocios` uses `CentralBusinessEditor`, `lib/vmv-central-business.ts`, VMV category picker and the private `vmv-business-media` bucket.
- Marketing Google flow picks the existing business, preloads missing fields, then saves `business_id`, an immutable `business_snapshot`, `confirmed_at`, `consent_version` and request-scoped private images in `vmv-google-media`.
- The optional **Save also in my business** update runs only *after* confirmed request insertion. A request-only correction must never update the original business.
- Admin's existing Google media viewer can open request-scoped photos without editing Admin code. The snapshot also records immutable original business-media references.
- Support and Admin already use `vmv_marketing_requests`; no parallel request system.

## Server-side protections verified (rollback-only tests)
- `vmv_private.marketing_business_capacity_guard` locks `smartjob_profiles` before counting, preventing concurrent extra business insertions. Currently one business is allowed per account because per-plan limits are **not defined**; no unlimited accounts.
- `vmv_business_media_owner_upload` now resolves `storage.objects.name` explicitly inside the correlated RLS condition. Owner uploads passed; an unrelated nonstaff account upload and SELECT were rejected.
- Request `(owner_id,business_id)` foreign key and `vmv_private.marketing_request_business_guard` prevent linking another account's business.
- An approved request snapshot survives later profile updates and cannot be altered. Request-only edits can be saved without modifying the profile.
- Legacy requests with `business_id IS NULL` remain intact.

## Director decisions and integration work still open
1. Define actual allowed business counts by Starter/Pro/Premium, whether extras may be purchased, and downgrade over-limit behavior. Replace the temporary one-business guard only after pricing/entitlement policy exists; enforce entirely server-side with serialized inserts.
2. Decide the long-term ownership/name for the canonical table (currently `vmv_marketing_businesses`, despite being shared) and provide read-only service interfaces to AI Agents/Web Services. **Do not claim those modules are connected until their own end-to-end flows are tested.**
3. Admin currently shows Google request-scoped images. If operators must browse other central-business photos or all `business_snapshot` fields, add an authorized Admin presentation path with business ownership checks. Avoid editing Admin from Marketing without Director coordination.
4. Validate account signup to business creation, auth redirects, image upload and full Google confirmation in a real browser/mobile session. Database tests and Vercel READY are not equivalent to this test.
5. Validate complete ES/EN visual copy with the shared language provider and real sessions.
6. Protect previous confirmed business-media objects from deletion: the owner bucket currently has no DELETE policy, so replaced profile paths remain available to old requests.
7. Product warning: no Google profile publication, claim, verification or payment is performed by these forms. They create an assisted VMV request and preserve consent/quote workflow.

## Build coordination
Marketing's bilingual audit is currently clean. The shared CI build may be blocked by Services i18n regressions while that module is concurrently changing; don't change the other specialist's files to bypass their checks.
