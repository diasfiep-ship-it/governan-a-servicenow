CREATE TABLE public.base_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL,
  file_name text NOT NULL,
  records_count integer DEFAULT 0
);

ALTER TABLE public.base_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All users can view base_updates" ON public.base_updates
  FOR SELECT TO public USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can insert base_updates" ON public.base_updates
  FOR INSERT TO public WITH CHECK (is_admin(auth.uid()));