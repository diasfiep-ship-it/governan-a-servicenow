
-- Criar tabela de sprints
CREATE TABLE public.sprints (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  numero INTEGER NOT NULL,
  nome TEXT NOT NULL,
  data_inicio DATE,
  data_fim DATE,
  status TEXT NOT NULL DEFAULT 'planejada' CHECK (status IN ('planejada', 'em_andamento', 'concluida')),
  horas_totais NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Adicionar coluna sprint_id na tabela chamados
ALTER TABLE public.chamados ADD COLUMN sprint_id UUID REFERENCES public.sprints(id);

-- Habilitar RLS na tabela sprints
ALTER TABLE public.sprints ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso para sprints
CREATE POLICY "Admins can manage sprints" ON public.sprints
FOR ALL USING (is_admin(auth.uid()));

CREATE POLICY "All users can view sprints" ON public.sprints
FOR SELECT USING (auth.uid() IS NOT NULL);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_sprints_updated_at
BEFORE UPDATE ON public.sprints
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Habilitar realtime para sprints
ALTER PUBLICATION supabase_realtime ADD TABLE public.sprints;
