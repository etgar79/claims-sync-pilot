
-- Add admin override RLS policies on all data tables.
-- Admins can view, insert, update, and delete all rows across the system.

-- cases
CREATE POLICY "Admins manage all cases"
ON public.cases FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- meetings
CREATE POLICY "Admins manage all meetings"
ON public.meetings FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- meeting_recordings
CREATE POLICY "Admins manage all meeting_recordings"
ON public.meeting_recordings FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- recordings
CREATE POLICY "Admins manage all recordings"
ON public.recordings FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- photos
CREATE POLICY "Admins manage all photos"
ON public.photos FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- notes
CREATE POLICY "Admins manage all notes"
ON public.notes FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- report_templates
CREATE POLICY "Admins manage all templates"
ON public.report_templates FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- profiles - admins view & manage all
CREATE POLICY "Admins view all profiles"
ON public.profiles FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update all profiles"
ON public.profiles FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete all profiles"
ON public.profiles FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));
