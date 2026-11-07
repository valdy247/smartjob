import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

// The Supabase Auth pool is shared with other apps for now.
// An authenticated identity MUST have a Smart Job profile before it can spend AI credits.
export async function authenticatedUser(req: NextRequest): Promise<string | null> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!token || !url || !key) return null;
  try {
    const client = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: "Bearer " + token } }
    });
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user || data.user.is_anonymous) return null;
    const profile = await client.from("smartjob_profiles").select("id").eq("id", data.user.id).maybeSingle();
    if (profile.error || !profile.data) return null;
    return data.user.id;
  } catch { return null; }
}


// Quotas are enforced atomically inside Supabase using the caller's JWT.
// Users of other applications on the shared Supabase Auth pool cannot use these credits.
export async function consumeCredit(req: NextRequest, kind: "ai" | "voice"): Promise<boolean> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!token || !url || !key) return false;
  try {
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: "Bearer " + token } }
    });
    const { data, error } = await client.rpc("smartjob_take_credit", { p_kind: kind });
    return !error && data?.allowed === true;
  } catch { return false; }
}
