-- Remove the generated column and recreate as regular column
ALTER TABLE public.chamados DROP COLUMN pontuacao_gut;
ALTER TABLE public.chamados ADD COLUMN pontuacao_gut integer;

-- Update default GUT values from 1 to NULL for chamados that haven't been evaluated
UPDATE public.chamados 
SET gravidade = NULL, urgencia = NULL, tendencia = NULL
WHERE gravidade = 1 AND urgencia = 1 AND tendencia = 1 AND status = 'Aguard. GUT';

-- Also change default values for future inserts
ALTER TABLE public.chamados ALTER COLUMN gravidade SET DEFAULT NULL;
ALTER TABLE public.chamados ALTER COLUMN urgencia SET DEFAULT NULL;
ALTER TABLE public.chamados ALTER COLUMN tendencia SET DEFAULT NULL;