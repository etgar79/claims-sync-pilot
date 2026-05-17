
-- 1) Platform fee settings (single-row table)
CREATE TABLE IF NOT EXISTS public.app_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  platform_monthly_fee_usd numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.app_settings (id, platform_monthly_fee_usd)
VALUES (true, 0)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authenticated reads settings" ON public.app_settings;
CREATE POLICY "Anyone authenticated reads settings"
ON public.app_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage settings" ON public.app_settings;
CREATE POLICY "Admins manage settings"
ON public.app_settings FOR ALL
USING (app_private.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (app_private.has_role(auth.uid(), 'admin'::public.app_role));

-- 2) Apply pricing change: new active version + retro update
CREATE OR REPLACE FUNCTION public.apply_pricing_change(
  p_service text,
  p_unit text,
  p_cost numeric,
  p_markup numeric,
  p_notes text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT app_private.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  UPDATE public.service_pricing
     SET is_active = false
   WHERE service = p_service AND unit = p_unit AND is_active = true;

  INSERT INTO public.service_pricing (service, unit, cost_per_unit_usd, markup_pct, notes, is_active)
  VALUES (p_service, p_unit, p_cost, p_markup, p_notes, true);

  -- retroactive: rewrite cost and billable for past events of this service+unit
  UPDATE public.usage_events
     SET cost_usd     = quantity * p_cost,
         billable_usd = quantity * p_cost * (1 + p_markup / 100)
   WHERE service = p_service AND unit = p_unit;
END;
$$;

-- 3) Bulk markup for ALL active services
CREATE OR REPLACE FUNCTION public.apply_bulk_markup(p_markup numeric)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT app_private.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  -- Update markup on every active price row
  UPDATE public.service_pricing
     SET markup_pct = p_markup,
         updated_at = now()
   WHERE is_active = true;

  -- Retroactive: recompute billable_usd for every past event
  UPDATE public.usage_events
     SET billable_usd = cost_usd * (1 + p_markup / 100);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_pricing_change(text,text,numeric,numeric,text) FROM public;
GRANT EXECUTE ON FUNCTION public.apply_pricing_change(text,text,numeric,numeric,text) TO authenticated;
REVOKE ALL ON FUNCTION public.apply_bulk_markup(numeric) FROM public;
GRANT EXECUTE ON FUNCTION public.apply_bulk_markup(numeric) TO authenticated;
