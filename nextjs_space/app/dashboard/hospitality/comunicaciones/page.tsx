'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import {
  MessageSquareText,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Send,
  Power,
  PowerOff,
  Mail,
  Phone,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CampoTelefonoConPais } from '@/components/paises-municipios/selectores';
import { paisDesdeTelefono } from '@/lib/paises-municipios/paises';
import { AccionHospitality } from '@/components/hospitality/AccionHospitality';
import { Textarea } from '@/components/ui/textarea';
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
  plantillaSugerida,
  idiomaDeValor,
  IDIOMAS,
} from '@/lib/hospitality/booking-i18n';

interface Plantilla {
  id: string;
  tenantId: string;
  evento: string;
  canal: string;
  idioma: string;
  asunto?: string | null;
  contenido: string;
  activo: boolean;
  fechaCreacion: string;
}

const EVENTOS = [
  { id: 'confirmacion', label: 'Confirmación', desc: 'Al recibir una reserva nueva o confirmada', icon: '✅' },
  { id: 'pre_llegada', label: 'Pre-llegada', desc: 'Información útil antes de la llegada', icon: '📅' },
  { id: 'check_in', label: 'Check-in', desc: 'Instrucciones de acceso el día del check-in', icon: '🔑' },
  { id: 'post_salida', label: 'Post-salida', desc: 'Agradecimiento después de la salida', icon: '👋' },
  { id: 'resena', label: 'Solicitud de reseña', desc: 'Pedir reseña según las reglas configuradas', icon: '⭐' },
  { id: 'briefing_diario', label: 'Briefing matutino', desc: 'Cada mañana al equipo: ocupación, llegadas, salidas, incidencias y cobros del día', icon: '🌅' },
];

const VARIABLES = [
  { v: '{{nombre}}', d: 'Nombre del huésped' },
  { v: '{{email}}', d: 'Email del huésped' },
  { v: '{{telefono}}', d: 'Teléfono del huésped' },
  { v: '{{unidad}}', d: 'Nombre de la unidad' },
  { v: '{{propiedad}}', d: 'Nombre de la propiedad' },
  { v: '{{canal}}', d: 'Canal (Airbnb, Booking...)' },
  { v: '{{referencia}}', d: 'Referencia de la reserva' },
  { v: '{{checkIn}}', d: 'Fecha de check-in' },
  { v: '{{checkOut}}', d: 'Fecha de check-out' },
  { v: '{{noches}}', d: 'Número de noches' },
  { v: '{{importe}}', d: 'Importe total' },
  { v: '{{estado}}', d: 'Estado de la reserva' },
];

const EMPTY_FORM = {
  evento: 'confirmacion',
  canal: 'whatsapp',
  idioma: 'es',
  asunto: '',
  contenido: '',
  activo: true,
};

const IDIOMA_LABEL: Record<string, string> = { es: 'Español', en: 'English' };

export default function HospitalityComunicacionesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Plantilla | null>(null);
  const [form, setForm] = useState<typeof EMPTY_FORM>({ ...EMPTY_FORM });
  // El contenido del diálogo viene de una plantilla sugerida (no la escribió
  // el hotel todavía): al cambiar el idioma se sustituye por la sugerida de
  // ese idioma. Si el hotel ya editó el texto, nunca se pisa.
  const [contenidoSugerido, setContenidoSugerido] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Plantilla | null>(null);
  const [testTarget, setTestTarget] = useState<Plantilla | null>(null);
  const [testDest, setTestDest] = useState('');
  const [testPaisTelefono, setTestPaisTelefono] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/hospitality/comunicaciones');
      if (res.ok) {
        const d = await res.json();
        setPlantillas(d.plantillas || []);
      }
    } catch {
      toast.error('Error al cargar las plantillas de comunicación');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const byEvento = useMemo(() => {
    const map: Record<string, Plantilla[]> = {};
    for (const e of EVENTOS) map[e.id] = [];
    for (const p of plantillas) {
      if (map[p.evento]) map[p.evento].push(p);
    }
    return map;
  }, [plantillas]);

  const stats = useMemo(() => {
    const activas = plantillas.filter((p) => p.activo);
    return {
      total: plantillas.length,
      activas: activas.length,
      whatsapp: plantillas.filter((p) => p.canal === 'whatsapp').length,
      email: plantillas.filter((p) => p.canal === 'email').length,
    };
  }, [plantillas]);

  const openNew = (evento: string, idioma = 'es') => {
    setEditing(null);
    const sugerida = plantillaSugerida(evento, idiomaDeValor(idioma));
    setForm({
      ...EMPTY_FORM,
      evento,
      idioma,
      asunto: sugerida?.asunto || '',
      contenido: sugerida?.contenido || '',
    });
    setContenidoSugerido(!!sugerida);
    setDialogOpen(true);
  };

  const openEdit = (p: Plantilla) => {
    setEditing(p);
    setForm({
      evento: p.evento,
      canal: p.canal,
      idioma: p.idioma || 'es',
      asunto: p.asunto || '',
      contenido: p.contenido,
      activo: p.activo,
    });
    setContenidoSugerido(false);
    setDialogOpen(true);
  };

  /** Cambia el idioma del diálogo: si el contenido aún es la sugerida, la
   *  sustituye por la del idioma nuevo; si el hotel ya escribió la suya, no
   *  se toca. */
  const cambiarIdioma = (idioma: string) => {
    setForm((f) => {
      const siguiente = { ...f, idioma };
      if (contenidoSugerido) {
        const sugerida = plantillaSugerida(f.evento, idiomaDeValor(idioma));
        if (sugerida) {
          siguiente.asunto = sugerida.asunto || '';
          siguiente.contenido = sugerida.contenido;
        }
      }
      return siguiente;
    });
  };

  const save = async () => {
    if (!form.contenido.trim()) {
      toast.error('El contenido es obligatorio');
      return;
    }
    if (form.canal === 'email' && !form.asunto.trim()) {
      toast.error('El asunto es obligatorio para plantillas de email');
      return;
    }
    setSaving(true);
    try {
      const url = editing ? `/api/hospitality/comunicaciones/${editing.id}` : '/api/hospitality/comunicaciones';
      const res = await fetch(url, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || 'Error al guardar la plantilla');
        return;
      }
      toast.success(editing ? 'Plantilla actualizada' : 'Plantilla creada');
      setDialogOpen(false);
      loadAll();
    } catch {
      toast.error('Error al guardar la plantilla');
    } finally {
      setSaving(false);
    }
  };

  const toggleActivo = async (p: Plantilla) => {
    try {
      const res = await fetch(`/api/hospitality/comunicaciones/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo: !p.activo }),
      });
      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error || 'Error al cambiar el estado');
        return;
      }
      toast.success(p.activo ? 'Plantilla desactivada' : 'Plantilla activada');
      loadAll();
    } catch {
      toast.error('Error al cambiar el estado');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/hospitality/comunicaciones/${deleteTarget.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error || 'Error al eliminar');
        return;
      }
      toast.success('Plantilla eliminada');
      setDeleteTarget(null);
      loadAll();
    } catch {
      toast.error('Error al eliminar la plantilla');
    }
  };

  const sendTest = async () => {
    if (!testTarget) return;
    if (!testDest.trim()) {
      toast.error('Escribe el email o teléfono de prueba');
      return;
    }
    if (testTarget.canal === 'whatsapp' && !testPaisTelefono) {
      toast.error('Selecciona el país del teléfono de prueba');
      return;
    }
    setTestSending(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/hospitality/comunicaciones/${testTarget.id}/enviar-prueba`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destinatario: testDest.trim() }),
      });
      const d = await res.json();
      if (!res.ok) {
        setTestResult(`❌ ${d.error || 'Error al enviar'}`);
        return;
      }
      if (d.ok) {
        setTestResult('✅ Enviado correctamente');
        toast.success('Mensaje de prueba enviado');
      } else {
        setTestResult(`❌ ${d.resultado?.error || 'Error al enviar'}`);
      }
    } catch {
      setTestResult('❌ Error de conexión al enviar');
    } finally {
      setTestSending(false);
    }
  };

  const canalBadge = (canal: string) =>
    canal === 'email' ? (
      <Badge variant="outline" className="gap-1"><Mail className="h-3 w-3" /> Email</Badge>
    ) : (
      <Badge variant="outline" className="gap-1"><Phone className="h-3 w-3" /> WhatsApp</Badge>
    );

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Comunicaciones</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Plantillas automáticas por evento, enviadas por WhatsApp o email con las integraciones de Volkern.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Plantillas</p>
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
            <p className="text-2xl font-bold">{stats.whatsapp}</p>
            <p className="text-xs text-muted-foreground">WhatsApp</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold">{stats.email}</p>
            <p className="text-xs text-muted-foreground">Email</p>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {EVENTOS.map((ev) => (
            <Card key={ev.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{ev.icon}</span>
                    <div>
                      <CardTitle className="text-base">{ev.label}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">{ev.desc}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {!byEvento[ev.id].some((p) => (p.idioma || 'es') === 'en') && (
                      <Button size="sm" variant="outline" onClick={() => openNew(ev.id, 'en')} title="Crear la versión en inglés con el texto sugerido">
                        <Plus className="h-4 w-4 mr-1" /> English
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => openNew(ev.id)}>
                      <Plus className="h-4 w-4 mr-1" /> Nueva
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {byEvento[ev.id].length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">
                    Sin plantillas para este evento todavía.
                  </p>
                ) : (
                  byEvento[ev.id].map((p) => (
                    <div key={p.id} className="rounded-lg border p-3 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {canalBadge(p.canal)}
                          <Badge variant="outline" className="uppercase">{p.idioma || 'es'}</Badge>
                          <Badge variant={p.activo ? 'default' : 'secondary'}>
                            {p.activo ? 'Activa' : 'Inactiva'}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="Enviar prueba" onClick={() => { setTestTarget(p); setTestDest(''); setTestPaisTelefono(''); setTestResult(null); }}>
                            <Send className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="Editar" onClick={() => openEdit(p)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <AccionHospitality capacidad="comunicaciones.gestionar">
                            <Button size="icon" variant="ghost" className="h-7 w-7" title={p.activo ? 'Desactivar' : 'Activar'} onClick={() => toggleActivo(p)}>
                              {p.activo ? <Power className="h-3.5 w-3.5" /> : <PowerOff className="h-3.5 w-3.5" />}
                            </Button>
                          </AccionHospitality>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="Eliminar" onClick={() => setDeleteTarget(p)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-line">
                        {p.contenido}
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog crear/editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar plantilla' : 'Nueva plantilla'}</DialogTitle>
            <DialogDescription>
              Configura el mensaje automático para este evento. Las variables se reemplazan al enviar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Evento</Label>
                <Select value={form.evento} onValueChange={(v) => setForm((f) => ({ ...f, evento: v }))} disabled={!!editing}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EVENTOS.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.icon} {e.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Canal</Label>
                <Select value={form.canal} onValueChange={(v) => setForm((f) => ({ ...f, canal: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Idioma</Label>
                <Select value={form.idioma} onValueChange={cambiarIdioma}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {IDIOMAS.map((i) => (
                      <SelectItem key={i} value={i}>{IDIOMA_LABEL[i] || i}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Crea una plantilla por idioma: cada huésped recibe la del idioma en que reservó y, si no existe, la española.
            </p>

            {form.canal === 'email' && (
              <div className="space-y-1">
                <Label>Asunto <span className="text-destructive">*</span></Label>
                <Input
                  value={form.asunto}
                  onChange={(e) => setForm((f) => ({ ...f, asunto: e.target.value }))}
                  placeholder="Ej: Confirmación de tu reserva en {{propiedad}}"
                />
              </div>
            )}

            <div className="space-y-1">
              <Label>Contenido <span className="text-destructive">*</span></Label>
              <Textarea
                value={form.contenido}
                onChange={(e) => setForm((f) => ({ ...f, contenido: e.target.value }))}
                rows={8}
                placeholder="Escribe el mensaje usando variables como {{nombre}}, {{checkIn}}..."
              />
            </div>

            <div className="rounded-lg border p-3">
              <p className="text-xs font-medium mb-2">Variables disponibles</p>
              <div className="flex flex-wrap gap-1.5">
                {VARIABLES.map((x) => (
                  <span
                    key={x.v}
                    className="cursor-pointer rounded bg-muted px-2 py-1 text-xs font-mono hover:bg-muted-foreground/20"
                    title={x.d}
                    onClick={() => setForm((f) => ({ ...f, contenido: f.contenido + x.v }))}
                  >
                    {x.v}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <AccionHospitality capacidad="comunicaciones.gestionar">
              <Button onClick={save} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editing ? 'Guardar cambios' : 'Crear plantilla'}
              </Button>
            </AccionHospitality>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog eliminar */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Eliminar plantilla?</DialogTitle>
            <DialogDescription>
              Esta acción eliminará la plantilla de {deleteTarget ? EVENTOS.find((e) => e.id === deleteTarget.evento)?.label : ''} (
              {deleteTarget?.canal}). No se podrá recuperar.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <AccionHospitality capacidad="comunicaciones.gestionar">
              <Button variant="destructive" onClick={confirmDelete}>Eliminar</Button>
            </AccionHospitality>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog enviar prueba */}
      <Dialog open={!!testTarget} onOpenChange={(o) => !o && setTestTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enviar prueba</DialogTitle>
            <DialogDescription>
              Enviar la plantilla a un destinatario de prueba con un contexto de ejemplo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MessageSquareText className="h-4 w-4" />
              {testTarget ? EVENTOS.find((e) => e.id === testTarget.evento)?.label : ''} · {testTarget?.canal}
            </div>
            <div className="space-y-1">
              <Label htmlFor={testTarget?.canal === 'whatsapp' ? 'telefono-prueba' : 'email-prueba'}>Email o teléfono de prueba</Label>
              {testTarget?.canal === 'whatsapp' ? (
                <CampoTelefonoConPais
                  telefono={testDest}
                  pais={testPaisTelefono}
                  paisAriaLabel="País del teléfono de prueba"
                  id="telefono-prueba"
                  placeholder="999 000 0000"
                  onTelefono={setTestDest}
                  onPais={(codigo) => setTestPaisTelefono(codigo)}
                />
              ) : (
                <Input
                  id="email-prueba"
                  type="email"
                  value={testDest}
                  onChange={(e) => setTestDest(e.target.value)}
                  placeholder="destino@email.com"
                />
              )}
            </div>
            {testResult && (
              <p className={`text-sm ${testResult.startsWith('✅') ? 'text-emerald-600' : 'text-destructive'}`}>
                {testResult}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestTarget(null)}>Cerrar</Button>
            <AccionHospitality capacidad="comunicaciones.enviar">
              <Button onClick={sendTest} disabled={testSending}>
                {testSending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Enviar prueba
              </Button>
            </AccionHospitality>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}