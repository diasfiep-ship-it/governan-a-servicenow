import { useEffect, useMemo, useState } from 'react';
import { useChamados } from '@/hooks/useChamados';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import GUTSelector from './GUTSelector';
import StatusBadge from './StatusBadge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Search, Filter, Loader2, HelpCircle, ArrowUpDown, ArrowUp, ArrowDown, AlertTriangle, RefreshCcw, UserX, Clock, Building2, FileSearch } from 'lucide-react';
import { calculateChamadoStatus, isGutComplete, hasAreaAccess, Chamado, isEscritorioProcessos, shouldShowInAguardGutFilter, calculateBusinessDays } from '@/types';
import { differenceInDays, parseISO, format, isAfter } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Area that Escritório de Processos can see in Priorização por Área tab
const ESCRITORIO_ALLOWED_AREA = 'GERÊNCIA DE PROJETOS PROCESSOS E MELHORIA CONTINUA';

// Sort types
type SortDirection = 'asc' | 'desc' | null;
type SortField = 'numero' | 'area' | 'cliente' | 'gut' | 'tempo' | 'prioridade' | null;

// GUT column hints
const GUT_HINTS = {
  gravidade: {
    title: 'Gravidade',
    description: 'Avalia o impacto do problema se nada for feito.',
    scale: '1 → Impacto mínimo, pouco perceptível\n5 → Impacto muito alto, afeta resultados, clientes ou operação',
    example: 'Um erro que gera retrabalho pontual (baixo impacto) → Gravidade baixa\nUm erro que paralisa um processo crítico → Gravidade alta'
  },
  urgencia: {
    title: 'Urgência',
    description: 'Avalia o quão rápido o problema precisa ser resolvido.',
    scale: '1 → Pode esperar, sem prejuízo imediato\n5 → Precisa de ação imediata',
    example: 'Uma melhoria desejável, mas sem prazo definido → Urgência baixa\nUma falha que impede o trabalho diário → Urgência alta'
  },
  tendencia: {
    title: 'Tendência',
    description: 'Avalia se o problema tende a piorar com o tempo.',
    scale: '1 → Não tende a piorar\n5 → Vai se agravar rapidamente se não for tratado',
    example: 'Um problema isolado e estável → Tendência baixa\nUm problema que gera efeito cascata ou aumenta com o uso → Tendência alta'
  }
};

// Component for GUT column header with tooltip
function GUTColumnHeader({ type }: { type: 'gravidade' | 'urgencia' | 'tendencia' }) {
  const hint = GUT_HINTS[type];
  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1 cursor-help justify-center">
            <span>{hint.title}</span>
            <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs p-3 text-left">
          <div className="space-y-2">
            <p className="font-medium">{hint.title}</p>
            <p className="text-sm text-muted-foreground">{hint.description}</p>
            <div className="text-xs space-y-1">
              <p className="whitespace-pre-line">{hint.scale}</p>
            </div>
            <div className="text-xs border-t pt-2 mt-2">
              <p className="font-medium mb-1">Exemplo:</p>
              <p className="whitespace-pre-line text-muted-foreground">{hint.example}</p>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Helper to format area name with only the first letter uppercase
function formatAreaName(area: string): string {
  const lower = area.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

// Helper to normalize area name for comparison (remove accents, lowercase)
function normalizeAreaName(area: string): string {
  return area
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

// Helper to deduplicate areas by normalized name
function deduplicateAreas(areas: string[]): string[] {
  const seen = new Map<string, string>();
  areas.forEach(area => {
    const normalized = normalizeAreaName(area);
    if (!seen.has(normalized)) {
      seen.set(normalized, area);
    }
  });
  return Array.from(seen.values()).sort((a, b) => 
    normalizeAreaName(a).localeCompare(normalizeAreaName(b))
  );
}

type StatusFilter = 'todos' | 'a_classificar' | 'concluido' | 'priorizado' | 'aguardando' | 'todos_exceto_concluidos';

export default function PriorizacaoAreaTab() {
  const { chamados, isLoading, updateGUT, subscribeToChanges, isAdmin, isTI, isEscritorio } = useChamados();
  const { roles } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [areaFilter, setAreaFilter] = useState<string>('all');
  
  // Check if user is Escritório de Processos
  const isEscritorioUser = roles.some(r => isEscritorioProcessos(r));
  
  // ADM/TI default to 'todos', clients default to 'a_classificar'
  const isAdminOrTI = isAdmin || isTI;
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(isAdminOrTI ? 'todos' : 'a_classificar');
  
  // Sorting state (ADM only) - default is prioridade descending
  const [sortField, setSortField] = useState<SortField>('prioridade');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Fetch sprints for displaying sprint info
  const { data: sprints = [] } = useQuery({
    queryKey: ['sprints'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sprints')
        .select('*')
        .order('numero', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Subscribe to real-time changes
  useEffect(() => {
    const unsubscribe = subscribeToChanges();
    return () => unsubscribe();
  }, []);

  // Get unique areas for filter based on current status filter (dynamic filtering)
  const areas = useMemo(() => {
    // First filter chamados by status to get only relevant areas
    const chamadosForStatus = chamados.filter(chamado => {
      const dynamicStatus = calculateChamadoStatus(chamado);
      switch (statusFilter) {
        case 'a_classificar':
          return shouldShowInAguardGutFilter(chamado);
        case 'concluido':
          return dynamicStatus === 'Concluído';
        case 'priorizado':
          // Priorizado: has sprint but is NOT concluded
          return chamado.sprint_id !== null && dynamicStatus !== 'Concluído';
        case 'aguardando':
          return !['Aguard. GUT', 'Concluído'].includes(dynamicStatus) && !chamado.sprint_id;
        case 'todos_exceto_concluidos':
          return dynamicStatus !== 'Concluído';
        case 'todos':
        default:
          return true;
      }
    });
    
    // Filter out empty area_demandante values before deduplication (Radix Select doesn't allow empty values)
    const allAreas = chamadosForStatus
      .map(c => c.area_demandante)
      .filter(area => area && area.trim() !== '');
    return deduplicateAreas(allAreas);
  }, [chamados, statusFilter]);

  // Helper to calculate priority score (80% GUT + 20% effort inverted)
  const calculatePriorityScore = (chamado: Chamado): number => {
    const maxGUT = 125; // 5*5*5
    const maxEsforco = 100;
    const gutScore = (chamado.pontuacao_gut || 0) / maxGUT;
    const effortScore = 1 - Math.min((chamado.esforco || 1) / maxEsforco, 1);
    return (gutScore * 0.8) + (effortScore * 0.2);
  };

  // Handle sort toggle (for ADM only)
  const handleSort = (field: SortField) => {
    if (!isAdmin) return;
    if (sortField === field) {
      if (sortDirection === 'desc') setSortDirection('asc');
      else if (sortDirection === 'asc') {
        setSortField('prioridade');
        setSortDirection('desc');
      }
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Get sort icon for column
  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-50" />;
    if (sortDirection === 'desc') return <ArrowDown className="h-3 w-3 ml-1" />;
    return <ArrowUp className="h-3 w-3 ml-1" />;
  };

  // Filter and sort chamados
  const filteredChamados = useMemo(() => {
    const filtered = chamados
      .filter(chamado => {
        // Escritório de Processos can only see their specific area
        if (isEscritorioUser) {
          const normalizedArea = normalizeAreaName(chamado.area_demandante);
          const normalizedAllowedArea = normalizeAreaName(ESCRITORIO_ALLOWED_AREA);
          if (normalizedArea !== normalizedAllowedArea) {
            return false;
          }
        }
        
        const matchesSearch = 
          chamado.numero.toLowerCase().includes(searchTerm.toLowerCase()) ||
          chamado.descricao?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          chamado.cliente?.toLowerCase().includes(searchTerm.toLowerCase());
        
        // Normalize area filter comparison
        const matchesArea = areaFilter === 'all' || 
          normalizeAreaName(chamado.area_demandante) === normalizeAreaName(areaFilter);
        
        // Status filter logic (applies to all users now)
        let matchesStatusFilter = true;
        const dynamicStatus = calculateChamadoStatus(chamado);
        switch (statusFilter) {
          case 'a_classificar':
            matchesStatusFilter = shouldShowInAguardGutFilter(chamado);
            break;
          case 'concluido':
            matchesStatusFilter = dynamicStatus === 'Concluído';
            break;
          case 'priorizado':
            // Priorizado: has sprint but is NOT concluded
            matchesStatusFilter = chamado.sprint_id !== null && dynamicStatus !== 'Concluído';
            break;
          case 'aguardando':
            matchesStatusFilter = !['Aguard. GUT', 'Concluído'].includes(dynamicStatus) && !chamado.sprint_id;
            break;
          case 'todos_exceto_concluidos':
            matchesStatusFilter = dynamicStatus !== 'Concluído';
            break;
          case 'todos':
          default:
            matchesStatusFilter = true;
        }
        
        return matchesSearch && matchesArea && matchesStatusFilter;
      });

    // Sort based on current sort field and direction (for ADM only, others get priority sort)
    return filtered.sort((a, b) => {
      let comparison = 0;
      
      if (!isAdmin) {
        // Non-admin users always get priority sort (GUT descending)
        return (b.pontuacao_gut || 0) - (a.pontuacao_gut || 0);
      }
      
      switch (sortField) {
        case 'numero':
          comparison = a.numero.localeCompare(b.numero);
          break;
        case 'area':
          comparison = normalizeAreaName(a.area_demandante).localeCompare(normalizeAreaName(b.area_demandante));
          break;
        case 'cliente':
          comparison = (a.cliente || '').localeCompare(b.cliente || '');
          break;
        case 'gut':
          comparison = (a.pontuacao_gut || 0) - (b.pontuacao_gut || 0);
          break;
        case 'tempo':
          const daysA = a.data_abertura ? differenceInDays(new Date(), parseISO(a.data_abertura)) : 0;
          const daysB = b.data_abertura ? differenceInDays(new Date(), parseISO(b.data_abertura)) : 0;
          comparison = daysA - daysB;
          break;
        case 'prioridade':
        default:
          comparison = calculatePriorityScore(a) - calculatePriorityScore(b);
          break;
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [chamados, searchTerm, areaFilter, statusFilter, sortField, sortDirection, isAdmin]);

  // Can user edit GUT for this chamado?
  const canEditGUT = (areaDemandante: string, chamado: typeof chamados[0]) => {
    // If chamado is concluded, don't allow editing
    if (chamado.data_conclusao || calculateChamadoStatus(chamado) === 'Concluído') return false;
    // If chamado is in a sprint, don't allow editing
    if (chamado.sprint_id) return false;
    if (isAdmin) return true;
    // Check if user has any role matching the area_demandante
    return hasAreaAccess(roles, areaDemandante);
  };

  // Calculate time open
  const getTempoAberto = (dataAbertura: string | null) => {
    if (!dataAbertura) return '-';
    try {
      const days = differenceInDays(new Date(), parseISO(dataAbertura));
      return `${days}d`;
    } catch {
      return '-';
    }
  };

  // Get sprint info for a chamado
  const getSprintInfo = (sprintId: string | null) => {
    if (!sprintId) return null;
    return sprints.find(s => s.id === sprintId);
  };

  // Check if chamado is overdue (sprint end date passed and not concluded)
  // Only mark as overdue if we're PAST the end date (i.e., the day AFTER data_fim)
  const isOverdue = (chamado: typeof chamados[0]) => {
    if (!chamado.sprint_id) return false;
    if (chamado.data_conclusao) return false; // Already concluded
    const sprint = getSprintInfo(chamado.sprint_id);
    if (!sprint?.data_fim) return false;
    // Add 1 day to the end date - overdue only starts the day AFTER sprint ends
    const endDate = parseISO(sprint.data_fim);
    const overdueStartDate = new Date(endDate);
    overdueStartDate.setDate(overdueStartDate.getDate() + 1);
    return isAfter(new Date(), overdueStartDate);
  };

  // Check if chamado has pending status due to requester
  // Only show "Pendência Solicitante" when Estado is "Pendente" AND Motivo da Pendência is "Aguardando Solicitante"
  const isPendenciaSolicitante = (chamado: typeof chamados[0]) => {
    const estadoNorm = (chamado.estado || '').toLowerCase().trim();
    return estadoNorm === 'pendente' && chamado.motivo_pendencia === 'Aguardando Solicitante';
  };

  // Get Spec days display for a chamado
  const getSpecDays = (chamado: typeof chamados[0]): number | null => {
    const c = chamado as any;
    if (!c.spec_ativo) return null;
    const acumulados = c.spec_dias_acumulados || 0;
    const diasAtuais = c.spec_inicio ? calculateBusinessDays(new Date(c.spec_inicio), new Date()) : 0;
    return acumulados + diasAtuais;
  };

  // Get status display for client view
  const getClientStatusDisplay = (chamado: typeof chamados[0]) => {
    // If chamado has data_conclusao, it's concluded - show conclusion date
    if (chamado.data_conclusao) {
      return { 
        label: 'Concluído', 
        dataConclusao: chamado.data_conclusao, 
        dataFim: null, 
        overdue: false,
        concluded: true,
        isEscritorioProcessos: false
      };
    }
    
    // If chamado is in Escritório de Processos
    if (chamado.status === 'Em mapeamento com Escritório de Processos') {
      return {
        label: 'Escritório de Processos',
        dataConclusao: null,
        dataFim: null,
        overdue: false,
        concluded: false,
        isEscritorioProcessos: true
      };
    }
    
    if (chamado.sprint_id) {
      const sprint = getSprintInfo(chamado.sprint_id);
      if (sprint) {
        return {
          label: sprint.nome,
          dataConclusao: null,
          dataFim: sprint.data_fim,
          overdue: isOverdue(chamado),
          concluded: false,
          isEscritorioProcessos: false
        };
      }
    }
    if (chamado.status?.toUpperCase().includes('CONCLU')) {
      return { label: 'Concluído', dataConclusao: null, dataFim: null, overdue: false, concluded: true, isEscritorioProcessos: false };
    }
    return null;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Status Filters (for all users) */}
      <div className="flex flex-wrap gap-2 mb-4">
        {!isAdminOrTI && (
          <Button
            variant={statusFilter === 'a_classificar' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('a_classificar')}
          >
            A classificar
          </Button>
        )}
        {isAdminOrTI && (
          <Button
            variant={statusFilter === 'todos' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('todos')}
          >
            Todos
          </Button>
        )}
        {isAdminOrTI && (
          <Button
            variant={statusFilter === 'todos_exceto_concluidos' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('todos_exceto_concluidos')}
          >
            Todos Exceto Concluídos
          </Button>
        )}
        {isAdminOrTI && (
          <Button
            variant={statusFilter === 'a_classificar' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('a_classificar')}
          >
            Aguard. GUT
          </Button>
        )}
        <Button
          variant={statusFilter === 'aguardando' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setStatusFilter('aguardando')}
        >
          Aguardando Priorização
        </Button>
        <Button
          variant={statusFilter === 'priorizado' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setStatusFilter('priorizado')}
        >
          Priorizado
        </Button>
        <Button
          variant={statusFilter === 'concluido' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setStatusFilter('concluido')}
        >
          Concluído
        </Button>
        {!isAdminOrTI && (
          <Button
            variant={statusFilter === 'todos' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('todos')}
          >
            Todos
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por número, descrição ou solicitado para..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        {isAdminOrTI && (
          <div className="w-full sm:w-72">
            <Select value={areaFilter} onValueChange={setAreaFilter}>
              <SelectTrigger>
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filtrar por área" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as áreas</SelectItem>
                {areas.map(area => (
                  <SelectItem key={area} value={area}>{formatAreaName(area)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Results count */}
      <div className="text-sm text-muted-foreground">
        {filteredChamados.length} chamado{filteredChamados.length !== 1 ? 's' : ''} encontrado{filteredChamados.length !== 1 ? 's' : ''}
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-x-auto w-full">
        <ScrollArea className="h-[calc(100vh-380px)]">
          <Table className="table-corporate w-full min-w-[1100px]">
            <TableHeader>
              <TableRow className="bg-table-header hover:bg-table-header">
                <TableHead 
                  className={`text-table-header-foreground ${isAdmin ? 'cursor-pointer hover:bg-muted/50' : ''}`}
                  onClick={() => handleSort('numero')}
                >
                  <div className="flex items-center">
                    Número
                    {isAdmin && getSortIcon('numero')}
                  </div>
                </TableHead>
                <TableHead 
                  className={`text-table-header-foreground ${isAdmin ? 'cursor-pointer hover:bg-muted/50' : ''}`}
                  onClick={() => handleSort('area')}
                >
                  <div className="flex items-center">
                    Área
                    {isAdmin && getSortIcon('area')}
                  </div>
                </TableHead>
                <TableHead className="text-table-header-foreground min-w-[200px]">Descrição</TableHead>
                <TableHead 
                  className={`text-table-header-foreground ${isAdmin ? 'cursor-pointer hover:bg-muted/50' : ''}`}
                  onClick={() => handleSort('cliente')}
                >
                  <div className="flex items-center">
                    Cliente
                    {isAdmin && getSortIcon('cliente')}
                  </div>
                </TableHead>
                {/* Only show GUT columns if chamado is not in a sprint (for client view) */}
                <TableHead className="text-table-header-foreground text-center">
                  <GUTColumnHeader type="gravidade" />
                </TableHead>
                <TableHead className="text-table-header-foreground text-center">
                  <GUTColumnHeader type="urgencia" />
                </TableHead>
                <TableHead className="text-table-header-foreground text-center">
                  <GUTColumnHeader type="tendencia" />
                </TableHead>
                <TableHead 
                  className={`text-table-header-foreground text-center ${isAdmin ? 'cursor-pointer hover:bg-muted/50' : ''}`}
                  onClick={() => handleSort('gut')}
                >
                  <div className="flex items-center justify-center">
                    GUT
                    {isAdmin && getSortIcon('gut')}
                  </div>
                </TableHead>
                {isAdminOrTI && (
                  <>
                    <TableHead 
                      className={`text-table-header-foreground text-center ${isAdmin ? 'cursor-pointer hover:bg-muted/50' : ''}`}
                      onClick={() => handleSort('tempo')}
                    >
                      <div className="flex items-center justify-center">
                        Tempo
                        {isAdmin && getSortIcon('tempo')}
                      </div>
                    </TableHead>
                    <TableHead className="text-table-header-foreground">Status</TableHead>
                  </>
                )}
                {!isAdminOrTI && (
                  <TableHead className="text-table-header-foreground">Status</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredChamados.map((chamado) => {
                const dynamicStatus = calculateChamadoStatus(chamado);
                const clientStatus = !isAdminOrTI ? getClientStatusDisplay(chamado) : null;
                const showGutMatrix = !chamado.sprint_id || isAdminOrTI;
                
                return (
                  <TableRow key={chamado.id} className="group">
                    <TableCell className="text-sm font-medium">{chamado.numero}</TableCell>
                    <TableCell className="text-sm">
                      <span className="truncate block max-w-[150px]" title={chamado.area_demandante || 'Não definido'}>
                        {chamado.area_demandante ? formatAreaName(chamado.area_demandante) : '-'}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-md">
                      <p className="truncate text-sm" title={chamado.descricao || ''}>
                        {chamado.descricao || '-'}
                      </p>
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className="truncate block max-w-[100px]" title={chamado.cliente || ''}>
                        {chamado.cliente || '-'}
                      </span>
                    </TableCell>
                    {showGutMatrix ? (
                      <>
                        <TableCell>
                          <GUTSelector
                            value={chamado.gravidade}
                            onChange={(value) => updateGUT({ id: chamado.id, gravidade: value })}
                            disabled={!canEditGUT(chamado.area_demandante, chamado)}
                            label="gravidade"
                          />
                        </TableCell>
                        <TableCell>
                          <GUTSelector
                            value={chamado.urgencia}
                            onChange={(value) => updateGUT({ id: chamado.id, urgencia: value })}
                            disabled={!canEditGUT(chamado.area_demandante, chamado)}
                            label="urgencia"
                          />
                        </TableCell>
                        <TableCell>
                          <GUTSelector
                            value={chamado.tendencia}
                            onChange={(value) => updateGUT({ id: chamado.id, tendencia: value })}
                            disabled={!canEditGUT(chamado.area_demandante, chamado)}
                            label="tendencia"
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          {isGutComplete(chamado) ? (
                            <span className="inline-flex items-center justify-center w-10 h-7 rounded bg-primary/10 text-primary font-bold text-sm">
                              {chamado.pontuacao_gut}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </TableCell>
                      </>
                    ) : (
                      <TableCell colSpan={4} className="text-center text-muted-foreground text-sm">
                        -
                      </TableCell>
                    )}
                    {isAdminOrTI && (
                      <>
                        <TableCell className="text-center text-sm text-muted-foreground">
                          {getTempoAberto(chamado.data_abertura)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            {/* Status principal */}
                            <div className="flex flex-wrap items-center gap-1">
                              {/* Check if concluded first - takes priority over sprint info */}
                              {chamado.data_conclusao ? (
                                <StatusBadge status="Concluído" />
                              ) : chamado.status === 'Em mapeamento com Escritório de Processos' ? (
                                <StatusBadge status="Escritório de Processos" />
                              ) : chamado.sprint_id ? (
                                <>
                                  <StatusBadge status="Priorizado" sprintName={getSprintInfo(chamado.sprint_id)?.nome} />
                                  {(chamado.grupo_atribuicao || '').toLowerCase().includes('prc - processos e melhoria') && (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-500/15 text-violet-600 dark:text-violet-400" title="Chamado em mapeamento com Escritório de Processos enquanto priorizado">
                                      <Building2 className="h-3 w-3" />
                                      Escritório de Processos Prioridade
                                    </span>
                                  )}
                                  {isPendenciaSolicitante(chamado) && (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold status-pendencia-solicitante" title="Aguardando resposta do solicitante">
                                      <Clock className="h-3 w-3" />
                                      Pendência Solicitante
                                    </span>
                                  )}
                                  {isOverdue(chamado) && (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-destructive/15 text-destructive" title="Chamado atrasado">
                                      <AlertTriangle className="h-3 w-3" />
                                      Atrasado
                                    </span>
                                  )}
                                </>
                              ) : dynamicStatus === 'Concluído' ? (
                                <StatusBadge status="Concluído" />
                              ) : (
                                <>
                                  <StatusBadge status={dynamicStatus} />
                                  {isPendenciaSolicitante(chamado) && (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold status-pendencia-solicitante" title="Aguardando resposta do solicitante">
                                      <Clock className="h-3 w-3" />
                                      Pendência Solicitante
                                    </span>
                                  )}
                                </>
                              )}
                              
                              {/* Badges adicionais */}
                              {(chamado as any).aguardando_cliente && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-warning/15 text-warning">
                                  <UserX className="h-3 w-3" />
                                  Aguardando Cliente
                                </span>
                              )}
                              {((chamado as any).contagem_reabertura ?? 0) > 0 && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400">
                                  <RefreshCcw className="h-3 w-3" />
                                  Reabertura ({(chamado as any).contagem_reabertura})
                                </span>
                              )}
                              {(chamado as any).spec_ativo && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-500/15 text-sky-600 dark:text-sky-400" title="Chamado em Spec">
                                  <FileSearch className="h-3 w-3" />
                                  Spec {getSpecDays(chamado) ?? 0} dias úteis
                                </span>
                              )}
                            </div>
                            
                            {/* Data de conclusão ou previsão */}
                            {chamado.data_conclusao && (
                              <span className="text-xs text-muted-foreground">
                                Concluído em: {format(parseISO(chamado.data_conclusao), "dd/MM/yyyy", { locale: ptBR })}
                              </span>
                            )}
                            {!chamado.data_conclusao && chamado.sprint_id && getSprintInfo(chamado.sprint_id)?.data_fim && (
                              <span className={`text-xs ${isOverdue(chamado) ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                                Previsão: {format(parseISO(getSprintInfo(chamado.sprint_id)!.data_fim!), "dd/MM/yyyy", { locale: ptBR })}
                              </span>
                            )}
                          </div>
                        </TableCell>
                      </>
                    )}
                    {!isAdminOrTI && (
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <div className="flex flex-wrap items-center gap-1">
                            {clientStatus ? (
                              clientStatus.isEscritorioProcessos ? (
                                <StatusBadge status="Escritório de Processos" />
                              ) : (
                                <>
                                  <StatusBadge status={clientStatus.concluded ? 'Concluído' : 'Priorizado'} sprintName={!clientStatus.concluded ? clientStatus.label : undefined} />
                                  {!clientStatus.concluded && (chamado.grupo_atribuicao || '').toLowerCase().includes('prc - processos e melhoria') && (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-500/15 text-violet-600 dark:text-violet-400" title="Chamado em mapeamento com Escritório de Processos enquanto priorizado">
                                      <Building2 className="h-3 w-3" />
                                      Escritório de Processos Prioridade
                                    </span>
                                  )}
                                  {!clientStatus.concluded && isPendenciaSolicitante(chamado) && (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold status-pendencia-solicitante" title="Aguardando resposta do solicitante">
                                      <Clock className="h-3 w-3" />
                                      Pendência Solicitante
                                    </span>
                                  )}
                                  {clientStatus.overdue && (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-destructive/15 text-destructive" title="Chamado atrasado">
                                      <AlertTriangle className="h-3 w-3" />
                                      Atrasado
                                    </span>
                                  )}
                                </>
                              )
                            ) : (
                              <>
                                <StatusBadge status={dynamicStatus} />
                                {isPendenciaSolicitante(chamado) && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold status-pendencia-solicitante" title="Aguardando resposta do solicitante">
                                    <Clock className="h-3 w-3" />
                                    Pendência Solicitante
                                  </span>
                                )}
                              </>
                            )}
                            
                            {/* Badges adicionais */}
                            {(chamado as any).aguardando_cliente && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-warning/15 text-warning">
                                <UserX className="h-3 w-3" />
                                Aguardando Cliente
                              </span>
                            )}
                            {((chamado as any).contagem_reabertura ?? 0) > 0 && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400">
                                <RefreshCcw className="h-3 w-3" />
                                Reabertura ({(chamado as any).contagem_reabertura})
                              </span>
                            )}
                            {(chamado as any).spec_ativo && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-500/15 text-sky-600 dark:text-sky-400" title="Chamado em Spec">
                                <FileSearch className="h-3 w-3" />
                                Spec {getSpecDays(chamado) ?? 0} dias úteis
                              </span>
                            )}
                          </div>
                          
                          {/* Data de conclusão ou previsão */}
                          {clientStatus?.concluded && clientStatus.dataConclusao && (
                            <span className="text-xs text-muted-foreground">
                              Concluído em: {format(parseISO(clientStatus.dataConclusao), "dd/MM/yyyy", { locale: ptBR })}
                            </span>
                          )}
                          {!clientStatus?.concluded && clientStatus?.dataFim && (
                            <span className={`text-xs ${clientStatus.overdue ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                              Previsão: {format(parseISO(clientStatus.dataFim), "dd/MM/yyyy", { locale: ptBR })}
                            </span>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
              {filteredChamados.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isAdminOrTI ? 10 : 9} className="h-32 text-center text-muted-foreground">
                    Nenhum chamado encontrado
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>
    </div>
  );
}
