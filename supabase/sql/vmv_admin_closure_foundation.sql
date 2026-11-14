-- Admin closure 01: canonical queue, notices, history and retry keys.
-- Existing service requests remain their sole source of truth.
alter table public.vmv_admin_tickets
 add column if not exists request_key uuid,
 add column if not exists related_ticket_id uuid references public.vmv_admin_tickets(id);
create unique index if not exists vmv_admin_tickets_retry_idx on public.vmv_admin_tickets(owner_id,request_key) where request_key is not null;
create index if not exists vmv_admin_tickets_related_idx on public.vmv_admin_tickets(related_ticket_id);
alter table public.vmv_admin_messages add column if not exists request_key uuid;
create unique index if not exists vmv_admin_messages_retry_idx on public.vmv_admin_messages(author_id,request_key) where request_key is not null;
alter table public.vmv_admin_attachments add column if not exists visibility text not null default 'shared'
 check (visibility in ('shared','internal'));
drop policy if exists vmv_admin_attachments_staff_or_owner_read on public.vmv_admin_attachments;
create policy vmv_admin_attachments_visibility_read on public.vmv_admin_attachments
 for select to authenticated using(
 exists (select 1 from public.vmv_marketing_staff s where s.user_id=(select auth.uid()))
 or (visibility='shared' and (
  (source='support' and exists(select 1 from public.vmv_admin_tickets t where t.id=source_id and t.owner_id=(select auth.uid())))
  or (source='marketing' and exists(select 1 from public.vmv_marketing_requests r where r.id=source_id and r.owner_id=(select auth.uid())))
  or (source='domain' and exists(select 1 from public.smartjob_builder_domain_requests d where d.id=source_id and d.owner_id=(select auth.uid())))
  or (source='provisioning' and exists(select 1 from public.smartjob_provisioning_requests p where p.id=source_id and p.user_id=(select auth.uid())))
 ))
);
alter table public.vmv_marketing_staff add column if not exists updated_at timestamptz not null default now();

create table if not exists public.vmv_admin_notifications (
 id bigint generated always as identity primary key,
 recipient_id uuid not null references auth.users(id) on delete cascade,
 actor_id uuid references auth.users(id) on delete set null,
 source text not null check(source in ('support','marketing','provisioning','domain')),
 source_id uuid not null,
 kind text not null check(kind in ('new_case','new_message','information_requested','quote_available','status_changed','delivered')),
 title text not null check(char_length(title) between 3 and 140),
 created_at timestamptz not null default now(),
 read_at timestamptz
);
create index if not exists vmv_admin_notices_recipient_idx on public.vmv_admin_notifications(recipient_id,created_at desc);
alter table public.vmv_admin_notifications enable row level security;
revoke all on public.vmv_admin_notifications from anon,authenticated;
grant select on public.vmv_admin_notifications to authenticated;
grant update (read_at) on public.vmv_admin_notifications to authenticated;
create policy vmv_admin_notices_owner_read on public.vmv_admin_notifications
 for select to authenticated using(recipient_id=(select auth.uid()));
create policy vmv_admin_notices_owner_read_update on public.vmv_admin_notifications
 for update to authenticated using(recipient_id=(select auth.uid()))
 with check(recipient_id=(select auth.uid()));

create table if not exists public.vmv_admin_case_history (
 id bigint generated always as identity primary key,
 source text not null check(source in ('marketing','support','provisioning','domain')),
 source_id uuid not null,
 actor_id uuid not null references auth.users(id),
 action text not null check(char_length(action) between 3 and 90),
 summary text not null check(char_length(summary) between 3 and 350),
 visibility text not null default 'internal' check(visibility in ('shared','internal')),
 detail jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index if not exists vmv_admin_history_case_idx on public.vmv_admin_case_history(source,source_id,created_at desc,id desc);
alter table public.vmv_admin_case_history enable row level security;
revoke all on public.vmv_admin_case_history from anon,authenticated;
grant select on public.vmv_admin_case_history to authenticated;
create policy vmv_admin_history_staff_owner_read on public.vmv_admin_case_history
 for select to authenticated using (
  exists(select 1 from public.vmv_marketing_staff s where s.user_id=(select auth.uid()))
  or (visibility='shared' and (
   (source='support' and exists(select 1 from public.vmv_admin_tickets t where t.id=source_id and t.owner_id=(select auth.uid())))
   or (source='marketing' and exists(select 1 from public.vmv_marketing_requests r where r.id=source_id and r.owner_id=(select auth.uid())))
   or (source='provisioning' and exists(select 1 from public.smartjob_provisioning_requests p where p.id=source_id and p.user_id=(select auth.uid())))
   or (source='domain' and exists(select 1 from public.smartjob_builder_domain_requests d where d.id=source_id and d.owner_id=(select auth.uid())))
  ))
 );

create or replace view public.vmv_admin_case_index with (security_invoker=true) as
 select 'marketing'::text as source, m.id, m.owner_id, m.business_name as title,
 m.goal_text as description, m.service_code as service, m.status,
 m.created_at, greatest(m.updated_at,coalesce(c.updated_at,m.updated_at)) as updated_at,
 m.quoted_price_cents as amount, c.assigned_to,coalesce(c.priority,'normal') as priority,c.due_at,
 coalesce(nullif(btrim(concat_ws(' ',p.first_name,p.last_name)),''),nullif(p.business_name,''),'Cliente') as client_name
 from public.vmv_marketing_requests m
 left join public.vmv_admin_case_meta c on c.source='marketing' and c.source_id=m.id
 left join public.smartjob_profiles p on p.id=m.owner_id
 union all
 select 'support',t.id,t.owner_id,t.subject,t.description,t.service_code,t.status,
 t.created_at,greatest(t.updated_at,coalesce(c.updated_at,t.updated_at)),
 null::integer,c.assigned_to,coalesce(c.priority,'normal'),c.due_at,
 coalesce(nullif(btrim(concat_ws(' ',p.first_name,p.last_name)),''),nullif(p.business_name,''),'Cliente')
 from public.vmv_admin_tickets t
 left join public.vmv_admin_case_meta c on c.source='support' and c.source_id=t.id
 left join public.smartjob_profiles p on p.id=t.owner_id
 union all
 select 'provisioning',t.id,t.user_id,'Solicitud de línea telefónica'::text,
 'Revisión de aprovisionamiento'::text,'smart_call'::text,t.status,
 t.created_at,greatest(t.updated_at,coalesce(c.updated_at,t.updated_at)),
 null::integer,c.assigned_to,coalesce(c.priority,'normal'),c.due_at,
 coalesce(nullif(btrim(concat_ws(' ',p.first_name,p.last_name)),''),nullif(p.business_name,''),'Cliente')
 from public.smartjob_provisioning_requests t
 left join public.vmv_admin_case_meta c on c.source='provisioning' and c.source_id=t.id
 left join public.smartjob_profiles p on p.id=t.user_id
 union all
 select 'domain',d.id,d.owner_id,d.hostname,d.intent,'domain'::text,d.status,
 d.created_at,greatest(d.updated_at,coalesce(c.updated_at,d.updated_at)),
 null::integer,c.assigned_to,coalesce(c.priority,'normal'),c.due_at,
 coalesce(nullif(btrim(concat_ws(' ',p.first_name,p.last_name)),''),nullif(p.business_name,''),'Cliente')
 from public.smartjob_builder_domain_requests d
 left join public.vmv_admin_case_meta c on c.source='domain' and c.source_id=d.id
 left join public.smartjob_profiles p on p.id=d.owner_id;
revoke all on public.vmv_admin_case_index from public,anon,authenticated;
grant select on public.vmv_admin_case_index to service_role;

create or replace function public.vmv_admin_queue_metrics()
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object(
 'total',count(*),
 'new',count(*) filter(where status in ('new','received','pending')),
 'unassigned',count(*) filter(where assigned_to is null and status not in ('closed','resolved','cancelled','verified','activated','completed')),
 'progress',count(*) filter(where status in ('approved','in_progress','contacted')),
 'waiting',count(*) filter(where status in ('needs_customer','quoted')),
 'overdue',count(*) filter(where due_at<now() and status not in ('closed','resolved','cancelled','verified','activated','completed')),
 'soon',count(*) filter(where due_at<now()+interval '48 hours' and status not in ('closed','resolved','cancelled','verified','activated','completed')),
 'sources', jsonb_build_object(
  'marketing',count(*) filter(where source='marketing'),
  'support',count(*) filter(where source='support'),
  'provisioning',count(*) filter(where source='provisioning'),
  'domain',count(*) filter(where source='domain')
 )
 ) from public.vmv_admin_case_index;
$$;
revoke all on function public.vmv_admin_queue_metrics() from public,anon,authenticated;
grant execute on function public.vmv_admin_queue_metrics() to service_role;
