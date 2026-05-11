-- Glossary
CREATE TABLE public.user_glossary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  workspace_kind text NOT NULL DEFAULT 'all',
  term text NOT NULL,
  replacement text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_glossary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own glossary" ON public.user_glossary FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own glossary" ON public.user_glossary FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own glossary" ON public.user_glossary FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own glossary" ON public.user_glossary FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins manage all glossary" ON public.user_glossary FOR ALL
  USING (app_private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (app_private.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_user_glossary_updated_at BEFORE UPDATE ON public.user_glossary
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_user_glossary_user ON public.user_glossary(user_id, workspace_kind);

-- Quality score columns
ALTER TABLE public.transcript_versions
  ADD COLUMN quality_score integer,
  ADD COLUMN quality_notes text;

ALTER TABLE public.recordings
  ADD COLUMN quality_score integer,
  ADD COLUMN quality_notes text;

ALTER TABLE public.meeting_recordings
  ADD COLUMN quality_score integer,
  ADD COLUMN quality_notes text;