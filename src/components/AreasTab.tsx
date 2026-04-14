import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Loader2, Building2 } from 'lucide-react';

interface Area {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

interface AreaFormData {
  nome: string;
  descricao: string;
  ativo: boolean;
}

const initialFormData: AreaFormData = {
  nome: '',
  descricao: '',
  ativo: true,
};

export function AreasTab() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Dialog states
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingArea, setEditingArea] = useState<Area | null>(null);
  const [deletingArea, setDeletingArea] = useState<Area | null>(null);
  
  // Form state
  const [formData, setFormData] = useState<AreaFormData>(initialFormData);

  useEffect(() => {
    fetchAreas();
  }, []);

  const fetchAreas = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('areas')
        .select('*')
        .order('nome');

      if (error) throw error;
      setAreas(data || []);
    } catch (error: any) {
      toast.error('Erro ao carregar áreas: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const openCreateDialog = () => {
    setEditingArea(null);
    setFormData(initialFormData);
    setIsDialogOpen(true);
  };

  const openEditDialog = (area: Area) => {
    setEditingArea(area);
    setFormData({
      nome: area.nome,
      descricao: area.descricao || '',
      ativo: area.ativo,
    });
    setIsDialogOpen(true);
  };

  const openDeleteDialog = (area: Area) => {
    setDeletingArea(area);
    setIsDeleteDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.nome.trim()) {
      toast.error('O nome da área é obrigatório');
      return;
    }

    try {
      setSaving(true);

      if (editingArea) {
        const oldName = editingArea.nome;
        const newName = formData.nome.trim();

        // Update area
        const { error } = await supabase
          .from('areas')
          .update({
            nome: newName,
            descricao: formData.descricao.trim() || null,
            ativo: formData.ativo,
          })
          .eq('id', editingArea.id);

        if (error) throw error;

        // If name changed, update all chamados with this area
        if (oldName !== newName) {
          const { error: updateChamadosError } = await supabase
            .from('chamados')
            .update({ area: newName })
            .eq('area', oldName);

          if (updateChamadosError) {
            console.error('Erro ao atualizar chamados:', updateChamadosError);
            toast.warning('Área atualizada, mas houve um erro ao atualizar os chamados');
          }
        }

        toast.success('Área atualizada com sucesso');
      } else {
        // Create
        const { error } = await supabase
          .from('areas')
          .insert({
            nome: formData.nome.trim(),
            descricao: formData.descricao.trim() || null,
            ativo: formData.ativo,
          });

        if (error) throw error;
        toast.success('Área criada com sucesso');
      }

      setIsDialogOpen(false);
      fetchAreas();
    } catch (error: any) {
      if (error.code === '23505') {
        toast.error('Já existe uma área com este nome');
      } else {
        toast.error('Erro ao salvar área: ' + error.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingArea) return;

    try {
      setSaving(true);

      // First, clear the area field in chamados that have this area
      const { error: clearChamadosError } = await supabase
        .from('chamados')
        .update({ area: null })
        .eq('area', deletingArea.nome);

      if (clearChamadosError) {
        console.error('Erro ao limpar área dos chamados:', clearChamadosError);
      }

      // Then delete the area
      const { error } = await supabase
        .from('areas')
        .delete()
        .eq('id', deletingArea.id);

      if (error) throw error;
      toast.success('Área excluída com sucesso');
      setIsDeleteDialogOpen(false);
      fetchAreas();
    } catch (error: any) {
      toast.error('Erro ao excluir área: ' + error.message);
    } finally {
      setSaving(false);
      setDeletingArea(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Gestão de Áreas
        </CardTitle>
        <Button onClick={openCreateDialog} className="gap-2">
          <Plus className="h-4 w-4" />
          Nova Área
        </Button>
      </CardHeader>
      <CardContent>
        {areas.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nenhuma área cadastrada
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="w-24 text-center">Status</TableHead>
                  <TableHead className="w-24 text-center">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {areas.map((area) => (
                  <TableRow key={area.id}>
                    <TableCell className="font-medium">{area.nome}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {area.descricao || '-'}
                    </TableCell>
                    <TableCell className="text-center">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                          area.ativo
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                        }`}
                      >
                        {area.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(area)}
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openDeleteDialog(area)}
                          title="Excluir"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Create/Edit Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingArea ? 'Editar Área' : 'Nova Área'}
              </DialogTitle>
              <DialogDescription>
                {editingArea
                  ? 'Atualize as informações da área.'
                  : 'Preencha as informações para criar uma nova área.'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="nome">Nome *</Label>
                  <Input
                    id="nome"
                    value={formData.nome}
                    onChange={(e) =>
                      setFormData({ ...formData, nome: e.target.value })
                    }
                    placeholder="Nome da área"
                    disabled={saving}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="descricao">Descrição</Label>
                  <Textarea
                    id="descricao"
                    value={formData.descricao}
                    onChange={(e) =>
                      setFormData({ ...formData, descricao: e.target.value })
                    }
                    placeholder="Descrição da área (opcional)"
                    disabled={saving}
                    rows={3}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    id="ativo"
                    checked={formData.ativo}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, ativo: checked })
                    }
                    disabled={saving}
                  />
                  <Label htmlFor="ativo">Área ativa</Label>
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                  disabled={saving}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingArea ? 'Salvar' : 'Criar'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir a área "{deletingArea?.nome}"?
                Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={saving}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
