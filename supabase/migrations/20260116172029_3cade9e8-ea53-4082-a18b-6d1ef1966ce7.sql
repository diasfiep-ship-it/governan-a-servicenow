-- Fix infinite recursion on user_roles RLS by removing self-referential policy
-- and replacing it with SECURITY DEFINER function checks.

-- Drop the recursive policy
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;

-- Recreate admin manage policy using security definer function (no recursion)
CREATE POLICY "Admins can manage all roles"
ON public.user_roles
FOR ALL
USING (public.has_role(auth.uid(), 'ADM'))
WITH CHECK (public.has_role(auth.uid(), 'ADM'));

-- Ensure own-role select policy exists
DROP POLICY IF EXISTS "Users can view own role" ON public.user_roles;
CREATE POLICY "Users can view own role"
ON public.user_roles
FOR SELECT
USING (auth.uid() = user_id);