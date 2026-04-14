-- Create backup table for chamados (stores last state before update)
CREATE TABLE IF NOT EXISTS public.chamados_backup (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  backup_date timestamp with time zone NOT NULL DEFAULT now(),
  backup_by uuid NOT NULL,
  backup_count integer NOT NULL DEFAULT 0,
  chamado_data jsonb NOT NULL
);

-- Enable RLS
ALTER TABLE public.chamados_backup ENABLE ROW LEVEL SECURITY;

-- Only admins can manage backup
CREATE POLICY "Admins can manage chamados_backup"
ON public.chamados_backup
FOR ALL
USING (is_admin(auth.uid()));

-- Create index for faster queries
CREATE INDEX idx_chamados_backup_date ON public.chamados_backup(backup_date DESC);