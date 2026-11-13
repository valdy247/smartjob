# VMV AI Agents · Native iOS phone-sales pilot

**Branch:** `feat/vmv-smart-call-control-center`.
**Scope:** `apps/ios/AIAgentsCommerceStudio.tsx`,
`apps/ios/aiAgentsCommerceData.ts`, plus a small launch point in
`apps/ios/AIAgentsStudio.tsx`. No shared Home, Smart Call, translator,
Twilio routing, billing, production deployments or unrelated components changed.

## Implemented

- New **Ventas por teléfono** screen within the iPhone AI Agents module.
- Owner selects a previously saved agent, including the one selected for their test number.
- Configure channel independently from skills and permissions: Chat / Teléfono /
  Teléfono y chat; sales, prepare orders, buyer-confirmation and payment-link permissions.
  These save to the agent's existing Supabase configuration with optimistic revision
  enforcement. Existing business training is preserved.
- Business-scoped approved catalog: name, SKU, USD price, description,
  tracked stock quantity or manual confirmation, product activation,
  owner approval and editing with optimistic conflict detection.
- View **real telephone-origin test orders** and their invoice lines, status,
  payment state and audit events. Telephone buyer acceptance cannot be fabricated
  by tapping a UI button.
- Optional lab action prepares a synthetic test quote against server-authoritative
  product price and inventory. Buyer acceptance simulation is explicitly marked
  as simulation and only possible for lab-origin orders.
- Merchant-specific Stripe Connect TEST Checkout remains unavailable until a
  verified merchant account and server keys are attached to the business.
  This flow is completely separate from VMV SaaS subscription billing.
- No prices, inventory, products, delivery terms or deposits invented.

## Verifications

- Expo cloud Linux sandbox from commit `47148088137ca3222cffbb427e24bdda2c4897ed`
  followed by pull to `8fc43d8cdbe1a472e264e90209c7eebe5aaa85de`.
- `cd apps/ios && npm install && npx tsc --noEmit --pretty false`: **PASS**.
- Supabase transaction-only smoke test: phone quote → quantity correction →
  buyer acceptance → `awaiting_payment`, with `payment_status=not_started`,
  server-calculated total and previous quote canceled: **PASS**;
  transaction **rolled back**. No demo products or orders persisted.
- Existing VMV merchant payment account for this business: **none configured**.
  Current catalog: **0**. No sale and no payment processed.
- Internal iOS Preview build `8d3fcd7b-be52-42e3-b740-b19b03ce2e12`
  from commit `8fc43d8cdbe1a472e264e90209c7eebe5aaa85de`: **ERROR** at
  EAS signing credentials stage, specifically
  `Entity not authorized: AppleAppIdentifierEntity ... action=READ`.
  The connected Expo actor has `VIEW,RUN` scope only. This is an Expo
  account permissions / signing-resource authorization blocker, NOT a TypeScript
  error. There is currently **no installable new IPA** produced by this run.

## User walkthrough (when native build becomes available)

1. Open **VMV Business → AI Agents → Ventas por teléfono → 1 · Agente**.
   Select the exact agent chosen for the test number. Choose
   `Teléfono` or `Teléfono y chat`.
2. Enable `Vender a clientes`, `Preparar pedidos`, and
   `Confirmar tras aceptación del comprador`, and save. AI disclosure
   must already be authorized on that agent. These capabilities apply to
   **the next phone call**, not a call already in progress.
3. Go to `2 · Catálogo`. Add **actual approved business** products,
   prices and available stock. With `Confirmación humana` for
   inventory, the agent will not automatically quote a confirmed total.
4. From a different telephone, dial the owner's authorized test number;
   choose `2` in the VMV top-level menu. Ask for a specific approved
   item, correct the quantity, and accept the final TEST quote.
5. In `3 · Pedidos`, tap `Actualizar pedidos` to see the new telephone
   order. Verify the amount and that it says **NO PAGADO**.
6. A real buyer payment requires a separate merchant-connected checkout
   and provider verification. The current pilot is test mode only.
   No card numbers are collected by the voice assistant.

## Deployment blocker and secure next step

Expo project `98b22fe3-9111-42d7-bdab-7ca7208dc257` has owner
`smart-job`. The connected Expo actor `valdy2471` cannot read the
Apple app identifier signing resource used for the iOS build.
The account administrator should assign a role allowing access to
credentials (**Developer** or higher; **Release Manager** or higher when
credential protection is enabled), or initiate the build using their
authorized account. Do not transmit credentials or passwords via chat.
Once permissions are corrected, rerun the `preview` build on this
same shared branch. No production promotion or automatic App Store
submission is authorized.

## Rollback and safety

The native module is isolated behind its AI Agents launch card.
Revert only the three files under `apps/ios` if needed.
The existing phone menu, Smart Call bridge and translator remain unchanged.
All test quotes remain traceable and cannot be counted as paid sales.
