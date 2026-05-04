CREATE TABLE public.transcriber_root_folder (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  admin_user_id uuid NOT NULL,
  folder_id text NOT NULL,
  folder_name text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.transcriber_root_folder ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read transcriber root"
ON public.transcriber_root_folder FOR SELECT
USING (app_private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins write transcriber root"
ON public.transcriber_root_folder FOR ALL
USING (app_private.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (app_private.has_role(auth.uid(), 'admin'::app_role));