
-- 1. Block direct INSERT into usage_events by authenticated users (service role bypasses RLS)
CREATE POLICY "Block authenticated inserts into usage_events"
ON public.usage_events
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (false);

-- 2. Realtime authorization: restrict topic subscriptions for tasks / extracted_tasks
-- Enable RLS on realtime.messages if not already
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;

-- Drop prior policy if it exists (idempotent)
DROP POLICY IF EXISTS "Users can only subscribe to their own task topics" ON realtime.messages;

CREATE POLICY "Users can only subscribe to their own task topics"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  -- Allow any non-tasks topic (other tables handle their own auth)
  (realtime.topic() NOT LIKE 'tasks%' AND realtime.topic() NOT LIKE 'extracted_tasks%')
  OR
  -- For tasks/extracted_tasks topics, require user_id in topic match auth uid
  realtime.topic() = 'tasks:' || auth.uid()::text
  OR
  realtime.topic() = 'extracted_tasks:' || auth.uid()::text
);

-- 3. Revoke EXECUTE from anon on sensitive SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.apply_pricing_change(text, text, numeric, numeric, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.apply_bulk_markup(numeric) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;

-- Grant back only what's needed
GRANT EXECUTE ON FUNCTION public.apply_pricing_change(text, text, numeric, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_bulk_markup(numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
