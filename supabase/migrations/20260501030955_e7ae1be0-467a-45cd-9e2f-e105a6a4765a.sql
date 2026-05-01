-- Update handle_new_user to also assign default role from signup metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  chosen_role public.app_role;
BEGIN
  -- Insert profile
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email));

  -- Determine chosen role from signup metadata (default: appraiser)
  BEGIN
    chosen_role := COALESCE(
      (NEW.raw_user_meta_data->>'role')::public.app_role,
      'appraiser'::public.app_role
    );
  EXCEPTION WHEN others THEN
    chosen_role := 'appraiser'::public.app_role;
  END;

  -- Never auto-assign admin from client metadata
  IF chosen_role = 'admin' THEN
    chosen_role := 'appraiser';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, chosen_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Ensure trigger exists on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();