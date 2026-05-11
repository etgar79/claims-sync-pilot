
-- summary_templates
CREATE TABLE public.summary_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workspace_kind TEXT NOT NULL CHECK (workspace_kind IN ('appraiser','architect','transcriber')),
  name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.summary_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own templates" ON public.summary_templates FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own templates" ON public.summary_templates FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own templates" ON public.summary_templates FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own templates" ON public.summary_templates FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins manage all summary templates" ON public.summary_templates FOR ALL USING (app_private.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (app_private.has_role(auth.uid(),'admin'::app_role));
CREATE INDEX idx_summary_templates_user ON public.summary_templates(user_id, workspace_kind);

-- extracted_tasks (pending review)
CREATE TABLE public.extracted_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  notes TEXT,
  due DATE,
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review','approved','rejected')),
  source_recording_id UUID,
  source_meeting_recording_id UUID,
  source_meeting_id UUID,
  source_case_id UUID,
  workspace_kind TEXT NOT NULL DEFAULT 'appraiser',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.extracted_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own extracted tasks" ON public.extracted_tasks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own extracted tasks" ON public.extracted_tasks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own extracted tasks" ON public.extracted_tasks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own extracted tasks" ON public.extracted_tasks FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins manage all extracted tasks" ON public.extracted_tasks FOR ALL USING (app_private.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (app_private.has_role(auth.uid(),'admin'::app_role));
CREATE INDEX idx_extracted_tasks_user_status ON public.extracted_tasks(user_id, status);

-- tasks (approved + tracked)
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  notes TEXT,
  due DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','done')),
  google_task_id TEXT,
  source_meeting_id UUID,
  source_case_id UUID,
  source_extracted_id UUID,
  workspace_kind TEXT NOT NULL DEFAULT 'appraiser',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own tasks" ON public.tasks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own tasks" ON public.tasks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own tasks" ON public.tasks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own tasks" ON public.tasks FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins manage all tasks" ON public.tasks FOR ALL USING (app_private.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (app_private.has_role(auth.uid(),'admin'::app_role));
CREATE INDEX idx_tasks_user_status ON public.tasks(user_id, status);

-- pipeline columns on recordings
ALTER TABLE public.recordings
  ADD COLUMN IF NOT EXISTS pipeline_status TEXT NOT NULL DEFAULT 'uploaded',
  ADD COLUMN IF NOT EXISTS summary TEXT,
  ADD COLUMN IF NOT EXISTS summary_generated_at TIMESTAMPTZ;

ALTER TABLE public.meeting_recordings
  ADD COLUMN IF NOT EXISTS pipeline_status TEXT NOT NULL DEFAULT 'uploaded',
  ADD COLUMN IF NOT EXISTS summary TEXT,
  ADD COLUMN IF NOT EXISTS summary_generated_at TIMESTAMPTZ;

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.extracted_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
ALTER TABLE public.extracted_tasks REPLICA IDENTITY FULL;
ALTER TABLE public.tasks REPLICA IDENTITY FULL;

-- Triggers for updated_at
CREATE TRIGGER trg_summary_templates_updated_at BEFORE UPDATE ON public.summary_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_extracted_tasks_updated_at BEFORE UPDATE ON public.extracted_tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
