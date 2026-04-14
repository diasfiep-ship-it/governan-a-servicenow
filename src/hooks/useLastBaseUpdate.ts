import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useLastBaseUpdate() {
  return useQuery({
    queryKey: ['last-base-update'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('base_updates')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
  });
}
