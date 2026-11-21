# VMV platform foundation — approved sequence

Valdy selected items 1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14, 15 and 16 from the numbered platform-foundation list. Work is sequential, retaining all other modules on `feat/vmv-smart-call-control-center`.

| Item | Scope | Status |
| --- | --- | --- |
| 1 | Shared web/native account, business data, preferences and balances | In progress: shared first-login mapper and account-change isolation; real cross-device validation pending |
| 2 | Complete Spanish/English interface and language preference | Pending Director validation; existing internationalization work must be preserved |
| 3 | Short registration, request details progressively | Pending |
| 4 | Central business profile | Pending |
| 5 | Multiple services using the same business information | Pending |
| 7 | Discover, compare, purchase and manage services | Pending |
| 8 | Clear and truthful service states | Pending |
| 10 | Review and authorize external actions and spending | Pending |
| 11 | Useful notifications linking to actions | Pending |
| 12 | Internal search | Pending |
| 13 | Contextual help and service support | Pending |
| 14 | Accessibility, performance and mobile adaptation | Pending |
| 15 | Remove inactive controls and fictional customer data | Pending |
| 16 | Distinguish demonstrations from active services | Pending |

## Item 1 — implementation

Web and native use `lib/account-profile.ts` to initialize `smartjob_profiles` consistently. Native first login previously omitted business identity and appearance fields. Existing profiles remain authoritative: initialization uses `ignoreDuplicates`, with a follow-up read if another device created the row.

Native identity changes clear account and billing summaries, activation profile, call history, greetings and assistant preferences. Account summaries and call-history responses are guarded against late requests from a previous account. Returning to the app refreshes authoritative account and billing data.

These changes do not migrate existing incomplete profiles automatically and do not create paid permissions from user metadata. There is no new schema or RLS change.

## Dependencies and remaining verification

- Native sessions and the web Smart Call proxy intentionally use the existing isolated telephone pilot API. Do not switch this endpoint until server billing credentials, pilot flags and telephone behavior have been checked in the new deployment.
- Some app-to-web links still point to the older business website. Replace only after validating the destination and module handoff.
- Validate a real account in web and iPhone, including business identity, preference changes, balances and sign-out/account-switch behavior.
- Run `node --test scripts/account-profile.test.cjs`, web typecheck/build and native typecheck.
- Fixed the pre-existing missing parenthesis at `apps/ios/BusinessServicesPanel.tsx:101` as a separate minimal build repair. Native typecheck passes with this repair.
- Verification: 4 profile tests and 17 interface-language tests pass; full web build (including bridge tests) passes. Real device/account tests remain pending.
- Production deployment is not authorized by this implementation request.
