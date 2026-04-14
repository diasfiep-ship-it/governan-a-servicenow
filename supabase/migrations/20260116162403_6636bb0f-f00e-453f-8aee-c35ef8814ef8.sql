-- Add area_id column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN area_id uuid REFERENCES public.areas(id) ON DELETE SET NULL;

-- Create index for better performance
CREATE INDEX idx_profiles_area_id ON public.profiles(area_id);

-- Create function to check if user belongs to an area
CREATE OR REPLACE FUNCTION public.get_user_area_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT area_id FROM public.profiles WHERE id = _user_id
$$;

-- Create function to get area name for a user
CREATE OR REPLACE FUNCTION public.get_user_area_name(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.nome 
  FROM public.profiles p
  LEFT JOIN public.areas a ON p.area_id = a.id
  WHERE p.id = _user_id
$$;

-- Update RLS policy for chamados to also check by area
DROP POLICY IF EXISTS "Users can view chamados from their area" ON public.chamados;

CREATE POLICY "Users can view chamados from their area" 
ON public.chamados 
FOR SELECT 
USING (
  -- Check by role (legacy support)
  area_to_role(area_demandante) = get_user_role(auth.uid())
  OR
  -- Check by area_id (new approach)
  area_demandante = get_user_area_name(auth.uid())
);

-- Update RLS policy for chamados update by area users
DROP POLICY IF EXISTS "Area users can update GUT fields" ON public.chamados;

CREATE POLICY "Area users can update GUT fields" 
ON public.chamados 
FOR UPDATE 
USING (
  area_to_role(area_demandante) = get_user_role(auth.uid())
  OR
  area_demandante = get_user_area_name(auth.uid())
)
WITH CHECK (
  area_to_role(area_demandante) = get_user_role(auth.uid())
  OR
  area_demandante = get_user_area_name(auth.uid())
);