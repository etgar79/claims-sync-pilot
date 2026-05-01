-- 1. Roles enum + user_roles table (separate from profiles for security)
CREATE TYPE public.app_role AS ENUM ('appraiser', 'architect', 'admin');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 2. Security definer function to check roles (prevents recursive RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 3. RLS policies on user_roles
CREATE POLICY "Users view own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all roles"
  ON public.user_roles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4. Meetings table (for architects)
CREATE TABLE public.meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  client_name TEXT,
  project_name TEXT,
  location TEXT,
  meeting_date TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active',
  ai_summary TEXT,
  ai_summary_generated_at TIMESTAMPTZ,
  notes TEXT,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own meetings"
  ON public.meetings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own meetings"
  ON public.meetings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own meetings"
  ON public.meetings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own meetings"
  ON public.meetings FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_meetings_updated_at
  BEFORE UPDATE ON public.meetings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Meeting recordings table
CREATE TABLE public.meeting_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  filename TEXT NOT NULL,
  duration TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  transcript TEXT,
  transcript_status TEXT NOT NULL DEFAULT 'pending',
  transcription_service TEXT,
  drive_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.meeting_recordings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own meeting recordings"
  ON public.meeting_recordings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own meeting recordings"
  ON public.meeting_recordings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own meeting recordings"
  ON public.meeting_recordings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own meeting recordings"
  ON public.meeting_recordings FOR DELETE USING (auth.uid() = user_id);

-- 6. Add transcription_service column to existing recordings table
ALTER TABLE public.recordings
  ADD COLUMN IF NOT EXISTS transcription_service TEXT;