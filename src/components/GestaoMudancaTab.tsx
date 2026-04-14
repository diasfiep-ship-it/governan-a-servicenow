import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Search, Filter, Loader2, FileCheck, CalendarIcon, Edit2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import ChatMudancas from './ChatMudancas';

interface ConcludedChamado {
  id: string;
  numero: string;
  descricao: string | null;
  area_demandante: string;
  cliente: string | null;
  esforco: number;
  pontuacao_gut: number;
  data_abertura: string | null;
  data_conclusao: string;
  status: string | null;
  sprint_id: string | null;
  comentarios: string | null;
  sprint?: {
    id: string;
    numero: number;
    nome: string;
    data_fim: string | null;
  };
}

// Helper to format area name with only the first letter uppercase (sentence case)
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

export default function GestaoMudancaTab() {
  const queryClient = useQueryClient();
  const { role } = useAuth();
  const isAdmin = role === 'ADM';
  
  const [searchTerm, setSearchTerm] = useState('');
  const [areaFilter, setAreaFilter] = useState<string>('all');
  const [sprintFilter, setSprintFilter] = useState<string>('all');
  const [editingConclusionId, setEditingConclusionId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState<Date | undefined>(undefined);

  // Fetch concluded chamados
  const { data: concludedChamados = [], isLoading } = useQuery({
    queryKey: ['concluded-chamados'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chamados')
        .select(`
          id, 
          numero, 
          descricao, 
          area_demandante, 
          cliente,
          esforco, 
          pontuacao_gut, 
          data_abertura,
          data_conclusao,
          status,
          sprint_id,
          comentarios,
          sprints (
            id,
            numero,
            nome,
            data_fim
          )
        `)
        .not('data_conclusao', 'is', null)
        .order('data_conclusao', { ascending: false });
      
      if (error) throw error;
      
      return (data || []).map(item => ({
        ...item,
        sprint: item.sprints ? {
          id: item.sprints.id,
          numero: item.sprints.numero,
          nome: item.sprints.nome,
          data_fim: item.sprints.data_fim
        } : undefined
      })) as ConcludedChamado[];
    },
  });

  // Update conclusion date mutation
  const updateConclusionDate = useMutation({
    mutationFn: async ({ id, data_conclusao }: { id: string; data_conclusao: Date }) => {
      const { error } = await supabase
        .from('chamados')
        .update({ data_conclusao: data_conclusao.toISOString() })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['concluded-chamados'] });
      setEditingConclusionId(null);
      setEditDate(undefined);
      toast.success('Data de conclusão atualizada');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar data: ' + error.message);
    },
  });

  // Start editing conclusion date
  const startEditingConclusion = (chamado: ConcludedChamado) => {
    setEditingConclusionId(chamado.id);
    setEditDate(parseISO(chamado.data_conclusao));
  };

  // Save edited conclusion date
  const saveConclusion = () => {
    if (editingConclusionId && editDate) {
      updateConclusionDate.mutate({ id: editingConclusionId, data_conclusao: editDate });
    }
  };

  // Get unique areas for filter based on current sprint filter (dynamic filtering)
  // Filter out empty values - Radix Select doesn't allow empty values
  const areas = useMemo(() => {
    // Filter by sprint first if a specific sprint is selected
    const chamadosForFilter = sprintFilter === 'all' 
      ? concludedChamados 
      : concludedChamados.filter(c => c.sprint_id === sprintFilter);
    
    const allAreas = chamadosForFilter
      .map(c => c.area_demandante)
      .filter(area => area && area.trim() !== '');
    return deduplicateAreas(allAreas);
  }, [concludedChamados, sprintFilter]);

  // Get unique sprints for filter
  const sprints = useMemo(() => {
    const uniqueSprints = concludedChamados
      .filter(c => c.sprint)
      .map(c => c.sprint!)
      .filter((sprint, index, self) => 
        index === self.findIndex(s => s.id === sprint.id)
      );
    return uniqueSprints.sort((a, b) => b.numero - a.numero);
  }, [concludedChamados]);

  // Filter chamados
  const filteredChamados = useMemo(() => {
    return concludedChamados.filter(chamado => {
      const matchesSearch = 
        chamado.numero.toLowerCase().includes(searchTerm.toLowerCase()) ||
        chamado.descricao?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        chamado.cliente?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesArea = areaFilter === 'all' || chamado.area_demandante === areaFilter;
      const matchesSprint = sprintFilter === 'all' || chamado.sprint_id === sprintFilter;
      
      return matchesSearch && matchesArea && matchesSprint;
    });
  }, [concludedChamados, searchTerm, areaFilter, sprintFilter]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <FileCheck className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Gestão de Mudança - Service Now</h2>
        <Badge variant="outline" className="ml-2">
          {concludedChamados.length} mudanças concluídas
        </Badge>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por número, descrição ou cliente..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="w-full sm:w-64">
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
        <div className="w-full sm:w-64">
          <Select value={sprintFilter} onValueChange={setSprintFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Filtrar por Sprint" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as Sprints</SelectItem>
              {sprints.map(sprint => (
                <SelectItem key={sprint.id} value={sprint.id}>
                  Sprint {sprint.numero} - {sprint.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Results count */}
      <div className="text-sm text-muted-foreground">
        {filteredChamados.length} mudança{filteredChamados.length !== 1 ? 's' : ''} encontrada{filteredChamados.length !== 1 ? 's' : ''}
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden w-full">
        <ScrollArea className="h-[calc(100vh-380px)]">
          <Table className="table-corporate w-full min-w-[1300px]">
            <TableHeader>
              <TableRow className="bg-table-header hover:bg-table-header">
                <TableHead className="text-table-header-foreground">Número</TableHead>
                <TableHead className="text-table-header-foreground">Área</TableHead>
                <TableHead className="text-table-header-foreground min-w-[200px]">Descrição</TableHead>
                <TableHead className="text-table-header-foreground">Cliente</TableHead>
                <TableHead className="text-table-header-foreground">Sprint</TableHead>
                <TableHead className="text-table-header-foreground text-center">GUT</TableHead>
                <TableHead className="text-table-header-foreground text-center">Esforço</TableHead>
                <TableHead className="text-table-header-foreground">Data Abertura</TableHead>
                <TableHead className="text-table-header-foreground">Previsão Sprint</TableHead>
                <TableHead className="text-table-header-foreground">Conclusão Chamado</TableHead>
                <TableHead className="text-table-header-foreground">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredChamados.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="h-32 text-center text-muted-foreground">
                    {searchTerm || areaFilter !== 'all' || sprintFilter !== 'all' 
                      ? 'Nenhuma mudança encontrada com os filtros aplicados'
                      : 'Nenhuma mudança concluída ainda'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredChamados.map((chamado) => (
                  <TableRow key={chamado.id}>
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
                    <TableCell className="text-sm">
                      <span className="truncate block max-w-[100px]" title={chamado.cliente || ''}>
                        {chamado.cliente || '-'}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {chamado.sprint ? (
                        <Badge variant="outline">
                          Sprint {chamado.sprint.numero}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="inline-flex items-center justify-center w-10 h-7 rounded bg-primary/10 text-primary font-bold text-sm">
                        {chamado.pontuacao_gut}
                      </span>
                    </TableCell>
                    <TableCell className="text-center text-sm">
                      {chamado.esforco}h
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {chamado.data_abertura 
                        ? format(parseISO(chamado.data_abertura), "dd/MM/yyyy", { locale: ptBR })
                        : '-'
                      }
                    </TableCell>
                    {/* Previsão de conclusão da sprint */}
                    <TableCell className="text-sm">
                      {chamado.sprint?.data_fim ? (
                        <span className="text-muted-foreground">
                          {format(parseISO(chamado.sprint.data_fim), "dd/MM/yyyy", { locale: ptBR })}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    {/* Conclusão do Chamado - editable */}
                    <TableCell className="text-sm">
                      {editingConclusionId === chamado.id ? (
                        <div className="flex items-center gap-2">
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className={cn(
                                  "w-32 justify-start text-left font-normal h-8",
                                  !editDate && "text-muted-foreground"
                                )}
                              >
                                <CalendarIcon className="mr-1 h-3 w-3" />
                                {editDate ? format(editDate, "dd/MM/yyyy", { locale: ptBR }) : 'Selecionar'}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={editDate}
                                onSelect={setEditDate}
                                initialFocus
                                className={cn("p-3 pointer-events-auto")}
                                locale={ptBR}
                              />
                            </PopoverContent>
                          </Popover>
                          <Button size="sm" variant="ghost" onClick={saveConclusion} className="h-8 w-8 p-0">
                            ✓
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingConclusionId(null)} className="h-8 w-8 p-0">
                            ✕
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <Badge variant="secondary" className="bg-success/15 text-success border-success/30">
                            {format(parseISO(chamado.data_conclusao), "dd/MM/yyyy", { locale: ptBR })}
                          </Badge>
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() => startEditingConclusion(chamado)}
                              title="Editar data de conclusão"
                            >
                              <Edit2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="bg-success/15 text-success">
                        {chamado.status || 'Concluído'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>

      {/* Chat IA */}
      <ChatMudancas 
        chamados={concludedChamados.map(c => ({
          numero: c.numero,
          descricao: c.descricao,
          area_demandante: c.area_demandante,
          cliente: c.cliente,
          data_conclusao: c.data_conclusao,
          comentarios: c.comentarios,
          esforco: c.esforco,
          pontuacao_gut: c.pontuacao_gut,
          status: c.status,
        }))}
      />
    </div>
  );
}