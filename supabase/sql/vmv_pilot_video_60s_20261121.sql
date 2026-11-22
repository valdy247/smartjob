-- VMV Pilot preview: support 5-second scene timelines through 60s and a locked Stickman style.
-- This does not start background workers or authorize any external spend.
ALTER TABLE public.vmv_video_pilots DROP CONSTRAINT IF EXISTS vmv_video_pilots_style_check;
ALTER TABLE public.vmv_video_pilots ADD CONSTRAINT vmv_video_pilots_style_check
 CHECK (style IN ('stickman','realistic','cinematic','animated','product'));
ALTER TABLE public.vmv_video_quick_projects DROP CONSTRAINT IF EXISTS vmv_video_quick_projects_seconds_check;
ALTER TABLE public.vmv_video_quick_projects ADD CONSTRAINT vmv_video_quick_projects_seconds_check
 CHECK (seconds IN (15,30,60));
