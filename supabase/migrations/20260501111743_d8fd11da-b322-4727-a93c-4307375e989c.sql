
-- 1. drive_work_folders: migrate existing 'input' rows to per-role types
-- Map existing 'input' folders to appraiser_recordings if user is appraiser, else architect_meetings
UPDATE public.drive_work_folders dwf
SET folder_type = CASE
  WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = dwf.user_id AND ur.role = 'architect') THEN 'architect_meetings'
  ELSE 'appraiser_recordings'
END
WHERE folder_type = 'input';

-- 2. recordings: make case_id nullable, add source + drive_file_id
ALTER TABLE public.recordings ALTER COLUMN case_id DROP NOT NULL;
ALTER TABLE public.recordings ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual_upload';
ALTER TABLE public.recordings ADD COLUMN IF NOT EXISTS drive_file_id text;
CREATE UNIQUE INDEX IF NOT EXISTS recordings_user_drive_file_unique
  ON public.recordings (user_id, drive_file_id)
  WHERE drive_file_id IS NOT NULL;

-- 3. meeting_recordings: make meeting_id nullable, add source + drive_file_id
ALTER TABLE public.meeting_recordings ALTER COLUMN meeting_id DROP NOT NULL;
ALTER TABLE public.meeting_recordings ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual_upload';
ALTER TABLE public.meeting_recordings ADD COLUMN IF NOT EXISTS drive_file_id text;
CREATE UNIQUE INDEX IF NOT EXISTS meeting_recordings_user_drive_file_unique
  ON public.meeting_recordings (user_id, drive_file_id)
  WHERE drive_file_id IS NOT NULL;
