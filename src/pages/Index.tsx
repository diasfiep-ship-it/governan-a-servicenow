import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Header from '@/components/Header';
import PriorizacaoAreaTab from '@/components/PriorizacaoAreaTab';
import PriorizacaoTecnicaTab from '@/components/PriorizacaoTecnicaTab';
import SprintsTab from '@/components/SprintsTab';
import GestaoMudancaTab from '@/components/GestaoMudancaTab';
import ChamadosCanceladosTab from '@/components/ChamadosCanceladosTab';
import HistoricoTab from '@/components/HistoricoTab';
import { UsersTab } from '@/components/UsersTab';
import { AreasTab } from '@/components/AreasTab';
import UploadExcel from '@/components/UploadExcel';
import ExportButton from '@/components/ExportButton';
import ImportButton from '@/components/ImportButton';
import { Loader2, LayoutGrid, Zap, Calendar, Users, FileCheck, Building2, XCircle, History, Clock } from 'lucide-react';
import { isAdminRole, isEscritorioProcessos } from '@/types';
import { useLastBaseUpdate } from '@/hooks/useLastBaseUpdate';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function Index() {
  const { user, profile, roles, loading } = useAuth();
  const { data: lastUpdate } = useLastBaseUpdate();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (profile?.must_change_password) {
    return <Navigate to="/change-password" replace />;
  }

  if (!roles || roles.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-foreground mb-2">Sem Perfil Atribuído</h1>
          <p className="text-muted-foreground">Entre em contato com o administrador.</p>
        </div>
      </div>
    );
  }

  const isAdmin = roles.some(r => isAdminRole(r));
  const isTI = roles.includes('TI');
  const isEscritorio = roles.some(r => isEscritorioProcessos(r));

  // TI: only sees Priorização Técnica and Sprints
  // Escritório de Processos: sees Priorização Técnica, Sprints, and Priorização por Área (filtered to their area)
  // ADM: sees all tabs
  // Other roles: only see Priorização por Área
  const defaultTab = isTI ? 'tecnica' : 'area';

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="mx-auto px-4 py-6 max-w-[1920px]">
        <Tabs defaultValue={defaultTab} className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <TabsList className="grid w-full sm:w-auto grid-cols-2 sm:grid-cols-none sm:flex flex-wrap">
              {/* Priorização por Área - ADM, area roles, and Escritório de Processos (not TI) */}
              {!isTI && (
                <TabsTrigger value="area" className="gap-2">
                  <LayoutGrid className="h-4 w-4" />
                  <span className="hidden sm:inline">Priorização por</span> Área
                </TabsTrigger>
              )}
              
              {/* Priorização Técnica and Sprints - ADM, TI, and Escritório */}
              {(isAdmin || isTI || isEscritorio) && (
                <>
                  <TabsTrigger value="tecnica" className="gap-2">
                    <Zap className="h-4 w-4" />
                    <span className="hidden sm:inline">Priorização</span> Técnica
                  </TabsTrigger>
                  <TabsTrigger value="sprints" className="gap-2">
                    <Calendar className="h-4 w-4" />
                    Sprints
                  </TabsTrigger>
                </>
              )}
              
              {/* Gestão de Mudança - only ADM */}
              {isAdmin && (
                <TabsTrigger value="gestao-mudanca" className="gap-2">
                  <FileCheck className="h-4 w-4" />
                  <span className="hidden sm:inline">Gestão de</span> Mudança
                </TabsTrigger>
              )}
              
              {/* Chamados Cancelados - only ADM */}
              {isAdmin && (
                <TabsTrigger value="cancelados" className="gap-2">
                  <XCircle className="h-4 w-4" />
                  Cancelados
                </TabsTrigger>
              )}
              
              {/* Usuários - only ADM */}
              {isAdmin && (
                <TabsTrigger value="usuarios" className="gap-2">
                  <Users className="h-4 w-4" />
                  Usuários
                </TabsTrigger>
              )}
              
              {/* Áreas - only ADM */}
              {isAdmin && (
                <TabsTrigger value="areas" className="gap-2">
                  <Building2 className="h-4 w-4" />
                  Áreas
                </TabsTrigger>
              )}
              
              {/* Histórico - only ADM */}
              {isAdmin && (
                <TabsTrigger value="historico" className="gap-2">
                  <History className="h-4 w-4" />
                  Histórico
                </TabsTrigger>
              )}
            </TabsList>

            {(isAdmin || isTI) && (
              <div className="flex flex-col items-end gap-1 w-full sm:w-auto">
                {isAdmin && (
                  <div className="flex gap-2 w-full sm:w-auto">
                    <UploadExcel />
                    <ExportButton />
                    <ImportButton />
                  </div>
                )}
                {lastUpdate && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    <span>
                      Última atualização: {format(new Date(lastUpdate.updated_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </span>
                    <span className="text-muted-foreground/70">
                      ({lastUpdate.file_name})
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Priorização por Área - for non-TI users (including Escritório de Processos) */}
          {!isTI && (
            <TabsContent value="area" className="mt-0">
              <PriorizacaoAreaTab />
            </TabsContent>
          )}

          {/* Priorização Técnica and Sprints - ADM, TI, and Escritório */}
          {(isAdmin || isTI || isEscritorio) && (
            <>
              <TabsContent value="tecnica" className="mt-0">
                <PriorizacaoTecnicaTab />
              </TabsContent>
              <TabsContent value="sprints" className="mt-0">
                <SprintsTab />
              </TabsContent>
            </>
          )}

          {/* Gestão de Mudança - only ADM */}
          {isAdmin && (
            <TabsContent value="gestao-mudanca" className="mt-0">
              <GestaoMudancaTab />
            </TabsContent>
          )}

          {/* Chamados Cancelados - only ADM */}
          {isAdmin && (
            <TabsContent value="cancelados" className="mt-0">
              <ChamadosCanceladosTab />
            </TabsContent>
          )}

          {/* Usuários - only ADM */}
          {isAdmin && (
            <TabsContent value="usuarios" className="mt-0">
              <UsersTab />
            </TabsContent>
          )}

          {/* Áreas - only ADM */}
          {isAdmin && (
            <TabsContent value="areas" className="mt-0">
              <AreasTab />
            </TabsContent>
          )}

          {/* Histórico - only ADM */}
          {isAdmin && (
            <TabsContent value="historico" className="mt-0">
              <HistoricoTab />
            </TabsContent>
          )}
        </Tabs>
      </main>
    </div>
  );
}
