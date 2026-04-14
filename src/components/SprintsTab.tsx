import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Loader2, Calendar, Clock, Edit2, Check, X, Trash2, CheckCircle, CalendarIcon, AlertTriangle, Search, Undo2, RefreshCcw, UserX, Building2, Ban, CircleDashed } from 'lucide-react';
import { format, parseISO, isAfter } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Sprint {
  id: string;
  numero: number;
  nome: string;
  data_inicio: string | null;
  data_fim: string | null;
  status: 'planejada' | 'em_andamento' | 'concluida';
  horas_totais: number;
  created_at: string;
  updated_at: string;
}

interface SprintChamado {
  id: string;
  numero: string;
  descricao: string | null;
  area_demandante: string;
  esforco: number;
  pontuacao_gut: number;
  data_conclusao: string | null;
  contagem_reabertura: number | null;
  aguardando_cliente: boolean | null;
  cancelado: boolean | null;
  grupo_atribuicao: string | null;
  estado: string | null;
  motivo_pendencia: string | null;
}

export default function SprintsTab() {
  const queryClient = useQueryClient();
  const { roles } = useAuth();
  const [selectedSprintId, setSelectedSprintId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Check user roles
  const isAdmin = roles.some(r => r === 'ADM' || r === 'ADM_TI');
  const [editingSprintId, setEditingSprintId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ nome: string; status: string; data_inicio: string; data_fim: string; horas_totais: number }>({ nome: '', status: '', data_inicio: '', data_fim: '', horas_totais: 60 });
  const [deleteSprintDialogOpen, setDeleteSprintDialogOpen] = useState(false);
  const [sprintToDelete, setSprintToDelete] = useState<Sprint | null>(null);
  
  // State for conclusion dialog
  const [concludeDialogOpen, setConcludeDialogOpen] = useState(false);
  const [chamadoToConclude, setChamadoToConclude] = useState<SprintChamado | null>(null);
  const [conclusionDate, setConclusionDate] = useState<Date | undefined>(new Date());

  // Only ADM can edit/delete sprints, conclude/remove chamados
  const canEditSprints = isAdmin;
  const canManageChamados = isAdmin; // TI and Escritório cannot conclude/remove chamados

  // Fetch sprints
  const { data: sprints = [], isLoading: loadingSprints } = useQuery({
    queryKey: ['sprints'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sprints')
        .select('*')
        .order('numero', { ascending: false });
      
      if (error) throw error;
      return data as Sprint[];
    },
  });

  // Fetch chamados for selected sprint (including concluded ones)
  const { data: sprintChamados = [], isLoading: loadingChamados } = useQuery({
    queryKey: ['sprint-chamados', selectedSprintId],
    queryFn: async () => {
      if (!selectedSprintId) return [];
      
      let query = supabase
        .from('chamados')
        .select('id, numero, descricao, area_demandante, esforco, pontuacao_gut, data_conclusao, contagem_reabertura, aguardando_cliente, cancelado, grupo_atribuicao, estado, motivo_pendencia, sprint_id')
        .order('pontuacao_gut', { ascending: false });

      if (selectedSprintId === '__all__') {
        query = query.not('sprint_id', 'is', null);
      } else {
        query = query.eq('sprint_id', selectedSprintId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as (SprintChamado & { sprint_id: string | null })[];
    },
    enabled: !!selectedSprintId,
  });

  // Auto-select first sprint
  useEffect(() => {
    if (sprints.length > 0 && !selectedSprintId) {
      setSelectedSprintId(sprints[0].id);
    }
  }, [sprints, selectedSprintId]);

  // Update sprint mutation
  const updateSprint = useMutation({
    mutationFn: async ({ id, nome, status, data_inicio, data_fim, horas_totais }: { id: string; nome: string; status: string; data_inicio?: string; data_fim?: string; horas_totais?: number }) => {
      const updates: Record<string, unknown> = { nome, status };
      if (data_inicio) {
        updates.data_inicio = data_inicio;
      }
      if (data_fim) {
        updates.data_fim = data_fim;
      }
      if (horas_totais !== undefined) {
        updates.horas_totais = horas_totais;
      }
      
      const { error } = await supabase
        .from('sprints')
        .update(updates)
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sprints'] });
      setEditingSprintId(null);
      toast.success('Sprint atualizada com sucesso');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar sprint: ' + error.message);
    },
  });

  // Delete sprint mutation
  const deleteSprint = useMutation({
    mutationFn: async (sprintId: string) => {
      // First, remove sprint_id from all chamados
      const { error: chamadosError } = await supabase
        .from('chamados')
        .update({ 
          sprint_id: null, 
          status: 'Aberto',
          selecionado_mes: false,
          data_conclusao: null
        })
        .eq('sprint_id', sprintId);
      
      if (chamadosError) throw chamadosError;

      // Then delete the sprint
      const { error } = await supabase
        .from('sprints')
        .delete()
        .eq('id', sprintId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sprints'] });
      queryClient.invalidateQueries({ queryKey: ['chamados'] });
      setDeleteSprintDialogOpen(false);
      setSprintToDelete(null);
      if (sprints.length > 1) {
        const remaining = sprints.filter(s => s.id !== sprintToDelete?.id);
        setSelectedSprintId(remaining[0]?.id || null);
      } else {
        setSelectedSprintId(null);
      }
      toast.success('Sprint excluída com sucesso');
    },
    onError: (error) => {
      toast.error('Erro ao excluir sprint: ' + error.message);
    },
  });

  // Remove chamado from sprint
  const removeChamadoFromSprint = useMutation({
    mutationFn: async (chamadoId: string) => {
      const { error } = await supabase
        .from('chamados')
        .update({ 
          sprint_id: null, 
          status: 'Aberto',
          selecionado_mes: false 
        })
        .eq('id', chamadoId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sprint-chamados'] });
      queryClient.invalidateQueries({ queryKey: ['chamados'] });
      toast.success('Chamado removido da sprint');
    },
    onError: (error) => {
      toast.error('Erro ao remover chamado: ' + error.message);
    },
  });

  // Conclude chamado mutation with custom date
  const concludeChamado = useMutation({
    mutationFn: async ({ chamadoId, conclusionDate }: { chamadoId: string; conclusionDate: Date }) => {
      const { error } = await supabase
        .from('chamados')
        .update({ 
          data_conclusao: conclusionDate.toISOString(),
          status: 'Concluído'
        })
        .eq('id', chamadoId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sprint-chamados'] });
      queryClient.invalidateQueries({ queryKey: ['chamados'] });
      queryClient.invalidateQueries({ queryKey: ['concluded-chamados'] });
      setConcludeDialogOpen(false);
      setChamadoToConclude(null);
      setConclusionDate(new Date());
      toast.success('Chamado concluído com sucesso');
    },
    onError: (error) => {
      toast.error('Erro ao concluir chamado: ' + error.message);
    },
  });

  // Revert chamado conclusion mutation (toggle back to not concluded)
  const revertChamadoConclusion = useMutation({
    mutationFn: async (chamadoId: string) => {
      const { error } = await supabase
        .from('chamados')
        .update({ 
          data_conclusao: null,
          status: 'Priorizado'
        })
        .eq('id', chamadoId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sprint-chamados'] });
      queryClient.invalidateQueries({ queryKey: ['chamados'] });
      queryClient.invalidateQueries({ queryKey: ['concluded-chamados'] });
      toast.success('Conclusão revertida com sucesso');
    },
    onError: (error) => {
      toast.error('Erro ao reverter conclusão: ' + error.message);
    },
  });

  // Open conclude dialog
  const openConcludeDialog = (chamado: SprintChamado) => {
    setChamadoToConclude(chamado);
    setConclusionDate(new Date());
    setConcludeDialogOpen(true);
  };

  // Handle conclude submit
  const handleConcludeSubmit = () => {
    if (chamadoToConclude && conclusionDate) {
      concludeChamado.mutate({ chamadoId: chamadoToConclude.id, conclusionDate });
    }
  };

  const isAllSprints = selectedSprintId === '__all__';
  const selectedSprint = isAllSprints ? null : sprints.find(s => s.id === selectedSprintId);
  // Filter chamados based on search term
  const filteredChamados = useMemo(() => {
    if (!searchTerm.trim()) return sprintChamados;
    const term = searchTerm.toLowerCase();
    return sprintChamados.filter(chamado => 
      chamado.numero.toLowerCase().includes(term) ||
      chamado.descricao?.toLowerCase().includes(term) ||
      chamado.area_demandante.toLowerCase().includes(term)
    );
  }, [sprintChamados, searchTerm]);
  
  // Only count non-concluded chamados for hours
  const cancelledChamados = filteredChamados.filter(c => c.cancelado);
  const activeChamados = filteredChamados.filter(c => !c.cancelado);
  const pendingChamados = activeChamados.filter(c => !c.data_conclusao);
  const concludedChamados = activeChamados.filter(c => c.data_conclusao);
  const naoIniciadosChamados = activeChamados.filter(c => !c.data_conclusao && (c.estado || '').toLowerCase().trim() === 'em aberto');
  const emAndamentoChamados = activeChamados.filter(c => !c.data_conclusao && (c.estado || '').toLowerCase().trim() !== 'em aberto');
  const totalHoras = sprintChamados.filter(c => !c.cancelado).reduce((sum, c) => sum + (c.esforco || 0), 0);
  const horasPendentes = pendingChamados.reduce((sum, c) => sum + (c.esforco || 0), 0);
  const horasNaoIniciados = naoIniciadosChamados.reduce((sum, c) => sum + (c.esforco || 0), 0);
  const horasEmAndamento = emAndamentoChamados.reduce((sum, c) => sum + (c.esforco || 0), 0);
  const horasConcluidos = concludedChamados.reduce((sum, c) => sum + (c.esforco || 0), 0);
  const horasCancelados = cancelledChamados.reduce((sum, c) => sum + (c.esforco || 0), 0);

  const startEditing = (sprint: Sprint) => {
    setEditingSprintId(sprint.id);
    setEditForm({ 
      nome: sprint.nome, 
      status: sprint.status,
      data_inicio: sprint.data_inicio || '',
      data_fim: sprint.data_fim || '',
      horas_totais: sprint.horas_totais || 60
    });
  };

  const cancelEditing = () => {
    setEditingSprintId(null);
    setEditForm({ nome: '', status: '', data_inicio: '', data_fim: '', horas_totais: 60 });
  };

  const saveEditing = () => {
    if (editingSprintId) {
      updateSprint.mutate({ 
        id: editingSprintId, 
        nome: editForm.nome, 
        status: editForm.status,
        data_inicio: editForm.data_inicio || undefined,
        data_fim: editForm.data_fim || undefined,
        horas_totais: editForm.horas_totais
      });
    }
  };

  const openDeleteDialog = (sprint: Sprint) => {
    setSprintToDelete(sprint);
    setDeleteSprintDialogOpen(true);
  };

  const formatAreaName = (area: string): string => {
    return area
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'planejada': return 'Planejada';
      case 'em_andamento': return 'Em Andamento';
      case 'concluida': return 'Concluída';
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'planejada': return 'bg-info/15 text-info border-info/30';
      case 'em_andamento': return 'bg-warning/15 text-warning border-warning/30';
      case 'concluida': return 'bg-success/15 text-success border-success/30';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  if (loadingSprints) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (sprints.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium text-foreground mb-2">Nenhuma Sprint Criada</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          As sprints são criadas automaticamente quando você prioriza chamados na aba "Priorização Técnica".
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Sprint Selector */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="w-full sm:w-72">
          <Select value={selectedSprintId || ''} onValueChange={(val) => setSelectedSprintId(val === '__all__' ? '__all__' : val)}>
            <SelectTrigger>
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Selecionar Sprint" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas as Sprints</SelectItem>
              {sprints.map(sprint => (
                <SelectItem key={sprint.id} value={sprint.id}>
                  {sprint.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        {/* Search Field */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar chamado..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {(selectedSprint || isAllSprints) && (
        <>
          {/* Sprint Info Card - only for single sprint */}
          {selectedSprint && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                {editingSprintId === selectedSprint.id ? (
                  <div className="flex flex-wrap items-center gap-3 flex-1">
                    <Input
                      value={editForm.nome}
                      onChange={(e) => setEditForm(prev => ({ ...prev, nome: e.target.value }))}
                      className="max-w-xs"
                      placeholder="Nome da Sprint"
                    />
                    <Select 
                      value={editForm.status} 
                      onValueChange={(value) => setEditForm(prev => ({ ...prev, status: value }))}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="planejada">Planejada</SelectItem>
                        <SelectItem value="em_andamento">Em Andamento</SelectItem>
                        <SelectItem value="concluida">Concluída</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Início:</span>
                      <Input
                        type="date"
                        value={editForm.data_inicio}
                        onChange={(e) => setEditForm(prev => ({ ...prev, data_inicio: e.target.value }))}
                        className="w-40"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Fim:</span>
                      <Input
                        type="date"
                        value={editForm.data_fim}
                        onChange={(e) => setEditForm(prev => ({ ...prev, data_fim: e.target.value }))}
                        className="w-40"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Capacidade:</span>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        value={editForm.horas_totais}
                        onChange={(e) => setEditForm(prev => ({ ...prev, horas_totais: parseFloat(e.target.value) || 0 }))}
                        className="w-20"
                      />
                      <span className="text-sm text-muted-foreground">h</span>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={saveEditing}>
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={cancelEditing}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <CardTitle className="flex items-center gap-3">
                      {selectedSprint.nome}
                      <span className={`px-2 py-0.5 rounded text-xs font-medium border ${getStatusColor(selectedSprint.status)}`}>
                        {getStatusLabel(selectedSprint.status)}
                      </span>
                    </CardTitle>
                    {canEditSprints && (
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="ghost" onClick={() => startEditing(selectedSprint)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="text-destructive hover:text-destructive"
                          onClick={() => openDeleteDialog(selectedSprint)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                <div className="flex flex-col items-center p-3 rounded-lg bg-muted/50">
                  <Clock className="h-5 w-5 text-muted-foreground mb-1" />
                  <span className="text-xs text-muted-foreground">Capacidade</span>
                  <span className="text-2xl font-bold text-primary">{selectedSprint.horas_totais || 60}h</span>
                </div>
                <div className="flex flex-col items-center p-3 rounded-lg bg-muted/50">
                  <span className="text-xs text-muted-foreground">Horas Comprometidas</span>
                  <span className={`text-2xl font-bold ${totalHoras > (selectedSprint.horas_totais || 60) ? 'text-destructive' : 'text-success'}`}>
                    {totalHoras.toFixed(1)}h
                  </span>
                </div>
                <div className="flex flex-col items-center p-3 rounded-lg bg-muted/50">
                  <span className="text-xs text-muted-foreground">Disponível</span>
                  <span className={`text-2xl font-bold ${(selectedSprint.horas_totais || 60) - totalHoras < 0 ? 'text-destructive' : 'text-success'}`}>
                    {((selectedSprint.horas_totais || 60) - totalHoras).toFixed(1)}h
                  </span>
                </div>
                <div className="flex flex-col items-center p-3 rounded-lg bg-muted/50">
                  <span className="text-xs text-muted-foreground">Pendentes</span>
                  <span className="text-2xl font-bold">{pendingChamados.length}</span>
                  <span className="text-xs text-muted-foreground">{horasPendentes.toFixed(1)}h</span>
                </div>
                <div className="flex flex-col items-center p-3 rounded-lg bg-muted/50">
                  <span className="text-xs text-muted-foreground">Não Iniciados</span>
                  <span className="text-2xl font-bold text-destructive">{naoIniciadosChamados.length}</span>
                  <span className="text-xs text-muted-foreground">{horasNaoIniciados.toFixed(1)}h</span>
                </div>
                <div className="flex flex-col items-center p-3 rounded-lg bg-muted/50">
                  <span className="text-xs text-muted-foreground">Em Andamento</span>
                  <span className="text-2xl font-bold text-warning">{emAndamentoChamados.length}</span>
                  <span className="text-xs text-muted-foreground">{horasEmAndamento.toFixed(1)}h</span>
                </div>
                <div className="flex flex-col items-center p-3 rounded-lg bg-muted/50">
                  <span className="text-xs text-muted-foreground">Concluídos</span>
                  <span className="text-2xl font-bold text-success">{concludedChamados.length}</span>
                  <span className="text-xs text-muted-foreground">{horasConcluidos.toFixed(1)}h</span>
                </div>
                {cancelledChamados.length > 0 && (
                  <div className="flex flex-col items-center p-3 rounded-lg bg-muted/50">
                    <span className="text-xs text-muted-foreground">Cancelados</span>
                    <span className="text-2xl font-bold text-destructive">{cancelledChamados.length}</span>
                    <span className="text-xs text-muted-foreground">{horasCancelados.toFixed(1)}h</span>
                  </div>
                )}
                {selectedSprint.data_inicio && (
                  <div className="flex flex-col items-center p-3 rounded-lg bg-muted/50">
                    <span className="text-xs text-muted-foreground">Início</span>
                    <span className="text-lg font-bold">{format(parseISO(selectedSprint.data_inicio), "dd/MM/yyyy", { locale: ptBR })}</span>
                  </div>
                )}
                {selectedSprint.data_fim && (
                  <div className="flex flex-col items-center p-3 rounded-lg bg-muted/50">
                    <span className="text-xs text-muted-foreground">Data Limite</span>
                    <span className="text-lg font-bold">{format(parseISO(selectedSprint.data_fim), "dd/MM/yyyy", { locale: ptBR })}</span>
                  </div>
                )}
                <div className="flex flex-col items-center p-3 rounded-lg bg-muted/50">
                  <span className="text-xs text-muted-foreground">Criada em</span>
                  <span className="text-lg font-bold">{format(parseISO(selectedSprint.created_at), "dd/MM/yyyy", { locale: ptBR })}</span>
                </div>
              </div>
            </CardContent>
          </Card>
          )}

          {/* Summary card for "Todas as Sprints" */}
          {isAllSprints && (() => {
            const allCapacidade = sprints.reduce((sum, s) => sum + (s.horas_totais || 60), 0);
            const allDisponivel = allCapacidade - totalHoras;
            const sprintsWithInicio = sprints.filter(s => s.data_inicio).sort((a, b) => a.data_inicio!.localeCompare(b.data_inicio!));
            const sprintsWithFim = sprints.filter(s => s.data_fim).sort((a, b) => a.data_fim!.localeCompare(b.data_fim!));
            const firstInicio = sprintsWithInicio.length > 0 ? sprintsWithInicio[0].data_inicio : null;
            const lastFim = sprintsWithFim.length > 0 ? sprintsWithFim[sprintsWithFim.length - 1].data_fim : null;
            return (
            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  <div className="flex flex-col items-center p-3 rounded-lg bg-muted/50">
                    <Clock className="h-5 w-5 text-muted-foreground mb-1" />
                    <span className="text-xs text-muted-foreground">Capacidade</span>
                    <span className="text-2xl font-bold text-primary">{allCapacidade}h</span>
                  </div>
                  <div className="flex flex-col items-center p-3 rounded-lg bg-muted/50">
                    <span className="text-xs text-muted-foreground">Horas Comprometidas</span>
                    <span className={`text-2xl font-bold ${totalHoras > allCapacidade ? 'text-destructive' : 'text-success'}`}>
                      {totalHoras.toFixed(1)}h
                    </span>
                  </div>
                  <div className="flex flex-col items-center p-3 rounded-lg bg-muted/50">
                    <span className="text-xs text-muted-foreground">Disponível</span>
                    <span className={`text-2xl font-bold ${allDisponivel < 0 ? 'text-destructive' : 'text-success'}`}>
                      {allDisponivel.toFixed(1)}h
                    </span>
                  </div>
                  <div className="flex flex-col items-center p-3 rounded-lg bg-muted/50">
                    <span className="text-xs text-muted-foreground">Pendentes</span>
                    <span className="text-2xl font-bold">{pendingChamados.length}</span>
                    <span className="text-xs text-muted-foreground">{horasPendentes.toFixed(1)}h</span>
                  </div>
                  <div className="flex flex-col items-center p-3 rounded-lg bg-muted/50">
                    <span className="text-xs text-muted-foreground">Não Iniciados</span>
                    <span className="text-2xl font-bold text-destructive">{naoIniciadosChamados.length}</span>
                    <span className="text-xs text-muted-foreground">{horasNaoIniciados.toFixed(1)}h</span>
                  </div>
                  <div className="flex flex-col items-center p-3 rounded-lg bg-muted/50">
                    <span className="text-xs text-muted-foreground">Em Andamento</span>
                    <span className="text-2xl font-bold text-warning">{emAndamentoChamados.length}</span>
                    <span className="text-xs text-muted-foreground">{horasEmAndamento.toFixed(1)}h</span>
                  </div>
                  <div className="flex flex-col items-center p-3 rounded-lg bg-muted/50">
                    <span className="text-xs text-muted-foreground">Concluídos</span>
                    <span className="text-2xl font-bold text-success">{concludedChamados.length}</span>
                    <span className="text-xs text-muted-foreground">{horasConcluidos.toFixed(1)}h</span>
                  </div>
                  {cancelledChamados.length > 0 && (
                    <div className="flex flex-col items-center p-3 rounded-lg bg-muted/50">
                      <span className="text-xs text-muted-foreground">Cancelados</span>
                      <span className="text-2xl font-bold text-destructive">{cancelledChamados.length}</span>
                      <span className="text-xs text-muted-foreground">{horasCancelados.toFixed(1)}h</span>
                    </div>
                  )}
                  {firstInicio && (
                    <div className="flex flex-col items-center p-3 rounded-lg bg-muted/50">
                      <span className="text-xs text-muted-foreground">Início</span>
                      <span className="text-lg font-bold">{format(parseISO(firstInicio), "dd/MM/yyyy", { locale: ptBR })}</span>
                    </div>
                  )}
                  {lastFim && (
                    <div className="flex flex-col items-center p-3 rounded-lg bg-muted/50">
                      <span className="text-xs text-muted-foreground">Data Limite</span>
                      <span className="text-lg font-bold">{format(parseISO(lastFim), "dd/MM/yyyy", { locale: ptBR })}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
            );
          })()}

          {/* Chamados Table */}
          <div className="rounded-lg border border-border overflow-hidden w-full">
            <div className="max-h-[calc(100vh-450px)] min-h-[300px] overflow-auto">
              <Table className="table-corporate w-full min-w-[800px]">
                <TableHeader>
                  <TableRow className="bg-table-header hover:bg-table-header">
                    <TableHead className="text-table-header-foreground">Número</TableHead>
                    <TableHead className="text-table-header-foreground">Área</TableHead>
                    <TableHead className="text-table-header-foreground min-w-[200px]">Descrição</TableHead>
                    <TableHead className="text-table-header-foreground text-center">GUT</TableHead>
                    <TableHead className="text-table-header-foreground text-center">Esforço</TableHead>
                    <TableHead className="text-table-header-foreground">Status</TableHead>
                    <TableHead className="text-table-header-foreground text-center">Concluir</TableHead>
                    <TableHead className="text-table-header-foreground"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingChamados ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-32 text-center">
                        <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : filteredChamados.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                        {searchTerm ? 'Nenhum chamado encontrado com essa busca' : 'Nenhum chamado nesta sprint'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredChamados.map((chamado) => {
                      const isConcluded = !!chamado.data_conclusao;
                      const isCancelled = !!chamado.cancelado;
                      const isPrc = (chamado.grupo_atribuicao || '').toLowerCase().includes('prc - processos e melhoria');
                      const isNaoIniciado = (chamado.estado || '').toLowerCase().trim() === 'em aberto';
                      return (
                        <TableRow key={chamado.id} className={cn(
                          isCancelled ? 'bg-destructive/5 opacity-70' : isConcluded ? 'bg-success/5' : ''
                        )}>
                          <TableCell className="text-sm font-medium">{chamado.numero}</TableCell>
                          <TableCell className="text-sm">
                            <span className="truncate block max-w-[150px]" title={chamado.area_demandante}>
                              {formatAreaName(chamado.area_demandante)}
                            </span>
                          </TableCell>
                          <TableCell className="max-w-md">
                            <p className="truncate text-sm" title={chamado.descricao || ''}>
                              {chamado.descricao || '-'}
                            </p>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="inline-flex items-center justify-center w-10 h-7 rounded bg-primary/10 text-primary font-bold text-sm">
                              {chamado.pontuacao_gut}
                            </span>
                          </TableCell>
                          <TableCell className="text-center text-sm">
                            {chamado.esforco}h
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {isCancelled ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-destructive/15 text-destructive">
                                  <Ban className="h-3 w-3" />
                                  Cancelado
                                </span>
                              ) : isConcluded ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-success/15 text-success">
                                  Concluído
                                </span>
                              ) : isNaoIniciado ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-destructive/15 text-destructive">
                                  <CircleDashed className="h-3 w-3" />
                                  Não Iniciado
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-primary/15 text-primary">
                                  Em andamento
                                </span>
                              )}
                              {!isCancelled && isPrc && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-violet-500/15 text-violet-600 dark:text-violet-400">
                                  <Building2 className="h-3 w-3" />
                                  Escritório de Processos
                                </span>
                              )}
                              {!isCancelled && chamado.aguardando_cliente && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-warning/15 text-warning">
                                  <UserX className="h-3 w-3" />
                                  Aguardando Cliente
                                </span>
                              )}
                              {!isCancelled && !isConcluded && (chamado.estado || '').toLowerCase().trim() === 'pendente' && chamado.motivo_pendencia === 'Aguardando Solicitante' && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold status-pendencia-solicitante" title="Aguardando resposta do solicitante">
                                  <Clock className="h-3 w-3" />
                                  Pendência Solicitante
                                </span>
                              )}
                              {!isCancelled && (chamado.contagem_reabertura ?? 0) > 0 && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400">
                                  <RefreshCcw className="h-3 w-3" />
                                  Reabertura ({chamado.contagem_reabertura})
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            {isCancelled ? (
                              <span className="text-muted-foreground text-xs">-</span>
                            ) : isConcluded ? (
                              canManageChamados ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-success hover:text-warning hover:bg-warning/10 p-0 h-8 w-8"
                                  onClick={() => revertChamadoConclusion.mutate(chamado.id)}
                                  disabled={revertChamadoConclusion.isPending}
                                  title={`Concluído em ${format(parseISO(chamado.data_conclusao!), "dd/MM/yyyy", { locale: ptBR })} - Clique para reverter`}
                                >
                                  {revertChamadoConclusion.isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-success text-success-foreground">
                                      <CheckCircle className="h-4 w-4" />
                                    </div>
                                  )}
                                </Button>
                              ) : (
                                <div 
                                  className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-success text-success-foreground"
                                  title={`Concluído em ${format(parseISO(chamado.data_conclusao!), "dd/MM/yyyy", { locale: ptBR })}`}
                                >
                                  <CheckCircle className="h-4 w-4" />
                                </div>
                              )
                            ) : canManageChamados ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-success hover:text-success hover:bg-success/10"
                                onClick={() => openConcludeDialog(chamado)}
                                title="Concluir chamado"
                              >
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                            ) : (
                              <span className="text-muted-foreground text-xs">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {isCancelled || isConcluded ? (
                              <span className="text-muted-foreground text-xs">-</span>
                            ) : canManageChamados ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive hover:text-destructive"
                                onClick={() => removeChamadoFromSprint.mutate(chamado.id)}
                                title="Remover da sprint"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            ) : (
                              <span className="text-muted-foreground text-xs">-</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      )}

      {/* Delete Sprint Confirmation Dialog */}
      <AlertDialog open={deleteSprintDialogOpen} onOpenChange={setDeleteSprintDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Sprint</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a <strong>{sprintToDelete?.nome}</strong>?
              <br /><br />
              Os chamados associados serão desvinculados e voltarão ao status "Aberto".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => sprintToDelete && deleteSprint.mutate(sprintToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteSprint.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Conclude Chamado Dialog */}
      <Dialog open={concludeDialogOpen} onOpenChange={(open) => {
        setConcludeDialogOpen(open);
        if (!open) {
          setChamadoToConclude(null);
          setConclusionDate(new Date());
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Concluir Chamado</DialogTitle>
            <DialogDescription>
              Informe a data de conclusão do chamado <strong>{chamadoToConclude?.numero}</strong>.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="conclusion-date">Data de Conclusão</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !conclusionDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {conclusionDate ? format(conclusionDate, "PPP", { locale: ptBR }) : <span>Selecione uma data</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={conclusionDate}
                    onSelect={setConclusionDate}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConcludeDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConcludeSubmit} disabled={!conclusionDate || concludeChamado.isPending}>
              {concludeChamado.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Concluindo...
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Concluir
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
