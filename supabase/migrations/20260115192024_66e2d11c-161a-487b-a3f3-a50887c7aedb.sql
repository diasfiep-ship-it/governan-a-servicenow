-- Add RLS policy to allow TI users to view all chamados
CREATE POLICY "TI can view all chamados"
ON public.chamados
FOR SELECT
USING (has_role(auth.uid(), 'TI'::app_role));