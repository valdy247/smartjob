-- Smart Quote security contract. Run only after applying its migration.
-- Read-only assertions; the transaction rolls back regardless of success.
begin;
do $$
declare rls_ok boolean;
begin
 if to_regclass('public.vmv_smart_quote_catalog') is null or
    to_regclass('public.vmv_smart_quotes') is null or
    to_regclass('public.vmv_smart_quote_events') is null then
   raise exception 'Smart Quote schema missing'; end if;
 select bool_and(relrowsecurity) into rls_ok from pg_class
 where oid in ('public.vmv_smart_quote_catalog'::regclass,
               'public.vmv_smart_quotes'::regclass,
               'public.vmv_smart_quote_events'::regclass);
 if not coalesce(rls_ok,false) then raise exception 'RLS not enabled on all tables'; end if;
 if has_table_privilege('anon','public.vmv_smart_quotes','SELECT') or
    has_table_privilege('anon','public.vmv_smart_quote_catalog','SELECT') or
    has_table_privilege('authenticated','public.vmv_smart_quotes','INSERT') or
    has_table_privilege('authenticated','public.vmv_smart_quotes','UPDATE') or
    has_table_privilege('authenticated','public.vmv_smart_quote_events','INSERT') then
   raise exception 'Unsafe table permissions'; end if;
 if not has_function_privilege('authenticated',
    'public.vmv_smart_quote_save(uuid,uuid,text,text,text,jsonb,integer,integer,integer,integer,date,text)','EXECUTE') or
    not has_function_privilege('authenticated','public.vmv_smart_quote_set_status(uuid,text)','EXECUTE') then
   raise exception 'Owner RPC permission missing'; end if;
 if has_function_privilege('anon',
    'public.vmv_smart_quote_save(uuid,uuid,text,text,text,jsonb,integer,integer,integer,integer,date,text)','EXECUTE') or
    has_function_privilege('anon','public.vmv_smart_quote_set_status(uuid,text)','EXECUTE') then
   raise exception 'Anonymous mutation access'; end if;
end $$;
rollback;
