
-- Enable unaccent extension for accent-insensitive comparisons
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;

-- Update user_has_area_access function to use accent-insensitive matching
CREATE OR REPLACE FUNCTION public.user_has_area_access(_user_id uuid, _area_demandante text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id 
    AND (
      UPPER(public.unaccent(role)) = UPPER(public.unaccent(_area_demandante))  -- Case and accent insensitive match
      OR role = 'ADM'          -- Admins have access to all
      OR role = 'ADM_TI'       -- ADM_TI has access to all
      OR role = 'TI'           -- TI has access to all
      OR role = 'ESCRITORIO_PROCESSOS'  -- Escritório de Processos has access to all
    )
  )
$function$;
