'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Search, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface TasaImpuesto {
  id: string;
  nombre: string;
  codigo: string;
  porcentaje: number;
  tipo: string;
  pais: string;
  estado: string | null;
  // Support both frontend and API field names
  esRetencion?: boolean;
  aplicaRetencion?: boolean;
  aplicaReverseCharge?: boolean;
  inversionSujetoPasivo?: boolean;
  vigenciaDesde?: string;
  fechaInicioVigencia?: string;
  vigenciaHasta?: string | null;
  fechaFinVigencia?: string | null;
  activo: boolean;
}

const PAISES = [
  { code: 'ES', name: 'España' },
  { code: 'MX', name: 'México' },
  { code: 'US', name: 'Estados Unidos' },
  { code: 'CL', name: 'Chile' },
  { code: 'AR', name: 'Argentina' },
  { code: 'CO', name: 'Colombia' },
  { code: 'PE', name: 'Perú' },
  { code: 'BR', name: 'Brasil' },
  { code: 'GB', name: 'Reino Unido' },
  { code: 'DE', name: 'Alemania' },
  { code: 'FR', name: 'Francia' },
  { code: 'IT', name: 'Italia' },
  { code: 'PT', name: 'Portugal' }
];

const TIPOS_IMPUESTO = [
  { value: 'IVA', label: 'IVA' },
  { value: 'ISR', label: 'ISR' },
  { value: 'IRPF', label: 'IRPF' },
  { value: 'IGV', label: 'IGV' },
  { value: 'GST', label: 'GST' },
  { value: 'SALES_TAX', label: 'Sales Tax' },
  { value: 'VAT', label: 'VAT' },
  { value: 'OTRO', label: 'Otro' }
];

interface Props {
  onUpdate: () => void;
}

export default function TasasImpuestoTab({ onUpdate }: Props) {
  const [tasas, setTasas] = useState<TasaImpuesto[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTasa, setEditingTasa] = useState<TasaImpuesto | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPais, setFilterPais] = useState<string>('all');
  const [filterTipo, setFilterTipo] = useState<string>('all');

  const [formData, setFormData] = useState({
    nombre: '',
    codigo: '',
    porcentaje: 0,
    tipo: 'IVA',
    pais: 'ES',
    estado: '',
    esRetencion: false,
    aplicaReverseCharge: false,
    vigenciaDesde: new Date().toISOString().split('T')[0],
    vigenciaHasta: '',
    activo: true
  });

  useEffect(() => {
    fetchTasas();
  }, []);

  const fetchTasas = async () => {
    try {
      const res = await fetch('/api/configuracion/fiscal/tasas');
      if (res.ok) {
        const data = await res.json();
        setTasas(data.tasas || []);
      }
    } catch (error) {
      toast.error('Error al cargar tasas');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      const url = editingTasa
        ? `/api/configuracion/fiscal/tasas/${editingTasa.id}`
        : '/api/configuracion/fiscal/tasas';
      const method = editingTasa ? 'PATCH' : 'POST';

      // Map frontend field names to API/schema field names
      const payload = {
        nombre: formData.nombre,
        codigo: formData.codigo,
        porcentaje: formData.porcentaje,
        tipo: formData.tipo,
        pais: formData.pais,
        estado: formData.estado || null,
        aplicaRetencion: formData.esRetencion,
        inversionSujetoPasivo: formData.aplicaReverseCharge,
        fechaInicioVigencia: formData.vigenciaDesde || null,
        fechaFinVigencia: formData.vigenciaHasta || null,
        activo: formData.activo
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        toast.success(editingTasa ? 'Tasa actualizada' : 'Tasa creada');
        setDialogOpen(false);
        resetForm();
        fetchTasas();
        onUpdate();
      } else {
        const error = await res.json();
        toast.error(error.error || 'Error al guardar');
      }
    } catch (error) {
      toast.error('Error de conexión');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta tasa de impuesto?')) return;

    try {
      const res = await fetch(`/api/configuracion/fiscal/tasas/${id}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        toast.success('Tasa eliminada');
        fetchTasas();
        onUpdate();
      } else {
        toast.error('Error al eliminar');
      }
    } catch (error) {
      toast.error('Error de conexión');
    }
  };

  const handleEdit = (tasa: TasaImpuesto) => {
    setEditingTasa(tasa);
    // Map API field names to frontend form field names
    const vigencia = tasa.fechaInicioVigencia || tasa.vigenciaDesde || '';
    const vigenciaFin = tasa.fechaFinVigencia || tasa.vigenciaHasta || '';
    setFormData({
      nombre: tasa.nombre || '',
      codigo: tasa.codigo || '',
      porcentaje: tasa.porcentaje || 0,
      tipo: tasa.tipo || 'IVA',
      pais: tasa.pais || 'MX',
      estado: tasa.estado || '',
      esRetencion: tasa.aplicaRetencion || tasa.esRetencion || false,
      aplicaReverseCharge: tasa.inversionSujetoPasivo || tasa.aplicaReverseCharge || false,
      vigenciaDesde: vigencia ? vigencia.split('T')[0] : new Date().toISOString().split('T')[0],
      vigenciaHasta: vigenciaFin ? vigenciaFin.split('T')[0] : '',
      activo: tasa.activo !== false
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setEditingTasa(null);
    setFormData({
      nombre: '',
      codigo: '',
      porcentaje: 0,
      tipo: 'IVA',
      pais: 'ES',
      estado: '',
      esRetencion: false,
      aplicaReverseCharge: false,
      vigenciaDesde: new Date().toISOString().split('T')[0],
      vigenciaHasta: '',
      activo: true
    });
  };

  const filteredTasas = tasas.filter(t => {
    const matchSearch = t.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        t.codigo.toLowerCase().includes(searchTerm.toLowerCase());
    const matchPais = filterPais === 'all' || t.pais === filterPais;
    const matchTipo = filterTipo === 'all' || t.tipo === filterTipo;
    return matchSearch && matchPais && matchTipo;
  });

  const getPaisName = (code: string) => PAISES.find(p => p.code === code)?.name || code;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Tasas de Impuesto</CardTitle>
            <CardDescription>
              Configura las tasas de IVA, retenciones y otros impuestos por país
            </CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Nueva Tasa
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{editingTasa ? 'Editar Tasa' : 'Nueva Tasa de Impuesto'}</DialogTitle>
                <DialogDescription>
                  Define los parámetros de la tasa impositiva
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-4 py-4">
                <div className="space-y-2">
                  <Label>Nombre</Label>
                  <Input
                    value={formData.nombre}
                    onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                    placeholder="IVA General"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Código</Label>
                  <Input
                    value={formData.codigo}
                    onChange={(e) => setFormData({ ...formData, codigo: e.target.value })}
                    placeholder="IVA_16"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Porcentaje (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.porcentaje}
                    onChange={(e) => setFormData({ ...formData, porcentaje: parseFloat(e.target.value) || 0 })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select value={formData.tipo} onValueChange={(v) => setFormData({ ...formData, tipo: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPOS_IMPUESTO.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>País</Label>
                  <Select value={formData.pais} onValueChange={(v) => setFormData({ ...formData, pais: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAISES.map(p => (
                        <SelectItem key={p.code} value={p.code}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Estado/Región (opcional)</Label>
                  <Input
                    value={formData.estado}
                    onChange={(e) => setFormData({ ...formData, estado: e.target.value })}
                    placeholder="California, CDMX..."
                  />
                </div>

                <div className="space-y-2">
                  <Label>Vigencia Desde</Label>
                  <Input
                    type="date"
                    value={formData.vigenciaDesde}
                    onChange={(e) => setFormData({ ...formData, vigenciaDesde: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Vigencia Hasta (opcional)</Label>
                  <Input
                    type="date"
                    value={formData.vigenciaHasta}
                    onChange={(e) => setFormData({ ...formData, vigenciaHasta: e.target.value })}
                  />
                </div>

                <div className="col-span-2 flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={formData.esRetencion}
                      onCheckedChange={(checked) => setFormData({ ...formData, esRetencion: checked })}
                    />
                    <Label>Es Retención</Label>
                  </div>

                  <div className="flex items-center gap-2">
                    <Switch
                      checked={formData.aplicaReverseCharge}
                      onCheckedChange={(checked) => setFormData({ ...formData, aplicaReverseCharge: checked })}
                    />
                    <Label>Aplica Reverse Charge</Label>
                  </div>

                  <div className="flex items-center gap-2">
                    <Switch
                      checked={formData.activo}
                      onCheckedChange={(checked) => setFormData({ ...formData, activo: checked })}
                    />
                    <Label>Activo</Label>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                <Button onClick={handleSubmit}>
                  {editingTasa ? 'Actualizar' : 'Crear'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="flex gap-4 mb-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre o código..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <Select value={filterPais} onValueChange={setFilterPais}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="País" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los países</SelectItem>
              {PAISES.map(p => (
                <SelectItem key={p.code} value={p.code}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterTipo} onValueChange={setFilterTipo}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los tipos</SelectItem>
              {TIPOS_IMPUESTO.map(t => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Porcentaje</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>País</TableHead>
                <TableHead>Flags</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-[100px]">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Cargando...
                  </TableCell>
                </TableRow>
              ) : filteredTasas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No hay tasas configuradas
                  </TableCell>
                </TableRow>
              ) : (
                filteredTasas.map((tasa) => (
                  <TableRow key={tasa.id}>
                    <TableCell className="font-medium">{tasa.nombre}</TableCell>
                    <TableCell><code className="text-xs bg-muted px-1 py-0.5 rounded">{tasa.codigo}</code></TableCell>
                    <TableCell>{tasa.porcentaje}%</TableCell>
                    <TableCell>
                      <Badge variant="outline">{tasa.tipo}</Badge>
                    </TableCell>
                    <TableCell>{getPaisName(tasa.pais)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {(tasa.aplicaRetencion || tasa.esRetencion) && <Badge variant="secondary" className="text-xs">Ret</Badge>}
                        {(tasa.inversionSujetoPasivo || tasa.aplicaReverseCharge) && <Badge variant="secondary" className="text-xs">RC</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={tasa.activo ? 'default' : 'secondary'}>
                        {tasa.activo ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(tasa)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(tasa.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
