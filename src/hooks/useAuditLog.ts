import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Json } from '@/integrations/supabase/types';

export interface AuditLogEntry {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Json | null;
  created_at: string;
}

export function useAuditLog() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();

  // Fetch audit logs (admin only)
  const { data: logs = [], isLoading, refetch } = useQuery({
    queryKey: ['audit-log'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;
      return data as AuditLogEntry[];
    },
  });

  // Log an action
  const logAction = useMutation({
    mutationFn: async ({
      action,
      entityType,
      entityId,
      details,
    }: {
      action: string;
      entityType: string;
      entityId?: string;
      details?: Json;
    }) => {
      if (!user || !profile) return;

      const { error } = await supabase.from('audit_log').insert([{
        user_id: user.id,
        user_name: profile.full_name || profile.email,
        user_email: profile.email,
        action,
        entity_type: entityType,
        entity_id: entityId || null,
        details: details || null,
      }]);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit-log'] });
    },
  });

  return {
    logs,
    isLoading,
    refetch,
    logAction: logAction.mutate,
  };
}
