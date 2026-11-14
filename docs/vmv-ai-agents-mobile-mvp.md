# VMV Business · AI Agents Studio (iPhone-first)

Status: **isolated draft implementation** on `feat/vmv-smart-call-control-center` (copied from `feat/vmv-ai-agents`). This is not an App Store release, a production migration, or a live telephone agent.

## Why mobile first
The VMV Business Home already has a blue **AI Agents** placeholder, as shown in the supplied screenshot. Preserve the exact existing Home, pastel service tiles, bottom navigation, Smart Call, translator, and phone code while other teams work. The new `apps/ios/AIAgentsStudio.tsx` supplies the functional screen behind that future entry.

## Features committed on this branch
- Native Expo/React Native studio with a violet hero, pastel role cards and mobile configuration.
- Templates: **Llamadas**, clientes, ventas, reservas, inventario, administración, personalizado.
- Create/edit agents, name, purpose, personality, language, additional instructions and approved knowledge text.
- Owner-only Supabase persistence, status (draft/active/paused), text simulator and searchable-by-agent recent simulation history.
- Isolated authenticated Next.js simulator: checks caller JWT, Smart Job business owner/agent and conversation, reserves one of 25 daily owner simulation requests atomically, limits message/context length and server-side model output, logs both turns.
- **Never** executes phone calls, sales, charges, appointments, inventory changes or external mutations. `active` means available for internal simulation only.

## File ownership
| Scope | File |
| --- | --- |
| Native UI only | `apps/ios/AIAgentsStudio.tsx` |
| Native data access | `apps/ios/aiAgentsData.ts` |
| Authenticated simulation | `app/api/vmv/ai-agents/simulate/route.ts` |
| Proposed schema + policies | `supabase/sql/vmv_ai_agents_mobile_mvp.sql` |
| Product/QA decisions | `docs/vmv-ai-agents-mobile-mvp.md` |

No modifications are made to `apps/ios/App.tsx`, `apps/ios/session.ts`, Home, Smart Call, Twilio, interpreter, global menus, billing, checkout, `diagrama`, or the active database.

## Shared integration — **needs coordination, not applied**
After App.tsx owner approves, their integration can:
1. Import `AIAgentsStudio` from `./AIAgentsStudio`.
2. Make the existing blue AI Agents Home tile a Pressable, routing to `activeTab="services"` and `activeModule="ai-agents"`, keeping its current visuals.
3. In the existing `activeTab==="services"` branch, render `<AIAgentsStudio session={session} onBack={()=>setActiveModule(null)} />` for `activeModule==="ai-agents"`, before the Smart Call and catalog branches. Avoid embedding its own scrollable SafeAreaView inside another ScrollView; present as a full-screen service view or adapt the surrounding container.
4. Update the relevant service card from “Próximamente” to “En pruebas” **only when the module is actually reachable**.
This tiny shared-file integration must be rebased with PRs #26, #27 and #28 and reviewed to avoid clobbering simultaneous work.

## Supabase / data safety
The SQL is **not executed**. It creates isolated `vmv_ai_*` business/agent/conversation/message/usage tables and owner-only RLS. No service-role secrets are used by the client; the model key is read only by the API. Each row has a verified owner and the agent also belongs to that owner's business. The starter MVP is owner-only; staff membership/roles, multiple businesses per owner, plan entitlements and delegation are **not supported yet**. Add them with a reviewed membership model, never from user-editable JWT metadata.

**Required before enabling:** approval to apply SQL in a managed staging environment, migration and rollback plan, audit of SECURITY DEFINER RPC and RLS with two independent test users/businesses, backend abuse limits per IP, retention/delete/export policy, budget and logging, vendor DPA/privacy review, input safety tests. Daily quota is 25 simulations per user, UTC. Business knowledge must be explicitly supplied with authorization.

The SQL uses `public.vmv_ai_reserve_simulation` as the only SECURITY DEFINER action; it verifies `auth.uid()`, a Smart Job profile and agent ownership before an atomic usage reservation. Grant access only to authenticated users. Future team/paid quotas require a separate entitlement and billing audit.

## Environment and preview
- iPhone: existing `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from `apps/ios/session.ts`.
- API: existing `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, server-only `OPENAI_API_KEY` or `AI_GATEWAY_API_KEY` / Vercel OIDC.
- Optional isolated model selector: `VMV_AI_MODEL` (defaults to the currently integrated `gpt-4.1-mini` for compatibility; evaluate a supported lower-cost successor before launch).
- `EXPO_PUBLIC_VMV_AI_API`: isolated Next.js preview base URL. Do **not** send preview requests to the live Smart Call API. When this env is absent, the client inherits the existing API base, which may not yet contain this route.

No new credentials or production model settings were changed. Do not enable service until API preview + RLS schema are both validated. Native EAS preview settings on the base branch point at the old Smart Call pilot; a new isolated preview must be selected explicitly, without modifying their shared `eas.json`.

## Verification before merge
- [ ] `cd apps/ios && npm ci && npm run typecheck`
- [ ] `npm ci && npm run typecheck && npm run build` for Next.js
- [ ] iPhone physical-device QA: card navigation, dark/light contrast, keyboard, small devices, fast double taps, sign-out/back, resumed sessions
- [ ] Auth/RLS: user A cannot read/edit B's agents, knowledge or conversations; invalid IDs rejected
- [ ] Quota: 25 successful reservations/day; 26th denied; concurrent requests cannot bypass limit
- [ ] Prompt injection, unsupported inventory/price/booking claims, user data leakage and provider outages
- [ ] Delete/export retention behavior and staff access design
- [ ] Regression test Smart Call/PushKit/calls/translation after integration
- [ ] User approves any database change, shared-file merge, TestFlight/App Store release

## Next authorized phases
1. Coordinate minimal App.tsx entry-point patch; isolate EAS preview; stage/test the schema and simulator; ship app-only internal QA.
2. Phone AI adapter: separate Twilio inbound route, explicit business enrollment, disclosure/consent, permission + handoff/fallback. Never intercept pilot voice paths.
3. Sales: verified catalog/stock read-only adapter, quotations and human-approved checkout; calendar booking through an authorized scheduling service; inventory read-only service with freshness metadata.
4. Administrative approvals, audit log, per-business entitlements and metrics. All actions must be permissioned and individually authorized before live execution.

## Shared integration branch update
The five isolated AI Agents module files were copied to `feat/vmv-smart-call-control-center` at the Director's request. The shared `apps/ios/App.tsx` Home tile still needs a separately coordinated navigation edit. The Next.js API is part of the shared Vercel build, but the native studio is not visible in `/vista-app` until it has its own preview or the native navigation integration is approved. This SQL is a proposal, not a live database migration.

## Web showcase on the shared Vercel preview
- Module-only route: `/vista-app/ai-agents` (add it after the shared preview hostname).
- Owned files: `app/vista-app/ai-agents/page.tsx` and `app/vista-app/ai-agents/page.module.css`.
- This is a responsive, isolated **visual showcase**, not the Expo bundle. It demonstrates role selection, form fields, in-memory draft cards and an explicitly illustrated test conversation; it does not save to the database, invoke models or send customer data.
- It deliberately does not edit `app/vista-app/page.tsx` or iOS `apps/ios/App.tsx`, so the existing Home tiles still point to their earlier destinations until the Director coordinates a shared navigation change.
- The live server simulator remains in `app/api/vmv/ai-agents/simulate/route.ts`, gated by the proposed Supabase schema. The schema is still **not applied**. No live business operation or channel integration is enabled.

## Six-step agent wizard (November 12, 2026)
The original two open text areas are replaced in both the isolated web showcase and native iPhone Studio by a role-aware guided setup:
1. Identity: name, mission, agent type, language and tone.
2. Business facts: company, industry, service area, opening hours, contact and approved policies.
3. Role-specific questions: call greeting, after-hours rules and disclosure; customer FAQs; verified sales catalog and discount policy; appointment types, duration and confirmation; inventory categories and stock freshness; operational or custom guardrails.
4. Integration needs: whether the owner wants VMV Scheduling, VMV Inventory and future lead capture. Ask intended read/use scope only. **Both connectors are unimplemented and explicitly marked NOT CONNECTED; an affirmative answer is not a connection or permission grant.**
5. Security and human handoff: unknown answers, contact information consent, future channels and forbidden actions.
6. Review: safe draft status, a read-back of important settings and a save button.

**Implementation:** `apps/ios/AIAgentWizard.tsx` wired into `AIAgentsStudio.tsx`; `app/vista-app/ai-agents/AgentSetupWizard.tsx` with module-local CSS, wired into the isolated preview route. Native answers are retained as `configuration` JSON in the proposed `vmv_ai_agents` schema, constrained by owner-only RLS. The simulator includes bounded serialized configuration as untrusted business information in its model context. Web preview remains **in-memory only** and does not touch private company records, send messages to the model, or execute real operations.

**Not implemented:** real detection of connected VMV Scheduling/Inventory per business, provider authorization, synchronizations, appointments, telephony AI call-answering, inventory changes or commerce. Require live verified module entitlements, scoped read permission and audit logging before enabling any of these. Keep shared Home/menu files unchanged; the Director will coordinate navigation integration.

## Context-aware wizard improvements (Nov 12, 2026)
- City and U.S. state are captured separately (e.g., Columbus + Georgia versus Columbus + Ohio), with country/other-region support.
- Opening hours use preset schedules or independent day-specific open/closed toggles and time dropdowns. No free-text hours required.
- Booking questions read the previously entered industry: taxi/transport owners choose trip types (local, airport, scheduled, hourly), while other businesses specify their own bookable service. The prior company and location are visibly repeated as context rather than re-asked.
- Reservation and cancellation lead times use clearly labeled choices (immediate, 15 minutes, 30 minutes, 1 hour, etc.), with an optional custom value.
- Staffing is asked in plain terms; additional employee/vehicle/location questions appear only for multiple operators, never for solo owners.
- The disconnected inventory and scheduling integration page is completely hidden. Future integration prompts require **tenant-verified, enabled and authorized connectors**, not just product catalog metadata.
- Both web and native currently show five focused steps; additional integration steps must remain hidden until business-scoped connectors can be verified. The web showcase still saves only in-memory.

## Isolated inbound telephone AI pilot — CODE ONLY, NOT LIVE
- New owned route: `app/api/vmv/ai-agents/voice/route.ts` (signed Twilio HTTP POST, speech gathering, authenticated tenant route, pilot quota and brief AI voice responses).
- Proposed DB tables: `vmv_ai_voice_routes` and `vmv_ai_voice_calls`, plus dedicated server-only call/turn reservation methods. These are **not migrated or tested against production**.
- Hard-gated to Vercel Preview by `VMV_AI_VOICE_PILOT_ENABLED=true`, and separately requires an approved, ownership-verified **dedicated Twilio number**, signed account ID, owner/billing eligibility, active agent, server OpenAI key, webhook-base URL and strict per-route quotas (5 calls/day, 8 turns/call, 4 minutes).
- No outgoing calls, payments, appointment bookings, real-time stock, data modifications or call recording. A caller hears a disclosure that the assistant uses AI. No speech transcripts are stored by this pilot route; audio/speech is processed by Twilio and OpenAI under their terms.
- It intentionally **does not modify or redirect** the Smart Call translation webhook `/api/twilio/live/voice` or any currently provisioned number. Voice is **not active** merely because the endpoint builds.
- To test an actual call, the Director must authorize a distinct testing number, ownership-verification and webhook routing, a staged database migration and privacy/billing review; then validate real Twilio signatures, TwiML recognition, model latency, human handoff and cleanup. Leave the feature flag OFF and the existing voice number unchanged until those conditions are met.

## Reuse the existing Twilio test number — optional pilot selector
The single enabled `smartjob_phone_routes` row in the current Supabase project is the existing Smart Call iPhone route. It must not be reassigned silently.

1. Isolated new endpoint `POST /api/vmv/ai-agents/test-number` validates a signed Twilio webhook, the Twilio account and an active owner-scoped Smart Call number. It does NOT change Twilio configuration.
2. **Fail-safe behavior:** If the AI pilot is disabled, the schema is absent, a configured agent is unavailable, ownership/consent is missing or the account lacks entitlements, respond with TwiML `<Redirect>` back to the existing `/api/twilio/live/voice` Smart Call handler.
3. **Only when ready** (Vercel Preview, `VMV_AI_VOICE_PILOT_ENABLED=true`, approved `vmv_ai_voice_routes` mapping for the SAME number, active agent, account owner, server-only `OPENAI_API_KEY`, billing and Twilio webhook base matching the chosen preview domain): announce a bilingual menu; press **1** for the unchanged Smart Call handler (which can have its own IVR), **2** to use the protected AI voice pilot, or wait for Smart Call default.
4. The existing number's webhook switch to this endpoint would require a *separate explicit Director/owner authorization* and a verified rollback URL. It has not been made: no direct Twilio connector is present. A webhook change affects real inbound calls, even on a test number.
5. The current connected Supabase project was read-only inspected on Nov 11/12, 2026: **no `vmv_ai_agents` or `vmv_ai_voice_routes` tables exist**. Do not activate the pilot flag or switch the webhook until the staged migration (RLS/security-reviewed) and real agent configuration are complete.
6. Before the first real test, confirm the Twilio number/account belongs to the owner; use a verified caller ID if the Twilio project is a trial account; verify Twilio's active inbound webhook URL and signature base; run a call with press 1 and press 2; test no digits and quota exhaustion; verify fallback to Smart Call; inspect costs, logs, recording/consent disclosures and customer handoff.
7. No production promotion, no live inventory, bookings, payments or autonomous admin actions. The prototype answers short informational questions using Twilio speech-to-text, server OpenAI and Twilio `<Say>`, one turn at a time. It is **not a real-time streaming speech agent**.

Current preview anchor: `https://smartjob-git-feat-vmv-smart-cal-fcbaa4-valdys-projects-b97fc7a6.vercel.app`.

## Agent Quality Lab — config review before customer contact

**Scope:** Isolated AI Agents code only. This ships an interactive **document-completeness** checker, NOT model-quality certification or live phone activation.

Files:
- Web `app/vista-app/ai-agents/agentQuality.ts`, `AgentQualityLab.tsx`, `AgentQualityLab.module.css`
- Native iPhone `apps/ios/aiAgentQuality.ts`, `AIAgentQualityLab.tsx`
- Existing owned Studio and wizard entry points updated with minimal patches.

Business capabilities:
1. Premium, mobile-first percentage of answered configuration checks, with **required** and **recommended** criteria for every role (calls, support, sales, bookings, inventory, operations, custom).
2. Highlight specific missing facts (company, city + state, hours, handoff, privacy, catalog or booking terms) with a one-tap deep link to the relevant wizard step.
3. Create a role-aware test deck (e.g. taxis: airport transfer/booking confirmation/cancellation; calls: IA disclosure; sales: unsafe discounts; stock: unverified availability).
4. Reveal an **expected business behavior** for each suggested test question; never claim these have been run through a model or prove accuracy.
5. Generate and export a training brief from business answers. Web preview offers user-initiated clipboard copy; iPhone offers native Share sheet. No automatic data egress.
6. Web demonstration includes an explicitly fictional taxi agent; the example lives **in-memory only**. It cannot contact people or persist to Supabase.
7. Native Studio adds **Calidad** and a completeness indicator to each agent card, blocks internal activation when *required* fields are missing, and opens the correct wizard step.
8. In the isolated phone pilot handler, a further server-side guard now checks owner-provided business, location, privacy, escalation and (for phone agents) AI-disclosure inputs before accepting a call. This remains inactive while the voice pilot feature flag is off.

### Safety boundaries and limitations

- Completeness percentage is computed locally from available configured facts. **100% is not approval** for public launch or phone routing.
- No new payments, automation, stock/calendar connections, Twilio rewiring or production DB operations.
- Native build / physical-device QA and staged RLS setup are still required; web `READY` confirms Next.js build only, not an Expo/TestFlight build.
- Browser demo and configured agents on the web still vanish after page reload. No private credentials or customer information should be entered in the design preview.
- All sensitive actions and final launch require verified tenant permissions, real model/voice tests, spending caps, consent/privacy review and explicit owner authorization.

### Suggested QA cases

| Fixture | Expected |
| --- | --- |
| New empty sales agent | Missing company, location, catalog, human handoff and privacy policy; cannot activate |
| Taxi in Columbus, Georgia | City/state are distinct; suggested cancellation and appointment confirmation test prompts |
| Full setup with a missing phone AI disclosure | Voice quality check remains required; voice route stays fail-closed |
| Inventory agent without real inventory integration | Expected test refuses to claim current stock |
| Full example with fictional details | Shows completed *configuration* only, never a claim that a phone call or actual AI test succeeded |
| Public preview reloaded | Example is gone; no browser draft is claimed persistent |
| User A vs User B in staging | Owner RLS must prevent cross-business access (not yet executed) |
