'use client';

import React, { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api-client';
import {
  Building2,
  Plus,
  Search,
  Trash2,
  Edit,
  ExternalLink,
  Phone,
  Mail,
  Globe,
  Loader2,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface Aseguradora {
  id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  web: string | null;
  direccion: string | null;
  notas: string | null;
  activa: boolean;
  _count: { polizas: number; productos: number };
  fechaCreacion: string;
}

export default function AseguradorasPage() {
  const [aseguradoras, setAseguradoras] = useState<Aseguradora[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAseg, setEditingAseg] = useState<Aseguradora | null>(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    nombre: '',
    telefono: '',
    email: '',
    web: '',
    direccion: '',
    notas: '',
    activa: true,
  });

  useEffect(() => {
    loadAseguradoras();
  }, []);

  const loadAseguradoras = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set('search', search);

      const res = await apiFetch(`/api/insurance/aseguradoras?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        // La API devuelve { aseguradoras: [...] } (y antes un array plano): soportar ambos
        setAseguradoras(Array.isArray(data) ? data : data.aseguradoras || []);
      } else {
        toast.error(data.error || 'Error al cargar aseguradoras');
      }
    } catch (error) {
      console.error('Error cargando aseguradoras:', error);
      toast.error('Error al cargar aseguradoras');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const debounce = setTimeout(() => loadAseguradoras(), 300);
    return () => clearTimeout(debounce);
  }, [search]);

  const handleNew = () => {
    setEditingAseg(null);
    setFormData({ nombre: '', telefono: '', email: '', web: '', direccion: '', notas: '', activa: true });
    setIsFormOpen(true);
  };

  const handleEdit = (a: Aseguradora) => {
    setEditingAseg(a);
    setFormData({
      nombre: a.nombre,
      telefono: a.telefono || '',
      email: a.email || '',
      web: a.web || '',
      direccion: a.direccion || '',
      notas: a.notas || '',
      activa: a.activa,
    });
    setIsFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nombre.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }

    try {
      setSaving(true);
      const method = editingAseg ? 'PATCH' : 'POST';
      const url = editingAseg
        ? `/api/insurance/aseguradoras/${editingAseg.id}`
        : '/api/insurance/aseguradoras';

      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (res.ok) {
        toast.success(editingAseg ? 'Aseguradora actualizada' : 'Aseguradora creada');
        setIsFormOpen(false);
        loadAseguradoras();
      } else {
        toast.error(data.error || 'Error al guardar');
      }
    } catch (error) {
      console.error('Error guardando aseguradora:', error);
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (a: Aseguradora) => {
    if (!confirm(`¿Eliminar ${a.nombre}? ${a._count.polizas > 0 ? `Tiene ${a._count.polizas} pólizas asociadas.` : ''}`)) return;

    try {
      const res = await apiFetch(`/api/insurance/aseguradoras/${a.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        toast.success('Aseguradora eliminada');
        loadAseguradoras();
      } else {
        toast.error(data.error || 'Error al eliminar');
      }
    } catch (error) {
      console.error('Error eliminando:', error);
      toast.error('Error al eliminar');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4" />
          <p className="text-muted-foreground">Cargando aseguradoras...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3 justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar aseguradora..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button onClick={handleNew}>
              <Plus className="w-4 h-4 mr-2" />
              Nueva Aseguradora
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {aseguradoras.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-30" />
              <h3 className="text-lg font-medium mb-2">No hay aseguradoras</h3>
              <p className="text-muted-foreground mb-4">
                {search ? 'No se encontraron resultados' : 'Registra tu primera aseguradora'}
              </p>
              {!search && (
                <Button onClick={handleNew}>
                  <Plus className="h-4 w-4 mr-2" /> Nueva Aseguradora
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {aseguradoras.map(a => (
                <Card key={a.id} className="hover:shadow-md transition-shadow border-l-4 border-l-purple-500">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
                          <Building2 className="h-5 w-5 text-purple-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-sm">{a.nombre}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <Badge variant="outline" className="text-xs">
                              {a._count.polizas} pólizas
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {a._count.productos} productos
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <Badge variant={a.activa ? 'default' : 'secondary'} className="text-xs">
                        {a.activa ? 'Activa' : 'Inactiva'}
                      </Badge>
                    </div>
                    <div className="space-y-1 text-sm text-muted-foreground">
                      {a.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="w-3.5 h-3.5" />
                          <span className="truncate">{a.email}</span>
                        </div>
                      )}
                      {a.telefono && (
                        <div className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5" />
                          <span>{a.telefono}</span>
                        </div>
                      )}
                      {a.web && (
                        <div className="flex items-center gap-2">
                          <Globe className="w-3.5 h-3.5" />
                          <span className="truncate">{a.web}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex justify-end gap-1 mt-3 pt-3 border-t">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(a)} title="Editar">
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(a)} title="Eliminar" className="text-destructive hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingAseg ? 'Editar Aseguradora' : 'Nueva Aseguradora'}</DialogTitle>
            <DialogDescription>
              {editingAseg ? `Editando ${editingAseg.nombre}` : 'Registra una nueva compañía aseguradora'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nombre">Nombre *</Label>
              <Input
                id="nombre"
                value={formData.nombre}
                onChange={e => setFormData(prev => ({ ...prev, nombre: e.target.value }))}
                placeholder="AXA, MAPFRE, GNP..."
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="telefono">Teléfono</Label>
                <Input
                  id="telefono"
                  value={formData.telefono}
                  onChange={e => setFormData(prev => ({ ...prev, telefono: e.target.value }))}
                  placeholder="+34 91..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="info@aseguradora.com"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="web">Web</Label>
              <Input
                id="web"
                value={formData.web}
                onChange={e => setFormData(prev => ({ ...prev, web: e.target.value }))}
                placeholder="https://..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="direccion">Dirección</Label>
              <Input
                id="direccion"
                value={formData.direccion}
                onChange={e => setFormData(prev => ({ ...prev, direccion: e.target.value }))}
                placeholder="Calle, ciudad..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notas">Notas</Label>
              <Textarea
                id="notas"
                value={formData.notas}
                onChange={e => setFormData(prev => ({ ...prev, notas: e.target.value }))}
                placeholder="Notas internas..."
                rows={2}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Guardando...' : editingAseg ? 'Actualizar' : 'Crear'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
