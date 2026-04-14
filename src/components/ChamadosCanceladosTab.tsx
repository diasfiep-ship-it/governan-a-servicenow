import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import StatusBadge from './StatusBadge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Search, Filter, Loader2, Eye, ExternalLink } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Helper to format area name
function formatAreaName(area: string): string {
  const lower = area.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

// Helper to normalize area name for comparison
function normalizeAreaName(area: string): string {
  return area
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

// Helper to deduplicate areas
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

interface ChamadoCancelado {
  id: string;
  numero: string;
  area_demandante: string;
  cliente: string | null;
  descricao: string | null;
  motivo_cancelamento: string | null;
  evidencia_cancelamento_url: string | null;
  cancelado_em: string | null;
  status_anterior: string | null;
}

export default function ChamadosCanceladosTab() {
  const [searchTerm, setSearchTerm] = useState('');
  const [areaFilter, setAreaFilter] = useState<string>('all');
  const [selectedChamado, setSelectedChamado] = useState<ChamadoCancelado | null>(null);

  // Fetch cancelled chamados
  const { data: chamadosCancelados = [], isLoading } = useQuery({
    queryKey: ['chamados-cancelados'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chamados')
        .select('id, numero, area_demandante, cliente, descricao, motivo_cancelamento, evidencia_cancelamento_url, cancelado_em, status_anterior')
        .eq('cancelado', true)
        .order('cancelado_em', { ascending: false });
      
      if (error) throw error;
      return data as ChamadoCancelado[];
    },
  });

  // Get unique areas (filter out empty values - Radix Select doesn't allow empty values)
  const areas = useMemo(() => {
    const allAreas = chamadosCancelados
      .map(c => c.area_demandante)
      .filter(area => area && area.trim() !== '');
    return deduplicateAreas(allAreas);
  }, [chamadosCancelados]);

  // Filter chamados
  const filteredChamados = useMemo(() => {
    return chamadosCancelados.filter(chamado => {
      const matchesSearch = 
        chamado.numero.toLowerCase().includes(searchTerm.toLowerCase()) ||
        chamado.descricao?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        chamado.cliente?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        chamado.motivo_cancelamento?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesArea = areaFilter === 'all' || 
        normalizeAreaName(chamado.area_demandante) === normalizeAreaName(areaFilter);
      
      return matchesSearch && matchesArea;
    });
  }, [chamadosCancelados, searchTerm, areaFilter]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por número, descrição ou motivo..."
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

      {/* Results count */}
      <div className="text-sm text-muted-foreground">
        {filteredChamados.length} chamado{filteredChamados.length !== 1 ? 's' : ''} cancelado{filteredChamados.length !== 1 ? 's' : ''}
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden w-full">
        <ScrollArea className="h-[calc(100vh-380px)]">
          <Table className="table-corporate w-full min-w-[900px]">
            <TableHeader>
              <TableRow className="bg-table-header hover:bg-table-header">
                <TableHead className="text-table-header-foreground">Número</TableHead>
                <TableHead className="text-table-header-foreground">Área</TableHead>
                <TableHead className="text-table-header-foreground min-w-[200px]">Descrição</TableHead>
                <TableHead className="text-table-header-foreground">Cliente</TableHead>
                <TableHead className="text-table-header-foreground">Status Anterior</TableHead>
                <TableHead className="text-table-header-foreground">Data Cancelamento</TableHead>
                <TableHead className="text-table-header-foreground text-center">Detalhes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredChamados.map((chamado) => (
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
                  <TableCell>
                    <StatusBadge status={chamado.status_anterior || 'Carga Inicial'} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {chamado.cancelado_em 
                      ? format(parseISO(chamado.cancelado_em), "dd/MM/yyyy HH:mm", { locale: ptBR })
                      : '-'
                    }
                  </TableCell>
                  <TableCell className="text-center">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedChamado(chamado)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-lg">
                        <DialogHeader>
                          <DialogTitle>Detalhes do Cancelamento - {chamado.numero}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Área</label>
                            <p className="text-sm">{formatAreaName(chamado.area_demandante)}</p>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Descrição</label>
                            <p className="text-sm">{chamado.descricao || '-'}</p>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Status Anterior</label>
                            <p className="text-sm">{chamado.status_anterior || 'Carga Inicial'}</p>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Data do Cancelamento</label>
                            <p className="text-sm">
                              {chamado.cancelado_em 
                                ? format(parseISO(chamado.cancelado_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                                : '-'
                              }
                            </p>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Motivo do Cancelamento</label>
                            <p className="text-sm whitespace-pre-wrap">{chamado.motivo_cancelamento || '-'}</p>
                          </div>
                          {chamado.evidencia_cancelamento_url && (
                            <div>
                              <label className="text-sm font-medium text-muted-foreground">Evidência</label>
                              <div className="mt-2">
                                <a 
                                  href={chamado.evidencia_cancelamento_url} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-2 text-primary hover:underline"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                  Ver evidência
                                </a>
                                <img 
                                  src={chamado.evidencia_cancelamento_url} 
                                  alt="Evidência do cancelamento"
                                  className="mt-2 max-w-full rounded-lg border"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </DialogContent>
                    </Dialog>
                  </TableCell>
                </TableRow>
              ))}
              {filteredChamados.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    Nenhum chamado cancelado encontrado
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
