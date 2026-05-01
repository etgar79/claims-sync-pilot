
ALTER TABLE public.recordings ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';
ALTER TABLE public.meeting_recordings ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';
