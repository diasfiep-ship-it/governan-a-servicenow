-- Enum para perfis de usuário
CREATE TYPE public.app_role AS ENUM (
  'ADM',
  'ADM_TI',
  'CENTRO_CIVICO_ENGENHARIA',
  'CENTRO_CIVICO_GPOG',
  'GERENCIA_CENTRO_EVENTOS',
  'GERENCIA_COMPRAS_LOGISTICA',
  'GERENCIA_CONTABILIDADE_PATRIMONIO_FINANCEIRO',
  'GERENCIA_FACILITIES',
  'GERENCIA_PERFORMANCE_CANAIS_VENDAS',
  'GERENCIA_PLANEJAMENTO_ORCAMENTO',
  'GERENCIA_PROJETOS_PROCESSOS_MELHORIA',
  'GERENCIA_RECURSOS_HUMANOS',
  'GERENCIA_RELACIONAMENTO_IEL',
  'GERENCIA_RISCOS_COMPLIANCE',
  'GERENCIA_TECNOLOGIA_INFORMACAO',
  'RECURSOS_HUMANOS'
);

-- Tabela de perfis de usuário
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  must_change_password BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Tabela de roles (separada por segurança)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);

-- Tabela principal de chamados
CREATE TABLE public.chamados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero TEXT UNIQUE NOT NULL,
  area_demandante TEXT NOT NULL,
  cliente TEXT,
  descricao TEXT,
  area TEXT,
  status TEXT DEFAULT 'Aberto',
  item TEXT,
  oferta TEXT,
  sla TEXT,
  estado TEXT,
  data_abertura DATE,
  catalogo TEXT,
  grupo_atribuicao TEXT,
  data_resolvido DATE,
  data_fechamento DATE,
  data_encerramento DATE,
  data_previsto DATE,
  -- Campos da aplicação
  gravidade INTEGER DEFAULT 1 CHECK (gravidade >= 1 AND gravidade <= 5),
  urgencia INTEGER DEFAULT 1 CHECK (urgencia >= 1 AND urgencia <= 5),
  tendencia INTEGER DEFAULT 1 CHECK (tendencia >= 1 AND tendencia <= 5),
  pontuacao_gut INTEGER GENERATED ALWAYS AS (gravidade * urgencia * tendencia) STORED,
  esforco DECIMAL(10,2) DEFAULT 1,
  prioridade_calculada DECIMAL(10,2) GENERATED ALWAYS AS (
    CASE WHEN esforco > 0 
      THEN (gravidade * urgencia * tendencia)::DECIMAL / esforco 
      ELSE 0 
    END
  ) STORED,
  selecionado_mes BOOLEAN DEFAULT FALSE,
  mes_priorizacao TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chamados ENABLE ROW LEVEL SECURITY;

-- Função para verificar role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Função para obter role do usuário
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id LIMIT 1
$$;

-- Função para verificar se é admin
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('ADM', 'ADM_TI')
  )
$$;

-- Função para mapear área demandante para role
CREATE OR REPLACE FUNCTION public.area_to_role(area TEXT)
RETURNS app_role
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN CASE 
    WHEN area ILIKE '%CENTRO CIVICO%ENGENHARIA%' THEN 'CENTRO_CIVICO_ENGENHARIA'::app_role
    WHEN area ILIKE '%CENTRO CIVICO%GPOG%' THEN 'CENTRO_CIVICO_GPOG'::app_role
    WHEN area ILIKE '%CENTRO DE EVENTOS%' THEN 'GERENCIA_CENTRO_EVENTOS'::app_role
    WHEN area ILIKE '%COMPRAS%LOGISTICA%' THEN 'GERENCIA_COMPRAS_LOGISTICA'::app_role
    WHEN area ILIKE '%CONTABILIDADE%' THEN 'GERENCIA_CONTABILIDADE_PATRIMONIO_FINANCEIRO'::app_role
    WHEN area ILIKE '%FACILITIES%' THEN 'GERENCIA_FACILITIES'::app_role
    WHEN area ILIKE '%PERFORMANCE%CANAIS%' THEN 'GERENCIA_PERFORMANCE_CANAIS_VENDAS'::app_role
    WHEN area ILIKE '%PLANEJAMENTO%ORCAMENTO%' THEN 'GERENCIA_PLANEJAMENTO_ORCAMENTO'::app_role
    WHEN area ILIKE '%PROJETOS%PROCESSOS%' OR area ILIKE '%MELHORIA CONTINUA%' THEN 'GERENCIA_PROJETOS_PROCESSOS_MELHORIA'::app_role
    WHEN area ILIKE '%RECURSOS HUMANOS%' THEN 'GERENCIA_RECURSOS_HUMANOS'::app_role
    WHEN area ILIKE '%IEL%' THEN 'GERENCIA_RELACIONAMENTO_IEL'::app_role
    WHEN area ILIKE '%RISCOS%COMPLIANCE%' THEN 'GERENCIA_RISCOS_COMPLIANCE'::app_role
    WHEN area ILIKE '%TECNOLOGIA%INFORMACAO%' THEN 'GERENCIA_TECNOLOGIA_INFORMACAO'::app_role
    ELSE NULL
  END;
END;
$$;

-- RLS Policies para profiles
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.is_admin(auth.uid()));

-- RLS Policies para user_roles
CREATE POLICY "Users can view own role"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'ADM'));

-- RLS Policies para chamados
CREATE POLICY "Admins can view all chamados"
  ON public.chamados FOR SELECT
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Users can view chamados from their area"
  ON public.chamados FOR SELECT
  USING (
    public.area_to_role(area_demandante) = public.get_user_role(auth.uid())
  );

CREATE POLICY "Admins can insert chamados"
  ON public.chamados FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'ADM'));

CREATE POLICY "ADM can update all chamados"
  ON public.chamados FOR UPDATE
  USING (public.has_role(auth.uid(), 'ADM'));

CREATE POLICY "ADM_TI can update esforco only"
  ON public.chamados FOR UPDATE
  USING (public.has_role(auth.uid(), 'ADM_TI'));

CREATE POLICY "Area users can update GUT fields"
  ON public.chamados FOR UPDATE
  USING (
    public.area_to_role(area_demandante) = public.get_user_role(auth.uid())
  );

-- Trigger para criar profile automaticamente
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, must_change_password)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    TRUE
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_chamados_updated_at
  BEFORE UPDATE ON public.chamados
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.chamados;