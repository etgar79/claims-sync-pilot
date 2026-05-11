
ALTER TABLE public.recordings ADD COLUMN IF NOT EXISTS segments jsonb;
ALTER TABLE public.meeting_recordings ADD COLUMN IF NOT EXISTS segments jsonb;
ALTER TABLE public.transcript_versions ADD COLUMN IF NOT EXISTS segments jsonb;
