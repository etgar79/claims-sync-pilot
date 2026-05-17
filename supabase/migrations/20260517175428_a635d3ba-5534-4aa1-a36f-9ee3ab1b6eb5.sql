
-- Restrict pricing visibility to admins only
DROP POLICY IF EXISTS "Anyone authenticated reads pricing" ON public.service_pricing;
DROP POLICY IF EXISTS "Anyone authenticated reads settings" ON public.app_settings;

-- "Admins manage pricing" (FOR ALL) already exists and covers SELECT for admins.
-- "Admins manage settings" (FOR ALL) already exists too.
