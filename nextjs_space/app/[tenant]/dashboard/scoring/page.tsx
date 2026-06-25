
'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Award,
  Plus,
  Edit2,
  Trash2,
  TrendingUp,
  Users,
  BarChart3,
  Settings,
  Flame,
  Sun,
  Snowflake,
  Moon,
} from 'lucide-react';
import { toast } from 'sonner';

interface ScoringRule {
  id: string;
  nombre: string;
  descripcion: string | null;
  categoria: string;
  evento: string;
  puntos: number;
  activo: boolean;
  orden: number;
}

interface ScoreCategory {
  id: string;
  nombre: string;
  etiqueta: string;
  descripcion: string | null;
  puntuacionMin: number;
  puntuacionMax: number;
  color: string;
  icono: string | null;
  orden: number;
}

interface Stats {
  totalLeads: number;
  promedioScore: number;
  distribucionCategorias: Record<string, number>;
  topLeads: Array<{
    leadId: string;
    nombre: string;
    puntuacion: number;
    categoria: string | null;
  }>;
}

const categoryIcons: Record<string, any> = {
  Flame: Flame,
  Sun: Sun,
  Snowflake: Snowflake,
  Moon: Moon,
};

export default function ScoringPage() {
  const [rules, setRules] = useState<ScoringRule[]>([]);
  const [categories, setCategories] = useState<ScoreCategory[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingRule, setEditingRule] = useState<ScoringRule | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  const fetchData = async () => {
    try {
      setLoading(true);
      const [rulesRes, categoriesRes, statsRes] = await Promise.all([
        fetch('/api/scoring/rules'),
        fetch('/api/scoring/categories'),
        fetch('/api/scoring/stats'),
      ]);

      if (rulesRes.ok) {
        const rulesData = await rulesRes.json();
        setRules(Array.isArray(rulesData) ? rulesData : []);
      }
      if (categoriesRes.ok) {
        const categoriesData = await categoriesRes.json();
        setCategories(Array.isArray(categoriesData) ? categoriesData : []);
      }
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }
    } catch (error) {
      console.error('Error cargando datos:', error);
      toast.error('Error cargando datos de scoring');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSaveRule = async (rule: Partial<ScoringRule>) => {
    try {
      const method = rule.id ? 'PUT' : 'POST';
      const response = await fetch('/api/scoring/rules', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rule),
      });

      if (response.ok) {
        toast.success(rule.id ? 'Regla actualizada' : 'Regla creada');
        setIsDialogOpen(false);
        setEditingRule(null);
        fetchData();
      } else {
        toast.error('Error guardando regla');
      }
    } catch (error) {
      console.error('Error guardando regla:', error);
      toast.error('Error guardando regla');
    }
  };

  const handleDeleteRule = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar esta regla?')) return;

    try {
      const response = await fetch(`/api/scoring/rules?id=${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast.success('Regla eliminada');
        fetchData();
      } else {
        toast.error('Error eliminando regla');
      }
    } catch (error) {
      console.error('Error eliminando regla:', error);
      toast.error('Error eliminando regla');
    }
  };

  const handleToggleRule = async (rule: ScoringRule) => {
    try {
      const response = await fetch('/api/scoring/rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...rule, activo: !rule.activo }),
      });

      if (response.ok) {
        toast.success(`Regla ${!rule.activo ? 'activada' : 'desactivada'}`);
        fetchData();
      } else {
        toast.error('Error actualizando regla');
      }
    } catch (error) {
      console.error('Error actualizando regla:', error);
      toast.error('Error actualizando regla');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Cargando sistema de scoring...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Sistema de Puntuación</h1>
          <p className="text-muted-foreground mt-1">
            Gestiona reglas de scoring y categorías de leads
          </p>
        </div>

        <div className="space-y-4">
          <div className="border-b border-border">
            <div className="flex gap-2">
              <Button
                variant={activeTab === 'overview' ? 'default' : 'ghost'}
                onClick={() => setActiveTab('overview')}
                className="rounded-b-none"
              >
                Resumen
              </Button>
              <Button
                variant={activeTab === 'rules' ? 'default' : 'ghost'}
                onClick={() => setActiveTab('rules')}
                className="rounded-b-none"
              >
                Reglas de Puntuación
              </Button>
              <Button
                variant={activeTab === 'categories' ? 'default' : 'ghost'}
                onClick={() => setActiveTab('categories')}
                className="rounded-b-none"
              >
                Categorías
              </Button>
            </div>
          </div>

          {activeTab === 'overview' && (
            <div className="space-y-6">
            {/* Estadísticas generales */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total de Leads</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats?.totalLeads || 0}</div>
                  <p className="text-xs text-muted-foreground">Con puntuación asignada</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Score Promedio</CardTitle>
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats?.promedioScore || 0}</div>
                  <p className="text-xs text-muted-foreground">Puntuación media</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Reglas Activas</CardTitle>
                  <Settings className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {rules.filter((r) => r.activo).length}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    De {rules.length} reglas totales
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Categorías</CardTitle>
                  <Award className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{categories.length}</div>
                  <p className="text-xs text-muted-foreground">Rangos de puntuación</p>
                </CardContent>
              </Card>
            </div>

            {/* Distribución por categorías */}
            <Card>
              <CardHeader>
                <CardTitle>Distribución de Leads por Categoría</CardTitle>
                <CardDescription>Clasificación basada en puntuación</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {categories.map((cat) => {
                    const count = stats?.distribucionCategorias[cat.nombre] || 0;
                    const Icon = cat.icono ? categoryIcons[cat.icono] : Award;

                    return (
                      <div key={cat.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div
                            className="p-2 rounded-lg"
                            style={{ backgroundColor: cat.color }}
                          >
                            <Icon className="h-4 w-4 text-white" />
                          </div>
                          <div>
                            <p className="font-medium">{cat.etiqueta}</p>
                            <p className="text-sm text-muted-foreground">
                              {cat.puntuacionMin} - {cat.puntuacionMax} puntos
                            </p>
                          </div>
                        </div>
                        <Badge variant="secondary">{count} leads</Badge>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Top Leads */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <TrendingUp className="h-5 w-5 mr-2" />
                  Top 10 Leads por Puntuación
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Puntuación</TableHead>
                      <TableHead>Categoría</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(stats?.topLeads && stats.topLeads.length > 0) ? (
                      stats.topLeads.map((lead) => (
                        <TableRow key={lead.leadId}>
                          <TableCell className="font-medium">{lead.nombre}</TableCell>
                          <TableCell>{lead.puntuacion}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{lead.categoria || 'N/A'}</Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                          No hay leads con puntuación aún
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            </div>
          )}

          {activeTab === 'rules' && (
            <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-semibold">Reglas de Puntuación</h3>
                <p className="text-sm text-muted-foreground">
                  Gestiona las reglas que otorgan puntos a los leads
                </p>
              </div>
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={() => setEditingRule(null)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Nueva Regla
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>
                      {editingRule ? 'Editar Regla' : 'Nueva Regla de Puntuación'}
                    </DialogTitle>
                    <DialogDescription>
                      Configura cuántos puntos se otorgan por eventos específicos
                    </DialogDescription>
                  </DialogHeader>
                  <RuleForm
                    rule={editingRule}
                    onSave={handleSaveRule}
                    onCancel={() => {
                      setIsDialogOpen(false);
                      setEditingRule(null);
                    }}
                  />
                </DialogContent>
              </Dialog>
            </div>

            <Card>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Categoría</TableHead>
                      <TableHead>Evento</TableHead>
                      <TableHead>Puntos</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rules.map((rule) => (
                      <TableRow key={rule.id}>
                        <TableCell className="font-medium">{rule.nombre}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{rule.categoria}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {rule.evento}
                        </TableCell>
                        <TableCell>
                          <Badge variant={rule.puntos > 0 ? 'default' : 'destructive'}>
                            {rule.puntos > 0 ? '+' : ''}
                            {rule.puntos}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={rule.activo}
                            onCheckedChange={() => handleToggleRule(rule)}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditingRule(rule);
                                setIsDialogOpen(true);
                              }}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteRule(rule.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            </div>
          )}

          {activeTab === 'categories' && (
            <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold">Categorías de Leads</h3>
              <p className="text-sm text-muted-foreground">
                Define los rangos de puntuación para clasificar leads
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {categories.map((cat) => {
                const Icon = cat.icono ? categoryIcons[cat.icono] : Award;

                return (
                  <Card key={cat.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div
                            className="p-3 rounded-lg"
                            style={{ backgroundColor: cat.color }}
                          >
                            <Icon className="h-6 w-6 text-white" />
                          </div>
                          <div>
                            <CardTitle>{cat.etiqueta}</CardTitle>
                            <CardDescription>Categoría {cat.nombre}</CardDescription>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Rango:</span>
                        <Badge variant="outline">
                          {cat.puntuacionMin} - {cat.puntuacionMax} puntos
                        </Badge>
                      </div>
                      {cat.descripcion && (
                        <p className="text-sm text-muted-foreground">{cat.descripcion}</p>
                      )}
                      <div className="flex items-center justify-between pt-2">
                        <span className="text-sm font-medium">
                          Leads: {stats?.distribucionCategorias[cat.nombre] || 0}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            </div>
          )}
        </div>
      </div>
  );
}

// Componente auxiliar para el formulario de reglas
function RuleForm({
  rule,
  onSave,
  onCancel,
}: {
  rule: ScoringRule | null;
  onSave: (rule: Partial<ScoringRule>) => void;
  onCancel: () => void;
}) {
  const [formData, setFormData] = useState({
    nombre: rule?.nombre || '',
    descripcion: rule?.descripcion || '',
    categoria: rule?.categoria || 'demografica',
    evento: rule?.evento || '',
    puntos: rule?.puntos || 0,
    activo: rule?.activo !== undefined ? rule.activo : true,
    orden: rule?.orden || 0,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(rule ? { ...rule, ...formData } : formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="nombre">Nombre de la Regla</Label>
        <Input
          id="nombre"
          value={formData.nombre}
          onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="descripcion">Descripción</Label>
        <Textarea
          id="descripcion"
          value={formData.descripcion}
          onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
          rows={3}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="categoria">Categoría</Label>
          <Select
            value={formData.categoria}
            onValueChange={(value) => setFormData({ ...formData, categoria: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="demografica">Demográfica</SelectItem>
              <SelectItem value="comportamiento">Comportamiento</SelectItem>
              <SelectItem value="interaccion">Interacción</SelectItem>
              <SelectItem value="engagement">Engagement</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="puntos">Puntos</Label>
          <Input
            id="puntos"
            type="number"
            value={formData.puntos}
            onChange={(e) =>
              setFormData({ ...formData, puntos: parseInt(e.target.value) || 0 })
            }
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="evento">Evento</Label>
        <Input
          id="evento"
          value={formData.evento}
          onChange={(e) => setFormData({ ...formData, evento: e.target.value })}
          placeholder="ej: cita_agendada, email_abierto"
          required
        />
        <p className="text-xs text-muted-foreground">
          El identificador del evento que dispara esta regla
        </p>
      </div>

      <div className="flex items-center space-x-2">
        <Switch
          id="activo"
          checked={formData.activo}
          onCheckedChange={(checked) => setFormData({ ...formData, activo: checked })}
        />
        <Label htmlFor="activo">Regla activa</Label>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit">{rule ? 'Guardar Cambios' : 'Crear Regla'}</Button>
      </DialogFooter>
    </form>
  );
}
