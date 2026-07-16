import { useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Upload, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
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

export default function ImportButton() {
  const [isImporting, setIsImporting] = useState(false);
  const [pendingData, setPendingData] = useState<Record<string, unknown>[] | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      // Aceita tanto array direto quanto o formato de backup completo
      // { export_version, exported_at, chamados: [...] }
      let records: Record<string, unknown>[] | null = null;
      if (Array.isArray(parsed)) {
        records = parsed as Record<string, unknown>[];
      } else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { chamados?: unknown }).chamados)) {
        records = (parsed as { chamados: Record<string, unknown>[] }).chamados;
      }

      if (!records) {
        toast.error('Arquivo inválido: esperado o JSON gerado pelo botão Exportar Base.');
        return;
      }

      if (records.length === 0) {
        toast.error('O arquivo não contém chamados.');
        return;
      }

      setPendingData(records);
      setConfirmOpen(true);
    } catch (err) {
      console.error('Parse error:', err);
      toast.error('Erro ao ler arquivo JSON');
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const confirmImport = async () => {
    if (!pendingData) return;
    setIsImporting(true);
    setConfirmOpen(false);

    try {
      const batchSize = 100;
      let processed = 0;
      for (let i = 0; i < pendingData.length; i += batchSize) {
        const batch = pendingData.slice(i, i + batchSize);
        const { error } = await supabase
          .from('chamados')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .upsert(batch as any, { onConflict: 'id' });
        if (error) {
          // Log full error diagnostics
          console.error('Import error (batch starting at index ' + i + '):', {
            message: error.message,
            details: (error as { details?: string }).details,
            hint: (error as { hint?: string }).hint,
            code: (error as { code?: string }).code,
            firstRecord: batch[0],
          });
          const parts = [
            error.message,
            (error as { details?: string }).details,
            (error as { hint?: string }).hint,
          ].filter(Boolean);
          throw new Error(parts.join(' | ') || 'Erro desconhecido');
        }
        processed += batch.length;
      }
      toast.success(`Base importada com sucesso! (${processed} chamados)`);
    } catch (err) {
      console.error('Import error:', err);
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      toast.error('Erro ao importar base: ' + msg);
    } finally {
      setIsImporting(false);
      setPendingData(null);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleFile}
      />
      <Button
        variant="outline"
        onClick={() => inputRef.current?.click()}
        disabled={isImporting}
        className="gap-2"
      >
        {isImporting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Importando...
          </>
        ) : (
          <>
            <Upload className="h-4 w-4" />
            Importar Base
          </>
        )}
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Importar base?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingData?.length ?? 0} chamados serão inseridos/atualizados no banco.
              Registros com o mesmo ID serão sobrescritos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingData(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmImport}>Importar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
