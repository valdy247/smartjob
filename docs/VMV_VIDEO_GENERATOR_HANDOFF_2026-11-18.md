# VMV Video Generator — preview handoff (2026-11-18)

## Source reviewed
- \`valdy247/EditMyPic\` \`main\`: \`app/api/v1/video+api.ts\`, \`app/video.tsx\`.
- \`feature/desktop-video-studio\`: protected API, browser workspace, status polling.
- Adapted the provider contract rather than importing Expo / React Native code.

## Implemented on VMV preview branch
- Services → Digital → Video Generator navigates to \`/vista-app/video-generator\`.
- Matches VMV light mint, simple two-card layout.
- Individual video text-to-video / image-to-video; 5 or 10 seconds, landscape/portrait, Runway Gen-4.5 or Kling 3.0 Pro via Runway.
- User authorization checkbox before any paid provider request.
- Secure authenticated Vercel server API, image type and size validation.
- Durable Supabase task history and automatic poll of Runway task status.
- MP4 direct download through authenticated, limited proxy; original output as fallback. Provider URLs can expire.
- AI-assisted short visual prompts and social captions via existing VMV AI Gateway.
- User-scoped pilot configuration: niche, audience, goal, style, frequency; can generate first draft and approve an individual video.
- Not implemented: unattended cron production schedules, publishing to social APIs, credit checkout, long-video stitching, voiceover/subtitles, permanent MP4 archive.

## Deployment setup
- Vercel project: smartjob; branch \`feat/vmv-smart-call-control-center\` PREVIEW ONLY.
- **Already configured** in Preview on that branch:
  - \`VMV_VIDEO_PILOT_ENABLED=true\`
  - \`VMV_VIDEO_ALLOWED_OWNER_ID\` (private, owner-only).
- **Owner must add** \`RUNWAYML_API_SECRET\` as Sensitive/Encrypted in Vercel Preview, preferably branch-scoped.
  Obtain secret directly from Runway developer account or existing private EditMyPic deployment; never paste it in chat or GitHub.
- Redeploy PREVIEW after setting the key.
- App must use a logged-in VMV account with a \`smartjob_profiles\` row and matching preview allowlist.
- Existing \`NEXT_PUBLIC_SUPABASE_URL\`, \`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY\`, \`SUPABASE_SECRET_KEY\` already configured in Vercel.
- Supabase migration applied: \`supabase/sql/vmv_video_generator_pilot.sql\`; read-only RLS for authenticated users and atomic service-role reservation RPC.

## Smoke test when key is connected
1. Go to Services → Video Generator.
2. Enter a short prompt; choose Runway, 5s and vertical.
3. Explicitly approve this generation, click Generate.
4. Observe PENDING → RUNNING → SUCCEEDED; see preview and Download MP4.
5. Check library reload; verify persisted job and caption.
6. Optional image-to-video test; optional Kling access if enabled in Runway.
7. Test no-auth 401/403, job ID ownership, three/day quota, one active generation at a time, invalid image payload, and preview-only account gate.
8. Do not publish campaigns/social posts or trigger provider spending without explicit authorization.

## Product boundary
- The autopilot settings are **paused**, and social auto-publication is **not connected**.
- The studio does not claim these features work until platform OAuth, scheduled workers, capped billing and customer approvals are integrated and end-to-end validated.
- Do not deploy to production without explicit approval.
