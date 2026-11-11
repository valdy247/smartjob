# VMV Business — Service charging and fulfillment catalog (2026-11-11)

## Branch
`feat/vmv-service-offers-catalog` in `valdy247/smartjob` branches from `feat/vmv-smart-call-control-center`. Do not merge this independently into `main`. The other chat continues Smart Call, its billing and telephony on the base branch.

## Catalog metadata
Each offering has a charge model:
- `subscription` — a service intended to be included or available within subscription plans.
- `one_time` — intended as a separately priced one-off service.

Each has a fulfillment model:
- `automatic` — future self-service fulfillment, subject to service-specific validation.
- `assisted` — customer intake plus human review/approval, verification or completion.

Neither type is a payment guarantee or an authorization to activate. All future charges and entitlements must be server-verified; UI metadata must not unlock anything.

### Initial classifications (no prices approved)
| Subscription offerings | Workflow |
| --- | --- |
| Smart Call (existing pilot) | Automatic (existing gated telephony) |
| Web Care | Planned automatic |
| AI Agents | Planned automatic |
| SEO Local | Planned assisted |
| Reseñas | Planned assisted |
| Smart Booking | Planned automatic |

| One-time offerings | Workflow |
| --- | --- |
| Diseño web | Planned automatic |
| Google Business Profile | Planned assisted |
| SEO inicial | Planned assisted |
| Dominio | Planned assisted |

Classifications are planning defaults. Prices, bundling, tiers and checkout are deliberately not invented.

## Google Business Profile
App service card opens a short native intake sheet for business name, category, telephone, site, physical address and/or service area, hours, description, Google-owner email, logo/photo link and customer authorization.

- A draft can be saved in iOS SecureStore under the signed-in user's UUID; not transmitted to a server.
- `Compartir ficha` opens iOS native Share after required fields/authorization. Sharing must not be represented as successful submission or a paid order.
- Never request a Google password, impersonate the owner, promise instant verification or auto-publish a GBP listing.
- Human operating flow when the authenticated backend is built: `received` → `preparing` → `verification_pending` → `delivered`, with requester and worker IDs, timestamps and append-only audit events.
- Profile ownership must remain with the business, with approved manager invitations/ownership procedures.

## UI scope and concurrent-work safety
Only `apps/ios/App.tsx` (two new lines), `BusinessServicesPanel.tsx`, `serviceOffers.ts` and this markdown file change. Keep Home, Smart Call, voice registration, PushKit, Twilio, Stripe, interpreter and billing logic untouched. Match purple/pastel service design and show only short labels, chips, field names and actionable controls. No explanatory paragraphs are introduced.

## Follow-on production work (not done)
1. Confirm which SKU belongs to each Starter / Pro / Premium plan, service availability and all one-time prices.
2. Persist orders and GBP requests with owner-based RLS in the existing dedicated Smart Job schema, separate from call tables; create server-authorized admin queue.
3. Charge one-time setup items only through a validated Stripe Checkout session/webhook and an idempotent server-side order state transition.
4. Fulfill automatic services only after verified payment / entitlement and readiness checks.
5. Add human review, evidence of verified profile ownership and completion notifications for assisted services.
6. Native TypeScript build, real-account isolation tests and iPhone QA remain necessary. The Vercel web build does **not** compile the iOS app.
