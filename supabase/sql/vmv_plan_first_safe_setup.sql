-- Non-authoritative signup preferences. Payment must be confirmed server-side.
alter table public.smartjob_profiles
 add column if not exists line_choice text not null default 'keep',
 add column if not exists preferred_plan text,
 add column if not exists plan_prompt_seen boolean not null default false,
 add column if not exists line_setup_completed boolean not null default false;
alter table public.smartjob_profiles drop constraint if exists vmv_line_choice_valid;
alter table public.smartjob_profiles add constraint vmv_line_choice_valid check (line_choice in ('keep','new'));
alter table public.smartjob_profiles drop constraint if exists vmv_preferred_plan_valid;
alter table public.smartjob_profiles add constraint vmv_preferred_plan_valid check (preferred_plan is null or preferred_plan in ('starter','pro','premium'));
comment on column public.smartjob_profiles.preferred_plan is 'UI plan selection, never entitlement';
comment on column public.smartjob_profiles.line_setup_completed is 'User preference only, never activation authorization';
comment on column public.smartjob_profiles.plan_prompt_seen is 'User preference only, never entitlement';
alter table public.smartjob_profiles add column if not exists line_carrier text not null default 'other';
alter table public.smartjob_profiles drop constraint if exists vmv_line_carrier_valid;
alter table public.smartjob_profiles add constraint vmv_line_carrier_valid check(length(line_carrier) between 1 and 30);
