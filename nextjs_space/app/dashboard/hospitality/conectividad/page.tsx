'use client';

/**
 * Conectividad de Canales — el ID de socio del hotel.
 *
 * El proveedor emite un **ID de socio (partner id)** al registrarse cada hotel,
 * y ese id es la clave con la que el servicio devuelve SUS propiedades. Sin él,
 * el hotel no puede ver su catálogo (ni, por tanto, vincular unidades y vender
 * por los canales): la capa funcionaba con un único ID de plataforma mientras
 * todos los hoteles compartían cuenta.
 *
 * Aquí el hotel registra el suyo. Lo que NO se toca desde esta pantalla es el
 * usuario y la contraseña: son de plataforma y los administra Volkern.
 *
 * Dos cosas, en orden:
 *  1. **Guardar el ID de socio**, con el aviso de si la plataforma ya está
 *     activada (sin el acceso de plataforma, el ID solo no sirve para nada).
 *  2. **Comprobar** que con ese ID se ve una propiedad concreta: el proveedor
 *     responde «partner desconocido» si el id no es el suyo, y es mejor
 *     descubrirlo aquí que al vincular unidades.
 */

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Cable,
  CheckCircle2,
  KeyRound,
  Loader2,
  Plug,
  RefreshCw,
  Save,
  Search,
  Trash2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { AccionHospitality } from '@/components/hospitality/AccionHospitality';

interface EstadoConectividad {
  nombre: string;
  plataformaConfigurada: boolean;
  tienePartnerIdPropio: boolean;
  partnerId: string;
  completo: boolean;
  estado: string;
}

/**
 * Estado de la credencial de una propiedad. `configurado` dice si hay token;
 * **el token no viaja**: la API nunca lo devuelve y esta pantalla no lo pinta.
 */
interface ConectividadPropiedad {
  configurado: boolean;
  activo: boolean;
  modo: string;
  estado: string;
  externalPropertyId: string | null;
  ultimoChequeo: string | null;
  ultimoError: string | null;
}

interface PropiedadConectividad {
  id: string;
  nombre: string;
  conectividad: ConectividadPropiedad;
}

/** Lo que responde guardar: el estado y la prueba de la credencial. */
interface SondeoCredencial {
  probado?: boolean;
  ok?: boolean;
  error?: string | null;
  hotel?: string | null;
  hotelActivo?: boolean | null;
  rentals?: number | null;
}

/**
 * Cómo se lee el estado de la credencial. `conectado` lo escribe la sonda de
 * guardado (o el chequeo de salud); `configurado` significa «hay token, sin
 * probar» — no un problema, pero tampoco una promesa.
 */
const ESTADO_CREDENCIAL: Record<string, { texto: string; clase: string }> = {
  conectado: { texto: 'Responde', clase: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  error: { texto: 'Falla', clase: 'bg-red-100 text-red-800 border-red-200' },
  configurado: { texto: 'Sin probar', clase: 'bg-amber-100 text-amber-900 border-amber-200' },
  sin_configurar: { texto: 'Sin token', clase: '' },
};

function fechaDeChequeo(iso: string | null): string {
  if (!iso) return '';
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '';
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(fecha);
}

export default function ConectividadDelHotel() {
  const [estado, setEstado] = useState<EstadoConectividad | null>(null);
  const [cargando, setCargando] = useState(true);
  const [partnerId, setPartnerId] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [hotelCode, setHotelCode] = useState('');
  const [probando, setProbando] = useState(false);
  const [prueba, setPrueba] = useState<{ ok: boolean; texto: string } | null>(null);

  // Credencial por propiedad (token del servicio de canales).
  const [propiedades, setPropiedades] = useState<PropiedadConectividad[]>([]);
  const [propiedadId, setPropiedadId] = useState('');
  const [codigoPropiedad, setCodigoPropiedad] = useState('');
  const [token, setToken] = useState('');
  const [activo, setActivo] = useState(true);
  const [modo, setModo] = useState<'escritura' | 'lectura'>('escritura');
  const [guardandoToken, setGuardandoToken] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch('/api/hospitality/conectividad');
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || 'No se pudo leer la configuración de conectividad');
        return;
      }
      setEstado(data as EstadoConectividad);
    } catch {
      toast.error('No se pudo leer la configuración de conectividad');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const seleccionada = propiedades.find((p) => p.id === propiedadId) ?? null;

  /** Vuelca la propiedad elegida en el formulario. El token siempre queda vacío. */
  const aplicarPropiedad = useCallback((p: PropiedadConectividad) => {
    setPropiedadId(p.id);
    setCodigoPropiedad(p.conectividad.externalPropertyId ?? '');
    setActivo(p.conectividad.activo);
    setModo(p.conectividad.modo === 'lectura' ? 'lectura' : 'escritura');
    setToken('');
  }, []);

  const cargarPropiedades = useCallback(
    async (preferida?: string) => {
      try {
        const res = await fetch('/api/hospitality/conectividad/propiedades');
        const data = await res.json();
        if (!res.ok) {
          toast.error(data?.error || 'No se pudo leer la conectividad de las propiedades');
          return;
        }
        const lista: PropiedadConectividad[] = Array.isArray(data?.propiedades)
          ? data.propiedades
          : [];
        setPropiedades(lista);
        const elegida = lista.find((p) => p.id === preferida) ?? lista[0] ?? null;
        if (elegida) aplicarPropiedad(elegida);
      } catch {
        toast.error('No se pudo leer la conectividad de las propiedades');
      }
    },
    [aplicarPropiedad]
  );

  useEffect(() => {
    void cargarPropiedades();
  }, [cargarPropiedades]);

  const guardarToken = async () => {
    if (!propiedadId) {
      toast.error('Elige una propiedad');
      return;
    }
    setGuardandoToken(true);
    try {
      const res = await fetch('/api/hospitality/conectividad/propiedades', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId: propiedadId,
          externalPropertyId: codigoPropiedad,
          // Vacío = conservar el guardado: cambiar el estado no obliga a
          // volver a pegar un secreto que ya no se muestra.
          ...(token.trim() ? { token: token.trim() } : {}),
          activo,
          modo,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        toast.error(data?.error || 'No se pudo guardar la credencial');
        return;
      }
      for (const aviso of Array.isArray(data?.avisos) ? data.avisos : []) {
        toast.warning(String(aviso));
      }
      setToken('');

      // El guardado trae la prueba del proveedor: decir «guardado» y callar un
      // token rechazado dejaría al hotel creyendo que ya está conectado.
      const sonda: SondeoCredencial | null = data?.sondeo ?? null;
      if (sonda?.probado && sonda.ok === false) {
        toast.error(
          `Credencial guardada, pero el proveedor no la aceptó: ${sonda.error || 'sin detalle'}`
        );
      } else if (sonda?.probado) {
        const cuantos =
          typeof sonda.rentals === 'number'
            ? ` · ${sonda.rentals} alojamiento${sonda.rentals === 1 ? '' : 's'}`
            : '';
        toast.success(
          sonda.hotel ? `Credencial verificada: ${sonda.hotel}${cuantos}` : 'Credencial verificada'
        );
        if (sonda.hotelActivo === false) {
          toast.warning('El establecimiento figura inactivo en el proveedor.');
        }
      } else {
        toast.success(
          'Credencial guardada. Está desactivada, así que no se probó contra el proveedor.'
        );
      }

      await cargarPropiedades(propiedadId);
    } catch {
      toast.error('No se pudo guardar la credencial');
    } finally {
      setGuardandoToken(false);
    }
  };

  const guardar = async (valor: string | null) => {
    setGuardando(true);
    try {
      const res = await fetch('/api/hospitality/conectividad', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnerId: valor }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || 'No se pudo guardar el ID de socio');
        return;
      }
      setEstado(data as EstadoConectividad);
      setPartnerId('');
      toast.success(valor ? 'ID de socio guardado' : 'ID de socio retirado');
    } catch {
      toast.error('No se pudo guardar el ID de socio');
    } finally {
      setGuardando(false);
    }
  };

  const probar = async () => {
    setProbando(true);
    setPrueba(null);
    try {
      const res = await fetch('/api/hospitality/conectividad', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'probar', hotelCode }),
      });
      const data = await res.json();
      if (data?.ok) {
        const habitaciones = typeof data.habitaciones === 'number' ? data.habitaciones : null;
        setPrueba({
          ok: true,
          texto: habitaciones == null
            ? 'La propiedad responde con tu ID de socio.'
            : `La propiedad responde con tu ID de socio: ${habitaciones} tipo(s) de habitación.`,
        });
      } else {
        setPrueba({ ok: false, texto: data?.error || 'La propiedad no respondió con tu ID de socio.' });
      }
    } catch {
      setPrueba({ ok: false, texto: 'No se pudo comprobar la propiedad.' });
    } finally {
      setProbando(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold text-gray-900">
            <Cable className="h-7 w-7" />
            Conectividad de Canales
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tu ID de socio es lo que deja al servicio devolver <strong>tus</strong> propiedades
            {' '}(habitaciones y planes de tarifa) para poder vincularlas y vender por los canales.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void cargar()} disabled={cargando}>
          {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-2">Actualizar</span>
        </Button>
      </div>

      {estado && !estado.plataformaConfigurada && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="flex items-start gap-3 pt-6">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <p className="text-sm text-amber-900">
              Volkern todavía no ha activado la conectividad de canales en la plataforma. Puedes dejar
              tu ID de socio guardado: empezará a usarse en cuanto la activación esté hecha.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plug className="h-5 w-5" />
            Tu ID de socio (partner id)
          </CardTitle>
          <CardDescription>
            Es el identificador que te dio el proveedor al registrar tu hotel. No es tu correo ni tu
            usuario: si te equivocas, el servicio responde «partner desconocido» y no verás tus
            propiedades.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Estado:</span>
            {estado?.tienePartnerIdPropio ? (
              <Badge className="bg-emerald-100 text-emerald-800">
                Registrado ({estado.partnerId})
              </Badge>
            ) : estado?.completo ? (
              <Badge variant="secondary">Sin registrar · se usa el de Volkern</Badge>
            ) : (
              // Sin el tuyo y sin uno de Volkern no hay con qué consultar TUS
              // propiedades: prometer un respaldo que no existe dejaría al hotel
              // esperando a que algo pase por sí solo.
              <Badge variant="destructive">Sin registrar · nadie puede consultar tus propiedades aún</Badge>
            )}
            {estado?.estado === 'error' && (
              <Badge className="bg-red-100 text-red-800">La capa reporta errores</Badge>
            )}
          </div>

          <div className="max-w-md space-y-2">
            <Label htmlFor="partnerId">ID de socio (partner id)</Label>
            <Input
              id="partnerId"
              value={partnerId}
              onChange={(e) => setPartnerId(e.target.value)}
              placeholder={estado?.tienePartnerIdPropio ? '•••••• (déjalo vacío para no cambiarlo)' : 'El que te dio el proveedor'}
              autoComplete="off"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <AccionHospitality capacidad="integraciones.gestionar">
              <Button onClick={() => void guardar(partnerId)} disabled={guardando || partnerId.trim() === ''}>
                {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                <span className="ml-2">Guardar</span>
              </Button>
            </AccionHospitality>

            {estado?.tienePartnerIdPropio && (
              <AccionHospitality capacidad="integraciones.gestionar">
                <Button variant="outline" onClick={() => void guardar(null)} disabled={guardando}>
                  <Trash2 className="h-4 w-4" />
                  <span className="ml-2">Quitar y usar el de Volkern</span>
                </Button>
              </AccionHospitality>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            Credencial por propiedad
          </CardTitle>
          <CardDescription>
            Si el servicio te dio un <strong>token por establecimiento</strong>, guárdalo aquí: es la
            clave con la que se consultan sus habitaciones, tarifas y reservas. Se guarda cifrado en el
            servidor y no se vuelve a mostrar: ni esta pantalla ni la API lo devuelven.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {propiedades.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay propiedades en tu cuenta.</p>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="propiedadCredencial">Propiedad</Label>
                  <Select
                    value={propiedadId}
                    onValueChange={(valor) => {
                      const p = propiedades.find((x) => x.id === valor);
                      if (p) aplicarPropiedad(p);
                    }}
                  >
                    <SelectTrigger id="propiedadCredencial">
                      <SelectValue placeholder="Elige una propiedad" />
                    </SelectTrigger>
                    <SelectContent>
                      {propiedades.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="codigoPropiedad">Código en el proveedor</Label>
                  <Input
                    id="codigoPropiedad"
                    value={codigoPropiedad}
                    onChange={(e) => setCodigoPropiedad(e.target.value)}
                    placeholder="El código con el que te registró el proveedor"
                    autoComplete="off"
                  />
                </div>
              </div>

              {seleccionada && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-muted-foreground">Estado:</span>
                  <Badge
                    variant={seleccionada.conectividad.configurado ? undefined : 'secondary'}
                    className={
                      seleccionada.conectividad.configurado
                        ? 'bg-emerald-100 text-emerald-800'
                        : undefined
                    }
                  >
                    {seleccionada.conectividad.configurado ? 'Token guardado' : 'Sin token'}
                  </Badge>
                  {seleccionada.conectividad.configurado && (
                    <Badge
                      variant="outline"
                      className={
                        (ESTADO_CREDENCIAL[seleccionada.conectividad.estado] ??
                          ESTADO_CREDENCIAL.configurado).clase
                      }
                    >
                      {(ESTADO_CREDENCIAL[seleccionada.conectividad.estado] ??
                        ESTADO_CREDENCIAL.configurado).texto}
                    </Badge>
                  )}
                  <Badge variant={seleccionada.conectividad.activo ? 'secondary' : 'outline'}>
                    {seleccionada.conectividad.activo ? 'En uso' : 'Desactivada'}
                  </Badge>
                  <Badge variant="outline">
                    {seleccionada.conectividad.modo === 'lectura' ? 'Solo lectura' : 'Escribe'}
                  </Badge>
                </div>
              )}

              {seleccionada?.conectividad.ultimoChequeo && (
                <p className="text-xs text-muted-foreground">
                  Última comprobación con el proveedor:
                  {' '}
                  {fechaDeChequeo(seleccionada.conectividad.ultimoChequeo)}
                </p>
              )}

              <div className="max-w-md space-y-2">
                <Label htmlFor="tokenPropiedad">Token</Label>
                <Input
                  id="tokenPropiedad"
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder={
                    seleccionada?.conectividad.configurado
                      ? '•••••• (vacío = conservar el actual)'
                      : 'El token de esta propiedad'
                  }
                  autoComplete="new-password"
                />
                <p className="text-xs text-muted-foreground">
                  No se muestra de nuevo una vez guardado. Déjalo vacío para cambiar solo el estado o
                  el modo: al guardar se prueba contra el proveedor en solo lectura y el resultado
                  queda en la tarjeta.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-6">
                <div className="flex items-center gap-2">
                  <Switch id="activoPropiedad" checked={activo} onCheckedChange={setActivo} />
                  <Label htmlFor="activoPropiedad">Usar esta credencial</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="modoPropiedad">Modo</Label>
                  <Select
                    value={modo}
                    onValueChange={(v) => setModo(v === 'lectura' ? 'lectura' : 'escritura')}
                  >
                    <SelectTrigger id="modoPropiedad" className="w-[190px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="escritura">Escribe en los canales</SelectItem>
                      <SelectItem value="lectura">Solo lectura</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                «Solo lectura» sirve mientras conviven dos conectividades: lee y reconcilia sin
                empujar disponibilidad. Solo una debe escribir, o se duplican las noches vendidas.
              </p>

              {seleccionada?.conectividad.ultimoError && (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>Último fallo registrado: {seleccionada.conectividad.ultimoError}</p>
                </div>
              )}

              <AccionHospitality capacidad="integraciones.gestionar">
                <Button
                  onClick={() => void guardarToken()}
                  disabled={guardandoToken || !codigoPropiedad.trim()}
                >
                  {guardandoToken ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  <span className="ml-2">
                    {guardandoToken ? 'Guardando y probando…' : 'Guardar credencial'}
                  </span>
                </Button>
              </AccionHospitality>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Comprobar con una propiedad
          </CardTitle>
          <CardDescription>
            Escribe el código de propiedad que te dio el proveedor. Con tu ID de socio debe devolver
            sus habitaciones y planes de tarifa: eso es lo que después se vincula en la puesta en
            marcha. Si ya tienes una propiedad vinculada, déjalo vacío y se comprueba con la suya
            (el mismo código con el que se envían tarifas y disponibilidad).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-md space-y-2">
            <Label htmlFor="hotelCode">Código de propiedad (hotelCode)</Label>
            <Input
              id="hotelCode"
              value={hotelCode}
              onChange={(e) => setHotelCode(e.target.value)}
              placeholder="El código del proveedor (vacío = el de tu propiedad vinculada)"
              autoComplete="off"
            />
          </div>

          <AccionHospitality capacidad="integraciones.gestionar">
            <Button onClick={() => void probar()} disabled={probando}>
              {probando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span className="ml-2">Comprobar</span>
            </Button>
          </AccionHospitality>

          {prueba && (
            <div
              className={`flex items-start gap-2 rounded-md border p-3 text-sm ${
                prueba.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-red-200 bg-red-50 text-red-900'
              }`}
            >
              {prueba.ok ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <p>{prueba.texto}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
