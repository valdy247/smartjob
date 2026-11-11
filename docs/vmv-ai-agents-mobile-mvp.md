# VMV Business · AI Agents Studio (iPhone-first)

Status: **isolated draft implementation** on `feat/vmv-ai-agents`. This is not an App Store release, a production migration, or a live telephone agent.

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
