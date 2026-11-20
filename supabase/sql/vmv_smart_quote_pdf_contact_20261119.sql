alter table public.vmv_smart_quotes add column if not exists pdf_business_contact jsonb not null default '{}'::jsonb;

create or replace function public.vmv_smart_quote_set_pdf_details(p_quote_id uuid, p_template text, p_contact jsonb)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare caller uuid := auth.uid();
begin
 if caller is null or p_template is null or p_template not in ('modern','elegant','classic')
    or p_contact is null or jsonb_typeof(p_contact) <> 'object'
    or exists (select 1 from jsonb_each(p_contact) as contact(key, value)
       where key not in ('email','website','address','phone')
          or jsonb_typeof(value) <> 'string' or length(value #>> '{}') > 180)
 then return false; end if;
 update public.vmv_smart_quotes q
 set design_template=p_template,pdf_business_contact=p_contact,updated_at=now()
 where q.id=p_quote_id and q.owner_id=caller and q.status='draft'
   and exists(select 1 from public.vmv_marketing_businesses b where b.id=q.business_id and b.owner_id=caller);
 return found;
end;
$$;
revoke all on function public.vmv_smart_quote_set_pdf_details(uuid,text,jsonb) from public, anon;
grant execute on function public.vmv_smart_quote_set_pdf_details(uuid,text,jsonb) to authenticated;
