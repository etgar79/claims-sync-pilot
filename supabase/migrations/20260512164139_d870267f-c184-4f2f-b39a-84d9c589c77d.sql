
CREATE TABLE public.system_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  level text NOT NULL DEFAULT 'info',
  source text NOT NULL DEFAULT 'app',
  message text NOT NULL,
  context jsonb,
  user_id uuid,
  CONSTRAINT system_logs_level_check CHECK (level IN ('debug','info','warn','error'))
);

CREATE INDEX idx_system_logs_created_at ON public.system_logs (created_at DESC);
CREATE INDEX idx_system_logs_level ON public.system_logs (level);
CREATE INDEX idx_system_logs_source ON public.system_logs (source);
CREATE INDEX idx_system_logs_user_id ON public.system_logs (user_id);

ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all logs"
ON public.system_logs FOR ALL
USING (app_private.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (app_private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users insert own logs"
ON public.system_logs FOR INSERT
WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users view own logs"
ON public.system_logs FOR SELECT
USING (auth.uid() = user_id);
