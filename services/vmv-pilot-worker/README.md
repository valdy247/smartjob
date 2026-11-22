# VMV Pilot — durable rendering worker

Preview-only worker for 15, 30, and 60 second videos. Video generation starts after a signed-in owner confirms spending.
Produces motion clips, per-scene voice, optional burned subtitles and a finished MP4 saved in private Supabase Storage.

## Render deployment — requires user selection and approval

1. Existing migration: supabase/sql/vmv_pilot_durable_renders_20261121.sql.
2. Create a dedicated Render Docker service from valdy247/smartjob, branch feat/vmv-smart-call-control-center.
3. Set service root to services/vmv-pilot-worker, Dockerfile Dockerfile, health path /healthz.
4. Set secrets in Render, NEVER in source code: SUPABASE_URL, SUPABASE_SECRET_KEY, OPENAI_API_KEY, RUNWAYML_API_SECRET, VMV_PILOT_OWNER_ID.
5. To offer ElevenLabs voices, add ELEVENLABS_API_KEY separately to both Render (TTS) and Vercel Preview (voice catalogue and ownership checks). A ChatGPT ElevenLabs connection does not expose its credentials to these deployments. Without it, Pilot offers standard OpenAI narrator voices.\n6. Worker checks selected language in the script before video rendering and verifies narration language with a transcription before Runway generation. Wrong-language output fails instead of exporting.
7. Set VMV_PILOT_WORKER_ENABLED=true only after verifying owner and credit budget. Verify /healthz and worker logs, then set VMV_PILOT_RENDER_ENABLED=true in Vercel branch-scoped Preview.
8. Test a 15-second sample in each selected language, close and reopen the browser, verify job resumes and finished MP4 downloads.

An account may start one new render per rolling 24 hours, with at most one active job. Auto-publishing is disabled.
Runway generation costs vary with duration: 60 seconds means up to 12 separately charged five-second clips.
Do not copy or disclose secrets in the browser, issue comments or logs.
Use persistent deployment: this worker runs independently of the Vercel browser and can resume after lease expiry.
