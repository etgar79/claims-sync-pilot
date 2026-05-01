-- Fix: the existing "Block non-admin role writes" restrictive policy was applied to ALL commands
-- (including SELECT), which prevented non-admin users from reading their own role row.
-- Replace it with a write-only restrictive policy so users can still SELECT their own roles
-- via the existing permissive "Users view own roles" policy.

DROP POLICY IF EXISTS "Block non-admin role writes" ON public.user_roles;

CREATE POLICY "Block non-admin role inserts"
ON public.user_roles
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (app_private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Block non-admin role updates"
ON public.user_roles
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (app_private.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (app_private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Block non-admin role deletes"
ON public.user_roles
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (app_private.has_role(auth.uid(), 'admin'::app_role));