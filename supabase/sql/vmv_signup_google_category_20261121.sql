-- Save verified Google Business Profile taxonomy alongside VMV's internal category.
-- Empty fields mean no Google verification; never substitute a guessed ID.
alter table public.vmv_marketing_businesses
 add column if not exists google_category_id text not null default '';
alter table public.vmv_marketing_businesses
 add column if not exists google_category_name text not null default '';
alter table public.vmv_marketing_businesses
 drop constraint if exists vmv_signup_google_category_length;
alter table public.vmv_marketing_businesses
 add constraint vmv_signup_google_category_length
 check(length(google_category_id)<=150 and length(google_category_name)<=120);
