# Web Services — category, service cards, image management (shared integration branch)

Branch: `feat/vmv-smart-call-control-center` in `valdy247/smartjob`.

## User-visible web experience
- A common business category picker replaces the free-form "Etiqueta" field.
- Stable IDs from `lib/vmv-business-categories.ts` can be used by other VMV modules.
- The category is persisted in `smartjob_business_category_preferences` using owner-based RLS.
- Google Business Profile (web and iOS) uses that same ID catalog and can reuse the account's saved category; this is a VMV taxonomy, **not a claim to map exactly to official Google Business Profile categories**.
- Services are independently addable, editable, removable and reorderable (up to six); the existing newline-delimited `services` field stays backward compatible.
- Visual template and palette choices sit **above the live preview**, not in the text editor, so the result is visible when changing an option.
- Upload a cover image and up to four gallery photos, with browser-side optimization to WebP and Supabase Storage. Public website rendering uses validated project-owned URLs only.
- Published sites show selected category, cover and gallery images.

## Storage
Supabase project `wrnlhjujsbigculndivs`:
- `storage.buckets`: `smartjob-web-images`, public asset delivery, upload max 5 MB, JPG/PNG/WebP.
- `storage.objects`: upload/select/delete policies restricted to authenticated users' own UUID prefix.
- Public bucket URLs are viewable by anyone who has the URL, including **before** a website is published. Do not upload confidential images.
- UI removal detaches an image from a website but does not delete the stored file, to prevent breaking an older published version. Scheduled cleanup and moderation are future work.

## Optional AI image generation
- `/api/web-services/generate-image`: GET for availability and authenticated POST to OpenAI Images API (server side only).
- **Disabled by default**. Must deliberately configure `OPENAI_API_KEY`, `SUPABASE_SECRET_KEY`, `VMV_WEB_AI_IMAGES_ENABLED=true`, and `VMV_WEB_AI_TEST_OWNER_ID` on the target Preview environment. No secrets should be exposed in frontend values.
- Per-allowlisted-owner hard limit of two generated images per UTC day via atomic Postgres RPC `smartjob_web_ai_claim_slot` and `smartjob_web_ai_usage`. The RPC is executable by service_role only. Requests made before an image provider error still count toward the cap.
- Provider model: `gpt-image-2` low quality 1024×1024 WebP. The server uploads output to the same owner asset bucket.
- Don't enable for the public or allow unmetered access without paid entitlement enforcement, content moderation, rate limiting and billing safeguards.
- No OpenAI API key and no owner allowlist were present on the shared preview when implemented; **generation has not been live-tested**. The UI shows it as unavailable rather than simulating success.

## Validation & deployment
- Next.js/Vercel build READY on the shared branch (check current last SHA).
- Category owner RLS insertion/read tested inside a rolled-back SQL transaction.
- Storage bucket and owner-specific policies verified.
- The web app still needs manual signed-in end-to-end QA for image uploads, persistence, publication rendering and narrow-phone layout.
- Native iOS Expo runtime/typecheck is not validated by the Vercel build; test independently.
- No Home/Smart Call/Translator/Marketing code or shared navigation edited in this change.
