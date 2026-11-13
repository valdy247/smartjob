-- Private creation-stage product list: independent images and deletion survive reload.
-- Fully reversible; no real customer records or payment APIs are touched.
begin;
select set_config('request.jwt.claim.sub',(select id::text from auth.users limit 1),true);
set local role authenticated;
do $qa$
declare
 v_owner uuid:=auth.uid();
 v_items jsonb;
 v_read jsonb;
begin
 if v_owner is null then raise exception 'QA owner missing';end if;
 v_items='[{"id":"ae5cf5ce-1a1b-42b2-a2a1-111111111111","title":"Pastel ficticio","image":"https://example.invalid/qa-cake.jpg","description":"Pedido de prueba","price":""},{"id":"ae5cf5ce-1a1b-42b2-a2a1-222222222222","title":"Tartaletas ficticias","image":"https://example.invalid/qa-tartlets.jpg","description":"Segundo producto","price":"Desde 10"}]'::jsonb;
 insert into public.smartjob_web_intake_products(owner_id,items)values(v_owner,v_items)
 on conflict(owner_id) do update set items=excluded.items,updated_at=now();
 select items into v_read from public.smartjob_web_intake_products where owner_id=v_owner;
 if jsonb_array_length(v_read)<>2 or v_read#>>'{0,title}'<>'Pastel ficticio'
 or v_read#>>'{1,image}' not like '%qa-tartlets.jpg' then
  raise exception 'Two independent products did not reload';end if;
 update public.smartjob_web_intake_products set
 items=jsonb_set(items,'{0,image}','""'::jsonb),updated_at=now()
 where owner_id=v_owner;
 select items into v_read from public.smartjob_web_intake_products where owner_id=v_owner;
 if v_read#>>'{0,image}'<>'' or v_read#>>'{1,image}' not like '%qa-tartlets.jpg' then
  raise exception 'Removing one product image removed another';end if;
 update public.smartjob_web_intake_products set items=v_read - 0 where owner_id=v_owner;
 select items into v_read from public.smartjob_web_intake_products where owner_id=v_owner;
 if jsonb_array_length(v_read)<>1 or v_read#>>'{0,title}'<>'Tartaletas ficticias'
 then raise exception 'Deleted product reappeared after fresh select';end if;
end $qa$;
reset role;
do $qa$
begin
 if has_table_privilege('anon','public.smartjob_web_intake_products','SELECT')
 then raise exception 'Anonymous visitor can read private product drafts';end if;
 if not has_table_privilege('authenticated','public.smartjob_web_intake_products','INSERT')
 or not has_table_privilege('authenticated','public.smartjob_web_intake_products','UPDATE')
 then raise exception 'Owner product draft saving unavailable';end if;
end $qa$;
select 'PASS: independent products, image removal, fresh read, deletion and private access' as result;
rollback;