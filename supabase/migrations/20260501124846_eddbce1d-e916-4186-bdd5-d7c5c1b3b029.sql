CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  chosen_role public.app_role;
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email))
  ON CONFLICT (user_id) DO UPDATE
  SET display_name = EXCLUDED.display_name;

  BEGIN
    chosen_role := (NEW.raw_user_meta_data->>'role')::public.app_role;
  EXCEPTION WHEN others THEN
    chosen_role := NULL;
  END;

  IF chosen_role IS NOT NULL AND chosen_role <> 'admin'::public.app_role THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, chosen_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;