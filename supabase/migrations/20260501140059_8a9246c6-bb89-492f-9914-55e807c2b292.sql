ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS drive_folder_id text;

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS drive_folder_id text,
  ADD COLUMN IF NOT EXISTS drive_folder_url text;