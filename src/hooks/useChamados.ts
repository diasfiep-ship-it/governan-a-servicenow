import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Chamado, isGutComplete, isAdminRole, isEscritorioProcessos, calculateBusinessDays } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { Json } from '@/integrations/supabase/types';

// Helper function to log actions to audit_log
async function logAuditAction(
  userId: string,
  userName: string,
  userEmail: string,
  action: string,
  entityType: string,
  entityId?: string,
  details?: Json
) {
  try {
    await supabase.from('audit_log').insert([{
      user_id: userId,
      user_name: userName,
      user_email: userEmail,
      action,
      entity_type: entityType,
      entity_id: entityId || null,
      details: details || null,
    }]);
  } catch (error) {
    console.error('Failed to log audit action:', error);
  }
}

export function useChamados() {
  const { roles, user, profile } = useAuth();
  const queryClient = useQueryClient();

  // Check if user has admin, TI, or Escritorio de Processos role
  const isAdmin = roles.some(r => isAdminRole(r));
  const isTI = roles.includes('TI');
  const isEscritorio = roles.some(r => isEscritorioProcessos(r));
  const canViewAll = isAdmin || isTI || isEscritorio;

  const { data: chamados = [], isLoading, error } = useQuery({
    queryKey: ['chamados', roles],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chamados')
        .select('*')
        .eq('cancelado', false) // Exclude cancelled chamados
        .or('oculto.is.null,oculto.eq.false') // Exclude hidden chamados (Aguardando Aprovação)
        .order('pontuacao_gut', { ascending: false });
      
      if (error) throw error;
      return data as Chamado[];
    },
    enabled: roles.length > 0,
  });

  const subscribeToChanges = () => {
    const channel = supabase
      .channel('chamados-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chamados' }, () => {
        queryClient.invalidateQueries({ queryKey: ['chamados'] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  };

  const updateGUT = useMutation({
    mutationFn: async ({ id, gravidade, urgencia, tendencia }: { id: string; gravidade?: number | null; urgencia?: number | null; tendencia?: number | null; }) => {
      // Get the current chamado to check if all GUT values will be complete
      const currentChamado = chamados.find(c => c.id === id);
      if (!currentChamado) throw new Error('Chamado não encontrado');

      const newGravidade = gravidade !== undefined ? gravidade : currentChamado.gravidade;
      const newUrgencia = urgencia !== undefined ? urgencia : currentChamado.urgencia;
      const newTendencia = tendencia !== undefined ? tendencia : currentChamado.tendencia;

      const updates: Record<string, unknown> = {};
      if (gravidade !== undefined) updates.gravidade = gravidade;
      if (urgencia !== undefined) updates.urgencia = urgencia;
      if (tendencia !== undefined) updates.tendencia = tendencia;

      // Calculate GUT score only if all values are set
      const allGutComplete = newGravidade !== null && newGravidade > 0 &&
                             newUrgencia !== null && newUrgencia > 0 &&
                             newTendencia !== null && newTendencia > 0;

      if (allGutComplete) {
        updates.pontuacao_gut = (newGravidade || 0) * (newUrgencia || 0) * (newTendencia || 0);
        // Update status to Aguard. Esforço if GUT is complete and not yet in sprint
        if (!currentChamado.sprint_id && !currentChamado.status?.includes('Priorizado')) {
          updates.status = 'Aguard. Esforço';
        }
      } else {
        updates.pontuacao_gut = null;
        // If GUT is incomplete and not in sprint, set status back to Aguard. GUT
        if (!currentChamado.sprint_id && !currentChamado.status?.includes('Priorizado')) {
          updates.status = 'Aguard. GUT';
        }
      }

      const { error } = await supabase.from('chamados').update(updates).eq('id', id);
      if (error) throw error;
      
      // Log audit action
      if (user && profile) {
        const chamadoNumero = currentChamado.numero;
        const gutInfo = [];
        if (gravidade !== undefined) gutInfo.push(`G:${gravidade}`);
        if (urgencia !== undefined) gutInfo.push(`U:${urgencia}`);
        if (tendencia !== undefined) gutInfo.push(`T:${tendencia}`);
        await logAuditAction(
          user.id,
          profile.full_name || profile.email,
          profile.email,
          `Atualizou GUT do chamado ${chamadoNumero} (${gutInfo.join(', ')})`,
          'chamado',
          chamadoNumero
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chamados'] });
      toast.success('GUT atualizado');
    },
    onError: (error) => { toast.error('Erro: ' + error.message); },
  });

  const updateEsforco = useMutation({
    mutationFn: async ({ id, esforco }: { id: string; esforco: number | null }) => {
      const currentChamado = chamados.find(c => c.id === id);
      
      const updates: Record<string, unknown> = { esforco };
      
      // If esforco is null or 0, and chamado is not in sprint, set status back to Aguard. Esforço
      if ((esforco === null || esforco <= 0) && currentChamado && !currentChamado.sprint_id) {
        if (isGutComplete(currentChamado)) {
          updates.status = 'Aguard. Esforço';
        }
      } else if (esforco && esforco > 0 && currentChamado && !currentChamado.sprint_id) {
        if (isGutComplete(currentChamado)) {
          updates.status = 'Aguard. Priorização';
        }
      }
      
      const { error } = await supabase.from('chamados').update(updates).eq('id', id);
      if (error) throw error;
      
      // Log audit action
      if (user && profile && currentChamado) {
        await logAuditAction(
          user.id,
          profile.full_name || profile.email,
          profile.email,
          `Atualizou esforço do chamado ${currentChamado.numero} para ${esforco}h`,
          'chamado',
          currentChamado.numero
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chamados'] });
      toast.success('Esforço atualizado');
    },
    onError: (error) => { toast.error('Erro: ' + error.message); },
  });

  const updateArea = useMutation({
    mutationFn: async ({ id, area_demandante }: { id: string; area_demandante: string }) => {
      const currentChamado = chamados.find(c => c.id === id);
      if (!currentChamado) throw new Error('Chamado não encontrado');
      
      const oldArea = currentChamado.area_demandante;
      const clienteName = currentChamado.cliente?.trim();
      
      // If chamado has a client name, update ALL chamados from this client
      if (clienteName) {
        // Use wildcard pattern to match client names with trailing spaces
        // The database may have names with trailing whitespace, so we use %clienteName%
        const clientePattern = `%${clienteName}%`;
        
        // Find all chamados with the same client name (case-insensitive, with wildcards)
        const { data: chamadosDoCliente, error: fetchError } = await supabase
          .from('chamados')
          .select('id, numero')
          .ilike('cliente', clientePattern);
        
        if (fetchError) throw fetchError;
        
        if (chamadosDoCliente && chamadosDoCliente.length > 0) {
          // Update all chamados from this client
          const { error } = await supabase
            .from('chamados')
            .update({ area_demandante, area_modificada_por_admin: true })
            .ilike('cliente', clientePattern);
          
          if (error) throw error;
          
          // Log audit action for batch update
          if (user && profile) {
            const numeros = chamadosDoCliente.map(c => c.numero).join(', ');
            await logAuditAction(
              user.id,
              profile.full_name || profile.email,
              profile.email,
              `Alterou área de ${chamadosDoCliente.length} chamado(s) do cliente "${clienteName}" de "${oldArea}" para "${area_demandante}" (${numeros})`,
              'chamado',
              currentChamado.numero
            );
          }
          
          return { count: chamadosDoCliente.length, clienteName };
        }
      }
      
      // Fallback: update only this chamado if no client name
      const { error } = await supabase
        .from('chamados')
        .update({ area_demandante, area_modificada_por_admin: true })
        .eq('id', id);
      if (error) throw error;
      
      // Log audit action for single update
      if (user && profile) {
        await logAuditAction(
          user.id,
          profile.full_name || profile.email,
          profile.email,
          `Alterou área do chamado ${currentChamado.numero} de "${oldArea}" para "${area_demandante}"`,
          'chamado',
          currentChamado.numero
        );
      }
      
      return { count: 1, clienteName: null };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['chamados'] });
      if (data && data.count > 1) {
        toast.success(`Área atualizada para ${data.count} chamados do cliente "${data.clienteName}"`);
      } else {
        toast.success('Área atualizada');
      }
    },
    onError: (error) => { toast.error('Erro: ' + error.message); },
  });

  const toggleSelecionado = useMutation({
    mutationFn: async ({ id, selecionado }: { id: string; selecionado: boolean }) => {
      const { error } = await supabase.from('chamados').update({ selecionado_mes: selecionado }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['chamados'] }); },
    onError: (error) => { toast.error('Erro: ' + error.message); },
  });

  const limparSelecao = useMutation({
    mutationFn: async () => {
      const selecionados = chamados.filter(c => c.selecionado_mes);
      if (selecionados.length === 0) return;
      
      const { error } = await supabase
        .from('chamados')
        .update({ selecionado_mes: false })
        .in('id', selecionados.map(c => c.id));
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chamados'] });
      toast.success('Seleção limpa com sucesso');
    },
    onError: (error) => { toast.error('Erro: ' + error.message); },
  });

  const priorizar = useMutation({
    mutationFn: async ({ sprintId }: { sprintId?: string } = {}) => {
      const selecionados = chamados.filter(c => c.selecionado_mes);
      if (selecionados.length === 0) throw new Error('Nenhum chamado selecionado');

      const totalHoras = selecionados.reduce((sum, c) => sum + (c.esforco || 0), 0);
      let targetSprintId: string;
      let dataFimStr: string;

      if (sprintId) {
        // Use existing sprint
        targetSprintId = sprintId;
        
        // Get sprint data_fim and update horas_totais
        const { data: existingSprint, error: fetchError } = await supabase
          .from('sprints')
          .select('*')
          .eq('id', sprintId)
          .single();
        
        if (fetchError) throw fetchError;
        
        dataFimStr = existingSprint.data_fim || new Date().toISOString().split('T')[0];
        
        // Update sprint horas_totais
        const { error: updateError } = await supabase
          .from('sprints')
          .update({ horas_totais: existingSprint.horas_totais + totalHoras })
          .eq('id', sprintId);
        
        if (updateError) throw updateError;
      } else {
        // Create new sprint
        const { data: lastSprint } = await supabase.from('sprints').select('numero').order('numero', { ascending: false }).limit(1).single();
        const nextNumber = (lastSprint?.numero || 0) + 1;
        
        // Calculate default end date (2 weeks from now)
        const dataFim = new Date();
        dataFim.setDate(dataFim.getDate() + 14);
        dataFimStr = dataFim.toISOString().split('T')[0];

        // Create sprint with data_fim
        const { data: sprint, error: sprintError } = await supabase.from('sprints').insert({
          numero: nextNumber,
          nome: `Sprint ${nextNumber}`,
          horas_totais: totalHoras,
          status: 'planejada',
          data_fim: dataFimStr
        }).select().single();

        if (sprintError) throw sprintError;
        targetSprintId = sprint.id;
      }

      // Update chamados with status including sprint name and data_previsto
      for (const chamado of selecionados) {
        await supabase.from('chamados').update({ 
          status: 'Priorizado', 
          sprint_id: targetSprintId, 
          selecionado_mes: false,
          data_previsto: dataFimStr
        }).eq('id', chamado.id);
      }

      // Log audit action
      if (user && profile) {
        const numeros = selecionados.map(c => c.numero).join(', ');
        await logAuditAction(
          user.id,
          profile.full_name || profile.email,
          profile.email,
          `Priorizou ${selecionados.length} chamado(s) para sprint: ${numeros}`,
          'sprint',
          targetSprintId
        );
      }

      return { isNewSprint: !sprintId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['chamados'] });
      queryClient.invalidateQueries({ queryKey: ['sprints'] });
      toast.success(data?.isNewSprint ? 'Sprint criada com sucesso!' : 'Chamados adicionados à sprint!');
    },
    onError: (error) => { toast.error('Erro: ' + error.message); },
  });

  // Send to Escritório de Processos
  const enviarEscritorioProcessos = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const currentChamado = chamados.find(c => c.id === id);
      if (!currentChamado) throw new Error('Chamado não encontrado');
      
      // Save current status before changing
      const statusAtual = currentChamado.status || 'Aguard. GUT';
      
      const { error } = await supabase
        .from('chamados')
        .update({ 
          status: 'Em mapeamento com Escritório de Processos',
          status_anterior: statusAtual
        })
        .eq('id', id);
      
      if (error) throw error;
      
      // Log audit action
      if (user && profile) {
        await logAuditAction(
          user.id,
          profile.full_name || profile.email,
          profile.email,
          `Enviou chamado ${currentChamado.numero} para Escritório de Processos`,
          'chamado',
          currentChamado.numero
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chamados'] });
      toast.success('Chamado enviado para Escritório de Processos');
    },
    onError: (error) => { toast.error('Erro: ' + error.message); },
  });

  // Return from Escritório de Processos to previous status
  const retornarDoEscritorioProcessos = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const currentChamado = chamados.find(c => c.id === id);
      if (!currentChamado) throw new Error('Chamado não encontrado');
      
      // Restore previous status
      const statusAnterior = (currentChamado as any).status_anterior || 'Aguard. GUT';
      
      const { error } = await supabase
        .from('chamados')
        .update({ 
          status: statusAnterior,
          status_anterior: null
        })
        .eq('id', id);
      
      if (error) throw error;
      
      // Log audit action
      if (user && profile) {
        await logAuditAction(
          user.id,
          profile.full_name || profile.email,
          profile.email,
          `Retornou chamado ${currentChamado.numero} do Escritório de Processos para "${statusAnterior}"`,
          'chamado',
          currentChamado.numero
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chamados'] });
      toast.success('Chamado retornado ao status anterior');
    },
    onError: (error) => { toast.error('Erro: ' + error.message); },
  });

  // Cancel chamado
  const cancelarChamado = useMutation({
    mutationFn: async ({ 
      id, 
      motivo, 
      evidenciaUrl 
    }: { 
      id: string; 
      motivo: string; 
      evidenciaUrl?: string | null;
    }) => {
      const currentChamado = chamados.find(c => c.id === id);
      if (!currentChamado) throw new Error('Chamado não encontrado');
      
      const { error } = await supabase
        .from('chamados')
        .update({ 
          cancelado: true,
          motivo_cancelamento: motivo,
          evidencia_cancelamento_url: evidenciaUrl || null,
          cancelado_em: new Date().toISOString(),
          cancelado_por: user?.id,
          status_anterior: currentChamado.status || 'Desconhecido'
        })
        .eq('id', id);
      
      if (error) throw error;
      
      // Log audit action
      if (user && profile) {
        await logAuditAction(
          user.id,
          profile.full_name || profile.email,
          profile.email,
          `Cancelou chamado ${currentChamado.numero}. Motivo: ${motivo}`,
          'chamado',
          currentChamado.numero
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chamados'] });
      queryClient.invalidateQueries({ queryKey: ['chamados-cancelados'] });
      toast.success('Chamado cancelado com sucesso');
    },
    onError: (error) => { toast.error('Erro: ' + error.message); },
  });

  // Toggle Spec status
  const toggleSpec = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const currentChamado = chamados.find(c => c.id === id);
      if (!currentChamado) throw new Error('Chamado não encontrado');
      
      const isCurrentlySpec = (currentChamado as any).spec_ativo === true;
      
      if (isCurrentlySpec) {
        // Deactivating spec - calculate business days and accumulate
        const specInicio = (currentChamado as any).spec_inicio;
        let diasAdicionais = 0;
        if (specInicio) {
          diasAdicionais = calculateBusinessDays(new Date(specInicio), new Date());
        }
        const diasAcumulados = ((currentChamado as any).spec_dias_acumulados || 0) + diasAdicionais;
        
        const { error } = await supabase
          .from('chamados')
          .update({ 
            spec_ativo: false,
            spec_inicio: null,
            spec_dias_acumulados: diasAcumulados
          })
          .eq('id', id);
        
        if (error) throw error;
        
        if (user && profile) {
          await logAuditAction(
            user.id,
            profile.full_name || profile.email,
            profile.email,
            `Desativou Spec do chamado ${currentChamado.numero} (${diasAdicionais} dias úteis neste período, ${diasAcumulados} total)`,
            'chamado',
            currentChamado.numero
          );
        }
      } else {
        // Activating spec
        const { error } = await supabase
          .from('chamados')
          .update({ 
            spec_ativo: true,
            spec_inicio: new Date().toISOString()
          })
          .eq('id', id);
        
        if (error) throw error;
        
        if (user && profile) {
          await logAuditAction(
            user.id,
            profile.full_name || profile.email,
            profile.email,
            `Ativou Spec para o chamado ${currentChamado.numero}`,
            'chamado',
            currentChamado.numero
          );
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chamados'] });
      toast.success('Status Spec atualizado');
    },
    onError: (error) => { toast.error('Erro: ' + error.message); },
  });

  return {
    chamados, isLoading, error, isAdmin, isTI, isEscritorio, canViewAll, subscribeToChanges,
    updateGUT: updateGUT.mutate, updateEsforco: updateEsforco.mutate,
    updateArea: updateArea.mutate,
    toggleSelecionado: toggleSelecionado.mutate, priorizar: priorizar.mutate,
    limparSelecao: limparSelecao.mutate, isLimpandoSelecao: limparSelecao.isPending,
    isPriorizando: priorizar.isPending,
    enviarEscritorioProcessos: enviarEscritorioProcessos.mutate,
    retornarDoEscritorioProcessos: retornarDoEscritorioProcessos.mutate,
    cancelarChamado: cancelarChamado.mutate,
    isCancelando: cancelarChamado.isPending,
    toggleSpec: toggleSpec.mutate,
  };
}
