import { useState, useEffect, useMemo } from 'react';
import { useUsers, UserWithRole } from '@/hooks/useUsers';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Search, 
  Pencil, 
  Trash2, 
  Loader2,
  UserPlus,
  Users,
  KeyRound,
  Shield,
  Building2
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// System roles - these are fixed
const SYSTEM_ROLES = ['ADM', 'TI', 'ESCRITORIO_PROCESSOS'];

const SYSTEM_ROLE_DISPLAY_NAMES: Record<string, string> = {
  'ADM': 'Administrador (ADM)',
  'TI': 'Tecnologia da Informação (TI)',
  'ESCRITORIO_PROCESSOS': 'Escritório de Processos'
};

const getRoleBadgeVariant = (role: string): "default" | "secondary" | "destructive" | "outline" => {
  if (role === 'ADM') return 'destructive';
  if (role === 'TI') return 'default';
  if (role === 'ESCRITORIO_PROCESSOS') return 'default';
  return 'secondary';
};

// Helper to format area name for display
function formatAreaName(area: string): string {
  return area
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Helper to normalize string for comparison (remove accents and uppercase)
function normalizeForComparison(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .toUpperCase();
}

export function UsersTab() {
  const { 
    users, 
    isLoading, 
    isCreating, 
    isUpdating, 
    isDeleting,
    fetchUsers, 
    createUser, 
    updateUser, 
    deleteUser 
  } = useUsers();

  // Fetch unique areas from chamados to use as dynamic roles (case-insensitive deduplication)
  const { data: areaRoles = [] } = useQuery({
    queryKey: ['area-roles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chamados')
        .select('area_demandante');
      
      if (error) throw error;
      
      // Get unique areas with case-insensitive and accent-insensitive deduplication
      // Keep the first occurrence of each area (by normalized key)
      const areaMap = new Map<string, string>();
      data.forEach(c => {
        const normalizedKey = normalizeForComparison(c.area_demandante);
        if (!areaMap.has(normalizedKey)) {
          areaMap.set(normalizedKey, c.area_demandante);
        }
      });
      
      return Array.from(areaMap.values()).sort((a, b) => 
        normalizeForComparison(a).localeCompare(normalizeForComparison(b))
      );
    },
  });

  // Helper to get display name for a role
  const getRoleDisplayName = (role: string): string => {
    if (SYSTEM_ROLE_DISPLAY_NAMES[role]) {
      return SYSTEM_ROLE_DISPLAY_NAMES[role];
    }
    // For area-based roles, format the name nicely
    return formatAreaName(role);
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithRole | null>(null);

  // Form states for create
  const [newEmail, setNewEmail] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newPassword, setNewPassword] = useState('123');
  const [newRoles, setNewRoles] = useState<string[]>([]);

  // Form states for edit
  const [editFullName, setEditFullName] = useState('');
  const [editRoles, setEditRoles] = useState<string[]>([]);
  const [resetPassword, setResetPassword] = useState(false);
  const [newPasswordForReset, setNewPasswordForReset] = useState('123');
  const [forcePasswordChange, setForcePasswordChange] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const filteredUsers = users.filter(user => {
    const searchLower = searchTerm.toLowerCase();
    const rolesMatch = user.roles.some(role => 
      getRoleDisplayName(role).toLowerCase().includes(searchLower)
    );
    return (
      user.email.toLowerCase().includes(searchLower) ||
      user.full_name?.toLowerCase().includes(searchLower) ||
      rolesMatch
    );
  });

  const handleCreateUser = async () => {
    if (!newEmail || !newPassword || newRoles.length === 0) {
      return;
    }

    const success = await createUser({
      email: newEmail,
      password: newPassword,
      full_name: newFullName || newEmail,
      roles: newRoles
    });

    if (success) {
      setIsCreateModalOpen(false);
      resetCreateForm();
    }
  };

  const handleEditUser = async () => {
    if (!selectedUser) return;

    const success = await updateUser({
      id: selectedUser.id,
      full_name: editFullName || undefined,
      roles: editRoles.length > 0 ? editRoles : undefined,
      reset_password: resetPassword,
      password: resetPassword ? newPasswordForReset : undefined,
      force_password_change: forcePasswordChange
    });

    if (success) {
      setIsEditModalOpen(false);
      resetEditForm();
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;

    const success = await deleteUser(selectedUser.id);

    if (success) {
      setIsDeleteDialogOpen(false);
      setSelectedUser(null);
    }
  };

  const openEditModal = (user: UserWithRole) => {
    setSelectedUser(user);
    setEditFullName(user.full_name || '');
    setEditRoles(user.roles || []);
    setResetPassword(false);
    setNewPasswordForReset('123');
    setForcePasswordChange(user.must_change_password);
    setIsEditModalOpen(true);
  };

  const openDeleteDialog = (user: UserWithRole) => {
    setSelectedUser(user);
    setIsDeleteDialogOpen(true);
  };

  const resetCreateForm = () => {
    setNewEmail('');
    setNewFullName('');
    setNewPassword('123');
    setNewRoles([]);
  };

  const resetEditForm = () => {
    setSelectedUser(null);
    setEditFullName('');
    setEditRoles([]);
    setResetPassword(false);
    setNewPasswordForReset('123');
    setForcePasswordChange(false);
  };

  const toggleRole = (role: string, isCreate: boolean) => {
    if (isCreate) {
      setNewRoles(prev => 
        prev.includes(role) 
          ? prev.filter(r => r !== role)
          : [...prev, role]
      );
    } else {
      setEditRoles(prev => 
        prev.includes(role) 
          ? prev.filter(r => r !== role)
          : [...prev, role]
      );
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Gerenciamento de Usuários</h2>
          <Badge variant="outline" className="ml-2">
            {users.length} usuários
          </Badge>
        </div>
        
        <Button onClick={() => setIsCreateModalOpen(true)} className="gap-2">
          <UserPlus className="h-4 w-4" />
          Novo Usuário
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por email, nome ou perfil..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-x-auto w-full">
        <ScrollArea className="h-[calc(100vh-350px)]">
          <Table className="table-corporate w-full min-w-[900px]">
            <TableHeader>
              <TableRow className="bg-table-header hover:bg-table-header">
                <TableHead className="text-table-header-foreground">Email</TableHead>
                <TableHead className="text-table-header-foreground">Nome</TableHead>
                <TableHead className="text-table-header-foreground">Perfis</TableHead>
                <TableHead className="text-table-header-foreground">Trocar Senha</TableHead>
                <TableHead className="text-table-header-foreground">Criado em</TableHead>
                <TableHead className="text-table-header-foreground text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                    <span className="text-muted-foreground mt-2 block">Carregando usuários...</span>
                  </TableCell>
                </TableRow>
              ) : filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <span className="text-muted-foreground">
                      {searchTerm ? 'Nenhum usuário encontrado' : 'Nenhum usuário cadastrado'}
                    </span>
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.email}</TableCell>
                    <TableCell>{user.full_name}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {user.roles.length > 0 ? (
                          user.roles.map(role => (
                            <Badge key={role} variant={getRoleBadgeVariant(role)} className="text-xs">
                              {getRoleDisplayName(role)}
                            </Badge>
                          ))
                        ) : (
                          <Badge variant="outline">Sem perfil</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {user.must_change_password ? (
                        <Badge variant="outline" className="text-amber-600 border-amber-600">
                          <KeyRound className="h-3 w-3 mr-1" />
                          Pendente
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.created_at 
                        ? format(new Date(user.created_at), "dd/MM/yyyy", { locale: ptBR })
                        : '-'
                      }
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditModal(user)}
                          className="gap-1"
                        >
                          <Pencil className="h-4 w-4" />
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openDeleteDialog(user)}
                          className="gap-1 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                          Excluir
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>

      {/* Create User Modal */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Novo Usuário
            </DialogTitle>
            <DialogDescription>
              Preencha os dados para criar um novo usuário no sistema.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                placeholder="usuario@exemplo.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="fullName">Nome Completo</Label>
              <Input
                id="fullName"
                placeholder="Nome do usuário"
                value={newFullName}
                onChange={(e) => setNewFullName(e.target.value)}
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="password">Senha Inicial *</Label>
              <Input
                id="password"
                type="text"
                placeholder="Senha inicial"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <span className="text-xs text-muted-foreground">
                O usuário será solicitado a trocar a senha no primeiro acesso.
              </span>
            </div>
            
            <div className="grid gap-2">
              <Label>Perfis de Acesso * (selecione um ou mais)</Label>
              <div className="grid grid-cols-1 gap-2 max-h-[250px] overflow-y-auto border rounded-md p-3">
                {/* System Roles Section */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium pb-1">
                  <Shield className="h-3 w-3" />
                  Perfis de Sistema
                </div>
                {SYSTEM_ROLES.map((role) => (
                  <div key={role} className="flex items-center space-x-2">
                    <Checkbox
                      id={`create-${role}`}
                      checked={newRoles.includes(role)}
                      onCheckedChange={() => toggleRole(role, true)}
                    />
                    <Label 
                      htmlFor={`create-${role}`} 
                      className="text-sm font-normal cursor-pointer flex-1"
                    >
                      {SYSTEM_ROLE_DISPLAY_NAMES[role]}
                    </Label>
                  </div>
                ))}
                
                <Separator className="my-2" />
                
                {/* Area-based Roles Section */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium pb-1">
                  <Building2 className="h-3 w-3" />
                  Áreas (dos Chamados)
                </div>
                {areaRoles.map((area) => (
                  <div key={area} className="flex items-center space-x-2">
                    <Checkbox
                      id={`create-${area}`}
                      checked={newRoles.includes(area)}
                      onCheckedChange={() => toggleRole(area, true)}
                    />
                    <Label 
                      htmlFor={`create-${area}`} 
                      className="text-sm font-normal cursor-pointer flex-1"
                    >
                      {formatAreaName(area)}
                    </Label>
                  </div>
                ))}
              </div>
              {newRoles.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {newRoles.map(role => (
                    <Badge key={role} variant={getRoleBadgeVariant(role)} className="text-xs">
                      {getRoleDisplayName(role)}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsCreateModalOpen(false); resetCreateForm(); }}>
              Cancelar
            </Button>
            <Button 
              onClick={handleCreateUser} 
              disabled={isCreating || !newEmail || !newPassword || newRoles.length === 0}
            >
              {isCreating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Criar Usuário
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5" />
              Editar Usuário
            </DialogTitle>
            <DialogDescription>
              {selectedUser?.email}
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="editFullName">Nome Completo</Label>
              <Input
                id="editFullName"
                placeholder="Nome do usuário"
                value={editFullName}
                onChange={(e) => setEditFullName(e.target.value)}
              />
            </div>
            
            <div className="grid gap-2">
              <Label>Perfis de Acesso (selecione um ou mais)</Label>
              <div className="grid grid-cols-1 gap-2 max-h-[250px] overflow-y-auto border rounded-md p-3">
                {/* System Roles Section */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium pb-1">
                  <Shield className="h-3 w-3" />
                  Perfis de Sistema
                </div>
                {SYSTEM_ROLES.map((role) => (
                  <div key={role} className="flex items-center space-x-2">
                    <Checkbox
                      id={`edit-${role}`}
                      checked={editRoles.includes(role)}
                      onCheckedChange={() => toggleRole(role, false)}
                    />
                    <Label 
                      htmlFor={`edit-${role}`} 
                      className="text-sm font-normal cursor-pointer flex-1"
                    >
                      {SYSTEM_ROLE_DISPLAY_NAMES[role]}
                    </Label>
                  </div>
                ))}
                
                <Separator className="my-2" />
                
                {/* Area-based Roles Section */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium pb-1">
                  <Building2 className="h-3 w-3" />
                  Áreas (dos Chamados)
                </div>
                {areaRoles.map((area) => (
                  <div key={area} className="flex items-center space-x-2">
                    <Checkbox
                      id={`edit-${area}`}
                      checked={editRoles.includes(area)}
                      onCheckedChange={() => toggleRole(area, false)}
                    />
                    <Label 
                      htmlFor={`edit-${area}`} 
                      className="text-sm font-normal cursor-pointer flex-1"
                    >
                      {formatAreaName(area)}
                    </Label>
                  </div>
                ))}
              </div>
              {editRoles.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {editRoles.map(role => (
                    <Badge key={role} variant={getRoleBadgeVariant(role)} className="text-xs">
                      {getRoleDisplayName(role)}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t pt-4 space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="resetPassword" 
                  checked={resetPassword}
                  onCheckedChange={(checked) => setResetPassword(checked as boolean)}
                />
                <Label htmlFor="resetPassword" className="text-sm font-normal cursor-pointer">
                  Resetar senha
                </Label>
              </div>

              {resetPassword && (
                <div className="grid gap-2 pl-6">
                  <Label htmlFor="newPasswordForReset">Nova Senha</Label>
                  <Input
                    id="newPasswordForReset"
                    type="text"
                    value={newPasswordForReset}
                    onChange={(e) => setNewPasswordForReset(e.target.value)}
                  />
                </div>
              )}

              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="forcePasswordChange" 
                  checked={forcePasswordChange}
                  onCheckedChange={(checked) => setForcePasswordChange(checked as boolean)}
                />
                <Label htmlFor="forcePasswordChange" className="text-sm font-normal cursor-pointer">
                  Forçar troca de senha no próximo login
                </Label>
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsEditModalOpen(false); resetEditForm(); }}>
              Cancelar
            </Button>
            <Button onClick={handleEditUser} disabled={isUpdating}>
              {isUpdating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Usuário</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o usuário <strong>{selectedUser?.email}</strong>?
              <br /><br />
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteUser}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}