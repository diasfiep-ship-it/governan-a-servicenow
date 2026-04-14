import { useState, useMemo } from 'react';
import { useAuditLog } from '@/hooks/useAuditLog';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Filter, Loader2, History, User, Calendar, Clock } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Entity type labels
const ENTITY_TYPE_LABELS: Record<string, string> = {
  chamado: 'Chamado',
  sprint: 'Sprint',
  user: 'Usuário',
  area: 'Área',
};

export default function HistoricoTab() {
  const { logs, isLoading } = useAuditLog();
  const [searchTerm, setSearchTerm] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>('all');
  const [userFilter, setUserFilter] = useState<string>('all');

  // Get unique users for filter
  const uniqueUsers = useMemo(() => {
    const users = new Map<string, string>();
    logs.forEach(log => {
      if (!users.has(log.user_id)) {
        users.set(log.user_id, log.user_name);
      }
    });
    return Array.from(users.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [logs]);

  // Get unique entity types for filter
  const uniqueEntityTypes = useMemo(() => {
    const types = new Set<string>();
    logs.forEach(log => types.add(log.entity_type));
    return Array.from(types).sort();
  }, [logs]);

  // Filter logs
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const matchesSearch = 
        searchTerm === '' ||
        log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.user_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.user_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.entity_id?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesEntityType = entityTypeFilter === 'all' || log.entity_type === entityTypeFilter;
      const matchesUser = userFilter === 'all' || log.user_id === userFilter;

      return matchesSearch && matchesEntityType && matchesUser;
    });
  }, [logs, searchTerm, entityTypeFilter, userFilter]);

  // Format date
  const formatDate = (dateStr: string) => {
    try {
      return format(parseISO(dateStr), "dd/MM/yyyy", { locale: ptBR });
    } catch {
      return '-';
    }
  };

  // Format time
  const formatTime = (dateStr: string) => {
    try {
      return format(parseISO(dateStr), "HH:mm:ss", { locale: ptBR });
    } catch {
      return '-';
    }
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
      {/* Header */}
      <div className="flex items-center gap-2">
        <History className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Histórico de Alterações</h2>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por descrição, usuário ou ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="w-full sm:w-48">
          <Select value={entityTypeFilter} onValueChange={setEntityTypeFilter}>
            <SelectTrigger>
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Tipo de entidade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              {uniqueEntityTypes.map(type => (
                <SelectItem key={type} value={type}>
                  {ENTITY_TYPE_LABELS[type] || type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full sm:w-56">
          <Select value={userFilter} onValueChange={setUserFilter}>
            <SelectTrigger>
              <User className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Filtrar por usuário" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os usuários</SelectItem>
              {uniqueUsers.map(([userId, userName]) => (
                <SelectItem key={userId} value={userId}>
                  {userName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Results count */}
      <div className="text-sm text-muted-foreground">
        {filteredLogs.length} registro{filteredLogs.length !== 1 ? 's' : ''} encontrado{filteredLogs.length !== 1 ? 's' : ''}
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden w-full">
        <ScrollArea className="h-[calc(100vh-320px)]">
          <Table className="table-corporate w-full min-w-[800px]">
            <TableHeader>
              <TableRow className="bg-table-header hover:bg-table-header">
                <TableHead className="text-table-header-foreground w-[180px]">
                  <div className="flex items-center gap-1">
                    <User className="h-4 w-4" />
                    Usuário
                  </div>
                </TableHead>
                <TableHead className="text-table-header-foreground w-[110px]">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    Data
                  </div>
                </TableHead>
                <TableHead className="text-table-header-foreground w-[90px]">
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    Hora
                  </div>
                </TableHead>
                <TableHead className="text-table-header-foreground w-[100px]">Tipo</TableHead>
                <TableHead className="text-table-header-foreground">Descrição</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLogs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-sm">
                    <div className="flex flex-col">
                      <span className="font-medium truncate max-w-[160px]" title={log.user_name}>
                        {log.user_name}
                      </span>
                      <span className="text-xs text-muted-foreground truncate max-w-[160px]" title={log.user_email}>
                        {log.user_email}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatDate(log.created_at)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatTime(log.created_at)}
                  </TableCell>
                  <TableCell className="text-sm">
                    <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-muted">
                      {ENTITY_TYPE_LABELS[log.entity_type] || log.entity_type}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">
                    <div className="flex flex-col gap-0.5">
                      <span>{log.action}</span>
                      {log.entity_id && (
                        <span className="text-xs text-muted-foreground">
                          ID: {log.entity_id}
                        </span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredLogs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                    Nenhum registro encontrado
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
