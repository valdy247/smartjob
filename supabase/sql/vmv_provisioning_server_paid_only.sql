-- Requests to reserve/activate numbers must be server-authorized after payment.
revoke insert, update, delete on public.smartjob_provisioning_requests from authenticated, anon;
drop policy if exists smartjob_provisioning_user_create on public.smartjob_provisioning_requests;
