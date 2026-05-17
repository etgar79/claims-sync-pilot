
-- 1. service_pricing table
CREATE TABLE public.service_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service text NOT NULL,
  unit text NOT NULL CHECK (unit IN ('seconds','input_tokens','output_tokens','tokens','versions')),
  cost_per_unit_usd numeric(20, 12) NOT NULL DEFAULT 0,
  markup_pct numeric(6, 2) NOT NULL DEFAULT 0,
  effective_from timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_service_pricing_lookup ON public.service_pricing(service, unit, is_active, effective_from DESC);

ALTER TABLE public.service_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage pricing" ON public.service_pricing
  FOR ALL USING (app_private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (app_private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone authenticated reads pricing" ON public.service_pricing
  FOR SELECT TO authenticated USING (true);

CREATE TRIGGER service_pricing_updated_at
  BEFORE UPDATE ON public.service_pricing
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. billable_usd column
ALTER TABLE public.usage_events
  ADD COLUMN billable_usd numeric(20, 8) NOT NULL DEFAULT 0;

-- Backfill: existing rows → billable equals cost (no markup applied historically)
UPDATE public.usage_events SET billable_usd = cost_usd WHERE billable_usd = 0;

-- 3. Seed initial prices
INSERT INTO public.service_pricing (service, unit, cost_per_unit_usd, markup_pct, notes) VALUES
  ('whisper',                 'seconds',       0.0001,         0, 'OpenAI Whisper $0.006/min ≈ $0.0001/sec'),
  ('elevenlabs',              'seconds',       0.000111111,    0, 'ElevenLabs Scribe ~$0.40/hr'),
  ('ivrit_ai',                'seconds',       0.0000277778,   0, 'ivrit.ai ~$0.10/hr'),
  ('lovable_ai',              'seconds',       0.0000096,      0, 'Gemini 2.5 Flash audio ~32 tok/sec'),
  ('google/gemini-2.5-flash', 'input_tokens',  0.000000075,    0, '$0.075 / 1M input tokens'),
  ('google/gemini-2.5-flash', 'output_tokens', 0.0000003,      0, '$0.30 / 1M output tokens'),
  ('google/gemini-2.5-pro',   'input_tokens',  0.00000125,     0, '$1.25 / 1M input tokens'),
  ('google/gemini-2.5-pro',   'output_tokens', 0.000005,       0, '$5.00 / 1M output tokens'),
  ('google/gemini-2.5-flash-lite', 'input_tokens',  0.0000000375, 0, '$0.0375 / 1M'),
  ('google/gemini-2.5-flash-lite', 'output_tokens', 0.00000015,   0, '$0.15 / 1M'),
  ('openai/gpt-5',            'input_tokens',  0.0000025,      0, '$2.50 / 1M input tokens (est)'),
  ('openai/gpt-5',            'output_tokens', 0.00001,        0, '$10 / 1M output tokens (est)'),
  ('openai/gpt-5-mini',       'input_tokens',  0.00000025,     0, '$0.25 / 1M (est)'),
  ('openai/gpt-5-mini',       'output_tokens', 0.000001,       0, '$1.00 / 1M (est)');

-- 4. Trigger: compute billable_usd on insert if not provided
CREATE OR REPLACE FUNCTION public.compute_billable_usd()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  pricing_record RECORD;
BEGIN
  -- If caller already set billable_usd > 0, respect it.
  IF NEW.billable_usd IS NOT NULL AND NEW.billable_usd > 0 THEN
    RETURN NEW;
  END IF;

  -- Find active markup for this service (most recent effective_from)
  SELECT markup_pct INTO pricing_record
  FROM public.service_pricing
  WHERE service = NEW.service
    AND is_active = true
    AND effective_from <= now()
  ORDER BY effective_from DESC
  LIMIT 1;

  IF FOUND THEN
    NEW.billable_usd := NEW.cost_usd * (1 + pricing_record.markup_pct / 100);
  ELSE
    NEW.billable_usd := NEW.cost_usd;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER usage_events_billable
  BEFORE INSERT ON public.usage_events
  FOR EACH ROW EXECUTE FUNCTION public.compute_billable_usd();
