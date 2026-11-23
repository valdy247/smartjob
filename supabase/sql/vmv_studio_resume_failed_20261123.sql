-- Resume a failed video without regenerating stored images or double charging.
ALTER TABLE public.vmv_studio_jobs ADD COLUMN IF NOT EXISTS resume_count integer NOT NULL DEFAULT 0;
CREATE OR REPLACE FUNCTION public.vmv_studio_resume(p_owner uuid,p_job uuid)
RETURNS public.vmv_studio_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
DECLARE v_job public.vmv_studio_jobs%rowtype; v_available integer; v_attempt integer;
BEGIN
 IF p_owner IS NULL OR p_job IS NULL THEN RAISE EXCEPTION 'studio_invalid_action'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_owner::text,602233));
 SELECT * INTO v_job FROM public.vmv_studio_jobs WHERE id=p_job AND owner_id=p_owner FOR UPDATE;
 IF NOT FOUND OR v_job.status <> 'failed' OR NOT v_job.credits_settled
   OR v_job.output_path IS NOT NULL THEN RAISE EXCEPTION 'studio_resume_unavailable'; END IF;
 IF v_job.resume_count>=5 THEN RAISE EXCEPTION 'studio_resume_limit'; END IF;
 SELECT balance-reserved INTO v_available FROM public.vmv_studio_wallets
  WHERE owner_id=p_owner FOR UPDATE;
 IF v_available IS NULL OR v_available<v_job.charge_credits THEN
  RAISE EXCEPTION 'studio_insufficient_credits'; END IF;
 v_attempt:=v_job.resume_count+1;
 UPDATE public.vmv_studio_wallets SET reserved=reserved+v_job.charge_credits,updated_at=now()
 WHERE owner_id=p_owner;
 INSERT INTO public.vmv_studio_credit_ledger(owner_id,job_id,kind,reserved_delta,external_ref)
 VALUES(p_owner,p_job,'reserve',v_job.charge_credits,
  'resume:'||p_job::text||':'||v_attempt::text);
 UPDATE public.vmv_studio_jobs SET status='queued_images',phase='Reanudando imágenes',
  progress=5,eta_seconds=NULL,credits_settled=false,failure_code=NULL,
  finished_at=NULL,lease_token=NULL,lease_expires_at=NULL,
  resume_count=v_attempt,version=version+1,updated_at=now()
 WHERE id=p_job RETURNING * INTO v_job;
 RETURN v_job;
END $fn$;
REVOKE ALL ON FUNCTION public.vmv_studio_resume(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vmv_studio_resume(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.vmv_studio_credit_finalize(p_id uuid,p_success boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
DECLARE v_job public.vmv_studio_jobs%rowtype; v_ref text;
BEGIN
 SELECT * INTO v_job FROM public.vmv_studio_jobs WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF v_job.credits_settled THEN RETURN true; END IF;
 IF p_success AND v_job.status<>'completed' THEN RETURN false; END IF;
 IF NOT p_success AND v_job.status NOT IN ('failed','cancelled') THEN RETURN false; END IF;
 UPDATE public.vmv_studio_wallets
  SET balance=balance-(CASE WHEN p_success THEN v_job.charge_credits ELSE 0 END),
      reserved=reserved-v_job.charge_credits,updated_at=now()
  WHERE owner_id=v_job.owner_id AND reserved>=v_job.charge_credits;
 IF NOT FOUND THEN RAISE EXCEPTION 'studio_wallet_inconsistent'; END IF;
 v_ref:='final:'||v_job.id::text||
   CASE WHEN v_job.resume_count>0 THEN ':resume:'||v_job.resume_count::text ELSE '' END;
 INSERT INTO public.vmv_studio_credit_ledger(owner_id,job_id,kind,balance_delta,reserved_delta,external_ref)
 VALUES(v_job.owner_id,v_job.id,CASE WHEN p_success THEN 'capture' ELSE 'release' END,
   CASE WHEN p_success THEN -v_job.charge_credits ELSE 0 END,-v_job.charge_credits,v_ref);
 UPDATE public.vmv_studio_jobs SET credits_settled=true,updated_at=now() WHERE id=v_job.id;
 RETURN true;
END $fn$;