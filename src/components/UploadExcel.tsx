import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Loader2, RefreshCw, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { useAuth } from '@/contexts/AuthContext';
import type { Json } from '@/integrations/supabase/types';

// New Excel structure mapping
interface NewExcelRow {
  'Solicitado(a) para'?: string;
  'Descrição'?: string;
  'Número'?: string;
  'Item'?: string;
  'Estado'?: string;
  'Criação'?: string | number;
  'Grupo de atribuição'?: string;
  'Resolvido'?: string | number;
  'Encerrado por'?: string;
  'Encerrado'?: string | number;
  'Atribuído a'?: string;
  'Motivo do Cancelamento'?: string;
  'Motivo da Pendência'?: string;
  'Comentários e Anotações de trabalho'?: string;
  'Contagem de reabertura'?: number | string;
}

interface ImportResult {
  inserted: number;
  updated: number;
  skipped: number;
  hidden: number;
  errors: number;
  errorDetails: ImportError[];
}

interface ImportError {
  row: number;
  numero: string;
  message: string;
}

interface ChamadoRecord {
  id: string;
  numero: string;
  descricao: string | null;
  cliente: string | null;
  area_demandante: string;
  area: string | null;
  status: string | null;
  item: string | null;
  oferta: string | null;
  sla: string | null;
  estado: string | null;
  catalogo: string | null;
  grupo_atribuicao: string | null;
  motivo_pendencia: string | null;
  encerrado_por: string | null;
  data_abertura: string | null;
  data_previsto: string | null;
  data_resolvido: string | null;
  data_fechamento: string | null;
  data_encerramento: string | null;
  atribuido_a: string | null;
  gravidade: number | null;
  urgencia: number | null;
  tendencia: number | null;
  esforco: number | null;
  pontuacao_gut: number | null;
  prioridade_calculada: number | null;
  selecionado_mes: boolean | null;
  mes_priorizacao: string | null;
  sprint_id: string | null;
  data_conclusao: string | null;
  oculto: boolean | null;
  cancelado: boolean | null;
  cancelado_em: string | null;
  cancelado_por: string | null;
  status_anterior: string | null;
  motivo_cancelamento: string | null;
  evidencia_cancelamento_url: string | null;
  aguardando_cliente: boolean | null;
  area_modificada_por_admin: boolean | null;
  comentarios: string | null;
  contagem_reabertura: number | null;
  created_at: string;
  updated_at: string;
}

export default function UploadExcel() {
  const [isOpen, setIsOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isReverting, setIsReverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [hasBackup, setHasBackup] = useState(false);
  const [backupInfo, setBackupInfo] = useState<{ date: string; count: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Check if backup exists on component mount
  const checkBackup = async () => {
    const { data } = await supabase
      .from('chamados_backup')
      .select('backup_date, backup_count')
      .order('backup_date', { ascending: false })
      .limit(1)
      .single();
    
    if (data) {
      setHasBackup(true);
      setBackupInfo({
        date: new Date(data.backup_date).toLocaleString('pt-BR'),
        count: data.backup_count
      });
    } else {
      setHasBackup(false);
      setBackupInfo(null);
    }
  };

  // Check backup when dialog opens
  const handleDialogOpen = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      checkBackup();
    } else {
      resetDialog();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.type !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' &&
          selectedFile.type !== 'application/vnd.ms-excel') {
        toast.error('Por favor, selecione um arquivo Excel válido (.xlsx ou .xls)');
        return;
      }
      setFile(selectedFile);
      setResult(null);
    }
  };

  // Parse Excel date - handles multiple formats including "M/D/YY H:MM"
  const parseExcelDate = (value: string | number | undefined): string | null => {
    if (!value) return null;
    
    // If it's a number (Excel serial date)
    if (typeof value === 'number') {
      const date = XLSX.SSF.parse_date_code(value);
      if (date) {
        return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
      }
    }
    
    // If it's a string
    if (typeof value === 'string') {
      // Try format "M/D/YY H:MM" or "M/D/YY"
      const dateTimeParts = value.split(' ');
      const datePart = dateTimeParts[0];
      const parts = datePart.split('/');
      
      if (parts.length === 3) {
        let [month, day, year] = parts;
        // Handle 2-digit year
        if (year.length === 2) {
          const yearNum = parseInt(year);
          year = yearNum > 50 ? `19${year}` : `20${year}`;
        }
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
    }
    
    return null;
  };

  // Parse Excel datetime to ISO string
  const parseExcelDateTime = (value: string | number | undefined): string | null => {
    const dateStr = parseExcelDate(value);
    if (!dateStr) return null;
    return `${dateStr}T00:00:00.000Z`;
  };

  const getErrorMessage = (error: { code?: string; message?: string; details?: string }): string => {
    if (error.code === '42501' || error.message?.includes('row-level security')) {
      return 'Sem permissão para inserir. Verifique se você está logado como administrador.';
    }
    if (error.code === '23505') {
      return 'Chamado com este número já existe na base.';
    }
    if (error.code === '23502') {
      const match = error.message?.match(/null value in column "(\w+)"/);
      const column = match?.[1] || 'desconhecido';
      return `Campo obrigatório "${column}" está vazio.`;
    }
    if (error.code === '23503') {
      return 'Referência inválida a outra tabela.';
    }
    if (error.code === '23514') {
      return 'Valor inválido para um dos campos.';
    }
    if (error.code === '22P02') {
      return 'Formato de dados inválido em um dos campos.';
    }
    if (error.code === '22007' || error.message?.includes('date')) {
      return 'Formato de data inválido.';
    }
    return error.message || 'Erro desconhecido ao inserir.';
  };

  // Determine status based on Estado column
  // IMPORTANT: "Resolvido" or "Encerrado concluído" ALWAYS means the ticket is concluded,
  // regardless of having a sprint_id. This takes priority over sprint status.
  const determineStatus = (estado: string | undefined, existingChamado: any): { 
    status: string; 
    oculto: boolean;
    aguardandoCliente: boolean;
    cancelado: boolean;
    dataConclusao: string | null;
  } => {
    const estadoNorm = (estado || '').toLowerCase().trim();
    
    // Default values
    let status = 'Aguard. GUT';
    let oculto = false;
    let aguardandoCliente = false;
    let cancelado = false;
    let dataConclusao: string | null = null;

    // PRIORITY 1: Check if Estado indicates the ticket is resolved/closed
    // This MUST take priority over sprint status because if ServiceNow says it's resolved, it's resolved
    if (estadoNorm.includes('resolvido') || estadoNorm === 'encerrado concluído' || estadoNorm === 'encerrado concluido' || estadoNorm === 'encerrado') {
      status = 'Concluído';
      dataConclusao = existingChamado?.data_conclusao || null; // Will be set by caller with Resolvido date
    }
    // PRIORITY 2: Check if Estado indicates cancellation
    else if (estadoNorm.includes('cancelado')) {
      cancelado = true;
      status = 'Cancelado';
    }
    // PRIORITY 3: If already concluded in our system, keep as Concluído
    else if (existingChamado?.data_conclusao) {
      status = 'Concluído';
      dataConclusao = existingChamado.data_conclusao;
    }
    // PRIORITY 4: If has sprint and still open, keep as Priorizado
    else if (existingChamado?.sprint_id) {
      status = 'Priorizado';
    }
    // PRIORITY 5: Keep existing status or default
    else if (estadoNorm === 'em aberto' || estadoNorm === 'aberto' || estadoNorm.includes('trabalho em andamento')) {
      status = existingChamado?.status || 'Aguard. GUT';
    }

    return { status, oculto, aguardandoCliente, cancelado, dataConclusao };
  };

  // Normalize name for comparison (lowercase, remove accents, trim)
  const normalizeName = (name: string): string => {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  };

  // Create backup of all chamados before update
  const createBackup = async (): Promise<boolean> => {
    if (!user) return false;

    try {
      // Delete previous backup (keep only one)
      await supabase
        .from('chamados_backup')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

      // Fetch all current chamados
      const { data: allChamados, error: fetchError } = await supabase
        .from('chamados')
        .select('*');

      if (fetchError) {
        console.error('Error fetching chamados for backup:', fetchError);
        return false;
      }

      if (!allChamados || allChamados.length === 0) {
        // No chamados to backup, but that's OK
        return true;
      }

      // Insert backup as a single record with all chamados data
      const { error: insertError } = await supabase
        .from('chamados_backup')
        .insert({
          backup_by: user.id,
          backup_count: allChamados.length,
          chamado_data: allChamados as unknown as Json
        });

      if (insertError) {
        console.error('Error creating backup:', insertError);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error in createBackup:', error);
      return false;
    }
  };

  // Revert to backup
  const handleRevert = async () => {
    if (!user) return;

    setIsReverting(true);
    
    try {
      // Fetch the backup
      const { data: backup, error: fetchError } = await supabase
        .from('chamados_backup')
        .select('*')
        .order('backup_date', { ascending: false })
        .limit(1)
        .single();

      if (fetchError || !backup) {
        toast.error('Nenhum backup encontrado para reverter.');
        setIsReverting(false);
        return;
      }

      const chamadosData = backup.chamado_data as unknown as ChamadoRecord[];

      if (!Array.isArray(chamadosData)) {
        toast.error('Dados do backup estão corrompidos.');
        setIsReverting(false);
        return;
      }

      // Delete all current chamados
      const { error: deleteError } = await supabase
        .from('chamados')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

      if (deleteError) {
        toast.error('Erro ao limpar chamados atuais: ' + deleteError.message);
        setIsReverting(false);
        return;
      }

      // Insert all chamados from backup in batches
      const batchSize = 100;
      for (let i = 0; i < chamadosData.length; i += batchSize) {
        const batch = chamadosData.slice(i, i + batchSize).map(chamado => ({
          id: chamado.id,
          numero: chamado.numero,
          descricao: chamado.descricao,
          cliente: chamado.cliente,
          area_demandante: chamado.area_demandante,
          area: chamado.area,
          status: chamado.status,
          item: chamado.item,
          oferta: chamado.oferta,
          sla: chamado.sla,
          estado: chamado.estado,
          catalogo: chamado.catalogo,
          grupo_atribuicao: chamado.grupo_atribuicao,
          motivo_pendencia: chamado.motivo_pendencia,
          encerrado_por: chamado.encerrado_por,
          data_abertura: chamado.data_abertura,
          data_previsto: chamado.data_previsto,
          data_resolvido: chamado.data_resolvido,
          data_fechamento: chamado.data_fechamento,
          data_encerramento: chamado.data_encerramento,
          atribuido_a: chamado.atribuido_a,
          gravidade: chamado.gravidade,
          urgencia: chamado.urgencia,
          tendencia: chamado.tendencia,
          esforco: chamado.esforco,
          pontuacao_gut: chamado.pontuacao_gut,
          prioridade_calculada: chamado.prioridade_calculada,
          selecionado_mes: chamado.selecionado_mes,
          mes_priorizacao: chamado.mes_priorizacao,
          sprint_id: chamado.sprint_id,
          data_conclusao: chamado.data_conclusao,
          oculto: chamado.oculto,
          cancelado: chamado.cancelado,
          cancelado_em: chamado.cancelado_em,
          cancelado_por: chamado.cancelado_por,
          status_anterior: chamado.status_anterior,
          motivo_cancelamento: chamado.motivo_cancelamento,
          evidencia_cancelamento_url: chamado.evidencia_cancelamento_url,
          aguardando_cliente: chamado.aguardando_cliente,
          area_modificada_por_admin: chamado.area_modificada_por_admin,
          comentarios: chamado.comentarios,
          contagem_reabertura: chamado.contagem_reabertura,
          created_at: chamado.created_at,
          updated_at: chamado.updated_at
        }));

        const { error: insertError } = await supabase
          .from('chamados')
          .insert(batch);

        if (insertError) {
          toast.error('Erro ao restaurar chamados: ' + insertError.message);
          setIsReverting(false);
          return;
        }
      }

      // Delete the backup after successful restore
      await supabase
        .from('chamados_backup')
        .delete()
        .eq('id', backup.id);

      // Invalidate all queries
      queryClient.invalidateQueries({ queryKey: ['chamados'] });
      queryClient.invalidateQueries({ queryKey: ['chamados-cancelados'] });
      queryClient.invalidateQueries({ queryKey: ['concluded-chamados'] });

      toast.success(`Base revertida com sucesso! ${chamadosData.length} chamado(s) restaurado(s).`);
      setHasBackup(false);
      setBackupInfo(null);
    } catch (error) {
      console.error('Error reverting:', error);
      toast.error('Erro ao reverter a base de dados.');
    } finally {
      setIsReverting(false);
    }
  };

  const handleUpload = async () => {
    if (!file || !user) return;

    setIsUploading(true);
    setProgress(0);
    setResult(null);

    try {
      // Create backup before processing
      const backupCreated = await createBackup();
      if (!backupCreated) {
        toast.warning('Não foi possível criar backup. Continuando com a atualização...');
      }

      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows: NewExcelRow[] = XLSX.utils.sheet_to_json(sheet);

      if (rows.length === 0) {
        toast.error('O arquivo está vazio');
        setIsUploading(false);
        return;
      }

      // Validate required columns exist
      const firstRow = rows[0];
      const requiredColumns = ['Número'];
      const missingColumns = requiredColumns.filter(col => !(col in firstRow));
      
      if (missingColumns.length > 0) {
        toast.error(`Colunas obrigatórias não encontradas: ${missingColumns.join(', ')}`);
        setIsUploading(false);
        return;
      }

      // Fetch existing chamados to get client-area mappings
      const { data: existingChamados } = await supabase
        .from('chamados')
        .select('numero, cliente, area_demandante, sprint_id, data_conclusao, status, status_anterior, grupo_atribuicao, id, estado, data_resolvido, motivo_cancelamento, motivo_pendencia, comentarios, contagem_reabertura');

      // Build client to area mapping from existing data
      const clientToAreaMap = new Map<string, string>();
      existingChamados?.forEach(chamado => {
        if (chamado.cliente && chamado.area_demandante) {
          const normalizedClient = normalizeName(chamado.cliente);
          if (!clientToAreaMap.has(normalizedClient)) {
            clientToAreaMap.set(normalizedClient, chamado.area_demandante);
          }
        }
      });

      // Build existing chamados lookup by numero
      const existingByNumero = new Map<string, typeof existingChamados[0]>();
      existingChamados?.forEach(chamado => {
        existingByNumero.set(chamado.numero, chamado);
      });

      let inserted = 0;
      let updated = 0;
      let skipped = 0;
      let hidden = 0;
      let errors = 0;
      const errorDetails: ImportError[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNumber = i + 2;
        setProgress(Math.round(((i + 1) / rows.length) * 100));

        // Validate required fields
        if (!row['Número']) {
          errors++;
          errorDetails.push({
            row: rowNumber,
            numero: '-',
            message: 'Campo "Número" está vazio ou ausente.'
          });
          continue;
        }

        const numero = row['Número'];
        const solicitadoPara = row['Solicitado(a) para'] || '';
        const estado = row['Estado'] || '';
        const motivoPendencia = row['Motivo da Pendência'] || '';
        const motivoCancelamento = row['Motivo do Cancelamento'] || '';
        const comentarios = row['Comentários e Anotações de trabalho'] || '';
        const grupoAtribuicao = row['Grupo de atribuição'] || '';
        const dataResolvido = parseExcelDate(row['Resolvido']);
        const contagemReabertura = typeof row['Contagem de reabertura'] === 'number' 
          ? row['Contagem de reabertura'] 
          : parseInt(row['Contagem de reabertura'] as string || '0') || 0;
        
        // Check if chamado should go to/return from Escritório de Processos
        const isPrcProcessos = grupoAtribuicao.toLowerCase().includes('prc - processos e melhoria contínua') ||
                               grupoAtribuicao.toLowerCase().includes('prc - processos e melhoria continua');

        // Check if should be hidden (Pendente + Aguardando Aprovação)
        const estadoNorm = estado.toLowerCase().trim();
        const motivoPendenciaNorm = motivoPendencia.toLowerCase().trim();
        
        if (estadoNorm === 'pendente' && motivoPendenciaNorm.includes('aguardando aprovação')) {
          // Hide this chamado
          const existingChamado = existingByNumero.get(numero);
          
          if (existingChamado) {
            // Update complementary fields and hide
            await supabase
              .from('chamados')
              .update({ 
                oculto: true,
                estado: estado || existingChamado.estado,
                data_resolvido: dataResolvido || existingChamado.data_resolvido,
                motivo_cancelamento: motivoCancelamento || existingChamado.motivo_cancelamento,
                motivo_pendencia: motivoPendencia || existingChamado.motivo_pendencia,
                comentarios: comentarios || existingChamado.comentarios,
                contagem_reabertura: contagemReabertura || existingChamado.contagem_reabertura
              })
              .eq('id', existingChamado.id);
          } else {
            // Insert as hidden
            const normalizedSolicitado = normalizeName(solicitadoPara);
            const foundArea = clientToAreaMap.get(normalizedSolicitado);
            let areaDemandante = '';
            let isNewClient = false;
            
            if (foundArea) {
              areaDemandante = foundArea;
            } else if (solicitadoPara) {
              areaDemandante = ''; // Leave empty for new clients
              isNewClient = true;
            } else {
              areaDemandante = 'Não informado';
            }
            
            await supabase
              .from('chamados')
              .insert({
                numero,
                descricao: row['Descrição'] || null,
                cliente: solicitadoPara || null,
                data_abertura: parseExcelDate(row['Criação']),
                item: row['Item'] || null,
                estado: estado || null,
                grupo_atribuicao: row['Grupo de atribuição'] || null,
                data_resolvido: dataResolvido,
                encerrado_por: row['Encerrado por'] || null,
                data_encerramento: parseExcelDate(row['Encerrado']),
                atribuido_a: row['Atribuído a'] || null,
                motivo_cancelamento: motivoCancelamento || null,
                motivo_pendencia: motivoPendencia || null,
                comentarios: comentarios || null,
                contagem_reabertura: contagemReabertura,
                area_demandante: areaDemandante,
                area_modificada_por_admin: !isNewClient,
                oculto: true,
                status: 'Aguard. GUT'
              });
          }
          
          hidden++;
          continue;
        }

        // Check if Aguardando Cliente
        const aguardandoCliente = estadoNorm === 'pendente' && motivoPendenciaNorm.includes('aguardando cliente');

        // Check existing chamado
        const existingChamado = existingByNumero.get(numero);

        // Determine area based on Solicitado(a) para cross-reference with existing Cliente
        const normalizedSolicitado = normalizeName(solicitadoPara);
        const foundArea = clientToAreaMap.get(normalizedSolicitado);
        let areaDemandante = '';
        let isNewClient = false;
        
        if (foundArea) {
          // Found a matching area from existing records
          areaDemandante = foundArea;
        } else if (solicitadoPara) {
          // New client - set area_demandante as empty (not client name), mark as new
          // This will trigger the "Novo" badge and filter
          areaDemandante = ''; // Leave empty so it appears in "Novos" filter
          isNewClient = true;
        } else {
          areaDemandante = 'Não informado';
        }

        // Determine status based on Estado
        const statusInfo = determineStatus(estado, existingChamado);

        // Handle Cancelado
        if (statusInfo.cancelado) {
          const canceladoData = {
            cancelado: true,
            status: 'Cancelado',
            status_anterior: existingChamado?.status || null,
            selecionado_mes: false,
            mes_priorizacao: null,
            motivo_cancelamento: motivoCancelamento || existingChamado?.motivo_cancelamento || 'Cancelado via importação',
            cancelado_em: parseExcelDateTime(row['Encerrado']) || new Date().toISOString(),
            estado: estado || existingChamado?.estado,
            contagem_reabertura: contagemReabertura || existingChamado?.contagem_reabertura || 0,
            aguardando_cliente: aguardandoCliente,
            motivo_pendencia: motivoPendencia || existingChamado?.motivo_pendencia || null,
            comentarios: comentarios || existingChamado?.comentarios || null,
            data_resolvido: dataResolvido || existingChamado?.data_resolvido,
            oculto: false
          };

          if (existingChamado) {
            await supabase
              .from('chamados')
              .update(canceladoData)
              .eq('id', existingChamado.id);
            updated++;
          } else {
            await supabase
              .from('chamados')
              .insert({
                numero,
                descricao: row['Descrição'] || null,
                cliente: solicitadoPara || null,
                data_abertura: parseExcelDate(row['Criação']),
                item: row['Item'] || null,
                estado: estado || null,
                grupo_atribuicao: row['Grupo de atribuição'] || null,
                data_resolvido: dataResolvido,
                encerrado_por: row['Encerrado por'] || null,
                data_encerramento: parseExcelDate(row['Encerrado']),
                atribuido_a: row['Atribuído a'] || null,
                motivo_pendencia: motivoPendencia || null,
                comentarios: comentarios || null,
                contagem_reabertura: contagemReabertura,
                area_demandante: areaDemandante,
                area_modificada_por_admin: !isNewClient,
                status: 'Cancelado',
                ...canceladoData
              });
            inserted++;
          }
          continue;
        }

        // Handle Resolvido / Encerrado Concluído
        if (statusInfo.status === 'Concluído') {
          const conclusaoData = {
            status: 'Concluído',
            data_conclusao: parseExcelDateTime(row['Resolvido']) || parseExcelDateTime(row['Encerrado']) || new Date().toISOString(),
            data_resolvido: dataResolvido || existingChamado?.data_resolvido,
            data_encerramento: parseExcelDate(row['Encerrado']),
            estado: estado || existingChamado?.estado,
            contagem_reabertura: contagemReabertura || existingChamado?.contagem_reabertura || 0,
            aguardando_cliente: aguardandoCliente,
            motivo_pendencia: motivoPendencia || existingChamado?.motivo_pendencia || null,
            motivo_cancelamento: motivoCancelamento || existingChamado?.motivo_cancelamento || null,
            comentarios: comentarios || existingChamado?.comentarios || null,
            cancelado: false,
            oculto: false
          };

          if (existingChamado) {
            await supabase
              .from('chamados')
              .update(conclusaoData)
              .eq('id', existingChamado.id);
            updated++;
          } else {
            await supabase
              .from('chamados')
              .insert({
                numero,
                descricao: row['Descrição'] || null,
                cliente: solicitadoPara || null,
                data_abertura: parseExcelDate(row['Criação']),
                item: row['Item'] || null,
                grupo_atribuicao: row['Grupo de atribuição'] || null,
                encerrado_por: row['Encerrado por'] || null,
                atribuido_a: row['Atribuído a'] || null,
                area_demandante: areaDemandante,
                area_modificada_por_admin: !isNewClient,
                ...conclusaoData
              });
            inserted++;
          }
          continue;
        }

        // Handle normal cases (Em Aberto, Trabalho em Andamento, Pendente Aguardando Cliente)
        if (existingChamado) {
          // Determine Escritório de Processos status change
          const isCurrentlyInEscritorio = existingChamado.status === 'Em mapeamento com Escritório de Processos';
          let statusUpdate: { status?: string; status_anterior?: string | null } = {};
          
          if (isPrcProcessos && !isCurrentlyInEscritorio) {
            // If chamado is already in a sprint, don't change status - just keep grupo_atribuicao updated
            // The UI will show "Escritório de Processos Prioridade" label based on grupo_atribuicao
            if (!existingChamado.sprint_id) {
              // Send to Escritório de Processos only if NOT in a sprint
              statusUpdate = {
                status: 'Em mapeamento com Escritório de Processos',
                status_anterior: existingChamado.status || 'Aguard. GUT'
              };
            }
          } else if (!isPrcProcessos && isCurrentlyInEscritorio) {
            // Return from Escritório de Processos (like clicking "Retornar" button)
            // Restore previous status or default to Aguard. GUT
            const statusAnterior = (existingChamado as any).status_anterior || 'Aguard. GUT';
            statusUpdate = {
              status: statusAnterior,
              status_anterior: null
            };
          }
          
          // When Estado is no longer "Pendente", clear pending-related fields
          // This ensures "Pendência Solicitante" label is removed when the ticket is no longer pending
          const isStillPendente = estadoNorm === 'pendente';
          const clearedMotivoPendencia = isStillPendente 
            ? (motivoPendencia || existingChamado.motivo_pendencia) 
            : (motivoPendencia || null);
          const clearedAguardandoCliente = isStillPendente ? aguardandoCliente : false;

          // Update existing chamado with complementary data
          const { error } = await supabase
            .from('chamados')
            .update({
              // Only update these specific columns with new data if different
              estado: estado || existingChamado.estado,
              data_resolvido: dataResolvido || existingChamado.data_resolvido,
              motivo_cancelamento: motivoCancelamento || existingChamado.motivo_cancelamento,
              motivo_pendencia: clearedMotivoPendencia,
              comentarios: comentarios || existingChamado.comentarios,
              contagem_reabertura: contagemReabertura || existingChamado.contagem_reabertura,
              // Also update these related fields
              aguardando_cliente: clearedAguardandoCliente,
              data_encerramento: parseExcelDate(row['Encerrado']),
              encerrado_por: row['Encerrado por'] || null,
              atribuido_a: row['Atribuído a'] || null,
              grupo_atribuicao: grupoAtribuicao || null,
              oculto: false,
              cancelado: false,
              // Apply Escritório de Processos status change if needed
              ...statusUpdate
            })
            .eq('id', existingChamado.id);

          if (error) {
            errors++;
            errorDetails.push({
              row: rowNumber,
              numero,
              message: getErrorMessage(error)
            });
          } else {
            updated++;
          }
        } else {
          // Insert new chamado
          // For new chamados, if PRC Processos, set status to Escritório de Processos
          const newStatus = isPrcProcessos ? 'Em mapeamento com Escritório de Processos' : 'Aguard. GUT';
          const statusAnterior = isPrcProcessos ? 'Aguard. GUT' : null;
          
          const { error } = await supabase
            .from('chamados')
            .insert({
              numero,
              descricao: row['Descrição'] || null,
              cliente: solicitadoPara || null,
              data_abertura: parseExcelDate(row['Criação']),
              item: row['Item'] || null,
              estado: estado || null,
              grupo_atribuicao: grupoAtribuicao || null,
              data_resolvido: dataResolvido,
              encerrado_por: row['Encerrado por'] || null,
              data_encerramento: parseExcelDate(row['Encerrado']),
              atribuido_a: row['Atribuído a'] || null,
              motivo_cancelamento: motivoCancelamento || null,
              motivo_pendencia: motivoPendencia || null,
              comentarios: comentarios || null,
              contagem_reabertura: contagemReabertura,
              area_demandante: areaDemandante,
              area: isNewClient ? null : undefined, // Leave area blank for new clients
              area_modificada_por_admin: !isNewClient, // false = show "Novo" badge
              aguardando_cliente: aguardandoCliente,
              status: newStatus,
              status_anterior: statusAnterior,
              oculto: false,
              cancelado: false
            });

          if (error) {
            errors++;
            errorDetails.push({
              row: rowNumber,
              numero,
              message: getErrorMessage(error)
            });
          } else {
            inserted++;
          }
        }
      }

      setResult({ inserted, updated, skipped, hidden, errors, errorDetails });
      queryClient.invalidateQueries({ queryKey: ['chamados'] });
      queryClient.invalidateQueries({ queryKey: ['chamados-cancelados'] });
      queryClient.invalidateQueries({ queryKey: ['concluded-chamados'] });
      
      // Save base update record with filename
      if (inserted > 0 || updated > 0) {
        await supabase.from('base_updates').insert({
          updated_by: user.id,
          file_name: file.name,
          records_count: inserted + updated,
        });
        queryClient.invalidateQueries({ queryKey: ['last-base-update'] });
      }

      // Update backup info
      await checkBackup();
      
      if (inserted > 0 || updated > 0) {
        toast.success(`Base atualizada: ${inserted} novo(s), ${updated} atualizado(s)`);
      }
      
      if (hidden > 0) {
        toast.info(`${hidden} chamado(s) ocultado(s) (Aguardando Aprovação)`);
      }
      
      if (errors > 0) {
        toast.error(`${errors} erro(s) durante a importação. Veja os detalhes.`);
      }
    } catch (error) {
      console.error('Error processing file:', error);
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      toast.error(`Erro ao processar arquivo: ${message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const resetDialog = () => {
    setFile(null);
    setResult(null);
    setProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex gap-2">
      <Dialog open={isOpen} onOpenChange={handleDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Atualizar Base
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Atualizar Base de Chamados</DialogTitle>
            <DialogDescription>
              Faça upload do relatório Excel do ServiceNow para sincronizar os chamados.
              Novos chamados serão inseridos e existentes serão atualizados.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* File input */}
            <div 
              className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                className="hidden"
              />
              <FileSpreadsheet className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
              {file ? (
                <p className="text-sm font-medium text-foreground">{file.name}</p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Clique para selecionar ou arraste um arquivo
                </p>
              )}
            </div>

            {/* Progress */}
            {isUploading && (
              <div className="space-y-2">
                <Progress value={progress} className="h-2" />
                <p className="text-sm text-center text-muted-foreground">
                  Processando... {progress}%
                </p>
              </div>
            )}

            {/* Result */}
            {result && (
              <div className="space-y-3 p-4 rounded-lg bg-muted">
                {result.inserted > 0 && (
                  <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                    <CheckCircle className="h-4 w-4" />
                    <span className="text-sm font-medium">{result.inserted} novo(s) inserido(s)</span>
                  </div>
                )}
                {result.updated > 0 && (
                  <div className="flex items-center gap-2 text-info">
                    <RefreshCw className="h-4 w-4" />
                    <span className="text-sm font-medium">{result.updated} atualizado(s)</span>
                  </div>
                )}
                {result.hidden > 0 && (
                  <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                    <AlertCircle className="h-4 w-4" />
                    <span className="text-sm">{result.hidden} ocultado(s) (Aguardando Aprovação)</span>
                  </div>
                )}
                {result.errors > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-destructive">
                      <AlertCircle className="h-4 w-4" />
                      <span className="text-sm font-medium">{result.errors} erro(s)</span>
                    </div>
                    {result.errorDetails.length > 0 && (
                      <ScrollArea className="h-32 rounded border bg-background p-2">
                        <div className="space-y-1">
                          {result.errorDetails.map((err, idx) => (
                            <div key={idx} className="text-xs text-muted-foreground border-b border-border pb-1 last:border-b-0">
                              <span className="font-medium text-foreground">Linha {err.row}</span>
                              {err.numero !== '-' && <span className="text-muted-foreground"> ({err.numero})</span>}
                              <span className="text-destructive">: {err.message}</span>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </div>
                )}
                {result.inserted === 0 && result.updated === 0 && result.errors === 0 && result.hidden === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Nenhuma alteração necessária. A base já está atualizada.
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              {result ? 'Fechar' : 'Cancelar'}
            </Button>
            {!result && (
              <Button onClick={handleUpload} disabled={!file || isUploading}>
                {isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processando...
                  </>
                ) : (
                  'Atualizar Base'
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revert Button */}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button 
            variant="outline" 
            className="gap-2"
            disabled={!hasBackup || isReverting}
            onClick={() => checkBackup()}
          >
            {isReverting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Undo2 className="h-4 w-4" />
            )}
            Reverter Atualização
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reverter para o backup anterior?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Esta ação irá restaurar a base de dados para o estado anterior à última atualização.</p>
              {backupInfo && (
                <p className="text-sm font-medium text-foreground">
                  Backup de {backupInfo.date} ({backupInfo.count} chamados)
                </p>
              )}
              <p className="text-destructive font-medium">
                Atenção: Todas as alterações feitas após a última atualização serão perdidas!
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRevert} className="bg-destructive hover:bg-destructive/90">
              Reverter
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
