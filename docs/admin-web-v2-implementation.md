# Admin Web V2 — VMV Business

Branch: `feat/vmv-smart-call-control-center`. Scope: `app/admin`, `app/api/admin`, `app/api/support`, `app/vista-app/soporte`, additive SQL. Do not deploy manually to production.

## Implemented

- Six operational sections: Inicio, Bandeja, Clientes, Servicios, Equipo, Configuración.
- Server-gated staff identity (existing Supabase Auth, existing `vmv_marketing_staff`). Admin and agent roles are checked on every API request.
- Unified queue from canonical sources: `vmv_marketing_requests`, `vmv_admin_tickets`, `smartjob_provisioning_requests` and `smartjob_builder_domain_requests`.
- Client-owned web inquiries (`smartjob_web_inquiries`), AI merchant orders (`vmv_ai_orders`) and AI owner handoffs (`vmv_ai_human_requests`) stay outside VMV's internal support inbox.
- Case assignment, priorities and due dates in a separate overlay table. No duplication or replacement of canonical service requests.
- Append-only messages visible to client for Marketing/support, or internal staff notes for all case sources; staff-only read of internal notes.
- Support customer portal `/vista-app/soporte` with ticket creation, status, and replies; Marketing request replies are available in this portal by navigating to a request. No automatic external notifications.
- Marketing quote/status changes use the original table and trigger protections for quote approval and verification evidence. Customer approval is **not** a Stripe payment.
- Detailed Marketing records (Google Business Profile, diagnostic, directories, reputation) and authorized private Google photos through 90-second signed URLs.
- Clients directory: profile and billing summary read only for admin role.
- Team: view and manage explicit existing verified staff accounts, admin only; prevent self demotion/revocation and remove last admin.
- Services: subscription/plan/test-versus-live overview, redacted failed-call diagnostics, no purchase/activation controls.
- Settings: saved support SLA preference/welcome text, activity log reader, no fake automations.
- Append-only audit records for privileged mutations, and a recent-activity reader in administrator settings. Calls use the caller’s verified user ID, never a client-supplied identity.
- UI has mobile list-to-detail-to-context flow, light canvas, dark sidebar, compact typography and real counts. If queues exceed display limits, the UI shows a truncation warning instead of asserting completeness.

## Security

- No secret key in browser. Never use user-editable metadata for admin access.
- New tables have RLS. Direct anonymous/authenticated INSERT on ticket/message/metadata/audit/settings tables is denied; validated authenticated endpoints own writes.
- Profile/account reads require verified staff + server-side role; customers cannot enumerate other accounts through these endpoints.
- In support, an owner must match the canonical record before reading or posting; closed tickets or completed Marketing jobs reject customer replies.
- Public messages for line/domain requests are refused until those modules have a customer-facing notification flow.
- HTTP endpoints return no-store and never process actual charges, domain purchases, line activation, or calls.

## Still blocked / follow-up

- External notification provider approval (SMS/email/push) and delivery status.
- End-to-end authenticated browser QA with two distinct customer accounts, staff and mobile. DB schema catalog + build alone do not prove workflow.
- QA of Marketing quote changes and read-back of customer portal using a temporary test case, without modifying real requests.
- Server-side pagination/search for queues above 150 marketing/support or 100 provisioning/domains; small-case filters currently operate within the loaded records.
- Private case attachments (JPG/PNG/WEBP/PDF, max 3 MB) are included with a private Supabase Storage bucket, ownership checks and 60-second signed links. End-to-end browser upload/download QA remains outstanding.
- Staged production release, SMS deliverability, payment refunds/collections and staff handoff automation.
- LLC formation: no canonical request backend currently; do not fabricate workflow.
- Final app navigation link to `/vista-app/soporte` needs coordination with shared interface owners.
