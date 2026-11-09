export type Profile = {
  id: string; first_name: string; last_name: string; phone: string; occupation: string;
  assistant_name: string; owner_language: string; customer_language: string;
  city: string; state: string; country: string;
  account_type?: "personal"|"business"; occupation_code?: string|null; use_case?: string|null;
  business_name?: string|null; website_url?: string|null;
  theme_color?: "mint"|"blue"|"violet"; font_scale?: "small"|"normal"|"large";
  appearance?: "light"|"dark"|"system"; reduce_motion?: boolean;
};
export type JobContext = {
  user_id?: string; job_type: string; city: string; state: string; zip: string;
  client_name: string; dimensions: string; materials: string; details: string;
};
export type CallSettings = { user_id?: string; existing_phone: string; forwarding_enabled: boolean;
  desired_language: string; caller_language: string; assistant_name: string; };
export type Actor = "owner" | "customer";
export type AiTurn = { id: string; actor: Actor; source: string; output: string; mode: "relay" | "advice" | "interpret";
  language: string; warning?: string; blocked?: boolean; timestamp: number; };
