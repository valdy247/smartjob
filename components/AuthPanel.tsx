"use client";
import type {SupabaseClient} from "@supabase/supabase-js";
import VMVAuthGateway from "./VMVAuthGateway";

export function AuthPanel({supabase}:{supabase:SupabaseClient}){
 return <VMVAuthGateway supabase={supabase}/>;
}
