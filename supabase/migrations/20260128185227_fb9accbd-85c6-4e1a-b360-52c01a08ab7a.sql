-- Add new columns for enhanced Excel import functionality

-- Column for reopening count from Excel
ALTER TABLE public.chamados ADD COLUMN IF NOT EXISTS contagem_reabertura integer DEFAULT 0;

-- Column for "Aguardando Cliente" status flag
ALTER TABLE public.chamados ADD COLUMN IF NOT EXISTS aguardando_cliente boolean DEFAULT false;

-- Column for "Motivo da Pendência" from Excel
ALTER TABLE public.chamados ADD COLUMN IF NOT EXISTS motivo_pendencia text;

-- Column for "Encerrado por" from Excel
ALTER TABLE public.chamados ADD COLUMN IF NOT EXISTS encerrado_por text;

-- Column for "Atribuído a" from Excel
ALTER TABLE public.chamados ADD COLUMN IF NOT EXISTS atribuido_a text;

-- Column for "Comentários e Anotações de trabalho" from Excel
ALTER TABLE public.chamados ADD COLUMN IF NOT EXISTS comentarios text;

-- Column for hiding tickets with "Aguardando Aprovação" status
ALTER TABLE public.chamados ADD COLUMN IF NOT EXISTS oculto boolean DEFAULT false;

-- Clear all "Novo" flags for existing chamados (set area_modificada_por_admin to true)
UPDATE public.chamados SET area_modificada_por_admin = true WHERE area_modificada_por_admin = false OR area_modificada_por_admin IS NULL;