-- Add new columns to chamados table for process office and cancellation features
ALTER TABLE public.chamados 
ADD COLUMN IF NOT EXISTS status_anterior text,
ADD COLUMN IF NOT EXISTS cancelado boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS motivo_cancelamento text,
ADD COLUMN IF NOT EXISTS evidencia_cancelamento_url text,
ADD COLUMN IF NOT EXISTS cancelado_em timestamp with time zone,
ADD COLUMN IF NOT EXISTS cancelado_por uuid;

-- Create storage bucket for cancellation evidence images
INSERT INTO storage.buckets (id, name, public) 
VALUES ('evidencias-cancelamento', 'evidencias-cancelamento', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policy for admins to upload evidence
CREATE POLICY "Admins can upload evidence"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'evidencias-cancelamento' 
  AND (SELECT is_admin(auth.uid()))
);

-- Create storage policy for public read access
CREATE POLICY "Anyone can view evidence"
ON storage.objects FOR SELECT
USING (bucket_id = 'evidencias-cancelamento');

-- Create storage policy for admins to delete evidence
CREATE POLICY "Admins can delete evidence"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'evidencias-cancelamento' 
  AND (SELECT is_admin(auth.uid()))
);