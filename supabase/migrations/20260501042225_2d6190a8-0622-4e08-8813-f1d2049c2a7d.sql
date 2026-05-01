
CREATE TABLE public.transcript_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recording_id UUID NOT NULL,
  user_id UUID NOT NULL,
  service TEXT NOT NULL,
  transcript TEXT NOT NULL,
  is_merged BOOLEAN NOT NULL DEFAULT false,
  source_version_ids UUID[],
  language TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_transcript_versions_recording ON public.transcript_versions(recording_id);
CREATE INDEX idx_transcript_versions_user ON public.transcript_versions(user_id);

ALTER TABLE public.transcript_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own transcript versions" ON public.transcript_versions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own transcript versions" ON public.transcript_versions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own transcript versions" ON public.transcript_versions
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own transcript versions" ON public.transcript_versions
  FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins manage all transcript versions" ON public.transcript_versions
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
