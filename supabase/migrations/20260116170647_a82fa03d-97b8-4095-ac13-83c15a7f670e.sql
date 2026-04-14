-- Drop all dependent policies on chamados first
DROP POLICY IF EXISTS "Users can view chamados from their area" ON public.chamados;
DROP POLICY IF EXISTS "Area users can update GUT fields" ON public.chamados;

-- Now drop the function with CASCADE to remove remaining dependencies
DROP FUNCTION IF EXISTS public.get_user_role(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.has_role(uuid, app_role) CASCADE;
DROP FUNCTION IF EXISTS public.area_to_role(text) CASCADE;

-- Drop policies on user_roles
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view own role" ON public.user_roles;

-- Drop the table and recreate with TEXT column
DROP TABLE IF EXISTS public.user_roles;

CREATE TABLE public.user_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role text NOT NULL,
    UNIQUE (user_id, role)
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Recreate policies for user_roles
CREATE POLICY "Admins can manage all roles"
ON public.user_roles
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.user_roles ur 
        WHERE ur.user_id = auth.uid() AND ur.role = 'ADM'
    )
);

CREATE POLICY "Users can view own role"
ON public.user_roles
FOR SELECT
USING (auth.uid() = user_id);

-- Recreate functions with text roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('ADM', 'ADM_TI')
  )
$$;

-- Function to get all roles of a user
CREATE OR REPLACE FUNCTION public.get_user_roles(_user_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ARRAY_AGG(role) FROM public.user_roles WHERE user_id = _user_id
$$;

-- Function to check if user has any role that matches the area_demandante
CREATE OR REPLACE FUNCTION public.user_has_area_access(_user_id uuid, _area_demandante text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
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
    )
  )
$$;

-- Recreate chamados RLS policies using the new function
CREATE POLICY "Users can view chamados from their area"
ON public.chamados
FOR SELECT
USING (
  user_has_area_access(auth.uid(), area_demandante)
);

CREATE POLICY "Area users can update GUT fields"
ON public.chamados
FOR UPDATE
USING (
  user_has_area_access(auth.uid(), area_demandante)
)
WITH CHECK (
  user_has_area_access(auth.uid(), area_demandante)
);