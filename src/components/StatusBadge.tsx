import { cn } from '@/lib/utils';
import { ChamadoStatus } from '@/types';

interface StatusBadgeProps {
  status: string | null;
  sprintName?: string;
}

export default function StatusBadge({ status, sprintName }: StatusBadgeProps) {
  const getStatusClass = (status: string | null) => {
    if (!status) return 'status-badge bg-muted text-muted-foreground';
    
    const normalizedStatus = status.toUpperCase();
    
    if (normalizedStatus.includes('CONCLU')) {
      return 'status-badge status-fechado';
    }
    if (normalizedStatus.includes('ESCRITÓRIO DE PROCESSOS') || normalizedStatus.includes('MAPEAMENTO')) {
      return 'status-badge bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
    }
    if (normalizedStatus.includes('PRIORIZADO') || sprintName) {
      return 'status-badge status-priorizado';
    }
    if (normalizedStatus.includes('FECHAD') || normalizedStatus.includes('RESOLVID')) {
      return 'status-badge status-fechado';
    }
    if (normalizedStatus.includes('AGUARD. GUT') || normalizedStatus.includes('GUT')) {
      return 'status-badge status-aguardando-gut';
    }
    if (normalizedStatus.includes('AGUARD. ESFORÇO') || normalizedStatus.includes('ESFORÇO') || normalizedStatus.includes('ESTIMATIVA')) {
      return 'status-badge status-aguardando-esforco';
    }
    if (normalizedStatus.includes('AGUARD. PRIORIZAÇÃO') || normalizedStatus.includes('QUALIDADE') || normalizedStatus.includes('INDICADORES')) {
      return 'status-badge status-aguardando-priorizacao';
    }
    if (normalizedStatus.includes('SPRINT')) {
      return 'status-badge status-aguardando-sprint';
    }
    return 'status-badge status-aberto';
  };

  const getDisplayStatus = (status: string | null) => {
    // If sprintName is provided, show it instead
    if (sprintName) {
      return sprintName;
    }
    
    if (!status) return 'Sem status';
    
    // Show "Escritório de Processos" for mapping status
    if (status === 'Escritório de Processos' || status === 'Em mapeamento com Escritório de Processos') {
      return 'Escritório de Processos';
    }
    
    // Shorten long status names
    if (status.length > 20) {
      if (status.includes('GUT')) return 'Aguard. GUT';
      if (status.includes('Esforço')) return 'Aguard. Esforço';
      if (status.includes('Qualidade')) return 'Aguard. ADM';
      if (status.includes('Sprint')) return 'Próx. Sprint';
    }
    return status;
  };

  return (
    <span className={cn(getStatusClass(status))} title={sprintName || status || 'Sem status'}>
      {getDisplayStatus(status)}
    </span>
  );
}
