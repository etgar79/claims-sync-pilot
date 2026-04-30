CREATE TABLE public.report_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  content TEXT NOT NULL DEFAULT '',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.report_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own templates"
ON public.report_templates FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users insert own templates"
ON public.report_templates FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own templates"
ON public.report_templates FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users delete own templates"
ON public.report_templates FOR DELETE
USING (auth.uid() = user_id);

CREATE TRIGGER update_report_templates_updated_at
BEFORE UPDATE ON public.report_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();