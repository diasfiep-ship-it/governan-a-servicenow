-- Create areas table for managing departments/sectors
CREATE TABLE public.areas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  descricao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;

-- Only admins can manage areas
CREATE POLICY "Admins can manage areas"
  ON public.areas
  FOR ALL
  USING (is_admin(auth.uid()));

-- All authenticated users can view active areas
CREATE POLICY "Users can view active areas"
  ON public.areas
  FOR SELECT
  USING (auth.uid() IS NOT NULL AND ativo = true);

-- Create trigger for updated_at
CREATE TRIGGER update_areas_updated_at
  BEFORE UPDATE ON public.areas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Insert existing areas from chamados
INSERT INTO public.areas (nome) 
SELECT DISTINCT area_demandante FROM public.chamados 
WHERE area_demandante IS NOT NULL AND area_demandante != ''
ON CONFLICT (nome) DO NOTHING;