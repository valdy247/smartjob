# Google Business Profile — assisted service launch checklist

Scope: `valdy247/smartjob`, `feat/vmv-smart-call-control-center`.
Customer: `/vista-app/marketing`. Operator: `/admin`, Marketing cases.
This service collects requests and supports human fulfillment. It does not submit profiles through a Google API.

## Fulfillment

1. Open the customer case in Admin. Review action (create/claim/improve), actual business name, Google category, country, customer-facing address or service area, phone, hours and private photos. Check Maps for duplicates and eligibility. Online-only operations need eligibility review before accepting work.
2. Send a written scope and VMV fee through the case. Google Business Profile itself is free. Do not represent VMV as Google or promise verification, ranking or a fixed completion date.
3. Obtain acceptance of the current quote before starting. Changing price or quote text invalidates the previous acceptance. **Quote acceptance is not payment.** The present Marketing intake does not collect money; use the agreed invoicing/payment procedure and record its reference in internal notes. Never record card data in notes. Do not advertise automatic checkout as available.
4. Keep the customer as owner/co-owner throughout. For an existing profile, ask the owner to invite VMV as manager through Google's official access controls. For a new profile, arrange customer-owned setup and authorized management; do not create it solely under VMV and postpone ownership until the end. Never ask for Google passwords or verification codes.
5. Confirm the exact public data with the customer before external changes. The service-area intake discards street/unit/city/region/postal fields so a residential address is not accidentally retained in that request. Google may separately require a private verification address.
6. Prepare or update the profile manually through the official portal. Google categories must be verified by the operator; VMV's industry search is not Google's live category catalog. Country-specific restrictions and postal formats also require operator review.
7. If customer action is required, mark Needs customer and explain the precise next step in the case conversation. The customer performs Google verification directly. Google chooses the available method. Do not promise that VMV can bypass it.
8. Mark In progress only after current-price authorization and agreed payment arrangements. For completion, check the actual live profile, requested changes and customer access; save its public Google Maps URL. The database requires an approved current quote, evidence and a completion timestamp. The URL requirement is not an automated check of Google's verification status.
9. Confirm handoff with the customer and remove VMV access if requested. Honor Google's ownership and termination rules. Deliver the official third-party disclosure notice by the required channel when the service relationship begins/renews. The notice link is also shown in the request confirmation.

## Product controls

- Signed-in owners submit and read their own cases. Explicit Marketing staff can read the team queue; customer queries filter owner before pagination.
- Private `vmv-google-media` bucket: JPG/PNG only, maximum 5 MB. Browser checks file signature, decodability, dimensions (250 × 250 minimum) and 10 KB minimum. Up to 1 logo, 1 cover and 8 photos. Restored/legacy files are additionally checked for type, size and signature before upload; operator still reviews suitability.
- Content SHA-256 in uploaded filenames avoids confusing two different same-size/same-date files on retries.
- Database intake guard validates structure, fields, international phone, business hours, media ownership/existence/type/size and associated business ownership. Client controls are not the authorization boundary.
- Same request UUID is reused for retries. An ambiguous response is checked before resubmitting. Media remains attached after an uncertain insert to avoid destroying a successfully saved request.
- Saved customer cases remain in the existing request/history/Admin model. No parallel queue or Google credentials store.

## Verification evidence for this change

- `npm run google-profile:test`: location variants, phone/address/date normalization, malformed and overnight hours, description limits, content-based photo IDs and forged MIME header rejection.
- `supabase/tests/vmv_google_profile_intake.sql`: transaction/rollback test of malformed submissions, owner read, cross-account read/approval denial, owner status protection, private-address cleanup, wrong-price rejection, stale-approval rejection and completion evidence. Requires two existing VMV profiles; no users or staff roles are created.
- Full build includes bridge, bilingual catalog, strict Marketing translation scan, interface-language, testers and Google-profile tests plus Next/TypeScript.

## Remaining live acceptance gates

Do not label the entire service 100% verified until these are observed:

- Signed-in customer submits a genuine request with photos, refreshes/reopens it, and sees all saved details.
- Staff opens that exact case in Admin, views private photos and all seven days of hours, quotes it, and customer accepts the same revision.
- Staff/customer messages, attachments and status changes are checked across both live sessions. Do not assume email/SMS delivery merely because an internal notification exists.
- A genuine business is fulfilled through Google with the customer's authorization and ownership preserved. Google verification cannot be simulated as a completed external result.
- Commercial scope, fee, invoice/payment procedure and cancellation/refund handling are approved before taking a paid order.

## Official references (checked 2026-11-13)

- Eligibility and representation: https://support.google.com/business/answer/3038177
- Third-party fees, ownership, disclosure and termination: https://support.google.com/business/answer/7353941
- Verification methods and owner action: https://support.google.com/business/answer/7107242
- Photo requirements: https://support.google.com/business/answer/6103862
- Private Storage and signed access: https://supabase.com/docs/guides/storage/buckets/fundamentals

## Follow-up verification

- Fixed a malformed UUID validator in `/api/support`: previously valid UUIDs were rejected, blocking existing case reads, thread/history and message submission. Five HTTP-handler tests now cover authentication, ownership, private notes/history, server-derived actor, invalid IDs and safe error responses.
- Customer Marketing cases now link directly to their existing support conversation; no second ticket is created. Saved Google details include all seven days of hours, country, secondary phone, categories and safe profile/booking links.
- `supabase/tests/vmv_google_profile_conversation.sql` passed against the live database in a transaction that rolled back: case index, customer/staff messages, retry deduplication, internal notifications, denial of cross-account messages/internal notes, private history and closed-case rejection. These tests do not prove browser authentication or external email/SMS delivery.
- Genuine customer and operator browser sessions, private photo upload/download after reopening, and fulfillment in Google remain explicit acceptance gates. No real Google changes or charges were made.
