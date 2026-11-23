-- Grant creation only to customer-supplied fields. All workflow/status/price fields are server/staff controlled.
revoke insert on public.vmv_marketing_requests from authenticated;
grant insert (owner_id,service_code,business_name,category_id,website_url,goal_text,agreed_to_contact)
 on public.vmv_marketing_requests to authenticated;
revoke insert on public.vmv_marketing_quote_acceptances from authenticated;
grant insert (request_id,owner_id,quote_revision,quoted_price_cents)
 on public.vmv_marketing_quote_acceptances to authenticated;
