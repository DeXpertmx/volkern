'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import {
  Tag,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Moon,
  DollarSign,
  Save,
  RefreshCcw,
  DoorOpen,
  Building2,
  CalendarX2,
  CalendarCheck2,
  Power,
  Copy,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AccionHospitality } from '@/components/hospitality/AccionHospitality';
import { MONEDAS_SELECCIONABLES, formatearImporte, primeraMoneda } from '@/lib/moneda';
import { useMonedaTenant } from '@/lib/use-moneda-tenant';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface Property {
  id: string;
  nombre: string;
}

interface Unit {
  id: string;
  propertyId: string;
  nombre: string;
  codigo: string | null;
  tarifaBase: number | null;
  moneda: string;
}

interface RatePlan {
  id: string;
  propertyId: string;
  unitId: string;
  nombre: string;
  codigo: string | null;
  tarifa: number;
  moneda: string;
  minNoches: number;
  maxNoches: number | null;
  checkInDias: number[] | null;
  checkOutDias: number[] | null;
  activo: boolean;
  unit?: { id: string; nombre: string; codigo: string | null };
  property?: { id: string; nombre: string };
}

/**
 * Divisas que el formulario ofrece. Salen del catálogo de la plataforma: la
 * lista no se escribe aquí, porque una divisa nueva del catálogo no aparecería.
 */
const MONEDAS = MONEDAS_SELECCIONABLES;
const DIAS_SEMANA = [
  { v: 0, label: 'Dom' },
  { v: 1, label: 'Lun' },
  { v: 2, label: 'Mar' },
  { v: 3, label: 'Mié' },
  { v: 4, label: 'Jue' },
  { v: 5, label: 'Vie' },
  { v: 6, label: 'Sáb' },
];

const EMPTY_FORM = {
  nombre: '', codigo: '', tarifa: '', moneda: '', minNoches: '1', maxNoches: '',
  checkInDias: [] as number[], checkOutDias: [] as number[], activo: true,
};

export default function HospitalityTarifasPage() {
  /** Moneda de reporte del tenant: respaldo de la divisa de una tarifa nueva. */
  const monedaTenant = useMonedaTenant();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [properties, setProperties] = useState<Property[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [plans, setPlans] = useState<RatePlan[]>([]);

  const [filterProperty, setFilterProperty] = useState('all');
  const [filterUnit, setFilterUnit] = useState('all');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RatePlan | null>(null);
  const [form, setForm] = useState<typeof EMPTY_FORM>({ ...EMPTY_FORM });
  const [deleteTarget, setDeleteTarget] = useState<RatePlan | null>(null);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      const [propRes, unitRes, planRes] = await Promise.all([
        fetch('/api/hospitality/properties'),
        fetch('/api/hospitality/units'),
        fetch('/api/hospitality/rateplans'),
      ]);
      if (propRes.ok) {
        const d = await propRes.json();
        setProperties(d.properties || []);
      }
      if (unitRes.ok) {
        const d = await unitRes.json();
        setUnits(d.units || []);
      }
      if (planRes.ok) {
        const d = await planRes.json();
        setPlans(d.ratePlans || []);
      }
    } catch {
      toast.error('Error al cargar tarifas y disponibilidad');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const filteredPlans = useMemo(() => {
    return plans.filter((p) => {
      if (filterProperty !== 'all' && p.propertyId !== filterProperty) return false;
      if (filterUnit !== 'all' && p.unitId !== filterUnit) return false;
      return true;
    });
  }, [plans, filterProperty, filterUnit]);

  const filteredUnits = useMemo(
    () => units.filter((u) => filterProperty === 'all' || u.propertyId === filterProperty),
    [units, filterProperty]
  );

  const stats = useMemo(() => {
    const activos = plans.filter((p) => p.activo);
    return {
      planes: plans.length,
      activos: activos.length,
      conRestriccionNoches: plans.filter((p) => p.minNoches > 1 || (p.maxNoches != null && p.maxNoches > 0)).length,
      conRestriccionDias: plans.filter((p) => (p.checkInDias?.length || 0) > 0 || (p.checkOutDias?.length || 0) > 0).length,
    };
  }, [plans]);

  const openNew = () => {
    setEditing(null);
    const defaultUnit = filteredUnits[0]?.id || '';
    setForm({
      ...EMPTY_FORM,
      // La tarifa se cobra en la divisa de la unidad que la vende; si la unidad
      // no declara ninguna, la de reporte del tenant — la misma precedencia que
      // aplica la API al crear el plan (y sin el mínimo del esquema como
      // primera opción: ese es la red de seguridad de la escritura, no una
      // divisa elegida).
      moneda: primeraMoneda(filteredUnits[0]?.moneda, monedaTenant),
      activo: true,
    });
    setDialogOpen(true);
  };

  const openEdit = (p: RatePlan) => {
    setEditing(p);
    setForm({
      nombre: p.nombre,
      codigo: p.codigo || '',
      tarifa: String(p.tarifa),
      moneda: p.moneda,
      minNoches: String(p.minNoches || 1),
      maxNoches: p.maxNoches != null ? String(p.maxNoches) : '',
      checkInDias: p.checkInDias || [],
      checkOutDias: p.checkOutDias || [],
      activo: p.activo,
    });
    setDialogOpen(true);
  };

  const toggleDia = (field: 'checkInDias' | 'checkOutDias', d: number) => {
    setForm((f) => ({
      ...f,
      [field]: (f[field] as number[]).includes(d)
        ? (f[field] as number[]).filter((x) => x !== d)
        : [...(f[field] as number[]), d],
    }));
  };

  const save = async () => {
    if (!form.nombre.trim() || !form.tarifa) {
      toast.error('Nombre y tarifa son obligatorios');
      return;
    }
    const tarifa = Number(form.tarifa);
    if (!tarifa || tarifa <= 0) {
      toast.error('La tarifa debe ser un número mayor a 0');
      return;
    }

    // Determinar unidad: al editar se usa la del plan; al crear, la del filtro.
    let unitId = editing?.unitId;
    if (!unitId) {
      if (filterUnit !== 'all') {
        unitId = filterUnit;
      } else {
        unitId = filteredUnits[0]?.id;
      }
    }
    if (!unitId) {
      toast.error('Selecciona primero una propiedad y una unidad');
      return;
    }
    const unit = units.find((u) => u.id === unitId);
    const propertyId = editing?.propertyId || unit?.propertyId;
    if (!propertyId) {
      toast.error('La unidad no tiene propiedad asociada');
      return;
    }

    setSaving(true);
    try {
      const body = {
        nombre: form.nombre.trim(),
        codigo: form.codigo.trim() || null,
        tarifa,
        moneda: form.moneda,
        minNoches: parseInt(form.minNoches) || 1,
        maxNoches: form.maxNoches ? parseInt(form.maxNoches) : null,
        checkInDias: form.checkInDias.length ? form.checkInDias : null,
        checkOutDias: form.checkOutDias.length ? form.checkOutDias : null,
        activo: form.activo,
      };
      const url = editing
        ? `/api/hospitality/rateplans/${editing.id}`
        : '/api/hospitality/rateplans';
      const res = await fetch(url, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing ? body : { ...body, unitId, propertyId }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(editing ? 'Plan actualizado (tarifas sincronizadas)' : 'Plan creado (tarifas sincronizadas)');
        setDialogOpen(false);
        await loadAll();
      } else {
        toast.error(data.error || 'Error al guardar el plan');
      }
    } catch {
      toast.error('Error al guardar el plan');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/hospitality/rateplans/${deleteTarget.id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Plan eliminado (tarifas sincronizadas)');
        await loadAll();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Error al eliminar');
      }
    } catch {
      toast.error('Error al eliminar el plan');
    } finally {
      setDeleteTarget(null);
    }
  };

  const syncManual = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/hospitality/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ diasHorizonte: 180 }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        toast.success(`Sincronización completada (${data.pushCount} push, ${data.errores} errores)`);
      } else {
        toast.error(data.error || data.message || 'La sincronización falló (revisa los sync-logs)');
      }
    } catch {
      toast.error('Error al sincronizar tarifas');
    } finally {
      setSyncing(false);
    }
  };

  const duplicar = async (p: RatePlan) => {
    try {
      const res = await fetch('/api/hospitality/rateplans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId: p.propertyId,
          unitId: p.unitId,
          nombre: `${p.nombre} (copia)`,
          codigo: p.codigo,
          tarifa: p.tarifa,
          moneda: p.moneda,
          minNoches: p.minNoches,
          maxNoches: p.maxNoches,
          checkInDias: p.checkInDias,
          checkOutDias: p.checkOutDias,
          activo: p.activo,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Plan duplicado');
        await loadAll();
      } else {
        toast.error(data.error || 'Error al duplicar');
      }
    } catch {
      toast.error('Error al duplicar el plan');
    }
  };

  const fmtDias = (dias: number[] | null | undefined): string => {
    if (!dias || dias.length === 0) return 'Sin restricción';
    return dias
      .slice()
      .sort((a, b) => a - b)
      .map((d) => DIAS_SEMANA.find((x) => x.v === d)?.label || String(d))
      .join(', ');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Tag className="h-8 w-8 text-primary" />
            Tarifas & Disponibilidad
          </h1>
          <p className="text-muted-foreground mt-1">
            Planes de tarifa por unidad y restricciones de venta, sincronizados con los canales de distribución
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AccionHospitality capacidad="integraciones.gestionar">
            <Button variant="outline" onClick={syncManual} disabled={syncing}>
              {syncing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCcw className="h-4 w-4 mr-1" />}
              Sincronizar tarifas
            </Button>
          </AccionHospitality>
          <Button onClick={openNew} disabled={filteredUnits.length === 0}>
            <Plus className="h-4 w-4 mr-2" /> Nuevo Plan
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4"><p className="text-2xl font-bold">{stats.planes}</p><p className="text-xs text-muted-foreground">Planes totales</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-2xl font-bold text-emerald-600">{stats.activos}</p><p className="text-xs text-muted-foreground">Planes activos</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-2xl font-bold">{stats.conRestriccionNoches}</p><p className="text-xs text-muted-foreground">Con restricción de noches</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-2xl font-bold">{stats.conRestriccionDias}</p><p className="text-xs text-muted-foreground">Con restricción de días</p></CardContent></Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Propiedad</Label>
            <Select value={filterProperty} onValueChange={(v) => { setFilterProperty(v); setFilterUnit('all'); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las propiedades</SelectItem>
                {properties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Unidad</Label>
            <Select value={filterUnit} onValueChange={setFilterUnit}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las unidades</SelectItem>
                {filteredUnits.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.nombre}{u.codigo ? ` (${u.codigo})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Lista de planes */}
      {filteredPlans.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Tag className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg font-semibold">Sin planes de tarifa</p>
            <p className="text-sm text-muted-foreground mb-4">
              {units.length === 0
                ? 'Primero crea unidades en Inicio → Propiedades, luego define sus tarifas'
                : 'Crea un plan de tarifa para una unidad. Si no defines planes, se usará la tarifa base de la unidad.'}
            </p>
            {filteredUnits.length > 0 && (
              <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" /> Nuevo Plan</Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredPlans.map((p) => (
            <Card key={p.id} className={p.activo ? '' : 'opacity-60'}>
              <CardContent className="p-4 flex flex-wrap items-center gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold">{p.nombre}</p>
                    {p.codigo && (
                      <Badge variant="outline" className="text-[10px] font-mono">{p.codigo}</Badge>
                    )}
                    {p.activo ? (
                      <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px]">Activo</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">Inactivo</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    <Building2 className="h-3 w-3 inline mr-1" />
                    {p.property?.nombre || 'Propiedad'}
                    <DoorOpen className="h-3 w-3 inline mx-1.5 ml-2" />
                    {p.unit?.nombre || 'Unidad'}
                    {p.unit?.codigo ? ` (${p.unit.codigo})` : ''}
                  </p>
                </div>

                <div className="flex items-center gap-4 text-sm">
                  <span className="flex items-center gap-1 font-semibold">
                    <DollarSign className="h-4 w-4 text-primary" />
                    {formatearImporte(p.tarifa, p.moneda)}
                    <span className="text-xs text-muted-foreground font-normal">/noche</span>
                  </span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Moon className="h-3.5 w-3.5" />
                    {p.minNoches}–{p.maxNoches != null ? p.maxNoches : '∞'} noches
                  </span>
                </div>

                <div className="hidden lg:block text-xs text-muted-foreground space-y-0.5">
                  <p className="flex items-center gap-1">
                    <CalendarX2 className="h-3 w-3" /> Check-in: {fmtDias(p.checkInDias)}
                  </p>
                  <p className="flex items-center gap-1">
                    <CalendarCheck2 className="h-3 w-3" /> Check-out: {fmtDias(p.checkOutDias)}
                  </p>
                </div>

                <div className="flex items-center gap-1">
                  <AccionHospitality capacidad="reservas.editar">
                    <Button variant="ghost" size="sm" onClick={() => duplicar(p)} title="Duplicar plan">
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </AccionHospitality>
                  <Button variant="outline" size="sm" onClick={() => openEdit(p)}>
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteTarget(p)}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Eliminar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog crear/editar plan */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Plan de Tarifa' : 'Nuevo Plan de Tarifa'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Actualiza la tarifa o restricciones; al guardar se sincronizan los canales.'
                : 'Define la tarifa por noche y las restricciones de venta de la unidad.'}
            </DialogDescription>
          </DialogHeader>

          {!editing && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Propiedad</Label>
                <Select
                  value={filterProperty}
                  onValueChange={(v) => { setFilterProperty(v); setFilterUnit('all'); }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {properties.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Unidad *</Label>
                <Select value={filterUnit !== 'all' ? filterUnit : ''} onValueChange={setFilterUnit}>
                  <SelectTrigger><SelectValue placeholder="Selecciona una unidad" /></SelectTrigger>
                  <SelectContent>
                    {filteredUnits.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.nombre}{u.codigo ? ` (${u.codigo})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rp-nombre">Nombre del plan *</Label>
                <Input
                  id="rp-nombre"
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  placeholder="Ej: Tarifa estándar"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rp-codigo">Código rateplan (opcional)</Label>
                <Input
                  id="rp-codigo"
                  value={form.codigo}
                  onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                  placeholder="Código del plan en el canal (si hay mapping)"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rp-tarifa">Tarifa / noche *</Label>
                <Input
                  id="rp-tarifa"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.tarifa}
                  onChange={(e) => setForm({ ...form, tarifa: e.target.value })}
                  placeholder="2500"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Moneda</Label>
                <Select value={form.moneda} onValueChange={(v) => setForm({ ...form, moneda: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONEDAS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Activo</Label>
                <Button
                  type="button"
                  variant={form.activo ? 'default' : 'outline'}
                  className="w-full"
                  onClick={() => setForm({ ...form, activo: !form.activo })}
                >
                  <Power className="h-4 w-4 mr-1" />
                  {form.activo ? 'Activo' : 'Inactivo'}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rp-min">Mínimo de noches</Label>
                <Input
                  id="rp-min"
                  type="number"
                  min={1}
                  value={form.minNoches}
                  onChange={(e) => setForm({ ...form, minNoches: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rp-max">Máximo de noches (vacío = sin límite)</Label>
                <Input
                  id="rp-max"
                  type="number"
                  min={0}
                  value={form.maxNoches}
                  onChange={(e) => setForm({ ...form, maxNoches: e.target.value })}
                  placeholder="Sin límite"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-3">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <CalendarX2 className="h-3.5 w-3.5" /> Días permitidos de check-in
                </Label>
                <div className="flex flex-wrap gap-1">
                  {DIAS_SEMANA.map((d) => (
                    <button
                      key={d.v}
                      type="button"
                      onClick={() => toggleDia('checkInDias', d.v)}
                      className={`text-xs rounded px-2 py-1 border transition-colors ${
                        form.checkInDias.includes(d.v)
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Sin selección = todos los días permitidos
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <CalendarCheck2 className="h-3.5 w-3.5" /> Días permitidos de check-out
                </Label>
                <div className="flex flex-wrap gap-1">
                  {DIAS_SEMANA.map((d) => (
                    <button
                      key={d.v}
                      type="button"
                      onClick={() => toggleDia('checkOutDias', d.v)}
                      className={`text-xs rounded px-2 py-1 border transition-colors ${
                        form.checkOutDias.includes(d.v)
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Sin selección = todos los días permitidos
                </p>
              </div>
            </div>

            <Alert>
              <AlertDescription className="text-xs">
                Al guardar, las tarifas se sincronizan automáticamente hacia los canales de distribución (push de tarifas). El resultado queda registrado en los sync-logs del panel de Conectividad.
              </AlertDescription>
            </Alert>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <AccionHospitality capacidad="reservas.editar">
              <Button onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Guardar
              </Button>
            </AccionHospitality>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmación de borrado */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              ¿Eliminar plan de tarifa?
            </DialogTitle>
            <DialogDescription>
              Vas a eliminar <strong>{deleteTarget?.nombre}</strong> de{' '}
              <strong>{deleteTarget?.unit?.nombre || 'la unidad'}</strong>. Las tarifas se resincronizarán sin este plan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <AccionHospitality capacidad="reservas.editar">
              <Button variant="destructive" onClick={confirmDelete}>
                <Trash2 className="h-4 w-4 mr-2" /> Sí, eliminar
              </Button>
            </AccionHospitality>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}