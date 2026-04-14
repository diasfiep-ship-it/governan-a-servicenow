ALTER TABLE public.chamados
  ADD COLUMN IF NOT EXISTS spec_ativo boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS spec_inicio timestamp with time zone DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS spec_dias_acumulados numeric DEFAULT 0;