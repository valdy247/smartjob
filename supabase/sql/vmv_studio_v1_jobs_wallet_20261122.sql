-- VMV Video Studio V1: isolated owner-scoped persistent jobs and transactional credits.
-- Safe additive migration: no legacy pilot/video/call tables are modified.
create table if not exists public.vmv_studio_wallets(
 owner_id uuid primary key references auth.users(id) on delete cascade,
 balance integer not null default 0 check(balance>=0),
 reserved integer not null default 0 check(reserved>=0 and reserved<=balance),
 updated_at timestamptz not null default now()
);
create table if not exists public.vmv_studio_jobs(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 client_key uuid not null,
 title text not null check(length(title) between 3 and 140),
 topic text not null check(length(topic) between 3 and 220),
 audience text not null check(length(audience) between 2 and 140),
 style text not null check(style in ('stickman','cartoon2d','cartoon3d','clay','illustrated')),
 seconds integer not null check(seconds between 15 and 180 and seconds%5=0),
 language text not null check(language in ('es','en','pt','fr','de','it')),
 voice_provider text not null check(voice_provider in ('openai','elevenlabs')),
 voice_id text not null check(length(voice_id) between 2 and 64),
 subtitles boolean not null default true,
 quality_mode text not null check(quality_mode in ('turbo','high')),
 source_platform text not null default 'idea',
 source_url text,
 scenes jsonb not null check(jsonb_typeof(scenes)='array' and jsonb_array_length(scenes) between 3 and 36),
 status text not null default 'queued_images' check(status in
 ('queued_images','generating_images','awaiting_image_approval','queued_animation',
  'animating','voice','assembling','verifying','completed','failed','cancelled')),
 phase text not null default 'En cola',
 progress integer not null default 0 check(progress between 0 and 100),
 eta_seconds integer,
 assets jsonb not null default '{}'::jsonb check(jsonb_typeof(assets)='object'),
 output_path text,
 failure_code text,
 charge_credits integer not null check(charge_credits>0),
 credits_settled boolean not null default false,
 version integer not null default 0,
 lease_token uuid,
 lease_expires_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 finished_at timestamptz,
 unique(owner_id,client_key)
);
create table if not exists public.vmv_studio_credit_ledger(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 job_id uuid references public.vmv_studio_jobs(id) on delete set null,
 kind text not null check(kind in ('purchase','reserve','capture','release','regenerate','refund')),
 balance_delta integer not null default 0,
 reserved_delta integer not null default 0,
 external_ref text not null,
 created_at timestamptz not null default now(),
 unique(kind,external_ref)
);
create index if not exists vmv_studio_job_queue_idx on public.vmv_studio_jobs(status,lease_expires_at,created_at);
create index if not exists vmv_studio_job_owner_idx on public.vmv_studio_jobs(owner_id,created_at desc);
create index if not exists vmv_studio_ledger_owner_idx on public.vmv_studio_credit_ledger(owner_id,created_at desc);
alter table public.vmv_studio_wallets enable row level security;
alter table public.vmv_studio_jobs enable row level security;
alter table public.vmv_studio_credit_ledger enable row level security;
revoke all on public.vmv_studio_wallets,public.vmv_studio_jobs,public.vmv_studio_credit_ledger from public,anon,authenticated;
grant select on public.vmv_studio_wallets,public.vmv_studio_jobs,public.vmv_studio_credit_ledger to authenticated;
drop policy if exists vmv_studio_wallet_owner_select on public.vmv_studio_wallets;
create policy vmv_studio_wallet_owner_select on public.vmv_studio_wallets
 for select to authenticated using(owner_id=(select auth.uid()));
drop policy if exists vmv_studio_job_owner_select on public.vmv_studio_jobs;
create policy vmv_studio_job_owner_select on public.vmv_studio_jobs
 for select to authenticated using(owner_id=(select auth.uid()));
drop policy if exists vmv_studio_ledger_owner_select on public.vmv_studio_credit_ledger;
create policy vmv_studio_ledger_owner_select on public.vmv_studio_credit_ledger
 for select to authenticated using(owner_id=(select auth.uid()));

-- All privileged mutations are accessible ONLY using the server-side service_role.
create or replace function public.vmv_studio_create_job(
 p_owner uuid,p_key uuid,p_payload jsonb
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;v_seconds int;v_price int;v_available int;v_style text;v_quality text;v_scenes jsonb;
begin
 if p_owner is null or p_key is null or p_payload is null then raise exception 'studio_invalid_request';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,602233));
 select id into v_id from public.vmv_studio_jobs where owner_id=p_owner and client_key=p_key;
 if v_id is not null then return v_id;end if;
 v_seconds=(p_payload->>'seconds')::integer;
 v_quality=p_payload->>'quality_mode';
 v_style=p_payload->>'style';
 v_scenes=p_payload->'scenes';
 if v_seconds is null or v_seconds<15 or v_seconds>180 or v_seconds%5<>0 or
  v_quality not in ('turbo','high') or
  v_style not in ('stickman','cartoon2d','cartoon3d','clay','illustrated') or
  v_scenes is null or jsonb_typeof(v_scenes)<>'array' or
  jsonb_array_length(v_scenes)<>v_seconds/5 then
  raise exception 'studio_invalid_request';
 end if;
 v_price=v_seconds*(case when v_quality='high' then 25 else 10 end)/10;
 insert into public.vmv_studio_wallets(owner_id) values(p_owner) on conflict(owner_id) do nothing;
 select balance-reserved into v_available from public.vmv_studio_wallets where owner_id=p_owner for update;
 if v_available<v_price then raise exception 'studio_insufficient_credits';end if;
 insert into public.vmv_studio_jobs(
  owner_id,client_key,title,topic,audience,style,seconds,language,voice_provider,
  voice_id,subtitles,quality_mode,source_platform,source_url,scenes,charge_credits)
 values(
  p_owner,p_key,left(p_payload->>'title',140),left(p_payload->>'topic',220),
  left(p_payload->>'audience',140),v_style,v_seconds,p_payload->>'language',
  p_payload->>'voice_provider',p_payload->>'voice_id',
  coalesce((p_payload->>'subtitles')::boolean,true),v_quality,
  left(coalesce(p_payload->>'source_platform','idea'),20),
  left(p_payload->>'source_url',1000),
  v_scenes,v_price
 ) returning id into v_id;
 update public.vmv_studio_wallets set reserved=reserved+v_price,updated_at=now() where owner_id=p_owner;
 insert into public.vmv_studio_credit_ledger(owner_id,job_id,kind,reserved_delta,external_ref)
 values(p_owner,v_id,'reserve',v_price,'job:'||v_id::text);
 return v_id;
end $$;
revoke all on function public.vmv_studio_create_job(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.vmv_studio_create_job(uuid,uuid,jsonb) to service_role;

create or replace function public.vmv_studio_credit_finalize(p_id uuid,p_success boolean)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_job public.vmv_studio_jobs%rowtype;
begin
 select * into v_job from public.vmv_studio_jobs where id=p_id for update;
 if not found then return false;end if;
 if v_job.credits_settled then return true;end if;
 if p_success and v_job.status<>'completed' then return false;end if;
 if not p_success and v_job.status not in ('failed','cancelled') then return false;end if;
 update public.vmv_studio_wallets
  set balance=balance-(case when p_success then v_job.charge_credits else 0 end),
      reserved=reserved-v_job.charge_credits,updated_at=now()
  where owner_id=v_job.owner_id and reserved>=v_job.charge_credits;
 if not found then raise exception 'studio_wallet_inconsistent';end if;
 insert into public.vmv_studio_credit_ledger(owner_id,job_id,kind,balance_delta,reserved_delta,external_ref)
 values(v_job.owner_id,v_job.id,case when p_success then 'capture' else 'release' end,
  case when p_success then -v_job.charge_credits else 0 end,-v_job.charge_credits,
  'final:'||v_job.id::text);
 update public.vmv_studio_jobs set credits_settled=true,updated_at=now() where id=v_job.id;
 return true;
end $$;
revoke all on function public.vmv_studio_credit_finalize(uuid,boolean) from public,anon,authenticated;
grant execute on function public.vmv_studio_credit_finalize(uuid,boolean) to service_role;

-- Only a verified Stripe TEST-MODE webhook may call this from the backend.
create or replace function public.vmv_studio_credit_purchase(
 p_owner uuid,p_credits integer,p_session text
)returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;
begin
 if p_owner is null or p_credits not in (50,120,300) or
    p_session is null or p_session !~ '^cs_test_[A-Za-z0-9_]{12,240}$'
 then raise exception 'studio_invalid_purchase';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,602233));
 insert into public.vmv_studio_wallets(owner_id) values(p_owner) on conflict do nothing;
 insert into public.vmv_studio_credit_ledger(owner_id,kind,balance_delta,external_ref)
 values(p_owner,'purchase',p_credits,p_session)
 on conflict(kind,external_ref) do nothing returning id into v_id;
 if v_id is null then return false;end if;
 update public.vmv_studio_wallets set balance=balance+p_credits,updated_at=now()
 where owner_id=p_owner;
 return true;
end $$;
revoke all on function public.vmv_studio_credit_purchase(uuid,integer,text) from public,anon,authenticated;
grant execute on function public.vmv_studio_credit_purchase(uuid,integer,text) to service_role;

create or replace function public.vmv_studio_scene_update(
 p_owner uuid,p_job uuid,p_action text,p_index integer default null,
 p_value text default null,p_regen boolean default false
) returns public.vmv_studio_jobs language plpgsql security definer
set search_path=public,pg_temp as $$
declare v_job public.vmv_studio_jobs%rowtype;v_scene jsonb;v_scenes jsonb;v_n int;v_all boolean;v_path text;
begin
 select * into v_job from public.vmv_studio_jobs
 where id=p_job and owner_id=p_owner for update;
 if not found or v_job.status<>'awaiting_image_approval' then raise exception 'studio_scene_locked';end if;
 v_scenes=v_job.scenes;v_n=jsonb_array_length(v_scenes);
 if p_action='cancel' then
  update public.vmv_studio_jobs set status='cancelled',phase='Cancelado',lease_token=null,
   lease_expires_at=null,version=version+1,updated_at=now() where id=p_job returning * into v_job;
  perform public.vmv_studio_credit_finalize(p_job,false);
  return v_job;
 end if;
 if p_action='approve_all' then
  if exists(select 1 from jsonb_array_elements(v_scenes) x where
    coalesce(x->>'imagePath','')='') then raise exception 'studio_images_not_ready';end if;
  select jsonb_agg(x||'{"approved":true}'::jsonb) into v_scenes
  from jsonb_array_elements(v_scenes) x;
 elsif p_index is not null and p_index>=0 and p_index<v_n then
  v_scene=v_scenes->p_index;
  if p_action='approve' then
   if coalesce(v_scene->>'imagePath','')='' then raise exception 'studio_images_not_ready';end if;
   v_scene=v_scene||'{"approved":true}'::jsonb;
  elsif p_action='edit_scene' and p_value is not null and length(p_value) between 5 and 950 then
   if p_regen then
    perform pg_advisory_xact_lock(hashtextextended(p_owner::text,602233));
    update public.vmv_studio_wallets set balance=balance-1,updated_at=now()
     where owner_id=p_owner and balance-reserved>=1;
    if not found then raise exception 'studio_insufficient_credits';end if;
    insert into public.vmv_studio_credit_ledger(owner_id,job_id,kind,balance_delta,external_ref)
    values(p_owner,p_job,'regenerate',-1,'regen:'||p_job::text||':'||v_job.version::text);
    if length(p_value)>230 then raise exception 'studio_speech_too_long';end if;
    -- Invalidate the frame, preserve all other approved frames.
    v_scene=v_scene||jsonb_build_object('imagePath',null,'approved',false);
   else
    v_scene=v_scene||'{"approved":false}'::jsonb;
   end if;
   -- p_value uses a JSON envelope {"field":"speech"|"imagePrompt","value":"..."}.
   if p_value is null then raise exception 'studio_invalid_edit';end if;
   v_path=case when p_regen then 'imagePrompt' else 'speech' end;
   v_scene=jsonb_set(v_scene,array[v_path],to_jsonb(p_value),true);
  else raise exception 'studio_invalid_action';end if;
  v_scenes=jsonb_set(v_scenes,array[p_index::text],v_scene,false);
 else raise exception 'studio_invalid_action';end if;
 select bool_and((x->>'approved')::boolean is true and coalesce(x->>'imagePath','')<>'')
 into v_all from jsonb_array_elements(v_scenes) x;
 update public.vmv_studio_jobs set scenes=v_scenes,
  status=case when p_action='approve_all' or v_all then 'queued_animation'
              when p_regen then 'queued_images' else status end,
  phase=case when p_action='approve_all' or v_all then 'Animación en cola'
             when p_regen then 'Regenerando fotograma' else 'Esperando aprobación' end,
  progress=case when p_regen then 12 else progress end,
  version=version+1,updated_at=now() where id=p_job returning * into v_job;
 return v_job;
end $$;
revoke all on function public.vmv_studio_scene_update(uuid,uuid,text,integer,text,boolean)
 from public,anon,authenticated;
grant execute on function public.vmv_studio_scene_update(uuid,uuid,text,integer,text,boolean) to service_role;

create or replace function public.vmv_studio_claim(p_token uuid)
returns setof public.vmv_studio_jobs language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;v_status text;
begin
 if p_token is null then return;end if;
 select id,status into v_id,v_status from public.vmv_studio_jobs
  where (status in ('queued_images','queued_animation')
    or (status in ('generating_images','animating','voice','assembling','verifying')
      and lease_expires_at<now()))
   and (lease_expires_at is null or lease_expires_at<now())
  order by created_at asc limit 1 for update skip locked;
 if v_id is null then return;end if;
 return query update public.vmv_studio_jobs set
  status=case when v_status in ('queued_images','generating_images') then 'generating_images' else 'animating' end,
  phase=case when v_status in ('queued_images','generating_images') then 'Generando imágenes' else 'Animando escenas' end,
  lease_token=p_token,lease_expires_at=now()+interval '15 minutes',updated_at=now()
  where id=v_id returning *;
end $$;
revoke all on function public.vmv_studio_claim(uuid) from public,anon,authenticated;
grant execute on function public.vmv_studio_claim(uuid) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('vmv-studio-assets','vmv-studio-assets',false,262144000,
 array['image/jpeg','video/mp4','audio/mpeg'])
on conflict(id) do update set public=false,file_size_limit=262144000,
 allowed_mime_types=excluded.allowed_mime_types;
-- No bucket access is granted to visitors. Server issues short-lived signed URLs.
