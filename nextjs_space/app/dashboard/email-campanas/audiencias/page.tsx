
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { 
  Plus, 
  Users, 
  Edit, 
  Trash, 
  Filter,
  ArrowLeft
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Audiencia {
  id: string;
  nombre: string;
  descripcion: string | null;
  filtrosJSON: string;
  totalLeads: number;
  fechaCreacion: string;
}

export default function AudienciasPage() {
  const router = useRouter();
  const [audiencias, setAudiencias] = useState<Audiencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
    filtros: {
      tags: [] as string[],
      scoreMin: 0,
      scoreMax: 100,
      estado: ''
    }
  });

  useEffect(() => {
    cargarAudiencias();
  }, []);

  const cargarAudiencias = async () => {
    try {
      const res = await fetch('/api/email-campanas/audiences');
      if (!res.ok) throw new Error('Error al cargar audiencias');
      const data = await res.json();
      setAudiencias(data);
    } catch (error: any) {
      toast.error('Error al cargar audiencias');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      nombre: '',
      descripcion: '',
      filtros: {
        tags: [],
        scoreMin: 0,
        scoreMax: 100,
        estado: ''
      }
    });
    setEditingId(null);
  };

  const handleSubmit = async () => {
    if (!formData.nombre.trim()) {
      toast.error('El nombre es requerido');
      return;
    }

    try {
      const url = editingId
        ? `/api/email-campanas/audiences/${editingId}`
        : '/api/email-campanas/audiences';
      
      const method = editingId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Error al guardar');
      }

      toast.success(editingId ? 'Audiencia actualizada' : 'Audiencia creada');
      setShowModal(false);
      resetForm();
      cargarAudiencias();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleEdit = async (id: string) => {
    try {
      const res = await fetch(`/api/email-campanas/audiences/${id}`);
      if (!res.ok) throw new Error('Error al cargar audiencia');
      const audiencia = await res.json();
      
      setFormData({
        nombre: audiencia.nombre,
        descripcion: audiencia.descripcion || '',
        filtros: JSON.parse(audiencia.filtrosJSON || '{}')
      });
      setEditingId(id);
      setShowModal(true);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/email-campanas/audiences/${id}`, {
        method: 'DELETE'
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Error al eliminar');
      }

      toast.success('Audiencia eliminada');
      cargarAudiencias();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setDeleteId(null);
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground animate-pulse" />
            <p className="text-muted-foreground">Cargando audiencias...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/dashboard/email-campanas')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Audiencias</h1>
            <p className="text-muted-foreground mt-2">
              Segmenta tus leads para campañas personalizadas
            </p>
          </div>
        </div>
        <Button 
          onClick={() => {
            resetForm();
            setShowModal(true);
          }}
          size="lg"
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          Nueva Audiencia
        </Button>
      </div>

      {/* Lista de audiencias */}
      {audiencias.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No hay audiencias</h3>
            <p className="text-muted-foreground text-center mb-4">
              Crea tu primera audiencia para segmentar tus leads
            </p>
            <Button onClick={() => setShowModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Nueva Audiencia
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {audiencias.map((audiencia) => {
            const filtros = JSON.parse(audiencia.filtrosJSON || '{}');
            return (
              <Card key={audiencia.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 flex-1">
                      <CardTitle className="text-lg">{audiencia.nombre}</CardTitle>
                      {audiencia.descripcion && (
                        <CardDescription>{audiencia.descripcion}</CardDescription>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(audiencia.id)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteId(audiencia.id)}
                      >
                        <Trash className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Total Leads:</span>
                      <Badge variant="default" className="gap-1">
                        <Users className="h-3 w-3" />
                        {audiencia.totalLeads}
                      </Badge>
                    </div>

                    {Object.keys(filtros).length > 0 && (
                      <div className="border-t pt-3 space-y-2">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Filter className="h-3 w-3" />
                          <span>Filtros aplicados:</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {filtros.scoreMin !== undefined && (
                            <Badge variant="secondary" className="text-xs">
                              Score ≥ {filtros.scoreMin}
                            </Badge>
                          )}
                          {filtros.scoreMax !== undefined && (
                            <Badge variant="secondary" className="text-xs">
                              Score ≤ {filtros.scoreMax}
                            </Badge>
                          )}
                          {filtros.estado && (
                            <Badge variant="secondary" className="text-xs">
                              Estado: {filtros.estado}
                            </Badge>
                          )}
                          {filtros.tags?.length > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              Tags: {filtros.tags.join(', ')}
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal crear/editar */}
      <Dialog open={showModal} onOpenChange={(open) => {
        setShowModal(open);
        if (!open) resetForm();
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Editar Audiencia' : 'Nueva Audiencia'}
            </DialogTitle>
            <DialogDescription>
              Define los criterios para segmentar tus leads
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="nombre">Nombre *</Label>
              <Input
                id="nombre"
                value={formData.nombre}
                onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                placeholder="Ej: Leads Calificados Q1 2024"
              />
            </div>

            <div>
              <Label htmlFor="descripcion">Descripción</Label>
              <Textarea
                id="descripcion"
                value={formData.descripcion}
                onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                placeholder="Descripción opcional"
                rows={3}
              />
            </div>

            <div className="border-t pt-4">
              <h4 className="font-medium mb-4 flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Filtros de Segmentación
              </h4>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Score Mínimo</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={formData.filtros.scoreMin}
                      onChange={(e) => setFormData({
                        ...formData,
                        filtros: { ...formData.filtros, scoreMin: parseInt(e.target.value) || 0 }
                      })}
                    />
                  </div>
                  <div>
                    <Label>Score Máximo</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={formData.filtros.scoreMax}
                      onChange={(e) => setFormData({
                        ...formData,
                        filtros: { ...formData.filtros, scoreMax: parseInt(e.target.value) || 100 }
                      })}
                    />
                  </div>
                </div>

                <div>
                  <Label>Estado del Lead</Label>
                  <Select
                    value={formData.filtros.estado}
                    onValueChange={(value) => setFormData({
                      ...formData,
                      filtros: { ...formData.filtros, estado: value }
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Todos los estados" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Todos</SelectItem>
                      <SelectItem value="nuevo">Nuevo</SelectItem>
                      <SelectItem value="contactado">Contactado</SelectItem>
                      <SelectItem value="calificado">Calificado</SelectItem>
                      <SelectItem value="propuesta">Propuesta</SelectItem>
                      <SelectItem value="negociacion">Negociación</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Tags (separados por coma)</Label>
                  <Input
                    value={formData.filtros.tags?.join(', ') || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      filtros: {
                        ...formData.filtros,
                        tags: e.target.value ? e.target.value.split(',').map(t => t.trim()) : []
                      }
                    })}
                    placeholder="Ej: interesado, activo"
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit}>
              {editingId ? 'Actualizar' : 'Crear'} Audiencia
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog eliminar */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar audiencia?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Si hay campañas usando esta audiencia, no podrá eliminarse.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && handleDelete(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
