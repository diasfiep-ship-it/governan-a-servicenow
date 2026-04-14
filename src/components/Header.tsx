import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import ThemeToggle from './ThemeToggle';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { Building2, ChevronDown, LogOut, User } from 'lucide-react';

// Helper to format role for display
function formatRoleDisplay(roles: string[]): string {
  if (!roles || roles.length === 0) return 'Sem perfil';
  
  const systemRoles = ['ADM', 'ADM_TI', 'TI'];
  const foundSystemRole = roles.find(r => systemRoles.includes(r));
  if (foundSystemRole) return foundSystemRole;
  
  const firstRole = roles[0];
  return firstRole
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export default function Header() {
  const { profile, roles, signOut } = useAuth();

  return (
    <header className="gradient-header border-b border-sidebar-border">
      <div className="h-16 px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
            <Building2 className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">
              Governança de Priorização
            </h1>
            <p className="text-xs text-white/70">
              Chamados de Melhoria Service Now
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">

          <ThemeToggle />
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                className="h-auto py-2 px-3 text-white hover:bg-white/10"
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-primary/30 flex items-center justify-center">
                    <User className="h-4 w-4 text-white" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium">{profile?.full_name || profile?.email}</p>
                    <p className="text-xs text-white/70">
                      {formatRoleDisplay(roles)}
                    </p>
                  </div>
                  <ChevronDown className="h-4 w-4 text-white/70" />
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Minha Conta</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-muted-foreground">
                <User className="mr-2 h-4 w-4" />
                {profile?.email}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={signOut}
                className="text-destructive focus:text-destructive"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sair do Sistema
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
