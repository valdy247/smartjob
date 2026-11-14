# VMV Marketing — Action Center (pilot)

**Status:** feature implementation on `feat/vmv-smart-call-control-center`; not a production release.
**Scope:** business-owner requests and human-assisted execution when directory APIs are unavailable.

## Customer flow
1. Open `/vista-app/marketing`, which defaults to **Acciones**.
2. While signed in to an existing VMV Business account, pick a standardized request: Google Business Profile, Apple Maps, Bing Places, Yelp, Search Console setup, website SEO, campaign setup, review strategy, or another request.
3. VMV pre-fills the account's company name, website and the canonical category from Web Services when available.
4. Owner explains the goal and explicitly agrees to be contacted and have request details processed.
5. Submission saves a new row in `vmv_marketing_requests` with status `received`. No provider-side action or payment is performed.
6. Customer can read progress, quoted price, staff message, and proof URL. Owners only see their own records.
7. If staff issues a price quote (including $0 for free work), the customer approves the current amount and revision. Approval is recorded in `vmv_marketing_quote_acceptances`; it does not charge money.
8. Authorized staff then updates the state and, for `verified`, must supply a public evidence URL and verification timestamp.

## Staff provisioning: explicitly administered
The table `vmv_marketing_staff` is deliberately empty at installation. Never automatically grant staff access to the first signed-in account, self-reported admin status, or editable user metadata.

Before accepting real customer requests, a verified project administrator must review the identity of the operator using trusted account records and provision access using the Supabase SQL editor, substituting an independently verified auth.users ID:

```sql
insert into public.vmv_marketing_staff (user_id, role)
values ('<VERIFIED_AUTH_USER_UUID>', 'admin')
on conflict (user_id) do update set role = excluded.role;
```

The authenticated staff user then gets a **Bandeja del equipo** tab in Marketing → Acciones. Staff can prepare a quote, update status and provide proof. Customers cannot elevate themselves. Avoid granting staff to unrelated Supabase users.

## Security invariants
- `vmv_marketing_requests`: RLS + customer SELECT/INSERT only; INSERT column privileges exclude price, stage, evidence and owner timestamps.
- `vmv_marketing_quote_acceptances`: owner INSERT only if matching *current* quoted revision and amount; a changed quote invalidates prior approvals.
- Staff UPDATE requires membership in `vmv_marketing_staff`; trigger blocks started/verified states until approval and blocks verified state without URL + timestamp.
- Private rate-limit trigger allows at most 8 requests per owner per rolling 24 hours; anonymous accounts and other app users without a `smartjob_profiles` record cannot create requests.
- No automatic publication, fabricated claims, uncontrolled browsing, SMS, email, or charges.
- Every third-party connection requires delegated OAuth/approved provider access; this pilot stores no third-party access tokens.
- All the above tables are additive and independent of AI Agents, Web Services, Smart Call, billing and the native iOS app.

## Automated action available now
The existing `/api/marketing/site-audit` uses Google PageSpeed Insights for read-only mobile performance/SEO/accessibility checks; it may return Google quota 429 without a dedicated API key. The UI displays a link to Google's free public PageSpeed website if the quota is exhausted. This is technical site analysis, not a search rank or sales guarantee.

## Tested
- RLS policies enabled on all three public tables, verified via Supabase catalog.
- Anonymous SELECT privilege denied on requests.
- Customer INSERT privilege granted only on permitted input columns, not status.
- Simulated authenticated customer request successfully INSERTed inside a transaction and the transaction was rolled back. The database remained at 0 sample customer requests.

## Not delivered by this pilot
- Real publication or verification of Google/Bing/Apple/Yelp profiles.
- Google Search Console OAuth credentials, connector and data sync.
- Stripe billing for manual services. Quote approval records intent **only**, never processes payment.
- Notifications to staff or customers, scheduled jobs, domain verification, automatic form completion on provider sites.
- Multi-location business profiles, permanent encrypted third-party credentials, end-to-end native iOS UI.
- A staff user is not pre-provisioned; the operator setup above is a launch gate.

## Next implementation gates
1. Verify and provision the authorized operator; test customer → staff → quote → customer approval → verified evidence on separate test accounts.
2. Configure Google OAuth credentials and redirect URI; wire Search Console read-only scopes after explicit consent.
3. Add connected account/token vault using server-only secrets and proper disconnect/refresh.
4. Add notification and billing workflows with approved product catalog and quote acceptance; never collect payment by guessing prices.
5. Integrate Web Services' Google Business Profile work through a shared provider adapter, without duplicating the module.
6. Add idempotency, request audit events and customer cancellation before allowing any unattended external write.

Related SQL: `supabase/sql/vmv_marketing_action_center.sql`, `supabase/sql/vmv_marketing_column_permissions.sql`, `supabase/sql/vmv_marketing_rate_guard.sql`.
