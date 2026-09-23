'use client';

/**
 * Registro de viajeros — comunicación al Ministerio del Interior (RD 933/2021).
 *
 * Cuatro cosas, en el orden en que se necesitan:
 *  1. **Configuración**: el código de arrendador y las credenciales que entrega
 *     la Sede Electrónica, más el código de establecimiento de cada inmueble y
 *     el tipo de pago del catálogo. Sin esto no se envía nada (y se dice).
 *  2. **Estado**: qué se envió, qué se aceptó, qué trae errores y qué se quedó
 *     sin datos. El servicio es asíncrono, así que el lote y el código de
 *     comunicación se muestran por separado.
 *  3. **Completar**: los canales no mandan documento ni dirección del huésped.
 *     Aquí el operador los completa y el parte sale en el momento, sin esperar
 *     al barrido horario.
 *  4. **Lo que se quedó fuera**: los partes rechazados que agotaron sus intentos
 *     no vuelven a salir solos. El operador de plataforma los ve en el panel de
 *     crons; el hotel los tiene que ver aquí, con su motivo y su arreglo, o esas
 *     estancias se quedan sin comunicar sin que nadie se entere.
 *
 * La comunicación va al servicio OFICIAL del Ministerio: la página no habla con
 * nadie más y el endpoint lo fija `lib/hospitality/registro-viajeros.ts`.
 */

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  FileCheck2,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AccionHospitality } from '@/components/hospitality/AccionHospitality';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  CompletarParteVijerosDialog,
  type ReservaDelParte,
} from '@/components/hospitality/completar-parte-viajeros-dialog';
import {
  MAX_INTENTOS_DEL_PARTE,
  alertaPartesSinReintentar,
  lecturaPartesSinReintentar,
  type MetricasPartesViajeros,
} from '@/lib/hospitality/partes-metrics';
import {
  ESTADO_SIN_ENTREGAR,
  parteAbandonado,
  queCorregirElParte,
  type DiagnosticoDeParte,
} from '@/lib/hospitality/parte-rechazo';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Propiedad {
  id: string;
  nombre: string;
  codigoEstablecimientoMIR: string | null;
}

interface Comunicacion {
  id: string;
  estado: string;
  referencia: string | null;
  lote: string | null;
  codigoComunicacion: string | null;
  codigoRetorno: string | null;
  descripcion: string | null;
  intentos: number;
  errores: Array<{ campo: string; mensaje: string }> | { error?: string } | null;
  fechaEnvio: string | null;
  reservationId: string | null;
}

/**
 * Un parte que el barrido ya no reintenta, tal como lo devuelve la API: la
 * referencia para reconocer la estancia y el diagnóstico del rechazo (módulo
 * puro) para saber si la salida es el formulario del huésped o la configuración.
 */
interface ParteSinReintentar {
  id: string;
  reservationId: string | null;
  referencia: string | null;
  /** `rechazada` (el Ministerio lo leyó y no lo quiso) o `error` (no llegó). */
  estado: string;
  diagnostico: DiagnosticoDeParte | null;
  intentos: number;
  fechaEdicion: string;
}

interface Estado {
  config: {
    configurado: boolean;
    activo: boolean;
    codigoArrendador: string;
    aplicacion: string;
    entorno: 'pre' | 'prod';
    tieneCredenciales: boolean;
    tipoPagoDefecto: string | null;
    tiposPagoConfigurados: number;
    listoParaEnviar: boolean;
    ultimoEnvio: string | null;
    ultimoError: string | null;
  };
  conteo: Record<string, number>;
  total: number;
  propiedades: Propiedad[];
  propiedadesSinCodigo: Propiedad[];
  /** Preguntas personalizadas del check-in (incluye inactivas). */
  preguntas?: PreguntaDelHotel[];
  ultimas: Comunicacion[];
  /** Nº de partes que el barrido ya no reintenta (panel del hotel). */
  sinReintentar: number;
  /** Los mismos, con su motivo, para enseñarlos y arreglarlos desde aquí. */
  partesSinReintentar: ParteSinReintentar[];
  /** Resumen del ciclo del parte: aceptados frente a sin reintentar. */
  partes: MetricasPartesViajeros;
  /** Estado de la reserva de hospedaje (RH): todavía no emitible. */
  reservas: { habilitadas: boolean; motivo: string | null };
}

const ETIQUETA_ESTADO: Record<string, string> = {
  pendiente: 'Pendiente',
  enviada: 'Enviada (esperando lote)',
  aceptada: 'Aceptada por el Ministerio',
  rechazada: 'Rechazada',
  anulada: 'Anulada',
  // No es un «error» del producto: el servicio no llegó a recibir el parte. La
  // etiqueta dice eso, porque de ella depende lo que el operador va a hacer.
  error: 'Sin entregar al servicio',
  datos_incompletos: 'Faltan datos del huésped',
};

/** Color del badge por estado: el operador debe ver de un vistazo qué mirar. */
const TONO_ESTADO: Record<string, string> = {
  aceptada: 'bg-emerald-100 text-emerald-800',
  enviada: 'bg-blue-100 text-blue-800',
  datos_incompletos: 'bg-amber-100 text-amber-900',
  rechazada: 'bg-red-100 text-red-800',
  error: 'bg-red-100 text-red-800',
  anulada: 'bg-slate-100 text-slate-700',
  pendiente: 'bg-slate-100 text-slate-700',
};

function erroresLegibles(errores: Comunicacion['errores']): string[] {
  if (!errores) return [];
  if (Array.isArray(errores)) return errores.map((e) => `${e.campo}: ${e.mensaje}`);
  return errores.error ? [String(errores.error)] : [];
}

// ── Preguntas personalizadas del check-in ────────────────────────────────
// Las responde el huésped en el enlace y quedan en la reserva para el hotel.
// NUNCA viajan al parte del Ministerio: el XSD es cerrado y un elemento extra
// rechazaría la comunicación entera (guardia en tests/hospitality-checkin-preguntas.test.ts).
interface PreguntaDelHotel {
  id: string;
  tipo: string;
  es: string;
  en: string;
  opciones: { es: string[]; en: string[] } | null;
  requerida: boolean;
  activa: boolean;
  orden: number;
}

interface FormPregunta {
  id: string | null;
  es: string;
  en: string;
  tipo: string;
  opcionesEs: string;
  opcionesEn: string;
  requerida: boolean;
  activa: boolean;
  orden: number;
}

const FORM_PREGUNTA_VACIO: FormPregunta = {
  id: null,
  es: '',
  en: '',
  tipo: 'texto',
  opcionesEs: '',
  opcionesEn: '',
  requerida: false,
  activa: true,
  orden: 0,
};

function etiquetaTipoPregunta(tipo: string): string {
  switch (tipo) {
    case 'opcion':
      return 'opciones';
    case 'numero':
      return 'número';
    case 'fecha':
      return 'fecha';
    default:
      return 'texto';
  }
}

export default function RegistroViajerosPage() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [codigos, setCodigos] = useState<Record<string, string>>({});

  const [config, setConfig] = useState({
    codigoArrendador: '',
    aplicacion: 'Volkern',
    entorno: 'pre' as 'pre' | 'prod',
    usuario: '',
    password: '',
    tipoPagoDefecto: '',
    activo: true,
  });

  // Preguntas personalizadas del check-in: la lista del tenant y el formulario
  // de edición (null = nueva). Una pregunta es una de tu estancia — hora de
  // llegada, matrícula, mascotas… — que responde el huésped en el enlace y
  // queda en la reserva para el hotel; jamás sale en el parte oficial.
  const [preguntas, setPreguntas] = useState<PreguntaDelHotel[]>([]);
  const [formPregunta, setFormPregunta] = useState<FormPregunta | null>(null);
  const [guardandoPregunta, setGuardandoPregunta] = useState(false);

  // Reserva cuyo parte está completando el operador (dialog compartido con la
  // pantalla de reservas: es la misma tarea y el mismo formulario). Se usa desde
  // dos sitios —los partes incompletos y los que el sistema abandonó—, así que
  // el estado es la reserva y no la comunicación.
  const [completar, setCompletar] = useState<ReservaDelParte | null>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch('/api/hospitality/registro-viajeros');
      if (!res.ok) throw new Error('respuesta no válida');
      const datos: Estado = await res.json();
      setEstado(datos);
      setConfig((actual) => ({
        ...actual,
        codigoArrendador: datos.config.codigoArrendador || actual.codigoArrendador,
        aplicacion: datos.config.aplicacion || actual.aplicacion,
        entorno: datos.config.entorno || actual.entorno,
        tipoPagoDefecto: datos.config.tipoPagoDefecto || actual.tipoPagoDefecto,
        activo: datos.config.configurado ? datos.config.activo : actual.activo,
      }));
      setCodigos(
        Object.fromEntries(datos.propiedades.map((p) => [p.id, p.codigoEstablecimientoMIR ?? '']))
      );
      setPreguntas(Array.isArray(datos.preguntas) ? datos.preguntas : []);
    } catch {
      toast.error('No se pudo cargar el estado del registro de viajeros');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function guardarConfiguracion() {
    setGuardando(true);
    try {
      const res = await fetch('/api/hospitality/registro-viajeros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accion: 'configurar',
          ...config,
          propiedades: Object.entries(codigos).map(([id, codigoEstablecimientoMIR]) => ({
            id,
            codigoEstablecimientoMIR,
          })),
        }),
      });
      const d = await res.json();
      if (!res.ok || !d.ok) throw new Error(d.error || 'error guardando');
      toast.success('Configuración del Ministerio guardada');
      await cargar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error guardando la configuración');
    } finally {
      setGuardando(false);
    }
  }

  async function guardarPregunta() {
    if (!formPregunta) return;
    setGuardandoPregunta(true);
    try {
      const res = await fetch('/api/hospitality/registro-viajeros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accion: formPregunta.id ? 'pregunta_actualizar' : 'pregunta_crear',
          id: formPregunta.id ?? undefined,
          es: formPregunta.es,
          en: formPregunta.en,
          tipo: formPregunta.tipo,
          opcionesEs: formPregunta.tipo === 'opcion'
            ? formPregunta.opcionesEs.split('\n').map((s) => s.trim()).filter(Boolean)
            : undefined,
          opcionesEn: formPregunta.tipo === 'opcion'
            ? formPregunta.opcionesEn.split('\n').map((s) => s.trim()).filter(Boolean)
            : undefined,
          requerida: formPregunta.requerida,
          activa: formPregunta.activa,
          orden: formPregunta.orden,
        }),
      });
      const d = await res.json();
      if (!res.ok || !d.ok) throw new Error(d.error || 'error guardando la pregunta');
      toast.success(formPregunta.id ? 'Pregunta actualizada' : 'Pregunta añadida');
      setFormPregunta(null);
      await cargar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error guardando la pregunta');
    } finally {
      setGuardandoPregunta(false);
    }
  }

  async function desactivarPregunta(id: string) {
    try {
      const res = await fetch('/api/hospitality/registro-viajeros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'pregunta_eliminar', id }),
      });
      const d = await res.json();
      if (!res.ok || !d.ok) throw new Error(d.error || 'error');
      toast.success('Pregunta desactivada: deja de aparecer en el formulario');
      await cargar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error desactivando la pregunta');
    }
  }

  async function enviarReserva(reservaId: string | null) {
    if (!reservaId) return;
    try {
      const res = await fetch('/api/hospitality/registro-viajeros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'enviar', reservaId }),
      });
      const d = await res.json();
      if (d.estado === 'datos_incompletos') {
        toast.warning('Faltan datos del huésped: completa el parte para poder enviarlo');
      } else if (d.estado === 'aceptada') {
        toast.info('Ese parte ya estaba aceptado');
      } else {
        toast.success(`Parte ${d.estado}`);
      }
      await cargar();
    } catch {
      toast.error('Error enviando el parte');
    }
  }

  async function consultarLotes() {
    try {
      const res = await fetch('/api/hospitality/registro-viajeros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'consultar' }),
      });
      const d = await res.json();
      toast.success(
        `Lotes consultados: ${d.consultados ?? 0} · ${d.aceptadas ?? 0} aceptados · ${d.rechazadas ?? 0} con errores`
      );
      await cargar();
    } catch {
      toast.error('Error consultando los lotes');
    }
  }

  const incompletos = estado?.ultimas.filter((c) => c.estado === 'datos_incompletos') ?? [];

  // El panel del hotel solo enseña lo que hay: sin abandonados no aparece la
  // tarjeta (un panel con un «0 partes sin reintentar» permanente acaba
  // ignorándose). Y el aviso y la lectura salen del módulo puro: la página no
  // decide cuándo el abandono es anómalo.
  const abandonados = estado?.partesSinReintentar ?? [];
  const avisoPartes = estado ? alertaPartesSinReintentar(estado.partes) : null;
  const lecturaPartes = estado ? lecturaPartesSinReintentar(estado.partes) : '';

  /**
   * Enlace de check-in del huésped, para reenviárselo cuando el parte está
   * incompleto. En las reservas de canal es la única forma de que los
documentos
   * los ponga el huésped en vez del operador.
   */
  const copiarEnlace = async (reservationId: string) => {
    try {
      const res = await fetch('/api/hospitality/registro-viajeros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'enlace', reservaId: reservationId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo generar el enlace');
      await navigator.clipboard?.writeText(data.url);
      toast.success('Enlace de check-in copiado: envíalo al huésped');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudo generar el enlace');
    }
  };

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <ShieldCheck className="h-6 w-6" /> Registro de viajeros
          </h1>
          <p className="text-sm text-muted-foreground">
            Comunicación de los viajeros al Ministerio del Interior por el servicio oficial de
            hospedajes (RD 933/2021: dentro de las 24 h siguientes al inicio del servicio).
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void cargar()}>
            <RefreshCw className="mr-2 h-4 w-4" /> Actualizar
          </Button>
          <AccionHospitality capacidad="operaciones.gestionar">
            <Button variant="outline" onClick={() => void consultarLotes()}>
              <FileCheck2 className="mr-2 h-4 w-4" /> Consultar lotes
            </Button>
          </AccionHospitality>
        </div>
      </div>

      {cargando ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            {[
              { clave: 'aceptada', label: 'Aceptadas' },
              { clave: 'enviada', label: 'Esperando lote' },
              { clave: 'datos_incompletos', label: 'Faltan datos' },
              { clave: 'rechazada', label: 'Rechazadas' },
            ].map((kpi) => (
              <Card key={kpi.clave}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">{kpi.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{estado?.conteo[kpi.clave] ?? 0}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {estado?.reservas && !estado.reservas.habilitadas && (
            <Card className="border-slate-300 bg-slate-50">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  Reserva de hospedaje (RH): pendiente del XSD oficial
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-slate-700">
                <p>{estado.reservas.motivo}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  El parte de viajeros (la entrada del huésped) sí se está comunicando
                  con normalidad: lo que falta es la comunicación del momento de la reserva.
                </p>
              </CardContent>
            </Card>
          )}

          {!estado?.config.listoParaEnviar && (
            <Card className="border-amber-300 bg-amber-50">
              <CardContent className="pt-6 text-sm text-amber-900">
                Todavía no se puede comunicar: hacen falta las credenciales que entrega la Sede
                Electrónica del Ministerio y un código de tipo de pago del catálogo. El envío
                automático no arranca hasta que esté completo.
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Configuración del arrendador</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <Label>Código de arrendador</Label>
                  <Input
                    value={config.codigoArrendador}
                    onChange={(e) => setConfig({ ...config, codigoArrendador: e.target.value })}
                    placeholder="El que asigna el Ministerio"
                  />
                </div>
                <div>
                  <Label>Nombre de la aplicación</Label>
                  <Input
                    value={config.aplicacion}
                    onChange={(e) => setConfig({ ...config, aplicacion: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Entorno</Label>
                  <Select
                    value={config.entorno}
                    onValueChange={(v) => setConfig({ ...config, entorno: v as 'pre' | 'prod' })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pre">Pruebas del Ministerio</SelectItem>
                      <SelectItem value="prod">Producción</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Usuario</Label>
                  <Input
                    value={config.usuario}
                    onChange={(e) => setConfig({ ...config, usuario: e.target.value })}
                    placeholder={estado?.config.tieneCredenciales ? 'Configurado (••••)' : ''}
                  />
                </div>
                <div>
                  <Label>Contraseña</Label>
                  <Input
                    type="password"
                    value={config.password}
                    onChange={(e) => setConfig({ ...config, password: e.target.value })}
                    placeholder={estado?.config.tieneCredenciales ? 'Configurada (••••)' : ''}
                  />
                </div>
                <div>
                  <Label>Código de tipo de pago (catálogo)</Label>
                  <Input
                    value={config.tipoPagoDefecto}
                    onChange={(e) => setConfig({ ...config, tipoPagoDefecto: e.target.value })}
                    placeholder="Ej. el código del catálogo TIPO_PAGO"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Código de establecimiento por propiedad</Label>
                {estado?.propiedades.length ? (
                  <div className="grid gap-2 md:grid-cols-2">
                    {estado.propiedades.map((p) => (
                      <div key={p.id} className="flex items-center gap-2">
                        <span className="w-1/2 truncate text-sm">{p.nombre}</span>
                        <Input
                          value={codigos[p.id] ?? ''}
                          onChange={(e) => setCodigos({ ...codigos, [p.id]: e.target.value })}
                          placeholder="Código del Ministerio"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No hay propiedades activas.</p>
                )}
                {(estado?.propiedadesSinCodigo.length ?? 0) > 0 && (
                  <p className="text-sm text-amber-700">
                    {estado?.propiedadesSinCodigo.length} propiedad(es) sin código: sus reservas no
                    se pueden comunicar.
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3">
                <AccionHospitality capacidad="operaciones.gestionar">
                  <Button onClick={() => void guardarConfiguracion()} disabled={guardando}>
                    {guardando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Guardar
                  </Button>
                </AccionHospitality>
                {estado?.config.listoParaEnviar ? (
                  <Badge className="bg-emerald-100 text-emerald-800">Listo para comunicar</Badge>
                ) : (
                  <Badge variant="secondary">Sin configurar del todo</Badge>
                )}
                {estado?.config.ultimoError && (
                  <span className="text-xs text-red-700">Último error: {estado.config.ultimoError}</span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* ── Preguntas personalizadas del check-in ─────────────────────────
              Las responde el huésped en el enlace y quedan en la reserva para
              el hotel; no salen en el parte oficial (XSD cerrado del
              Ministerio). */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2 text-base">
                Preguntas del check-in
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setFormPregunta({ ...FORM_PREGUNTA_VACIO })}
                  disabled={formPregunta !== null}
                >
                  <Plus className="mr-2 h-4 w-4" /> Añadir pregunta
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Lo que quieres saber del huésped aparte del registro oficial: hora estimada de llegada, matrícula,
                mascotas… Las responde en el enlace de check-in, en español o inglés, y quedan en la reserva. No
                viajan al parte del Ministerio: ese esquema es cerrado.
              </p>
              {formPregunta && (
                <div className="rounded-md border p-3 space-y-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <Label>Pregunta (español)</Label>
                      <Input
                        value={formPregunta.es}
                        onChange={(e) => setFormPregunta({ ...formPregunta, es: e.target.value })}
                        placeholder="Hora estimada de llegada"
                      />
                    </div>
                    <div>
                      <Label>Pregunta (inglés)</Label>
                      <Input
                        value={formPregunta.en}
                        onChange={(e) => setFormPregunta({ ...formPregunta, en: e.target.value })}
                        placeholder="Estimated arrival time"
                      />
                    </div>
                    <div>
                      <Label>Tipo</Label>
                      <Select
                        value={formPregunta.tipo}
                        onValueChange={(v) => setFormPregunta({ ...formPregunta, tipo: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="texto">Texto</SelectItem>
                          <SelectItem value="opcion">Opciones</SelectItem>
                          <SelectItem value="numero">Número</SelectItem>
                          <SelectItem value="fecha">Fecha</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Orden</Label>
                      <Input
                        type="number"
                        value={formPregunta.orden}
                        onChange={(e) =>
                          setFormPregunta({ ...formPregunta, orden: Number(e.target.value) || 0 })
                        }
                      />
                    </div>
                  </div>
                  {formPregunta.tipo === 'opcion' && (
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <Label>Opciones (español, una por línea)</Label>
                        <Textarea
                          rows={3}
                          value={formPregunta.opcionesEs}
                          onChange={(e) => setFormPregunta({ ...formPregunta, opcionesEs: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Options (inglés, one per line)</Label>
                        <Textarea
                          rows={3}
                          value={formPregunta.opcionesEn}
                          onChange={(e) => setFormPregunta({ ...formPregunta, opcionesEn: e.target.value })}
                        />
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={formPregunta.requerida}
                        onCheckedChange={(v) => setFormPregunta({ ...formPregunta, requerida: v === true })}
                      />
                      Obligatoria
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={formPregunta.activa}
                        onCheckedChange={(v) => setFormPregunta({ ...formPregunta, activa: v === true })}
                      />
                      Activa
                    </label>
                    <div className="ml-auto flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setFormPregunta(null)}>
                        Cancelar
                      </Button>
                      <AccionHospitality capacidad="operaciones.gestionar">
                        <Button size="sm" onClick={() => void guardarPregunta()} disabled={guardandoPregunta}>
                          {guardandoPregunta && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Guardar
                        </Button>
                      </AccionHospitality>
                    </div>
                  </div>
                </div>
              )}
              {preguntas.length === 0 && !formPregunta && (
                <p className="text-sm text-muted-foreground">
                  Todavía no hay preguntas: el formulario del huésped solo pide lo oficial.
                </p>
              )}
              {preguntas.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                  <div className="min-w-0 text-sm">
                    <span className={`font-medium ${p.activa ? '' : 'line-through text-muted-foreground'}`}>
                      {p.es}
                    </span>
                    {!p.activa && <Badge variant="secondary" className="ml-2">inactiva</Badge>}
                    {p.requerida && <Badge variant="outline" className="ml-2">obligatoria</Badge>}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {etiquetaTipoPregunta(p.tipo)}
                      {p.opciones ? `: ${p.opciones.es.join(', ')}` : ''}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setFormPregunta({
                          id: p.id,
                          es: p.es,
                          en: p.en,
                          tipo: p.tipo,
                          opcionesEs: (p.opciones?.es ?? []).join('\n'),
                          opcionesEn: (p.opciones?.en ?? []).join('\n'),
                          requerida: p.requerida,
                          activa: p.activa,
                          orden: p.orden,
                        })
                      }
                    >
                      Editar
                    </Button>
                    {p.activa && (
                      <AccionHospitality capacidad="operaciones.gestionar">
                        <Button size="sm" variant="outline" onClick={() => void desactivarPregunta(p.id)}>
                          Desactivar
                        </Button>
                      </AccionHospitality>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* ── Lo que ya no se reintenta solo ────────────────────────────────
              Rojo y con nombre y motivo, no un número: son partes que dejaron
              de enviarse porque se agotaron los intentos, o sea estancias sin
              comunicar. El ámbar de abajo es distinto: al huésped le faltan
              datos, y el barrido sigue mirándolo. */}
          {abandonados.length > 0 && (
            <Card className="border-red-300">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base text-red-800">
                  <AlertTriangle className="h-4 w-4" />
                  Partes sin reintentar ({estado?.sinReintentar ?? abandonados.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-red-900">{lecturaPartes}</p>
                <p className="text-xs text-muted-foreground">
                  El sistema intenta cada parte hasta {MAX_INTENTOS_DEL_PARTE} veces. Agotados, deja de
                  reintentarlo: hasta que alguien corrija el dato o lo reenvíe, esa estancia queda sin
                  comunicar al Ministerio.
                </p>
                {abandonados.map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-2 border-t pt-3"
                  >
                    <div className="min-w-0 text-sm">
                      <span className="font-medium">{p.referencia ?? '—'}</span>
                      {/* Las dos causas del abandono, dichas: un rechazo del
                          Ministerio se corrige en los datos, una no-entrega
                          solo se reintenta. */}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {p.estado === ESTADO_SIN_ENTREGAR
                          ? 'el servicio no lo recibió'
                          : 'rechazado por el Ministerio'}{
                          ` · ${p.intentos} intento(s)`
                        }
                      </span>
                      {p.diagnostico?.motivo && (
                        <p className="truncate text-xs text-red-800">{p.diagnostico.motivo}</p>
                      )}
                      {p.diagnostico && (
                        <p className="text-xs text-muted-foreground">
                          {queCorregirElParte(p.diagnostico)}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {p.reservationId && (
                        <>
                          {/* Configuración rechazada o envío: completar datos no
                              arregla nada; lo que hace falta es reintentar. */}
                          {p.diagnostico?.ambito === 'datos' && (
                            <Button
                              size="sm"
                              onClick={() =>
                                setCompletar({ id: p.reservationId!, referencia: p.referencia })
                              }
                            >
                              <UserPlus className="mr-2 h-4 w-4" /> Corregir los datos
                            </Button>
                          )}
                          <AccionHospitality capacidad="operaciones.gestionar">
                            <Button
                              size="sm"
                              variant={p.diagnostico?.ambito === 'datos' ? 'outline' : 'default'}
                              onClick={() => void enviarReserva(p.reservationId)}
                            >
                              <RefreshCw className="mr-2 h-4 w-4" /> Reenviar el parte
                            </Button>
                          </AccionHospitality>
                          <AccionHospitality capacidad="operaciones.gestionar">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void copiarEnlace(p.reservationId!)}
                            >
                              <Link2 className="mr-2 h-4 w-4" /> Enlace de check-in
                            </Button>
                          </AccionHospitality>
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {avisoPartes && (
                  <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-900">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{avisoPartes}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {incompletos.length > 0 && (
            <Card className="border-amber-300">
              <CardHeader>
                <CardTitle className="text-base">
                  Partes con datos pendientes ({incompletos.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {incompletos.map((c) => (
                  <div key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm">
                      <span className="font-medium">{c.referencia}</span>
                      <span className="ml-2 text-muted-foreground">
                        {erroresLegibles(c.errores).slice(0, 2).join(' · ')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {c.reservationId && (
                        <AccionHospitality capacidad="operaciones.gestionar">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void copiarEnlace(c.reservationId!)}
                          >
                            <Link2 className="mr-2 h-4 w-4" /> Enlace de check-in
                          </Button>
                        </AccionHospitality>
                      )}
                      <Button
                        size="sm"
                        onClick={() =>
                          setCompletar({ id: c.reservationId!, referencia: c.referencia })
                        }
                      >
                        <UserPlus className="mr-2 h-4 w-4" /> Completar datos
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Últimas comunicaciones</CardTitle>
            </CardHeader>
            <CardContent>
              {estado?.ultimas.length ? (
                <div className="space-y-2">
                  {estado.ultimas.map((c) => {
                    // La regla del abandono es la del módulo puro (rechazado con
                    // los intentos agotados): la fila no la reinterpreta.
                    const sinReintentar = parteAbandonado(c);
                    return (
                      <div
                        key={c.id}
                        className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 last:border-0"
                      >
                        <div className="min-w-0 text-sm">
                          <span className="font-medium">{c.referencia ?? '—'}</span>
                          {c.lote && <span className="ml-2 text-muted-foreground">Lote {c.lote}</span>}
                          {c.codigoComunicacion && (
                            <span className="ml-2 text-muted-foreground">Código {c.codigoComunicacion}</span>
                          )}
                          {c.descripcion && (
                            <p className="truncate text-xs text-muted-foreground">{c.descripcion}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={TONO_ESTADO[c.estado] ?? ''}>
                            {ETIQUETA_ESTADO[c.estado] ?? c.estado}
                          </Badge>
                          {c.intentos > 0 && (
                            <span className="text-xs text-muted-foreground">
                              {c.intentos} intento(s)
                              {sinReintentar && ' · sin reintentos automáticos'}
                            </span>
                          )}
                          {c.reservationId && c.estado !== 'aceptada' && (
                            <AccionHospitality capacidad="operaciones.gestionar">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => void enviarReserva(c.reservationId)}
                              >
                                {/* Reenviar» cuando ya no lo hace el sistema: el
                                    botón dice quién actúa, no lo que hacía el barrido. */}
                                {sinReintentar ? 'Reenviar' : 'Reintentar'}
                              </Button>
                            </AccionHospitality>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Todavía no se ha enviado ninguna comunicación.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <CompletarParteVijerosDialog
        reserva={completar}
        onCerrar={() => setCompletar(null)}
        onCompletado={cargar}
      />
    </div>
  );
}
