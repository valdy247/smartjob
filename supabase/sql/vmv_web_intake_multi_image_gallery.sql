-- Owner-scoped, optional gallery for a new Web Studio site.
-- All existing single-image URLs and published pages remain unchanged.
ALTER TABLE public.smartjob_web_intake_media
 ADD COLUMN IF NOT EXISTS gallery_urls text[] NOT NULL DEFAULT '{}'::text[],
 ADD COLUMN IF NOT EXISTS gallery_columns smallint NOT NULL DEFAULT 2;
ALTER TABLE public.smartjob_web_intake_media
 ADD CONSTRAINT smartjob_web_gallery_max24 CHECK (cardinality(gallery_urls) <= 24),
 ADD CONSTRAINT smartjob_web_gallery_columns_range CHECK (gallery_columns BETWEEN 1 AND 3);
-- Carry forward the previous "work" photo into the new gallery exactly once.
UPDATE public.smartjob_web_intake_media
 SET gallery_urls=ARRAY[work_url]
 WHERE gallery_urls='{}'::text[] AND work_url<>'';
NOTIFY pgrst,'reload schema';
