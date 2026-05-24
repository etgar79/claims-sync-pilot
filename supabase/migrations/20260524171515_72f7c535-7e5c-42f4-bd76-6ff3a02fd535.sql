
DROP POLICY IF EXISTS "Users can only subscribe to their own task topics" ON realtime.messages;

-- Authenticated users can subscribe; row-level filtering for postgres_changes
-- is enforced by RLS on the underlying tables (tasks, extracted_tasks already have user_id RLS).
CREATE POLICY "Authenticated users can subscribe to realtime"
ON realtime.messages
FOR SELECT
TO authenticated
USING (true);
