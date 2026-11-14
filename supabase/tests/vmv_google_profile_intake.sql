-- Run as database owner. All fixtures, quotes and approvals roll back.
begin;
select set_config('gbp.test_owner',(select p.id::text from public.smartjob_profiles p where not exists(select 1 from public.vmv_marketing_staff s where s.user_id=p.id) limit 1),true);
select set_config('gbp.test_other',(select p.id::text from public.smartjob_profiles p where p.id::text<>current_setting('gbp.test_owner') limit 1),true);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('gbp.test_owner'),'role','authenticated')::text,true);
set local role authenticated;
do $$
declare owner_id uuid:=current_setting('gbp.test_owner')::uuid; other_id uuid:=current_setting('gbp.test_other')::uuid;
 request_id uuid:=gen_random_uuid(); g jsonb; bad jsonb; stored jsonb; i int; blocked bool;
begin
 if owner_id is null or other_id is null then raise exception 'Two existing VMV accounts required'; end if;
 g:=jsonb_build_object('action','create','kind','storefront','googleCategory','Bakery','country','US',
 'street','123 QA Street','city','Columbus','region','GA','postal','31901','serviceAreas','',
 'phone','+17065551234','description','QA test only','openingDate','',
 'hoursEnabled',false,'hours',(select jsonb_agg(jsonb_build_object('closed',true,'start','09:00','end','17:00')) from generate_series(1,7)), 'media','[]'::jsonb);
 for i in 1..7 loop
  bad:=case i when 1 then '{}'::jsonb when 2 then g||'{"phone":"+1"}'::jsonb
   when 3 then g||'{"hoursEnabled":true}'::jsonb
   when 4 then g||'{"description":"Visit https://example.com"}'::jsonb
   when 5 then g||'{"media":[{"kind":"logo","path":"another-user/missing.png"}]}'::jsonb
   when 6 then g||'{"openingDate":"2026-02-30"}'::jsonb
   when 7 then g||'{"street":""}'::jsonb end;
  blocked:=false;
  begin
   insert into public.vmv_marketing_requests(owner_id,service_code,business_name,category_id,goal_text,agreed_to_contact,google_profile_data)
    values(owner_id,'google_profile','VMV rollback QA','bakery','QA rollback invalid request',true,bad);
  exception when check_violation or datetime_field_overflow then blocked:=true;
  end;
  if not blocked then raise exception 'Invalid case % was accepted',i; end if;
 end loop;
 insert into public.vmv_marketing_requests(id,owner_id,service_code,business_name,category_id,goal_text,agreed_to_contact,google_profile_data)
 values(request_id,owner_id,'google_profile','VMV rollback QA','bakery','QA rollback valid request',true,g);
 perform set_config('gbp.test_id',request_id::text,true);
 if not exists(select 1 from public.vmv_marketing_requests r where r.id=request_id) then raise exception 'Owner cannot read own request'; end if;
 perform set_config('request.jwt.claims',json_build_object('sub',other_id,'role','authenticated')::text,true);
 -- The second account is staff in this project, so it may read; test ownership
 -- instead using a random authenticated sub with no membership or profile.
 perform set_config('request.jwt.claims',json_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
 if exists(select 1 from public.vmv_marketing_requests r where r.id=request_id) then raise exception 'Cross-account request leak'; end if;
 blocked:=false;
 begin
  insert into public.vmv_marketing_quote_acceptances(request_id,owner_id,quote_revision,quoted_price_cents) values(request_id,owner_id,0,0);
 exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'Cross-account approval accepted'; end if;
 perform set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
 blocked:=false;
 begin
  update public.vmv_marketing_requests set status='verified',verified_at=now(),evidence_url='https://example.com' where id=request_id;
 exception when insufficient_privilege then blocked:=true; end;
 -- UPDATE may correctly affect zero rows under RLS rather than throw.
 if exists(select 1 from public.vmv_marketing_requests where id=request_id and status<>'received') then raise exception 'Owner escalated status'; end if;
 g:=g||'{"kind":"service_area","serviceAreas":"Columbus GA","action":"improve","openingDate":"2020-01-01"}'::jsonb;
 insert into public.vmv_marketing_requests(owner_id,service_code,business_name,category_id,goal_text,agreed_to_contact,google_profile_data)
 values(owner_id,'google_profile','VMV rollback QA','bakery','QA rollback private address',true,g) returning google_profile_data into stored;
 if stored->>'street'<>'' or stored->>'city'<>'' or stored->>'openingDate'<>'' then raise exception 'Private or stale data retained'; end if;
 raise notice 'PASS: 7 invalid intakes, valid insert/read, cross-account read/approval, owner status protection, address/date normalization';
end $$;
reset role;
update public.vmv_marketing_requests set quoted_price_cents=5000,quote_note='QA quote' where id=current_setting('gbp.test_id')::uuid;
set local role authenticated;
do $$ declare blocked boolean:=false; begin
 begin
  insert into public.vmv_marketing_quote_acceptances(request_id,owner_id,quote_revision,quoted_price_cents)
  values(current_setting('gbp.test_id')::uuid,current_setting('gbp.test_owner')::uuid,1,0);
 exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'Wrong price accepted'; end if;
 insert into public.vmv_marketing_quote_acceptances(request_id,owner_id,quote_revision,quoted_price_cents)
 values(current_setting('gbp.test_id')::uuid,current_setting('gbp.test_owner')::uuid,1,5000);
end $$;
reset role;
do $$ declare blocked boolean:=false; begin
 update public.vmv_marketing_requests set quoted_price_cents=6000 where id=current_setting('gbp.test_id')::uuid;
 begin
  update public.vmv_marketing_requests set status='in_progress' where id=current_setting('gbp.test_id')::uuid;
 exception when raise_exception then blocked:=true; end;
 if not blocked then raise exception 'Stale approval authorized a new price'; end if;
end $$;
set local role authenticated;
insert into public.vmv_marketing_quote_acceptances(request_id,owner_id,quote_revision,quoted_price_cents)
values(current_setting('gbp.test_id')::uuid,current_setting('gbp.test_owner')::uuid,2,6000);
reset role;
do $$ declare blocked boolean:=false; begin
 update public.vmv_marketing_requests set status='in_progress' where id=current_setting('gbp.test_id')::uuid;
 begin
  update public.vmv_marketing_requests set status='verified',verified_at=now(),evidence_url='https://example.com'
  where id=current_setting('gbp.test_id')::uuid;
 exception when check_violation then blocked:=true; end;
 if not blocked then raise exception 'Non-Google completion evidence accepted'; end if;
 update public.vmv_marketing_requests set status='verified',verified_at=now(),evidence_url='https://www.google.com/maps?cid=123'
 where id=current_setting('gbp.test_id')::uuid;
 if not exists(select 1 from public.vmv_marketing_requests where id=current_setting('gbp.test_id')::uuid and status='verified')
 then raise exception 'Approved case could not complete'; end if;
end $$;
rollback;
select 'PASS: rollback complete; no test requests persisted' as result;
