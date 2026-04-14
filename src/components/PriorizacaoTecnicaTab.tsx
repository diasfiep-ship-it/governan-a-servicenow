import { useEffect, useMemo, useState } from 'react';
import { useChamados } from '@/hooks/useChamados';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import StatusBadge from './StatusBadge';
import ChatPriorizacao from './ChatPriorizacao';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Textarea } from '@/components/ui/textarea';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Search, Filter, Loader2, Zap, Clock, CheckCircle2, XCircle, Edit2, HelpCircle, Plus, ArrowUpDown, ArrowUp, ArrowDown, Sparkles, AlertTriangle, FileText, Upload, RotateCcw, FileSearch } from 'lucide-react';
import { differenceInDays, parseISO, format, isAfter } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { calculateChamadoStatus, isQuickWin, isGutComplete, Chamado, isEscritorioProcessos, shouldShowInAguardGutFilter, calculateBusinessDays } from '@/types';

// Sort direction type
type SortDirection = 'asc' | 'desc' | null;
type SortField = 'numero' | 'area' | 'cliente' | 'gut' | 'esforco' | 'tempo' | 'prioridade' | null;

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

// Helper to format area name with only the first letter of first word uppercase
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

// Fetch active areas from database
const useAvailableAreas = () => {
  return useQuery({
    queryKey: ['areas-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('areas')
        .select('nome')
        .eq('ativo', true)
        .order('nome');
      if (error) throw error;
      return data.map(a => a.nome);
    },
  });
};

type StatusFilter = 'todos' | 'aguard_gut' | 'aguard_esforco' | 'aguardando' | 'concluido' | 'novos';
type SprintOption = 'new' | string;

export default function PriorizacaoTecnicaTab() {
  const { 
    chamados, 
    isLoading, 
    updateEsforco, 
    updateArea,
    toggleSelecionado, 
    priorizar, 
    limparSelecao,
    isLimpandoSelecao,
    isPriorizando, 
    subscribeToChanges, 
    isAdmin, 
    isTI,
    isEscritorio,
    enviarEscritorioProcessos,
    retornarDoEscritorioProcessos,
    cancelarChamado,
    isCancelando,
    toggleSpec
  } = useChamados();
  const { roles } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [areaFilter, setAreaFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [editingAreaId, setEditingAreaId] = useState<string | null>(null);
  const [selectedSprintOption, setSelectedSprintOption] = useState<SprintOption>('new');
  const [viewSprintCapacity, setViewSprintCapacity] = useState<string | null>(null);
  
  // Cancel dialog state
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelingChamadoId, setCancelingChamadoId] = useState<string | null>(null);
  const [cancelMotivo, setCancelMotivo] = useState('');
  const [cancelEvidencia, setCancelEvidencia] = useState<File | null>(null);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  
  // Sorting state (ADM only) - default is prioridade descending
  const [sortField, setSortField] = useState<SortField>('prioridade');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  
  // Check if user can edit GUT and Esforço (Escritório de Processos cannot)
  const isEscritorioUser = roles.some(r => isEscritorioProcessos(r));
  const canEditGutEsforco = isAdmin || isTI; // Escritório cannot edit

  // Fetch available areas from database
  const { data: availableAreas = [] } = useAvailableAreas();

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
      // Only show non-prioritized chamados (not in a sprint)
      const notPrioritized = !chamado.sprint_id;
      
      const dynamicStatus = calculateChamadoStatus(chamado);
      switch (statusFilter) {
        case 'aguard_gut':
          return shouldShowInAguardGutFilter(chamado) && notPrioritized;
        case 'aguard_esforco':
          return dynamicStatus === 'Aguard. Esforço' && notPrioritized;
        case 'aguardando':
          return !['Aguard. GUT', 'Aguard. Esforço', 'Concluído'].includes(dynamicStatus) && notPrioritized;
        case 'concluido':
          return dynamicStatus === 'Concluído' && notPrioritized;
        case 'novos':
          // Novos = chamados without assigned area_demandante (empty or null) AND not modified by admin
          return (!chamado.area_demandante || chamado.area_demandante.trim() === '') && 
                 !(chamado as any).area_modificada_por_admin && notPrioritized;
        case 'todos':
        default:
          return notPrioritized;
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
      // Toggle direction or reset
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
        const matchesSearch = 
          chamado.numero.toLowerCase().includes(searchTerm.toLowerCase()) ||
          chamado.descricao?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          chamado.cliente?.toLowerCase().includes(searchTerm.toLowerCase());
        
        // Normalize area filter comparison
        const matchesArea = areaFilter === 'all' || 
          normalizeAreaName(chamado.area_demandante) === normalizeAreaName(areaFilter);
        
        // Only show non-prioritized chamados (not in a sprint)
        const notPrioritized = !chamado.sprint_id;
        
        // Status filter logic
        const dynamicStatus = calculateChamadoStatus(chamado);
        let matchesStatusFilter = true;
        switch (statusFilter) {
          case 'aguard_gut':
            matchesStatusFilter = shouldShowInAguardGutFilter(chamado);
            break;
          case 'aguard_esforco':
            matchesStatusFilter = dynamicStatus === 'Aguard. Esforço';
            break;
          case 'aguardando':
            matchesStatusFilter = !['Aguard. GUT', 'Aguard. Esforço', 'Concluído'].includes(dynamicStatus) && !chamado.sprint_id;
            break;
          case 'concluido':
            matchesStatusFilter = dynamicStatus === 'Concluído';
            break;
          case 'novos':
            // Novos = chamados without assigned area_demandante (empty or null) AND not modified by admin
            matchesStatusFilter = (!chamado.area_demandante || chamado.area_demandante.trim() === '') && 
                                  !(chamado as any).area_modificada_por_admin;
            break;
          case 'todos':
          default:
            matchesStatusFilter = true;
        }
        
        return matchesSearch && matchesArea && notPrioritized && matchesStatusFilter;
      });

    // Sort based on current sort field and direction
    return filtered.sort((a, b) => {
      let comparison = 0;
      
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
        case 'esforco':
          comparison = (a.esforco || 0) - (b.esforco || 0);
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
  }, [chamados, searchTerm, areaFilter, statusFilter, sortField, sortDirection]);

  // Get selected chamados and calculate total hours
  const selectedChamados = filteredChamados.filter(c => c.selecionado_mes);
  const selectedCount = selectedChamados.length;
  const totalHours = selectedChamados.reduce((sum, c) => sum + (c.esforco || 0), 0);
  
  // Get sprint capacity info for selected sprint
  const getSprintCapacityInfo = () => {
    if (!viewSprintCapacity) return null;
    const sprint = sprints.find(s => s.id === viewSprintCapacity);
    if (!sprint) return null;
    
    // Calculate hours already committed to this sprint (from other chamados not in the current selection)
    const chamadosInSprint = chamados.filter(c => c.sprint_id === sprint.id && !c.data_conclusao);
    const horasComprometidas = chamadosInSprint.reduce((sum, c) => sum + (c.esforco || 0), 0);
    
    return {
      nome: sprint.nome,
      capacidade: sprint.horas_totais || 60,
      comprometidas: horasComprometidas,
      disponiveis: (sprint.horas_totais || 60) - horasComprometidas,
      disponiveisComSelecao: (sprint.horas_totais || 60) - horasComprometidas - totalHours
    };
  };
  
  const sprintCapacity = getSprintCapacityInfo();
  // For new sprint, no capacity limit - unlimited hours allowed
  const maxHours = sprintCapacity ? sprintCapacity.capacidade : Infinity;
  const hoursRemaining = sprintCapacity 
    ? sprintCapacity.disponiveisComSelecao 
    : Infinity; // New sprint has no limit

  // Calculate time open and get age category for highlighting
  const getTempoAbertoInfo = (dataAbertura: string | null): { display: string; days: number } => {
    if (!dataAbertura) return { display: '-', days: 0 };
    try {
      const days = differenceInDays(new Date(), parseISO(dataAbertura));
      return { display: `${days}d`, days };
    } catch {
      return { display: '-', days: 0 };
    }
  };

  // Get row highlight class based on age
  const getAgeHighlightClass = (days: number): string => {
    if (days >= 90) return 'bg-destructive/5'; // 3+ months - light red
    if (days >= 60) return 'bg-warning/5'; // 2+ months - light orange
    if (days >= 30) return 'bg-amber-500/5'; // 1+ month - light amber
    return '';
  };

  // Handle esforco change with debounce
  const handleEsforcoChange = (id: string, value: string) => {
    if (value === '' || value.trim() === '') {
      updateEsforco({ id, esforco: null });
      return;
    }
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue >= 0) {
      updateEsforco({ id, esforco: numValue });
    }
  };

  // Handle area change
  const handleAreaChange = (id: string, newArea: string) => {
    updateArea({ id, area_demandante: newArea });
    setEditingAreaId(null);
  };

  // Can edit esforco? (Escritório de Processos cannot)
  const canEditEsforco = canEditGutEsforco;

  // Can edit area?
  const canEditArea = isAdmin;

  // Can priorizar?
  const canPriorizar = isAdmin;
  
  // Can send to Escritório de Processos? (ADM, TI, Escritório)
  const canSendToEscritorio = isAdmin || isTI || isEscritorio || isEscritorioUser;
  
  // Can cancel chamados? (ADM only)
  const canCancelChamado = isAdmin;

  // Handle cancel chamado
  const handleCancelChamado = async () => {
    if (!cancelingChamadoId || !cancelMotivo.trim()) return;
    
    let evidenciaUrl: string | null = null;
    
    if (cancelEvidencia) {
      setUploadingEvidence(true);
      try {
        const fileExt = cancelEvidencia.name.split('.').pop();
        const fileName = `${cancelingChamadoId}-${Date.now()}.${fileExt}`;
        
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('evidencias-cancelamento')
          .upload(fileName, cancelEvidencia);
        
        if (uploadError) throw uploadError;
        
        const { data: urlData } = supabase.storage
          .from('evidencias-cancelamento')
          .getPublicUrl(fileName);
        
        evidenciaUrl = urlData.publicUrl;
      } catch (error) {
        console.error('Error uploading evidence:', error);
      } finally {
        setUploadingEvidence(false);
      }
    }
    
    cancelarChamado({ 
      id: cancelingChamadoId, 
      motivo: cancelMotivo.trim(),
      evidenciaUrl 
    });
    
    setShowCancelDialog(false);
    setCancelingChamadoId(null);
    setCancelMotivo('');
    setCancelEvidencia(null);
  };
  
  // Check if chamado is in Escritório de Processos
  const isInEscritorioProcessos = (chamado: Chamado) => {
    return chamado.status === 'Em mapeamento com Escritório de Processos';
  };

  // Get Spec days display for a chamado
  const getSpecDays = (chamado: Chamado): number | null => {
    const c = chamado as any;
    if (!c.spec_ativo) return null;
    const acumulados = c.spec_dias_acumulados || 0;
    const diasAtuais = c.spec_inicio ? calculateBusinessDays(new Date(c.spec_inicio), new Date()) : 0;
    return acumulados + diasAtuais;
  };

  // Get sprint info for a chamado
  const getSprintInfo = (sprintId: string | null) => {
    if (!sprintId) return null;
    return sprints.find(s => s.id === sprintId);
  };

  // Check if chamado is overdue (sprint end date passed and not concluded)
  const isOverdue = (chamado: Chamado) => {
    if (!chamado.sprint_id) return false;
    if (chamado.data_conclusao) return false; // Already concluded
    const sprint = getSprintInfo(chamado.sprint_id);
    if (!sprint?.data_fim) return false;
    return isAfter(new Date(), parseISO(sprint.data_fim));
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
      {/* Status Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <Button
          variant={statusFilter === 'todos' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setStatusFilter('todos')}
        >
          Todos
        </Button>
        <Button
          variant={statusFilter === 'aguard_gut' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setStatusFilter('aguard_gut')}
        >
          Aguard. GUT
        </Button>
        <Button
          variant={statusFilter === 'aguard_esforco' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setStatusFilter('aguard_esforco')}
        >
          Aguard. Esforço
        </Button>
        <Button
          variant={statusFilter === 'aguardando' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setStatusFilter('aguardando')}
        >
          Aguardando Priorização
        </Button>
        <Button
          variant={statusFilter === 'concluido' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setStatusFilter('concluido')}
        >
          Concluído
        </Button>
        {isAdmin && (
          <Button
            variant={statusFilter === 'novos' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('novos')}
          >
            Novos
          </Button>
        )}
      </div>

      {/* Filters and Actions */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-3 flex-1 w-full">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por número, descrição ou solicitado para..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
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
        </div>

        {canPriorizar && (
          <div className="flex gap-2 w-full sm:w-auto">
            {selectedCount > 0 && (
              <Button 
                variant="outline"
                onClick={() => limparSelecao()}
                disabled={isLimpandoSelecao}
                className="w-full sm:w-auto"
              >
                {isLimpandoSelecao ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="mr-2 h-4 w-4" />
                )}
                Limpar Seleção
              </Button>
            )}
            <Button 
              onClick={() => setShowConfirmDialog(true)}
              disabled={selectedCount === 0 || isPriorizando || totalHours > maxHours}
              className="w-full sm:w-auto"
            >
              {isPriorizando ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Priorizando...
                </>
              ) : (
                <>
                  <Zap className="mr-2 h-4 w-4" />
                  PRIORIZAR ({selectedCount})
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Hours counter card */}
      {canPriorizar && (
        <Card className={`${hoursRemaining < 0 ? 'border-destructive bg-destructive/5' : 'border-primary/20 bg-primary/5'}`}>
          <CardContent className="py-3 px-4">
            <div className="flex flex-wrap items-center gap-4">
              {/* Sprint selector for capacity view */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Ver capacidade:</span>
                <Select value={viewSprintCapacity || 'new'} onValueChange={(val) => setViewSprintCapacity(val === 'new' ? null : val)}>
                  <SelectTrigger className="w-48 h-8">
                    <SelectValue placeholder="Selecionar Sprint" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">Nova Sprint</SelectItem>
                    {sprints.filter(s => s.status !== 'concluida').map(sprint => (
                      <SelectItem key={sprint.id} value={sprint.id}>
                        {sprint.nome} ({sprint.horas_totais || 60}h)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Sprint capacity info */}
              {sprintCapacity ? (
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Comprometidas:</span>
                    <span className="font-bold text-primary">{sprintCapacity.comprometidas.toFixed(1)}h</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Disponível:</span>
                    <span className={`font-bold ${sprintCapacity.disponiveis < 0 ? 'text-destructive' : 'text-success'}`}>
                      {sprintCapacity.disponiveis.toFixed(1)}h
                    </span>
                  </div>
                </div>
              ) : null}
              
              {/* Selection hours */}
              <div className="flex items-center gap-2 border-l pl-4">
                <span className="text-sm font-medium">Selecionado:</span>
                <span className={`text-lg font-bold ${hoursRemaining < 0 ? 'text-destructive' : 'text-primary'}`}>
                  {totalHours.toFixed(1)}h
                </span>
              </div>
              
              {/* Remaining after selection - only show for existing sprints */}
              {sprintCapacity && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Após seleção:</span>
                  <span className={`font-bold ${hoursRemaining < 0 ? 'text-destructive' : 'text-success'}`}>
                    {hoursRemaining.toFixed(1)}h
                  </span>
                </div>
              )}
              
              {hoursRemaining < 0 && sprintCapacity && (
                <span className="text-sm text-destructive font-medium">
                  Limite excedido em {Math.abs(hoursRemaining).toFixed(1)}h
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results count */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {filteredChamados.length} chamado{filteredChamados.length !== 1 ? 's' : ''} pendente{filteredChamados.length !== 1 ? 's' : ''}
        </span>
        {selectedCount > 0 && (
          <span className="text-primary font-medium">
            {selectedCount} selecionado{selectedCount !== 1 ? 's' : ''} para sprint
          </span>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden w-full">
        <ScrollArea className="h-[calc(100vh-420px)]">
          <Table className="table-corporate w-full min-w-[900px]">
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
                <TableHead 
                  className={`text-table-header-foreground text-center ${isAdmin ? 'cursor-pointer hover:bg-muted/50' : ''}`}
                  onClick={() => handleSort('gut')}
                >
                  <div className="flex items-center justify-center">
                    GUT
                    {isAdmin && getSortIcon('gut')}
                  </div>
                </TableHead>
                <TableHead 
                  className={`text-table-header-foreground text-center ${isAdmin ? 'cursor-pointer hover:bg-muted/50' : ''}`}
                  onClick={() => handleSort('esforco')}
                >
                  <div className="flex items-center justify-center">
                    Esforço
                    {isAdmin && getSortIcon('esforco')}
                  </div>
                </TableHead>
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
                {(canSendToEscritorio || canCancelChamado) && (
                  <TableHead className="text-table-header-foreground text-center">Ações</TableHead>
                )}
                {canPriorizar && (
                  <TableHead 
                    className="text-table-header-foreground text-center cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort('prioridade')}
                  >
                    <div className="flex items-center justify-center">
                      Sel.
                      {getSortIcon('prioridade')}
                    </div>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredChamados.map((chamado) => {
                const dynamicStatus = calculateChamadoStatus(chamado);
                const isQuickWinChamado = isQuickWin(chamado);
                const tempoInfo = getTempoAbertoInfo(chamado.data_abertura);
                const ageHighlightClass = getAgeHighlightClass(tempoInfo.days);
                
                // Combine classes: always apply age highlight, then add selection highlight on top
                const rowClasses = [
                  ageHighlightClass,
                  chamado.selecionado_mes ? 'ring-2 ring-primary ring-inset' : ''
                ].filter(Boolean).join(' ');
                
                return (
                  <TableRow 
                    key={chamado.id} 
                    className={rowClasses}
                  >
                    <TableCell className="text-sm font-medium">
                      <div className="flex items-center gap-2">
                        {chamado.numero}
                        {isQuickWinChamado && (
                          <span className="quickwin-badge" title="Quick Win - Alta prioridade, baixo esforço">
                            <Zap className="h-3 w-3" />
                            QW
                          </span>
                        )}
                        {/* Badge "Novo" for ADM - shows when area_demandante is empty and not modified by admin */}
                        {isAdmin && (!chamado.area_demandante || chamado.area_demandante.trim() === '') && !(chamado as any).area_modificada_por_admin && (
                          <span 
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                            title="Chamado novo - área não definida"
                          >
                            <Sparkles className="h-2.5 w-2.5" />
                            Novo
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {editingAreaId === chamado.id && canEditArea ? (
                        <Select
                          value={chamado.area_demandante}
                          onValueChange={(value) => handleAreaChange(chamado.id, value)}
                        >
                          <SelectTrigger className="w-[200px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {availableAreas.map(area => (
                              <SelectItem key={area} value={area}>{formatAreaName(area)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <div className="flex items-center gap-1">
                          <span className="truncate block max-w-[150px]" title={chamado.area_demandante}>
                            {formatAreaName(chamado.area_demandante)}
                          </span>
                          {canEditArea && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() => setEditingAreaId(chamado.id)}
                            >
                              <Edit2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      )}
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
                    <TableCell className="text-center">
                      {isGutComplete(chamado) ? (
                        <span className="inline-flex items-center justify-center w-10 h-7 rounded bg-primary/10 text-primary font-bold text-sm">
                          {chamado.pontuacao_gut}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {canEditEsforco ? (
                        <Input
                          type="number"
                          min="0"
                          step="0.5"
                          defaultValue={chamado.esforco !== null && chamado.esforco !== 1 && chamado.esforco > 0 ? chamado.esforco : ''}
                          placeholder="-"
                          onBlur={(e) => handleEsforcoChange(chamado.id, e.target.value)}
                          className="w-16 text-center mx-auto h-7 text-sm"
                        />
                      ) : (
                        <span className="text-sm">
                          {chamado.esforco !== null && chamado.esforco !== 1 && chamado.esforco > 0 ? `${chamado.esforco}h` : '-'}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-center text-sm text-muted-foreground">
                      {tempoInfo.display}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        {chamado.data_conclusao ? (
                          <div className="flex flex-col gap-1">
                            <StatusBadge status="Concluído" />
                            <span className="text-xs text-muted-foreground">
                              Concluído em: {format(parseISO(chamado.data_conclusao), "dd/MM/yyyy", { locale: ptBR })}
                            </span>
                          </div>
                        ) : (
                          <StatusBadge status={dynamicStatus} />
                        )}
                        {(chamado as any).spec_ativo && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-500/15 text-sky-600 dark:text-sky-400" title="Chamado em Spec">
                            <FileSearch className="h-3 w-3" />
                            Spec {getSpecDays(chamado) ?? 0} dias úteis
                          </span>
                        )}
                      </div>
                    </TableCell>
                    {/* Actions column */}
                    {(canSendToEscritorio || canCancelChamado) && (
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          {/* Escritório de Processos button */}
                          {canSendToEscritorio && !isInEscritorioProcessos(chamado) && !chamado.sprint_id && !chamado.data_conclusao && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-2 text-xs"
                                    onClick={() => enviarEscritorioProcessos({ id: chamado.id })}
                                  >
                                    <FileText className="h-3 w-3 mr-1" />
                                    Esc. Proc.
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  Enviar para Escritório de Processos
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          
                          {/* Return from Escritório de Processos button */}
                          {isInEscritorioProcessos(chamado) && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-2 text-xs bg-amber-50 hover:bg-amber-100 border-amber-200 dark:bg-amber-900/20 dark:hover:bg-amber-900/30 dark:border-amber-800"
                                    onClick={() => retornarDoEscritorioProcessos({ id: chamado.id })}
                                  >
                                    <RotateCcw className="h-3 w-3 mr-1" />
                                    Retornar
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  Retornar ao status anterior
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          
                          {/* Spec button */}
                          {!chamado.data_conclusao && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className={`h-7 px-2 text-xs ${(chamado as any).spec_ativo ? 'bg-sky-50 hover:bg-sky-100 border-sky-200 text-sky-700 dark:bg-sky-900/20 dark:hover:bg-sky-900/30 dark:border-sky-800 dark:text-sky-400' : ''}`}
                                    onClick={() => toggleSpec({ id: chamado.id })}
                                  >
                                    <FileSearch className="h-3 w-3 mr-1" />
                                    Spec
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {(chamado as any).spec_ativo ? 'Desativar Spec' : 'Ativar Spec'}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          
                          {canCancelChamado && !chamado.data_conclusao && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                                    onClick={() => {
                                      setCancelingChamadoId(chamado.id);
                                      setShowCancelDialog(true);
                                    }}
                                  >
                                    <XCircle className="h-3 w-3" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  Cancelar chamado
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      </TableCell>
                    )}
                    {canPriorizar && (
                      <TableCell className="text-center">
                        <button
                          onClick={() => toggleSelecionado({ id: chamado.id, selecionado: !chamado.selecionado_mes })}
                          className={`selection-circle ${chamado.selecionado_mes ? 'selected' : ''}`}
                          title={chamado.selecionado_mes ? 'Remover da seleção' : 'Adicionar à seleção'}
                        >
                          {chamado.selecionado_mes && <CheckCircle2 className="h-4 w-4 text-white" />}
                        </button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
              {filteredChamados.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canPriorizar ? (canSendToEscritorio || canCancelChamado ? 10 : 9) : (canSendToEscritorio || canCancelChamado ? 9 : 8)} className="h-32 text-center text-muted-foreground">
                    Nenhum chamado pendente encontrado
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>

      {/* Confirm Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={(open) => {
        setShowConfirmDialog(open);
        if (!open) setSelectedSprintOption('new');
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Priorizar Chamados</DialogTitle>
            <DialogDescription>
              Selecione onde deseja adicionar os <strong>{selectedCount}</strong> chamado{selectedCount !== 1 ? 's' : ''} selecionado{selectedCount !== 1 ? 's' : ''}.
              <br /><br />
              <strong>Total de horas:</strong> {totalHours.toFixed(1)}h
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <RadioGroup value={selectedSprintOption} onValueChange={(value) => setSelectedSprintOption(value as SprintOption)}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="new" id="new-sprint" />
                <Label htmlFor="new-sprint" className="flex items-center gap-2 cursor-pointer">
                  <Plus className="h-4 w-4" />
                  Criar nova Sprint
                </Label>
              </div>
              
              {sprints.filter(s => s.status !== 'concluida').length > 0 && (
                <div className="space-y-2 mt-3">
                  <span className="text-sm text-muted-foreground">Ou adicionar a uma Sprint existente:</span>
                  {sprints.filter(s => s.status !== 'concluida').map(sprint => (
                    <div key={sprint.id} className="flex items-center space-x-2">
                      <RadioGroupItem value={sprint.id} id={`sprint-${sprint.id}`} />
                      <Label htmlFor={`sprint-${sprint.id}`} className="cursor-pointer text-sm">
                        {sprint.nome} ({sprint.horas_totais}h - {sprint.status === 'em_andamento' ? 'Em andamento' : 'Planejada'})
                      </Label>
                    </div>
                  ))}
                </div>
              )}
            </RadioGroup>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={() => {
              if (selectedSprintOption === 'new') {
                priorizar({});
              } else {
                priorizar({ sprintId: selectedSprintOption });
              }
              setShowConfirmDialog(false);
              setSelectedSprintOption('new');
            }} disabled={isPriorizando}>
              {isPriorizando ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Priorizando...
                </>
              ) : (
                selectedSprintOption === 'new' ? 'Criar Sprint' : 'Adicionar à Sprint'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Chamado Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={(open) => {
        setShowCancelDialog(open);
        if (!open) {
          setCancelingChamadoId(null);
          setCancelMotivo('');
          setCancelEvidencia(null);
        }
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Cancelar Chamado</DialogTitle>
            <DialogDescription>
              Informe o motivo do cancelamento. Uma evidência pode ser anexada opcionalmente.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="motivo">Justificativa *</Label>
              <Textarea
                id="motivo"
                placeholder="Descreva o motivo do cancelamento..."
                value={cancelMotivo}
                onChange={(e) => setCancelMotivo(e.target.value)}
                className="min-h-[100px]"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="evidencia">Evidência (opcional)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="evidencia"
                  type="file"
                  accept="image/*"
                  onChange={(e) => setCancelEvidencia(e.target.files?.[0] || null)}
                  className="flex-1"
                />
                {cancelEvidencia && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCancelEvidencia(null)}
                  >
                    <XCircle className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {cancelEvidencia && (
                <p className="text-sm text-muted-foreground">
                  Arquivo selecionado: {cancelEvidencia.name}
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancelDialog(false)}>
              Voltar
            </Button>
            <Button 
              variant="destructive"
              onClick={handleCancelChamado}
              disabled={!cancelMotivo.trim() || isCancelando || uploadingEvidence}
            >
              {(isCancelando || uploadingEvidence) ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {uploadingEvidence ? 'Enviando...' : 'Cancelando...'}
                </>
              ) : (
                <>
                  <XCircle className="mr-2 h-4 w-4" />
                  Confirmar Cancelamento
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Chat Assistant */}
      <ChatPriorizacao chamados={chamados} isAdmin={isAdmin} />
    </div>
  );
}
