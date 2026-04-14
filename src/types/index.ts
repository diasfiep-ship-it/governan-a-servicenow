// Now roles are stored as text (flexible, includes area names)
// System roles
export const SYSTEM_ROLES = ['ADM', 'ADM_TI', 'TI', 'ESCRITORIO_PROCESSOS'] as const;
export type SystemRole = typeof SYSTEM_ROLES[number];

// AppRole is now a string (can be system role or area name)
export type AppRole = string;

// Helper to check if a role is a system role
export function isSystemRole(role: string): role is SystemRole {
  return SYSTEM_ROLES.includes(role as SystemRole);
}

// Helper to check if a role is admin
export function isAdminRole(role: string): boolean {
  return role === 'ADM' || role === 'ADM_TI';
}

// Helper to check if role is Escritório de Processos
export function isEscritorioProcessos(role: string): boolean {
  return role === 'ESCRITORIO_PROCESSOS';
}

// Helper to normalize text for comparison (remove accents, lowercase, trim)
export function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

// Helper to check if user has access to an area (used for UI logic)
export function hasAreaAccess(userRoles: string[], areaDemandante: string): boolean {
  const normalizedArea = normalizeForComparison(areaDemandante);
  return userRoles.some(role => {
    // Check system roles first
    if (role === 'ADM' || role === 'ADM_TI' || role === 'TI' || role === 'ESCRITORIO_PROCESSOS') {
      return true;
    }
    // Compare normalized versions for area match
    return normalizeForComparison(role) === normalizedArea;
  });
}

// Status do chamado baseado no fluxo
export type ChamadoStatus = 
  | 'Aguard. GUT'
  | 'Aguard. Esforço'
  | 'Aguard. Priorização'
  | 'Priorizado'
  | 'Concluído';

export interface Chamado {
  id: string;
  numero: string;
  area_demandante: string;
  cliente: string | null;
  descricao: string | null;
  area: string | null;
  status: string | null;
  item: string | null;
  oferta: string | null;
  sla: string | null;
  estado: string | null;
  data_abertura: string | null;
  catalogo: string | null;
  grupo_atribuicao: string | null;
  data_resolvido: string | null;
  data_fechamento: string | null;
  data_encerramento: string | null;
  data_previsto: string | null;
  data_conclusao: string | null;
  gravidade: number | null;
  urgencia: number | null;
  tendencia: number | null;
  pontuacao_gut: number | null;
  esforco: number | null;
  prioridade_calculada: number | null;
  selecionado_mes: boolean;
  mes_priorizacao: string | null;
  sprint_id: string | null;
  created_at: string;
  updated_at: string;
  // New fields for enhanced Excel import
  contagem_reabertura: number | null;
  aguardando_cliente: boolean | null;
  motivo_pendencia: string | null;
  encerrado_por: string | null;
  atribuido_a: string | null;
  comentarios: string | null;
  oculto: boolean | null;
  area_modificada_por_admin: boolean | null;
  status_anterior: string | null;
  cancelado: boolean | null;
  motivo_cancelamento: string | null;
  evidencia_cancelamento_url: string | null;
  cancelado_em: string | null;
  cancelado_por: string | null;
  spec_ativo: boolean | null;
  spec_inicio: string | null;
  spec_dias_acumulados: number | null;
}

export interface Sprint {
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

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  must_change_password: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: string; // Now text-based
}

export interface UserWithRole extends Profile {
  roles: string[]; // Array of roles (can be system roles or area names)
}

// Helper to calculate dynamic status
export function calculateChamadoStatus(chamado: Chamado): ChamadoStatus | 'Escritório de Processos' {
  // If chamado has data_conclusao, it's concluded
  if (chamado.data_conclusao) {
    return 'Concluído';
  }
  
  // If status is Concluído
  if (chamado.status?.toUpperCase().includes('CONCLU')) {
    return 'Concluído';
  }
  
  // If status is "Em mapeamento com Escritório de Processos", show special status
  if (chamado.status === 'Em mapeamento com Escritório de Processos') {
    return 'Escritório de Processos';
  }
  
  // If status is PRIORIZADO or has sprint_id
  if (chamado.status?.toUpperCase().includes('PRIORIZADO') || chamado.sprint_id) {
    return 'Priorizado';
  }
  
  // Check if all GUT values are set (not null and > 0)
  const gutComplete = 
    chamado.gravidade !== null && chamado.gravidade > 0 &&
    chamado.urgencia !== null && chamado.urgencia > 0 &&
    chamado.tendencia !== null && chamado.tendencia > 0;
  
  if (!gutComplete) {
    return 'Aguard. GUT';
  }
  
  // Check if effort was set (esforco is not null and > 0)
  if (chamado.esforco === null || chamado.esforco <= 0) {
    return 'Aguard. Esforço';
  }
  
  // GUT and effort set, but not priorizado
  return 'Aguard. Priorização';
}

// Check if chamado is a Quick Win (high GUT, low effort)
export function isQuickWin(chamado: Chamado): boolean {
  return (chamado.pontuacao_gut || 0) >= 27 && (chamado.esforco || 0) <= 4 && (chamado.esforco || 0) > 0;
}

// Check if all GUT values are complete
export function isGutComplete(chamado: Chamado): boolean {
  return chamado.gravidade !== null && chamado.gravidade > 0 &&
         chamado.urgencia !== null && chamado.urgencia > 0 &&
         chamado.tendencia !== null && chamado.tendencia > 0;
}

// Check if chamado should appear in Aguard. GUT filter (includes Escritório de Processos with incomplete GUT)
export function shouldShowInAguardGutFilter(chamado: Chamado): boolean {
  const status = calculateChamadoStatus(chamado);
  if (status === 'Aguard. GUT') return true;
  // Escritório de Processos chamados with incomplete GUT should also appear
  if (status === 'Escritório de Processos' && !isGutComplete(chamado)) return true;
  return false;
}

// Calculate business days between two dates (excludes weekends)
export function calculateBusinessDays(startDate: Date, endDate: Date): number {
  let count = 0;
  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  
  while (current < end) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  return count;
}
