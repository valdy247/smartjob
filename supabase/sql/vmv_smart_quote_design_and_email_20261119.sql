-- Smart Quote: persist the chosen PDF design and distinguish provider-accepted mail.
-- Ownership, prices and payment status remain controlled by existing workflows.
begin;
alter table public.vmv_smart_quotes
 add column if not exists design_template text not null default 'modern';
alter table public.vmv_smart_quotes
 drop constraint if exists vmv_smart_quotes_design_template_check;
alter table public.vmv_smart_quotes
 add constraint vmv_smart_quotes_design_template_check
 check (design_template in ('modern','elegant','classic'));

alter table public.vmv_smart_quote_events
 drop constraint if exists vmv_smart_quote_events_kind_check;
alter table public.vmv_smart_quote_events
 add constraint vmv_smart_quote_events_kind_check
 check (kind in ('created','edited','approved','sent_manual','sent_email','cancelled'));

create or replace function public.vmv_smart_quote_set_design(
 p_quote_id uuid,p_template text)
returns boolean language plpgsql security definer
set search_path=public,pg_temp as $$
declare caller uuid:=auth.uid();q public.vmv_smart_quotes%rowtype;
begin
 if caller is null or p_template not in ('modern','elegant','classic') or
    not exists(select 1 from public.smartjob_profiles where id=caller) then
    return false;
 end if;
 select * into q from public.vmv_smart_quotes
  where id=p_quote_id and owner_id=caller
   and exists(select 1 from public.vmv_marketing_businesses b
    where b.id=business_id and b.owner_id=caller)
  for update;
 if not found or q.status<>'draft' then return false; end if;
 update public.vmv_smart_quotes set design_template=p_template,updated_at=now()
  where id=q.id;
 return true;
end $$;
revoke all on function public.vmv_smart_quote_set_design(uuid,text) from public,anon;
grant execute on function public.vmv_smart_quote_set_design(uuid,text) to authenticated;

create or replace function public.vmv_smart_quote_set_status(p_quote_id uuid,p_action text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare caller uuid:=auth.uid(); q public.vmv_smart_quotes%rowtype; next_status text; kind text;
begin
 if caller is null or not exists(select 1 from public.smartjob_profiles where id=caller)
    then return false; end if;
 select * into q from public.vmv_smart_quotes
  where id=p_quote_id and owner_id=caller and exists
  (select 1 from public.vmv_marketing_businesses b where b.id=business_id and b.owner_id=caller)
  for update;
 if not found then return false; end if;
 if p_action='approve' and q.status='draft' and q.valid_until>=current_date then
  next_status:='approved';kind:='approved';
 elsif p_action='mark_sent' and q.status='approved' and q.valid_until>=current_date then
  next_status:='sent';kind:='sent_manual';
 elsif p_action='mark_sent_email' and q.status='approved' and q.valid_until>=current_date then
  next_status:='sent';kind:='sent_email';
 elsif p_action='cancel' and q.status in ('draft','approved','sent') then
  next_status:='cancelled';kind:='cancelled';
 else return false; end if;
 update public.vmv_smart_quotes set status=next_status,updated_at=now(),
  approved_at=case when next_status='approved' then now() else approved_at end,
  sent_at=case when next_status='sent' then now() else sent_at end,
  cancelled_at=case when next_status='cancelled' then now() else cancelled_at end
 where id=q.id;
 insert into public.vmv_smart_quote_events(owner_id,business_id,quote_id,kind,revision)
 values(caller,q.business_id,q.id,kind,q.revision);
 return true;
end $$;
revoke all on function public.vmv_smart_quote_set_status(uuid,text) from public,anon;
grant execute on function public.vmv_smart_quote_set_status(uuid,text) to authenticated;
commit;