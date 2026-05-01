-- 1. Remove the dangerous "Users insert own usage" policy.
-- usage_events should only be inserted by edge functions using the service role,
-- which bypasses RLS entirely. This prevents users from fabricating cost data.
DROP POLICY IF EXISTS "Users insert own usage" ON public.usage_events;

-- 2. user_roles - block any non-admin from inserting/updating/deleting roles.
-- The "Admins manage roles" PERMISSIVE policy already allows admins.
-- We add an explicit RESTRICTIVE policy that denies all writes unless the caller is an admin.
-- The handle_new_user() trigger uses SECURITY DEFINER and bypasses RLS, so signup still works.
CREATE POLICY "Block non-admin role writes"
ON public.user_roles
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));