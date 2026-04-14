
-- Update user_has_area_access function to use case-insensitive matching
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
      UPPER(role) = UPPER(_area_demandante)  -- Case-insensitive match with area_demandante
      OR role = 'ADM'          -- Admins have access to all
      OR role = 'ADM_TI'       -- ADM_TI has access to all
      OR role = 'TI'           -- TI has access to all
      OR role = 'ESCRITORIO_PROCESSOS'  -- Escritório de Processos has access to all
    )
  )
$function$;
