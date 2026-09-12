'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Building2,
  Check,
  ClipboardList,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  Settings2,
  Trash2,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface FichaEstado {
  valor: string;
  etiqueta: string;
  icono: string;
  tono: 'verde' | 'amarillo' | 'naranja' | 'azul' | 'morado' | 'rojo' | 'gris';
  descripcion: string;
}

interface FilaRegistro {
  reservationId: string;
  referencia: string;
  canal: string;
  checkIn: string;
  checkOut: string;
  huesped: string | null;
  propiedad: string | null;
  unidad: string | null;
  total: number;
  registrados: number;
  pendientes: number;
  estado: string;
  etiqueta: string;
  listoParaEnviar: boolean;
  ultimoEnvio: string | null;
  mensajeError: string | null;
}

interface ViajeroPublico {
  id: string;
  nombre: string;
  apellido1: string;
  apellido2: string | null;
  tipoDocumento: string | null;
  numeroDocumento: string;
  soporteDocumento: string | null;
  fechaNacimiento: string | null;
  nacionalidad: string | null;
  esTitular: boolean;
  estado: string;
  documentoCompleto: boolean;
}

interface Configuracion {
  activo: boolean;
  entorno: string;
  entidadNombre: string | null;
  entidadNif: string | null;
  tieneUsuario: boolean;
  tienePassword: boolean;
  tieneCertificado: boolean;
  estadoConexion: string;
  ultimoEnvio: string | null;
  ultimoCodigo: string | null;
  ultimoError: string | null;
}

interface Evento {
  id: string;
  tipo: string;
  estado: string;
  detalle: string | null;
  codigoComunicacion: string | null;
  codigoError: string | null;
  mensajeError: string | null;
  fechaCreacion: string;
}

interface Detalle {
  reserva: {
    id: string;
    referencia: string;
    canal: string;
    estado: string;
    checkIn: string;
    checkOut: string;
    propiedad: string | null;
    unidad: string | null;
    contacto: { id: string; nombre: string; email: string | null; telefono: string | null } | null;
  };
  resumen: { total: number; registrados: number; pendientes: number; estado: string; etiqueta: string; listoParaEnviar: boolean };
  viajeros: ViajeroPublico[];
  registro: {
    estadoReserva: string;
    estadoViajeros: string;
    codigoComunicacion: string | null;
    enviadoEn: string | null;
    procesadoEn: string | null;
    codigoError: string | null;
    mensajeError: string | null;
  } | null;
  eventos: Evento[];
}

const TONOS: Record<FichaEstado['tono'], string> = {
  verde: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  amarillo: 'bg-amber-50 text-amber-700 border-amber-200',
  naranja: 'bg-orange-50 text-orange-700 border-orange-200',
  azul: 'bg-sky-50 text-sky-700 border-sky-200',
  morado: 'bg-violet-50 text-violet-700 border-violet-200',
  rojo: 'bg-red-50 text-red-700 border-red-200',
  gris: 'bg-slate-100 text-slate-600 border-slate-200',
};

const VIAJERO_VACIO = {
  nombre: '',
  apellido1: '',
  apellido2: '',
  tipoDocumento: '',
  numeroDocumento: '',
  soporteDocumento: '',
  fechaNacimiento: '',
  nacionalidad: '',
};

const fecha = (valor: string | null) =>
  valor ? new Date(valor).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

const fechaHora = (valor: string | null) =>
  valor
    ? new Date(valor).toLocaleString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

export default function RegistroDeViajerosPage() {
  const [cargando, setCargando] = useState(true);
  const [filas, setFilas] = useState<FilaRegistro[]>([]);
  const [estados, setEstados] = useState<FichaEstado[]>([]);
  const [conteo, setConteo] = useState<Record<string, number>>({});
  const [porcentaje, setPorcentaje] = useState(0);
  const [config, setConfig] = useState<Configuracion | null>(null);
  const [esquemaDisponible, setEsquemaDisponible] = useState(true);
  const [entornos, setEntornos] = useState<string[]>(['pruebas', 'produccion']);

  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [busqueda, setBusqueda] = useState('');

  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [trabajando, setTrabajando] = useState(false);

  const [formViajero, setFormViajero] = useState({ ...VIAJERO_VACIO });
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);

  const [avisoCerrado, setAvisoCerrado] = useState(false);
  const [configAbierta, setConfigAbierta] = useState(false);
  const [formConfig, setFormConfig] = useState({
    activo: false,
    entorno: 'pruebas',
    entidadNombre: '',
    entidadNif: '',
    usuario: '',
    password: '',
    certificado: '',
  });

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const params = new URLSearchParams();
      if (filtroEstado !== 'todos') params.set('estado', filtroEstado);
      if (busqueda.trim()) params.set('q', busqueda.trim());

      const res = await fetch(`/api/hospitality/compliance?${params.toString()}`);
      if (!res.ok) throw new Error('No se pudo leer el registro de viajeros');

      const datos = await res.json();
      setFilas(datos.filas || []);
      setEstados(datos.estados || []);
      setConteo(datos.conteo || {});
      setPorcentaje(datos.porcentajeEnviado || 0);
      setConfig(datos.configuracion || null);
      setEsquemaDisponible(datos.esquemaDisponible !== false);
      setEntornos(datos.entornos || ['pruebas', 'produccion']);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al cargar');
    } finally {
      setCargando(false);
    }
  }, [filtroEstado, busqueda]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const fichaPorValor = useMemo(() => {
    const mapa: Record<string, FichaEstado> = {};
    for (const ficha of estados) mapa[ficha.valor] = ficha;
    return mapa;
  }, [estados]);

  // Llegadas de mañana con viajeros aún incompletos o sin comunicar: es lo que
  // hay que recoger hoy, porque mañana el huésped ya está en la puerta. Las
  // reservas canceladas ya se excluyen en la bandeja.
  const llegadasManana = useMemo(() => {
    const iso = (d: Date | string) => {
      const dt = new Date(d);
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    };
    const manana = new Date();
    manana.setDate(manana.getDate() + 1);
    const isoManana = `${manana.getFullYear()}-${String(manana.getMonth() + 1).padStart(2, '0')}-${String(manana.getDate()).padStart(2, '0')}`;
    return filas.filter(
      (f) =>
        iso(f.checkIn) === isoManana &&
        (f.estado === 'datos_pendientes' || f.estado === 'pendiente_envio')
    );
  }, [filas]);

  const abrirDetalle = useCallback(async (reservationId: string) => {
    setCargandoDetalle(true);
    setDetalle(null);
    try {
      const res = await fetch(`/api/hospitality/compliance/${reservationId}`);
      if (!res.ok) throw new Error('No se pudo abrir el registro de esta reserva');
      setDetalle(await res.json());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al abrir el registro');
    } finally {
      setCargandoDetalle(false);
    }
  }, []);

  const leerDetalle = useCallback(async (reservationId: string) => {
    const res = await fetch(`/api/hospitality/compliance/${reservationId}`);
    if (!res.ok) throw new Error('No se pudo releer el registro');
    return (await res.json()) as Detalle;
  }, []);

  const accion = useCallback(
    async (reservationId: string, cuerpo: Record<string, unknown>, recargarDetalle = true) => {
      setTrabajando(true);
      try {
        const res = await fetch(`/api/hospitality/compliance/${reservationId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cuerpo),
        });
        const datos = await res.json().catch(() => ({}));

        if (!res.ok || datos.ok === false) {
          toast.error(datos.mensaje || datos.error || 'No se pudo completar la acción');
          return false;
        }

        toast.success(
          cuerpo.accion === 'enviar_reserva' || cuerpo.accion === 'enviar_viajeros'
            ? 'Comunicación enviada al Ministerio'
            : 'Guardado'
        );

        await cargar();
        if (recargarDetalle) {
          await leerDetalle(reservationId).then(setDetalle).catch(() => {});
        }
        return true;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Error de red');
        return false;
      } finally {
        setTrabajando(false);
      }
    },
    [cargar, leerDetalle]
  );

  const guardarViajero = useCallback(async () => {
    if (!detalle) return;
    if (!formViajero.nombre.trim() || !formViajero.apellido1.trim()) {
      toast.error('Nombre y primer apellido son obligatorios');
      return;
    }

    const ok = await accion(
      detalle.reserva.id,
      {
        accion: editandoId ? 'actualizar_viajero' : 'crear_viajero',
        viajeroId: editandoId ?? undefined,
        viajero: { ...formViajero, fechaNacimiento: formViajero.fechaNacimiento || null },
      },
      false
    );

    if (ok) {
      setFormViajero({ ...VIAJERO_VACIO });
      setEditandoId(null);
      setMostrarFormulario(false);
      await leerDetalle(detalle.reserva.id).then(setDetalle).catch(() => {});
    }
  }, [accion, detalle, editandoId, formViajero, leerDetalle]);

  const guardarConfiguracion = useCallback(async () => {
    setTrabajando(true);
    try {
      const res = await fetch('/api/hospitality/compliance/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formConfig),
      });
      const datos = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(datos.error || 'No se pudo guardar');

      setConfig(datos.configuracion);
      setFormConfig((previo) => ({ ...previo, usuario: '', password: '', certificado: '' }));
      toast.success('Configuración guardada');
      setConfigAbierta(false);
      await cargar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al guardar');
    } finally {
      setTrabajando(false);
    }
  }, [cargar, formConfig]);

  const probarConexion = useCallback(async () => {
    setTrabajando(true);
    try {
      const res = await fetch('/api/hospitality/compliance/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entorno: formConfig.entorno }),
      });
      const datos = await res.json();
      const alcance = datos.alcance;
      if (alcance?.alcanzable) {
        toast.success(`El servicio responde (HTTP ${alcance.status}) en ${alcance.entorno}`);
      } else {
        toast.error(`No se pudo alcanzar el servicio: ${alcance?.error || 'sin respuesta'}`);
      }
    } catch {
      toast.error('No se pudo probar la conexión');
    } finally {
      setTrabajando(false);
    }
  }, [formConfig.entorno]);

  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-black text-slate-900">
              <ClipboardList className="h-6 w-6 text-emerald-600" />
              Registro de viajeros
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              Comunicación obligatoria de la reserva y de las personas alojadas al Ministerio del Interior
              (SES.HOSPEDAJES). Cada cuenta se registra como entidad y usa sus propias credenciales.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => void cargar()} disabled={cargando}>
              {cargando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Actualizar
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setFormConfig({
                  activo: config?.activo ?? false,
                  entorno: config?.entorno ?? 'pruebas',
                  entidadNombre: config?.entidadNombre ?? '',
                  entidadNif: config?.entidadNif ?? '',
                  usuario: '',
                  password: '',
                  certificado: '',
                });
                setConfigAbierta(true);
              }}
            >
              <Settings2 className="mr-2 h-4 w-4" />
              Configuración
            </Button>
          </div>
        </header>

        {!esquemaDisponible && (
          <Card className="mb-4 border-amber-200 bg-amber-50">
            <CardContent className="flex gap-3 p-4 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">El envío al Ministerio está pendiente del esquema oficial</p>
                <p className="mt-1 text-amber-800">
                  Puedes dar de alta y revisar los viajeros y preparar la comunicación, pero el mensaje todavía no
                  sale: falta el manual de alta de SES.HOSPEDAJES, que define el XML. Nada se envía a medias y no se
                  registra en la bitácora lo que no se ha enviado.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {!config?.tieneUsuario || !config?.tienePassword ? (
          <Card className="mb-4 border-sky-200 bg-sky-50">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm text-sky-900">
              <div className="flex items-center gap-2">
                <KeyRound className="h-5 w-5" />
                <span>Esta cuenta aún no tiene credenciales de entidad guardadas.</span>
              </div>
              <Button size="sm" variant="outline" onClick={() => setConfigAbierta(true)}>
                Configurar credenciales
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {llegadasManana.length > 0 && !avisoCerrado && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <span>
                <strong>
                  {llegadasManana.length} reserva{llegadasManana.length !== 1 ? 's' : ''}{' '}
                  llega{llegadasManana.length !== 1 ? 'n' : ''} mañana
                </strong>{' '}
                con el registro incompleto ({llegadasManana.map((f) => f.etiqueta).join('; ')}).
              </span>
            </div>
            <button
              onClick={() => setAvisoCerrado(true)}
              className="p-1 rounded hover:bg-amber-100"
              aria-label="Cerrar aviso"
            >
              <XCircle className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Enviado correctamente</p>
              <p className="mt-1 text-2xl font-black text-emerald-600">
                {(conteo.completo || 0) + (conteo.procesando || 0) + (conteo.enviado || 0)}
                <span className="ml-1 text-sm font-bold text-slate-400">({porcentaje}%)</span>
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Datos pendientes</p>
              <p className="mt-1 text-2xl font-black text-amber-600">{conteo.datos_pendientes || 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Listos para enviar</p>
              <p className="mt-1 text-2xl font-black text-orange-600">{conteo.pendiente_envio || 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Errores del Ministerio</p>
              <p className="mt-1 text-2xl font-black text-red-600">{conteo.error || 0}</p>
            </CardContent>
          </Card>
        </div>

        <Card className="mb-4">
          <CardContent className="flex flex-wrap items-end gap-3 p-4">
            <div className="min-w-[220px]">
              <Label className="text-xs font-bold uppercase text-slate-400">Estado</Label>
              <Select value={filtroEstado} onValueChange={setFiltroEstado}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {estados.map((ficha) => (
                    <SelectItem key={ficha.valor} value={ficha.valor}>
                      {ficha.icono} {ficha.etiqueta}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[240px] flex-1">
              <Label className="text-xs font-bold uppercase text-slate-400">Buscar</Label>
              <Input
                className="mt-1"
                placeholder="Referencia, huésped, propiedad o canal"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Reservas y estado del registro</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {cargando ? (
              <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin" /> Cargando el registro…
              </div>
            ) : filas.length === 0 ? (
              <div className="py-16 text-center text-sm text-slate-400">
                No hay reservas que cumplan el filtro.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-y bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Referencia</th>
                      <th className="px-4 py-3">Huésped</th>
                      <th className="px-4 py-3">Alojamiento</th>
                      <th className="px-4 py-3">Estancia</th>
                      <th className="px-4 py-3">Registro</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((fila) => {
                      const ficha = fichaPorValor[fila.estado];
                      return (
                        <tr key={fila.reservationId} className="border-b last:border-0 hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-800">{fila.referencia}</div>
                            <div className="text-xs text-slate-400">{fila.canal}</div>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{fila.huesped ?? '—'}</td>
                          <td className="px-4 py-3 text-slate-600">
                            <div className="flex items-center gap-1">
                              <Building2 className="h-3.5 w-3.5 text-slate-400" />
                              {fila.propiedad ?? '—'}
                            </div>
                            <div className="text-xs text-slate-400">{fila.unidad ?? 'Sin unidad'}</div>
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            <div>{fecha(fila.checkIn)} → {fecha(fila.checkOut)}</div>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{fila.etiqueta}</td>
                          <td className="px-4 py-3">
                            {ficha ? (
                              <Badge variant="outline" className={TONOS[ficha.tono]}>
                                {ficha.icono} {ficha.etiqueta}
                              </Badge>
                            ) : (
                              <Badge variant="outline">{fila.estado}</Badge>
                            )}
                            {fila.ultimoEnvio ? (
                              <div className="mt-1 text-xs text-slate-400">{fechaHora(fila.ultimoEnvio)}</div>
                            ) : null}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="outline" onClick={() => void abrirDetalle(fila.reservationId)}>
                                Ver ficha
                              </Button>
                              <Button
                                size="sm"
                                disabled={!fila.listoParaEnviar || trabajando}
                                onClick={() => void accion(fila.reservationId, { accion: 'enviar_viajeros' })}
                              >
                                <Send className="mr-1 h-3.5 w-3.5" />
                                Enviar
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!detalle || cargandoDetalle} onOpenChange={(abierto) => !abierto && setDetalle(null)}>
        <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-emerald-600" />
              {detalle ? `Registro de la reserva ${detalle.reserva.referencia}` : 'Cargando registro…'}
            </DialogTitle>
            {detalle ? (
              <DialogDescription>
                {detalle.reserva.propiedad ?? 'Sin propiedad'} · {detalle.reserva.unidad ?? 'sin unidad'} ·{' '}
                {fecha(detalle.reserva.checkIn)} → {fecha(detalle.reserva.checkOut)}
              </DialogDescription>
            ) : null}
          </DialogHeader>

          {cargandoDetalle || !detalle ? (
            <div className="flex items-center justify-center gap-2 py-12 text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin" /> Cargando…
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-slate-50 p-3 text-sm">
                <span className="font-semibold text-slate-700">Registro Ministerio</span>
                <span className="text-slate-500">{detalle.resumen.etiqueta}</span>
                {fichaPorValor[detalle.resumen.estado] ? (
                  <Badge
                    variant="outline"
                    className={TONOS[fichaPorValor[detalle.resumen.estado].tono]}
                  >
                    {fichaPorValor[detalle.resumen.estado].icono} {fichaPorValor[detalle.resumen.estado].etiqueta}
                  </Badge>
                ) : null}
                <div className="ml-auto flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={trabajando}
                    onClick={() => void accion(detalle.reserva.id, { accion: 'enviar_reserva' })}
                  >
                    <Send className="mr-1 h-3.5 w-3.5" />
                    Enviar reserva
                  </Button>
                  <Button
                    size="sm"
                    disabled={trabajando || !detalle.resumen.listoParaEnviar}
                    onClick={() => void accion(detalle.reserva.id, { accion: 'enviar_viajeros' })}
                  >
                    <Send className="mr-1 h-3.5 w-3.5" />
                    Enviar viajeros
                  </Button>
                </div>
              </div>

              {detalle.resumen.pendientes > 0 ? (
                <p className="text-xs text-amber-700">
                  Faltan datos de {detalle.resumen.pendientes} de {detalle.resumen.total} viajeros: sin fecha de
                  nacimiento y documento no se puede comunicar.
                </p>
              ) : null}

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-700">Viajeros ({detalle.viajeros.length})</h3>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditandoId(null);
                      setFormViajero({ ...VIAJERO_VACIO });
                      setMostrarFormulario(true);
                    }}
                  >
                    <UserPlus className="mr-1 h-3.5 w-3.5" />
                    Añadir viajero
                  </Button>
                </div>

                {detalle.viajeros.length === 0 ? (
                  <p className="rounded-lg border border-dashed py-6 text-center text-sm text-slate-400">
                    Sin viajeros declarados. El parte de viajeros no se puede comunicar hasta que haya al menos uno.
                  </p>
                ) : (
                  <ul className="divide-y rounded-lg border">
                    {detalle.viajeros.map((viajero) => (
                      <li key={viajero.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                        <div className="min-w-[220px] flex-1">
                          <div className="font-semibold text-slate-800">
                            {viajero.nombre} {viajero.apellido1} {viajero.apellido2 ?? ''}
                            {viajero.esTitular ? (
                              <span className="ml-2 text-xs font-bold uppercase text-emerald-600">Titular</span>
                            ) : null}
                          </div>
                          <div className="text-xs text-slate-400">
                            {viajero.tipoDocumento ?? 'Sin documento'} {viajero.numeroDocumento}
                            {viajero.fechaNacimiento ? ` · ${fecha(viajero.fechaNacimiento)}` : ' · sin fecha de nacimiento'}
                            {viajero.nacionalidad ? ` · ${viajero.nacionalidad}` : ''}
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={viajero.estado === 'datos_pendientes' ? TONOS.amarillo : TONOS.naranja}
                        >
                          {viajero.estado === 'datos_pendientes' ? 'Datos pendientes' : 'Listo'}
                        </Badge>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditandoId(viajero.id);
                              setFormViajero({
                                nombre: viajero.nombre,
                                apellido1: viajero.apellido1,
                                apellido2: viajero.apellido2 ?? '',
                                tipoDocumento: viajero.tipoDocumento ?? '',
                                numeroDocumento: viajero.documentoCompleto ? viajero.numeroDocumento : '',
                                soporteDocumento: viajero.soporteDocumento ?? '',
                                fechaNacimiento: viajero.fechaNacimiento
                                  ? new Date(viajero.fechaNacimiento).toISOString().slice(0, 10)
                                  : '',
                                nacionalidad: viajero.nacionalidad ?? '',
                              });
                              setMostrarFormulario(true);
                            }}
                          >
                            Editar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-600"
                            disabled={trabajando}
                            onClick={() => {
                              if (!confirm(`¿Retirar a ${viajero.nombre} ${viajero.apellido1} del registro?`)) return;
                              void accion(detalle.reserva.id, { accion: 'eliminar_viajero', viajeroId: viajero.id });
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {mostrarFormulario ? (
                <div className="rounded-lg border p-4">
                  <h3 className="mb-3 text-sm font-bold text-slate-700">
                    {editandoId ? 'Editar viajero' : 'Nuevo viajero'}
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label className="text-xs font-bold uppercase text-slate-400">Nombre *</Label>
                      <Input
                        className="mt-1"
                        value={formViajero.nombre}
                        onChange={(e) => setFormViajero({ ...formViajero, nombre: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-bold uppercase text-slate-400">Primer apellido *</Label>
                      <Input
                        className="mt-1"
                        value={formViajero.apellido1}
                        onChange={(e) => setFormViajero({ ...formViajero, apellido1: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-bold uppercase text-slate-400">Segundo apellido</Label>
                      <Input
                        className="mt-1"
                        value={formViajero.apellido2}
                        onChange={(e) => setFormViajero({ ...formViajero, apellido2: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-bold uppercase text-slate-400">Fecha de nacimiento *</Label>
                      <Input
                        className="mt-1"
                        type="date"
                        value={formViajero.fechaNacimiento}
                        onChange={(e) => setFormViajero({ ...formViajero, fechaNacimiento: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-bold uppercase text-slate-400">Tipo de documento *</Label>
                      <Input
                        className="mt-1"
                        placeholder="DNI, NIE, Pasaporte…"
                        value={formViajero.tipoDocumento}
                        onChange={(e) => setFormViajero({ ...formViajero, tipoDocumento: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-bold uppercase text-slate-400">Número de documento *</Label>
                      <Input
                        className="mt-1"
                        value={formViajero.numeroDocumento}
                        onChange={(e) => setFormViajero({ ...formViajero, numeroDocumento: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-bold uppercase text-slate-400">Soporte del documento</Label>
                      <Input
                        className="mt-1"
                        value={formViajero.soporteDocumento}
                        onChange={(e) => setFormViajero({ ...formViajero, soporteDocumento: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-bold uppercase text-slate-400">Nacionalidad</Label>
                      <Input
                        className="mt-1"
                        placeholder="ES"
                        value={formViajero.nacionalidad}
                        onChange={(e) => setFormViajero({ ...formViajero, nacionalidad: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setMostrarFormulario(false);
                        setEditandoId(null);
                        setFormViajero({ ...VIAJERO_VACIO });
                      }}
                    >
                      Cancelar
                    </Button>
                    <Button onClick={() => void guardarViajero()} disabled={trabajando}>
                      {trabajando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                      Guardar viajero
                    </Button>
                  </div>
                </div>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setMostrarFormulario(true)}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Añadir un viajero
                </Button>
              )}

              {detalle.eventos.length > 0 ? (
                <div>
                  <h3 className="mb-2 text-sm font-bold text-slate-700">Historial de comunicaciones</h3>
                  <ul className="space-y-1 text-xs">
                    {detalle.eventos.map((evento) => (
                      <li key={evento.id} className="flex items-center gap-2 rounded border px-2 py-1">
                        <span className="font-semibold text-slate-600">{evento.tipo}</span>
                        <span className="text-slate-400">{fechaHora(evento.fechaCreacion)}</span>
                        <span
                          className={
                            evento.estado === 'error' || evento.estado === 'anulado'
                              ? 'text-red-600'
                              : 'text-emerald-600'
                          }
                        >
                          {evento.estado}
                        </span>
                        <span className="truncate text-slate-500">
                          {evento.mensajeError || evento.detalle || ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <DialogFooter className="flex flex-wrap justify-between gap-2">
                <Button
                  variant="outline"
                  className="text-red-600"
                  disabled={trabajando}
                  onClick={() => {
                    if (!confirm('¿Anular el registro de viajeros de esta reserva?')) return;
                    void accion(detalle.reserva.id, { accion: 'anular', motivo: 'Anulado desde la ficha' });
                  }}
                >
                  <XCircle className="mr-1 h-3.5 w-3.5" />
                  Anular registro
                </Button>
                <Button variant="ghost" onClick={() => setDetalle(null)}>
                  Cerrar
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={configAbierta} onOpenChange={setConfigAbierta}>
        <DialogContent className="max-h-[88vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-emerald-600" />
              Credenciales de la entidad
            </DialogTitle>
            <DialogDescription>
              Cada cuenta se registra por su cuenta ante SES.HOSPEDAJES. Las credenciales se guardan cifradas y no
              se vuelven a mostrar: si dejas los campos vacíos, se conservan las que ya había.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs font-bold uppercase text-slate-400">Entorno</Label>
                <Select
                  value={formConfig.entorno}
                  onValueChange={(valor) => setFormConfig({ ...formConfig, entorno: valor })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {entornos.map((entorno) => (
                      <SelectItem key={entorno} value={entorno}>
                        {entorno === 'produccion' ? 'Producción' : 'Pruebas'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-bold uppercase text-slate-400">Estado</Label>
                <Button
                  variant="outline"
                  className="mt-1 w-full justify-start"
                  onClick={() => setFormConfig({ ...formConfig, activo: !formConfig.activo })}
                >
                  {formConfig.activo ? 'Activado' : 'Desactivado'}
                </Button>
              </div>
              <div>
                <Label className="text-xs font-bold uppercase text-slate-400">Nombre de la entidad</Label>
                <Input
                  className="mt-1"
                  value={formConfig.entidadNombre}
                  onChange={(e) => setFormConfig({ ...formConfig, entidadNombre: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs font-bold uppercase text-slate-400">NIF de la entidad</Label>
                <Input
                  className="mt-1"
                  value={formConfig.entidadNif}
                  onChange={(e) => setFormConfig({ ...formConfig, entidadNif: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs font-bold uppercase text-slate-400">
                  Usuario {config?.tieneUsuario ? '(guardado)' : '*'}
                </Label>
                <Input
                  className="mt-1"
                  autoComplete="off"
                  placeholder={config?.tieneUsuario ? '••••••••' : ''}
                  value={formConfig.usuario}
                  onChange={(e) => setFormConfig({ ...formConfig, usuario: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs font-bold uppercase text-slate-400">
                  Contraseña {config?.tienePassword ? '(guardada)' : '*'}
                </Label>
                <Input
                  className="mt-1"
                  type="password"
                  autoComplete="new-password"
                  placeholder={config?.tienePassword ? '••••••••' : ''}
                  value={formConfig.password}
                  onChange={(e) => setFormConfig({ ...formConfig, password: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-bold uppercase text-slate-400">
                Credencial digital {config?.tieneCertificado ? '(guardada)' : ''}
              </Label>
              <Input
                className="mt-1"
                type="password"
                autoComplete="off"
                value={formConfig.certificado}
                onChange={(e) => setFormConfig({ ...formConfig, certificado: e.target.value })}
              />
            </div>

            {config?.ultimoError ? (
              <p className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                Último error: {config.ultimoError}
              </p>
            ) : null}
          </div>

          <DialogFooter className="flex flex-wrap justify-between gap-2">
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => void probarConexion()} disabled={trabajando}>
                Probar conexión
              </Button>
              {config?.tieneUsuario ? (
                <Button
                  variant="outline"
                  className="text-red-600"
                  disabled={trabajando}
                  onClick={async () => {
                    const res = await fetch('/api/hospitality/compliance/config', { method: 'DELETE' });
                    if (res.ok) {
                      toast.success('Credenciales retiradas');
                      await cargar();
                    } else {
                      toast.error('No se pudieron retirar las credenciales');
                    }
                  }}
                >
                  Retirar credenciales
                </Button>
              ) : null}
            </div>
            <Button onClick={() => void guardarConfiguracion()} disabled={trabajando}>
              {trabajando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
