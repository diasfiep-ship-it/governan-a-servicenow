-- Update the user_has_area_access function to include ESCRITORIO_PROCESSOS role
-- This allows users with this role to view all chamados (like TI users)

CREATE OR REPLACE FUNCTION public.user_has_area_access(_user_id uuid, _area_demandante text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id 
    AND (
      role = _area_demandante  -- Exact match with area_demandante
      OR role = 'ADM'          -- Admins have access to all
      OR role = 'ADM_TI'       -- ADM_TI has access to all
      OR role = 'TI'           -- TI has access to all
      OR role = 'ESCRITORIO_PROCESSOS'  -- Escritório de Processos has access to all
    )
  )
$$;