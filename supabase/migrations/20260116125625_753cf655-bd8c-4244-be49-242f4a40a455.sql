-- Drop existing policy for area users
DROP POLICY IF EXISTS "Area users can update GUT fields" ON public.chamados;

-- Create new policy that allows area users to update GUT fields properly
CREATE POLICY "Area users can update GUT fields" 
ON public.chamados 
FOR UPDATE 
USING (area_to_role(area_demandante) = get_user_role(auth.uid()))
WITH CHECK (area_to_role(area_demandante) = get_user_role(auth.uid()));