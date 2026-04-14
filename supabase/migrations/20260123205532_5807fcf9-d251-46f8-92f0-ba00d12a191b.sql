-- Allow admins to INSERT chamados (needed for Excel upload)
CREATE POLICY "Admins can insert chamados"
ON public.chamados
FOR INSERT
WITH CHECK (is_admin(auth.uid()));

-- Allow admins to DELETE chamados
CREATE POLICY "Admins can delete chamados"
ON public.chamados
FOR DELETE
USING (is_admin(auth.uid()));