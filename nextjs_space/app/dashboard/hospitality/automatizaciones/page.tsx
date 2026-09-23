'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Power,
  PowerOff,
  Play,
  ListChecks,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AccionHospitality } from '@/components/hospitality/AccionHospitality';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface AccionResultado {
  type: string;
  /** `skipped`: la acción ya se había ejecutado para ese ámbito (idempotencia). */
  status: 'success' | 'failed' | 'skipped';
  durationMs?: number;
  error?: string;
  entityId?: string | null;
  reason?: string;
}

interface ResultadoEjecucion {
  message?: string;
  actions?: AccionResultado[];
  durationMs?: number;
  queuedAt?: string;
  finishedAt?: string;
}

interface LogEntry {
  id: string;
  entityId?: string | null;
  status: string;
  error?: string | null;
  result?: ResultadoEjecucion | null;
  executedAt: string;
  rule?: { id: string; name: string; triggerType: string } | null;
}

interface Regla {
  id: string;
  tenantId: string;
  name: string;
  description?: string | null;
  triggerType: string;
  conditions: any;
  actions: any[];
  isActive: boolean;
  createdAt: string;
  _count?: { logs: number };
  logs?: LogEntry[];
}

/**
 * Estados reales de una ejecución:
 *   queued  → encolada, el worker todavía no la ha tomado
 *   running → el worker la está ejecutando
 *   success → todas las acciones se completaron
 *   partial → algunas acciones fallaron
 *   failed  → no se pudo ejecutar (cola caída, worker caído o todas las acciones con error)
 */
const ESTADOS: Record<string, { label: string; clase: string }> = {
  queued: { label: 'Encolada', clase: 'bg-slate-100 text-slate-700 border-slate-200' },
  running: { label: 'Ejecutando', clase: 'bg-amber-50 text-amber-700 border-amber-200' },
  success: { label: 'Éxito', clase: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  partial: { label: 'Parcial', clase: 'bg-amber-50 text-amber-700 border-amber-200' },
  failed: { label: 'Falló', clase: 'bg-red-50 text-red-700 border-red-200' },
};

const EN_CURSO = ['queued', 'running'];

function EstadoBadge({ status }: { status: string }) {
  const e = ESTADOS[status] || { label: status, clase: 'bg-slate-100 text-slate-700 border-slate-200' };
  const enCurso = EN_CURSO.includes(status);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${e.clase}`}
    >
      {enCurso ? (
        <CircleDashed className="h-3 w-3 animate-spin" />
      ) : status === 'success' ? (
        <CheckCircle2 className="h-3 w-3" />
      ) : (
        <AlertTriangle className="h-3 w-3" />
      )}
      {e.label}
    </span>
  );
}

/** Detalle real de la ejecución: mensaje, duración, acciones fallidas y causa. */
function DetalleEjecucion({ log }: { log: LogEntry }) {
  const r = log.result || undefined;
  const acciones: AccionResultado[] = Array.isArray(r?.actions) ? (r?.actions as AccionResultado[]) : [];
  const fallidas = acciones.filter((a) => a.status === 'failed');
  const omitidas = acciones.filter((a) => a.status === 'skipped');

  return (
    <div className="space-y-0.5 max-w-md">
      <p className="text-xs">{r?.message || '—'}</p>
      <p className="text-[11px] text-muted-foreground">
        {typeof r?.durationMs === 'number' ? `${r.durationMs} ms` : 'sin duración'}
        {acciones.length > 0 ? ` · ${acciones.length} acción(es)` : ''}
      </p>
      {fallidas.length > 0 && (
        <ul className="text-[11px] text-destructive space-y-0.5">
          {fallidas.map((a, i) => (
            <li key={`${a.type}-${i}`}>
              {a.type}: {a.error || 'error desconocido'}
            </li>
          ))}
        </ul>
      )}
      {omitidas.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {omitidas.length} acción(es) no repetida(s): ya se había(n) ejecutado para este ámbito
        </p>
      )}
      {log.error && !fallidas.length && (
        <p className="text-[11px] text-destructive">{log.error}</p>
      )}
    </div>
  );
}

const TRIGGERS = [
  { id: 'hospitality_reservation_created', label: 'Reserva creada', icon: '📥', desc: 'Al recibir una reserva nueva del canal', sugerencia: 'Crear tarea de preparación de la unidad' },
  { id: 'hospitality_reservation_modified', label: 'Reserva modificada', icon: '✏️', desc: 'Al cambiar fechas, unidad o importe', sugerencia: 'Reenviar confirmación actualizada' },
  { id: 'hospitality_reservation_cancelled', label: 'Reserva cancelada', icon: '❌', desc: 'Al cancelarse una reserva', sugerencia: 'Liberar disponibilidad y avisar' },
  { id: 'hospitality_reservation_checked_in', label: 'Check-in realizado', icon: '🔑', desc: 'Al registrar el check-in', sugerencia: 'Enviar instrucciones de acceso' },
  { id: 'hospitality_reservation_checked_out', label: 'Check-out realizado', icon: '👋', desc: 'Al registrar el check-out', sugerencia: 'Crear tarea de limpieza' },
  { id: 'hospitality_checkin_due', label: 'Check-in en 24h', icon: '⏰', desc: '24 horas antes de la llegada', sugerencia: 'Enviar recordatorio de llegada' },
  { id: 'hospitality_cleaning_completed', label: 'Limpieza completada', icon: '🧹', desc: 'Al cerrar una tarea de limpieza', sugerencia: 'Marcar unidad disponible' },
  { id: 'hospitality_maintenance_created', label: 'Mantenimiento creado', icon: '🔧', desc: 'Al registrar una incidencia', sugerencia: 'Notificar al responsable' },
  { id: 'hospitality_maintenance_completed', label: 'Mantenimiento completado', icon: '✅', desc: 'Al resolver la incidencia', sugerencia: 'Avisar que la unidad vuelve al inventario' },
];

const ACCIONES = [
  { id: 'CREATE_HOSPITALITY_TASK', label: 'Crear tarea', icon: '📋', desc: 'Crea una tarea de preparación/seguimiento en el CRM' },
  { id: 'CREATE_HOSPITALITY_CLEANING', label: 'Crear limpieza', icon: '🧹', desc: 'Crea una tarea de limpieza para la unidad' },
  { id: 'SEND_GUEST_MESSAGE', label: 'Enviar mensaje', icon: '💬', desc: 'Envía la plantilla de comunicación al huésped' },
  { id: 'SET_UNIT_STATUS', label: 'Cambiar estado unidad', icon: '🏠', desc: 'Cambia el estado operativo de la unidad' },
];

const ACCION_PLANTILLAS: Record<string, any> = {
  CREATE_HOSPITALITY_TASK: { taskType: 'PREPARACION', title: 'Preparar estancia', dueInHours: 24 },
  CREATE_HOSPITALITY_CLEANING: { priority: 'normal' },
  SEND_GUEST_MESSAGE: { evento: 'check_in' },
  SET_UNIT_STATUS: { status: 'available' },
};

const EMPTY_FORM = {
  name: '',
  description: '',
  triggerType: 'hospitality_reservation_created',
  actionType: 'CREATE_HOSPITALITY_TASK',
  isActive: true,
};

export default function HospitalityAutomatizacionesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reglas, setReglas] = useState<Regla[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Regla | null>(null);
  const [form, setForm] = useState<typeof EMPTY_FORM>({ ...EMPTY_FORM });

  const [deleteTarget, setDeleteTarget] = useState<Regla | null>(null);
  const [testTarget, setTestTarget] = useState<Regla | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/hospitality/automatizaciones');
      if (res.ok) {
        const d = await res.json();
        setReglas(d.reglas || []);
        setLogs(d.logs || []);
      }
    } catch {
      toast.error('Error al cargar las automatizaciones');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const stats = useMemo(() => {
    const activas = reglas.filter((r) => r.isActive);
    const porTrigger: Record<string, number> = {};
    for (const r of reglas) porTrigger[r.triggerType] = (porTrigger[r.triggerType] || 0) + 1;
    return {
      total: reglas.length,
      activas: activas.length,
      ejecuciones: logs.length,
      triggersCubiertos: Object.keys(porTrigger).length,
      conFallo: logs.filter((l) => l.status === 'failed' || l.status === 'partial').length,
      enCurso: logs.filter((l) => EN_CURSO.includes(l.status)).length,
    };
  }, [reglas, logs]);

  const triggerLabel = (t: string) => TRIGGERS.find((x) => x.id === t)?.label || t;

  const openNew = (triggerType?: string) => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, triggerType: triggerType || EMPTY_FORM.triggerType });
    setDialogOpen(true);
  };

  const openEdit = (r: Regla) => {
    setEditing(r);
    setForm({
      name: r.name,
      description: r.description || '',
      triggerType: r.triggerType,
      actionType: r.actions[0]?.type || 'CREATE_HOSPITALITY_TASK',
      isActive: r.isActive,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }
    setSaving(true);
    try {
      const actionConfig = ACCION_PLANTILLAS[form.actionType] || {};
      const actions = [{ type: form.actionType, ...actionConfig }];
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        triggerType: form.triggerType,
        actions,
        conditions: {},
        isActive: form.isActive,
      };
      const url = editing ? `/api/hospitality/automatizaciones/${editing.id}` : '/api/hospitality/automatizaciones';
      const res = await fetch(url, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || 'Error al guardar la automatización');
        return;
      }
      toast.success(editing ? 'Automatización actualizada' : 'Automatización creada');
      setDialogOpen(false);
      loadAll();
    } catch {
      toast.error('Error al guardar la automatización');
    } finally {
      setSaving(false);
    }
  };

  const toggleActivo = async (r: Regla) => {
    try {
      const res = await fetch(`/api/hospitality/automatizaciones/${r.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !r.isActive }),
      });
      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error || 'Error al cambiar el estado');
        return;
      }
      toast.success(r.isActive ? 'Automatización desactivada' : 'Automatización activada');
      loadAll();
    } catch {
      toast.error('Error al cambiar el estado');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/hospitality/automatizaciones/${deleteTarget.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error || 'Error al eliminar');
        return;
      }
      toast.success('Automatización eliminada');
      setDeleteTarget(null);
      loadAll();
    } catch {
      toast.error('Error al eliminar la automatización');
    }
  };

  const runTest = async () => {
    if (!testTarget) return;
    const reglaId = testTarget.id;
    setTesting(true);
    setTestResult('⏳ Disparando la regla y esperando el resultado real del worker...');
    try {
      const res = await fetch(`/api/hospitality/automatizaciones/${reglaId}/test`, { method: 'POST' });
      const d = await res.json();
      if (!res.ok) {
        setTestResult(`❌ ${d.error || 'Error al probar'}`);
        return;
      }

      // El motor solo ENCOLA: el desenlace real lo escribe el worker sobre el
      // log. Sonódeamos la ejecución más reciente de la regla hasta que salga
      // de `queued`/`running`, para no mostrar un éxito falso.
      let final: LogEntry | undefined;
      for (let intento = 0; intento < 8; intento++) {
        await new Promise((r) => setTimeout(r, 1200));
        const r2 = await fetch('/api/hospitality/automatizaciones');
        if (!r2.ok) break;
        const d2 = await r2.json();
        const logs2: LogEntry[] = d2.logs || [];
        setReglas(d2.reglas || []);
        setLogs(logs2);
        const masReciente = logs2.find((l) => l.rule?.id === reglaId);
        if (masReciente && !EN_CURSO.includes(masReciente.status)) {
          final = masReciente;
          break;
        }
      }

      if (!final) {
        setTestResult('⏳ La ejecución sigue encolada: el worker no la ha procesado todavía. Revisa "Ejecuciones recientes".');
        toast.warning('La automatización quedó encolada sin procesar');
        return;
      }

      if (final.status === 'success') {
        setTestResult(`✅ ${final.result?.message || 'Ejecutada correctamente'}`);
        toast.success('Automatización ejecutada');
      } else {
        setTestResult(
          `❌ ${final.result?.message || final.status}${final.error ? ` — ${final.error}` : ''}`
        );
        toast.error('La automatización falló');
      }
    } catch {
      setTestResult('❌ Error de conexión al probar');
    } finally {
      setTesting(false);
      loadAll();
    }
  };

  const accionLabel = (t: string) => ACCIONES.find((a) => a.id === t)?.label || t;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Automatizaciones</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Reglas sobre el Automation Engine de Volkern: cada evento de Hospitality dispara tareas, limpiezas o mensajes automáticos.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Reglas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold">{stats.activas}</p>
            <p className="text-xs text-muted-foreground">Activas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold">{stats.triggersCubiertos}</p>
            <p className="text-xs text-muted-foreground">Triggers configurados</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold">{stats.ejecuciones}</p>
            <p className="text-xs text-muted-foreground">
              Ejecuciones registradas
              {stats.enCurso > 0 && <span className="text-amber-600"> · {stats.enCurso} en curso</span>}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className={`text-2xl font-bold ${stats.conFallo > 0 ? 'text-destructive' : ''}`}>
              {stats.conFallo}
            </p>
            <p className="text-xs text-muted-foreground">Con fallo o parciales</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {TRIGGERS.map((tr) => {
          const reglasDelTrigger = reglas.filter((r) => r.triggerType === tr.id);
          return (
            <Card key={tr.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{tr.icon}</span>
                    <div>
                      <CardTitle className="text-base">{tr.label}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">{tr.desc}</p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => openNew(tr.id)}>
                    <Plus className="h-4 w-4 mr-1" /> Regla
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {reglasDelTrigger.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" /> Sugerencia: {tr.sugerencia}
                  </p>
                ) : (
                  reglasDelTrigger.map((r) => (
                    <div key={r.id} className="rounded-lg border p-3 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium truncate">{r.name}</p>
                        <Badge variant={r.isActive ? 'default' : 'secondary'}>
                          {r.isActive ? 'Activa' : 'Inactiva'}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {r.actions.map((a) => accionLabel(a.type)).join(' · ')} · {r._count?.logs || 0} ejecuciones
                      </p>
                      {r.logs?.[0] && (
                        <p className="text-[11px] flex items-center gap-1 text-muted-foreground">
                          <span>Última:</span>
                          <EstadoBadge status={r.logs[0].status} />
                        </p>
                      )}
                      <div className="flex items-center gap-1 pt-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Probar con reserva real" onClick={() => { setTestTarget(r); setTestResult(null); }}>
                          <Play className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Editar" onClick={() => openEdit(r)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <AccionHospitality capacidad="automatizaciones.gestionar">
                          <Button size="icon" variant="ghost" className="h-7 w-7" title={r.isActive ? 'Desactivar' : 'Activar'} onClick={() => toggleActivo(r)}>
                            {r.isActive ? <Power className="h-3.5 w-3.5" /> : <PowerOff className="h-3.5 w-3.5" />}
                          </Button>
                        </AccionHospitality>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="Eliminar" onClick={() => setDeleteTarget(r)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Logs recientes */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ListChecks className="h-4 w-4" /> Ejecuciones recientes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">Aún no hay ejecuciones registradas.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Regla</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Resultado real</TableHead>
                  <TableHead>Entidad</TableHead>
                  <TableHead>Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{l.rule?.name || '-'}</TableCell>
                    <TableCell className="text-muted-foreground">{l.rule ? triggerLabel(l.rule.triggerType) : '-'}</TableCell>
                    <TableCell>
                      <EstadoBadge status={l.status} />
                    </TableCell>
                    <TableCell>
                      <DetalleEjecucion log={l} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{l.entityId || '-'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(l.executedAt).toLocaleString('es-MX')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog crear/editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar automatización' : 'Nueva automatización'}</DialogTitle>
            <DialogDescription>
              Configura qué pasa cuando ocurre el evento. Usa el Automation Engine existente de Volkern.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Nombre <span className="text-destructive">*</span></Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ej: Crear tarea de preparación"
              />
            </div>
            <div className="space-y-1">
              <Label>Descripción</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Qué hace esta automatización"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Trigger (evento)</Label>
                <Select value={form.triggerType} onValueChange={(v) => setForm((f) => ({ ...f, triggerType: v }))} disabled={!!editing}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TRIGGERS.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.icon} {t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Acción</Label>
                <Select value={form.actionType} onValueChange={(v) => setForm((f) => ({ ...f, actionType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACCIONES.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.icon} {a.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {ACCIONES.find((a) => a.id === form.actionType)?.desc}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <AccionHospitality capacidad="automatizaciones.gestionar">
              <Button onClick={save} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editing ? 'Guardar cambios' : 'Crear automatización'}
              </Button>
            </AccionHospitality>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog eliminar */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Eliminar automatización?</DialogTitle>
            <DialogDescription>
              Se eliminará la regla "{deleteTarget?.name}" ({deleteTarget ? triggerLabel(deleteTarget.triggerType) : ''}). No se podrá recuperar.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <AccionHospitality capacidad="automatizaciones.gestionar">
              <Button variant="destructive" onClick={confirmDelete}>Eliminar</Button>
            </AccionHospitality>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog probar */}
      <Dialog open={!!testTarget} onOpenChange={(o) => !o && setTestTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Probar automatización</DialogTitle>
            <DialogDescription>
              Dispara la regla "{testTarget?.name}" con la reserva más reciente del tenant y espera el resultado real
              de cada acción ejecutada por el worker.
            </DialogDescription>
          </DialogHeader>
          {testResult && (
            <p className={`text-sm ${testResult.startsWith('✅') ? 'text-emerald-600' : 'text-destructive'}`}>
              {testResult}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestTarget(null)}>Cerrar</Button>
            <AccionHospitality capacidad="automatizaciones.gestionar">
              <Button onClick={runTest} disabled={testing}>
                {testing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Disparar ahora
              </Button>
            </AccionHospitality>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}