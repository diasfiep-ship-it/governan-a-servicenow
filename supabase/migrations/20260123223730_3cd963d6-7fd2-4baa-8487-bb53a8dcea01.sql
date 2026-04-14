-- Add column to track if area was modified by admin after upload
ALTER TABLE public.chamados 
ADD COLUMN IF NOT EXISTS area_modificada_por_admin BOOLEAN DEFAULT FALSE;

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_chamados_area_modificada ON public.chamados (area_modificada_por_admin);

-- Add comment
COMMENT ON COLUMN public.chamados.area_modificada_por_admin IS 'Indica se a área demandante foi modificada por um administrador após o upload';