'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
  Upload,
} from 'lucide-react';
import { ImportEntityWizard } from '@/components/insurance/ImportEntityWizard';
import {
  buildTemplateAseguradoras,
  TEMPLATE_ASEGURADORAS_FILENAME,
} from '@/lib/insurance/csv-template';
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
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';

interface Aseguradora {
  id: string;
  nombre: string;
  nif: string | null;
  telefono: string | null;
  email: string | null;
  web: string | null;
  direccion: string | null;
  // Bloque 1: Identificación Legal y Fiscal
  razonSocial: string | null;
  nombreComercial: string | null;
  codigoPostal: string | null;
  provincia: string | null;
  pais: string | null;
  regimenFiscal: string | null;
  // Bloque 2: Regulación y Licencias
  numeroRegistro: string | null;
  ramosAutorizados: string[] | null;
  fechaVigenciaLicenciaInicio: string | null;
  fechaVigenciaLicenciaFin: string | null;
  notas: string | null;
  activa: boolean;
  _count: { polizas: number; productos: number };
  createdAt: string;
}

/**
 * Columnas canónicas que el wizard muestra en el paso 2 (mapeo).
 * Mantienen el mismo orden que el reporte descargable y los headers
 * del template bajado — así el corredor reconoce qué columna es cuál.
 */
const ASEGURADORAS_CANONICOS_UI: Array<{ key: string; label: string; required: boolean }> = [
  { key: 'nombre',                label: 'Nombre comercial',     required: true  },
  { key: 'razonSocial',           label: 'Razón social',         required: false },
  { key: 'nombreComercial',       label: 'Marca',                required: false },
  { key: 'identificacionFiscal',  label: 'RFC / NIT / RUC',      required: false },
  { key: 'domicilioFiscal',       label: 'Domicilio fiscal',     required: false },
  { key: 'codigoPostal',          label: 'Código postal',        required: false },
  { key: 'provincia',             label: 'Estado / Provincia',   required: false },
  { key: 'pais',                  label: 'País',                 required: false },
  { key: 'regimenFiscal',         label: 'Régimen fiscal',       required: false },
  { key: 'numeroRegistro',        label: 'Nº registro regulador', required: false },
  { key: 'ramosAutorizados',      label: 'Ramos autorizados',   required: false },
  { key: 'licenciaInicio',        label: 'Inicio licencia',      required: false },
  { key: 'licenciaVencimiento',   label: 'Vencimiento licencia', required: false },
  { key: 'representanteLegal',    label: 'Representante legal',  required: false },
  { key: 'telefono',              label: 'Teléfono',             required: false },
  { key: 'email',                 label: 'Email',                required: false },
  { key: 'sitioWeb',              label: 'Sitio web',            required: false },
  { key: 'notas',                 label: 'Notas',                required: false },
];

export default function AseguradorasPage() {
  const router = useRouter();
  const [aseguradoras, setAseguradoras] = useState<Aseguradora[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAseg, setEditingAseg] = useState<Aseguradora | null>(null);
  const [saving, setSaving] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);

  const [formData, setFormData] = useState({
    nombre: '',
    nif: '',
    telefono: '',
    email: '',
    web: '',
    direccion: '',
    razonSocial: '',
    nombreComercial: '',
    codigoPostal: '',
    provincia: '',
    pais: '',
    regimenFiscal: '',
    numeroRegistro: '',
    ramosAutorizados: '',
    fechaVigenciaLicenciaInicio: '',
    fechaVigenciaLicenciaFin: '',
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
    setFormData({
      nombre: '', nif: '', telefono: '', email: '', web: '', direccion: '',
      razonSocial: '', nombreComercial: '', codigoPostal: '', provincia: '', pais: '', regimenFiscal: '',
      numeroRegistro: '', ramosAutorizados: '', fechaVigenciaLicenciaInicio: '', fechaVigenciaLicenciaFin: '',
      notas: '', activa: true,
    });
    setIsFormOpen(true);
  };

  const handleEdit = (a: Aseguradora) => {
    setEditingAseg(a);
    setFormData({
      nombre: a.nombre,
      nif: a.nif || '',
      telefono: a.telefono || '',
      email: a.email || '',
      web: a.web || '',
      direccion: a.direccion || '',
      razonSocial: a.razonSocial || '',
      nombreComercial: a.nombreComercial || '',
      codigoPostal: a.codigoPostal || '',
      provincia: a.provincia || '',
      pais: a.pais || '',
      regimenFiscal: a.regimenFiscal || '',
      numeroRegistro: a.numeroRegistro || '',
      ramosAutorizados: Array.isArray(a.ramosAutorizados) ? a.ramosAutorizados.join(', ') : '',
      fechaVigenciaLicenciaInicio: a.fechaVigenciaLicenciaInicio ? a.fechaVigenciaLicenciaInicio.slice(0, 10) : '',
      fechaVigenciaLicenciaFin: a.fechaVigenciaLicenciaFin ? a.fechaVigenciaLicenciaFin.slice(0, 10) : '',
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

      // Convertir ramosAutorizados (string separado por comas) en array para la API
      const payload = {
        ...formData,
        ramosAutorizados: formData.ramosAutorizados
          ? formData.ramosAutorizados.split(',').map(r => r.trim()).filter(Boolean)
          : [],
      };

      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
            <Button variant="outline" onClick={() => setIsImportOpen(true)}>
              <Upload className="w-4 h-4 mr-2" />
              Importar
            </Button>
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
                      {a.razonSocial && a.razonSocial !== a.nombre && (
                        <div className="flex items-center gap-2">
                          <Building2 className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{a.razonSocial}</span>
                        </div>
                      )}
                      {a.nif && (
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs">{a.nif}</span>
                        </div>
                      )}
                      {a.numeroRegistro && (
                        <div className="flex items-center gap-2">
                          <span className="truncate text-xs">Reg. {a.numeroRegistro}</span>
                        </div>
                      )}
                      {Array.isArray(a.ramosAutorizados) && a.ramosAutorizados.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {a.ramosAutorizados.slice(0, 4).map((r) => (
                            <Badge key={r} variant="outline" className="text-[10px] font-normal px-1.5 py-0">
                              {r}
                            </Badge>
                          ))}
                          {a.ramosAutorizados.length > 4 && (
                            <span className="text-[10px] text-muted-foreground">+{a.ramosAutorizados.length - 4}</span>
                          )}
                        </div>
                      )}
                      {a.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{a.email}</span>
                        </div>
                      )}
                      {a.telefono && (
                        <div className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5 shrink-0" />
                          <span>{a.telefono}</span>
                        </div>
                      )}
                      {a.web && (
                        <div className="flex items-center gap-2">
                          <Globe className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{a.web}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex justify-end gap-1 mt-3 pt-3 border-t">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push(`/dashboard/seguros/aseguradoras/${a.id}`)}
                        title="Ver ficha completa"
                        className="text-xs mr-auto"
                      >
                        <ExternalLink className="w-3.5 h-3.5 mr-1" />
                        Ver ficha
                      </Button>
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
        <DialogContent className="max-w-3xl w-[95vw] max-h-[90vh] overflow-y-auto">
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

            {/* ── Identificación Legal y Fiscal (Bloque 1) ── */}
            <div className="rounded-lg border p-4 space-y-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Identificación Legal y Fiscal</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="razonSocial">Razón Social</Label>
                  <Input
                    id="razonSocial"
                    value={formData.razonSocial}
                    onChange={e => setFormData(prev => ({ ...prev, razonSocial: e.target.value }))}
                    placeholder="Grupo Asegurador, S.A."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nombreComercial">Nombre Comercial</Label>
                  <Input
                    id="nombreComercial"
                    value={formData.nombreComercial}
                    onChange={e => setFormData(prev => ({ ...prev, nombreComercial: e.target.value }))}
                    placeholder="AXA Seguros"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nif">Identificación Fiscal (NIF/CIF/RFC)</Label>
                  <Input
                    id="nif"
                    value={formData.nif}
                    onChange={e => setFormData(prev => ({ ...prev, nif: e.target.value }))}
                    placeholder="A12345678"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="regimenFiscal">Régimen Fiscal</Label>
                  <Input
                    id="regimenFiscal"
                    value={formData.regimenFiscal}
                    onChange={e => setFormData(prev => ({ ...prev, regimenFiscal: e.target.value }))}
                    placeholder="Gran Contribuyente, Agente de Retención..."
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="direccion">Domicilio Fiscal</Label>
                <Input
                  id="direccion"
                  value={formData.direccion}
                  onChange={e => setFormData(prev => ({ ...prev, direccion: e.target.value }))}
                  placeholder="Calle, número, colonia..."
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="codigoPostal">C.P.</Label>
                  <Input
                    id="codigoPostal"
                    value={formData.codigoPostal}
                    onChange={e => setFormData(prev => ({ ...prev, codigoPostal: e.target.value }))}
                    placeholder="28001"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="provincia">Provincia/Estado</Label>
                  <Input
                    id="provincia"
                    value={formData.provincia}
                    onChange={e => setFormData(prev => ({ ...prev, provincia: e.target.value }))}
                    placeholder="Madrid"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pais">País</Label>
                  <Input
                    id="pais"
                    value={formData.pais}
                    onChange={e => setFormData(prev => ({ ...prev, pais: e.target.value }))}
                    placeholder="España"
                  />
                </div>
              </div>
            </div>

            {/* ── Regulación y Licencias (Bloque 2) ── */}
            <div className="rounded-lg border p-4 space-y-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Regulación y Licencias</p>
              <div className="space-y-2">
                <Label htmlFor="numeroRegistro">Nº Registro / Licencia Reguladora</Label>
                <Input
                  id="numeroRegistro"
                  value={formData.numeroRegistro}
                  onChange={e => setFormData(prev => ({ ...prev, numeroRegistro: e.target.value }))}
                  placeholder="CNSF/DGSFP/Superintendencia..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ramosAutorizados">Ramos Autorizados</Label>
                <Input
                  id="ramosAutorizados"
                  value={formData.ramosAutorizados}
                  onChange={e => setFormData(prev => ({ ...prev, ramosAutorizados: e.target.value }))}
                  placeholder="Vida, Salud, Autos, Caución... (separados por coma)"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="fechaVigenciaLicenciaInicio">Vigencia Licencia — Inicio</Label>
                  <Input
                    id="fechaVigenciaLicenciaInicio"
                    type="date"
                    value={formData.fechaVigenciaLicenciaInicio}
                    onChange={e => setFormData(prev => ({ ...prev, fechaVigenciaLicenciaInicio: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fechaVigenciaLicenciaFin">Vigencia Licencia — Fin</Label>
                  <Input
                    id="fechaVigenciaLicenciaFin"
                    type="date"
                    value={formData.fechaVigenciaLicenciaFin}
                    onChange={e => setFormData(prev => ({ ...prev, fechaVigenciaLicenciaFin: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            {/* ── Contacto ── */}
            <div className="rounded-lg border p-4 space-y-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contacto</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <Label htmlFor="notas">Notas</Label>
                <Textarea
                  id="notas"
                  value={formData.notas}
                  onChange={e => setFormData(prev => ({ ...prev, notas: e.target.value }))}
                  placeholder="Notas internas..."
                  rows={3}
                />
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Checkbox
                  id="activa"
                  checked={formData.activa}
                  onCheckedChange={v => setFormData(prev => ({ ...prev, activa: !!v }))}
                />
                <Label htmlFor="activa" className="cursor-pointer">Aseguradora activa</Label>
              </div>
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

      <ImportEntityWizard
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        endpoint="/api/insurance/aseguradoras/importar"
        canonicalColumns={ASEGURADORAS_CANONICOS_UI}
        templateBuilder={buildTemplateAseguradoras}
        templateFilename={TEMPLATE_ASEGURADORAS_FILENAME}
        entityLabel="Aseguradoras"
        fileInputId="aseguradoras-wizard-file-input"
        requiredFieldsHint="Al menos el nombre comercial es obligatorio; el resto se infiere del CSV."
        extraTips={["Si tu archivo viene de Excel con acentos o celdas combinadas, el paso 'Análisis' detecta el delimitador y propone el mapeo automáticamente."]}
        onCompleted={() => loadAseguradoras()}
      />
    </div>
  );
}
