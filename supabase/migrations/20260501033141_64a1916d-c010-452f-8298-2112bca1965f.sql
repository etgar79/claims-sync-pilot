
-- Usage events table: every billable action is logged here
CREATE TABLE public.usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_type text NOT NULL,        -- 'transcription' | 'ai_summary'
  service text NOT NULL,           -- 'ivrit_ai' | 'whisper' | 'elevenlabs' | 'lovable_ai'
  quantity numeric NOT NULL DEFAULT 0, -- seconds for transcription, tokens for AI
  unit text NOT NULL,              -- 'seconds' | 'tokens'
  cost_usd numeric(10,6) NOT NULL DEFAULT 0,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_usage_events_user_created ON public.usage_events (user_id, created_at DESC);
CREATE INDEX idx_usage_events_created ON public.usage_events (created_at DESC);

ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;

-- Users can see only their own usage
CREATE POLICY "Users view own usage"
ON public.usage_events FOR SELECT
USING (auth.uid() = user_id);

-- Admins see and manage all usage
CREATE POLICY "Admins manage all usage"
ON public.usage_events FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Inserts are done by edge functions (service role bypasses RLS), but allow self-inserts too
CREATE POLICY "Users insert own usage"
ON public.usage_events FOR INSERT
WITH CHECK (auth.uid() = user_id);
