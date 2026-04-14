import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

export interface UserWithRole {
  id: string;
  email: string;
  full_name: string;
  roles: string[];
  role: string | null; // Keep for backward compatibility
  area_id: string | null;
  area_nome: string | null;
  must_change_password: boolean;
  created_at: string;
}

interface CreateUserData {
  email: string;
  password: string;
  full_name: string;
  roles: string[];
  area_id?: string | null;
}

interface UpdateUserData {
  id: string;
  full_name?: string;
  roles?: string[];
  area_id?: string | null;
  reset_password?: boolean;
  password?: string;
  force_password_change?: boolean;
}

export function useUsers() {
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { session } = useAuth();

  const fetchUsers = useCallback(async () => {
    if (!session?.access_token) {
      console.log('No session, skipping fetch users');
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-users', {
        body: { action: 'list' }
      });

      if (error) {
        console.error('Error fetching users:', error);
        toast.error('Erro ao carregar usuários');
        return;
      }

      if (data.error) {
        console.error('API Error:', data.error);
        toast.error(data.error);
        return;
      }

      // Ensure all users have roles array
      const usersWithRoles = (data.users || []).map((user: UserWithRole) => ({
        ...user,
        roles: user.roles || (user.role ? [user.role] : []),
        area_id: user.area_id || null,
        area_nome: user.area_nome || null
      }));

      setUsers(usersWithRoles);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('Erro ao carregar usuários');
    } finally {
      setIsLoading(false);
    }
  }, [session?.access_token]);

  const createUser = useCallback(async (userData: CreateUserData) => {
    if (!session?.access_token) {
      toast.error('Você precisa estar logado');
      return false;
    }

    setIsCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-users', {
        body: { 
          action: 'create',
          data: userData
        }
      });

      if (error) {
        console.error('Error creating user:', error);
        toast.error('Erro ao criar usuário');
        return false;
      }

      if (data.error) {
        console.error('API Error:', data.error);
        toast.error(data.error);
        return false;
      }

      toast.success('Usuário criado com sucesso');
      await fetchUsers();
      return true;
    } catch (error) {
      console.error('Error creating user:', error);
      toast.error('Erro ao criar usuário');
      return false;
    } finally {
      setIsCreating(false);
    }
  }, [session?.access_token, fetchUsers]);

  const updateUser = useCallback(async (userData: UpdateUserData) => {
    if (!session?.access_token) {
      toast.error('Você precisa estar logado');
      return false;
    }

    setIsUpdating(true);
    try {
      console.log('Updating user with data:', userData);
      
      const { data, error } = await supabase.functions.invoke('manage-users', {
        body: { 
          action: 'update',
          data: userData
        }
      });

      console.log('Update response:', { data, error });

      if (error) {
        console.error('Error updating user:', error);
        toast.error('Erro ao atualizar usuário: ' + (error.message || 'Erro desconhecido'));
        return false;
      }

      if (data?.error) {
        console.error('API Error:', data.error);
        toast.error(data.error);
        return false;
      }

      toast.success('Usuário atualizado com sucesso');
      await fetchUsers();
      return true;
    } catch (error) {
      console.error('Error updating user:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      toast.error('Erro ao atualizar usuário: ' + errorMessage);
      return false;
    } finally {
      setIsUpdating(false);
    }
  }, [session?.access_token, fetchUsers]);

  const deleteUser = useCallback(async (userId: string) => {
    if (!session?.access_token) {
      toast.error('Você precisa estar logado');
      return false;
    }

    setIsDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-users', {
        body: { 
          action: 'delete',
          data: { id: userId }
        }
      });

      if (error) {
        console.error('Error deleting user:', error);
        toast.error('Erro ao excluir usuário');
        return false;
      }

      if (data.error) {
        console.error('API Error:', data.error);
        toast.error(data.error);
        return false;
      }

      toast.success('Usuário excluído com sucesso');
      await fetchUsers();
      return true;
    } catch (error) {
      console.error('Error deleting user:', error);
      toast.error('Erro ao excluir usuário');
      return false;
    } finally {
      setIsDeleting(false);
    }
  }, [session?.access_token, fetchUsers]);

  return {
    users,
    isLoading,
    isCreating,
    isUpdating,
    isDeleting,
    fetchUsers,
    createUser,
    updateUser,
    deleteUser
  };
}