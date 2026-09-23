'use client';

/**
 * Equipo y roles de Hospitality (§27 del plan maestro).
 *
 * Esta pantalla no edita permisos uno a uno — para eso está la matriz de
 * Equipo → Roles y permisos, que ya existe y no se duplica aquí. Lo que hace es
 * lo que ninguna otra pantalla puede hacer: **decir qué es cada rol del
 * alojamiento** y crear de una vez los que falten con su definición exacta.
 *
 * Cuando el rol tiene el botón escondido es porque el usuario no administra los
 * roles: la pantalla lo explica en lugar de dejar un botón que llevaría a un 403.
 */
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import Link from 'next/link';
import {
  BadgeCheck,
  KeyRound,
  Link2Off,
  Loader2,
  Lock,
  RefreshCw,
  Search,
  ShieldCheck,
  TriangleAlert,
  UserCog,
  UserPlus,
  UserRoundCheck,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AccionHospitality } from '@/components/hospitality/AccionHospitality';
import {
  CAPACIDADES_HOSPITALITY,
  type CapacidadHospitality,
} from '@/lib/hospitality/capacidades';

interface EntradaCatalogo {
  id: string;
  nombre: string;
  descripcion: string;
  protegido: boolean;
  capacidades: CapacidadHospitality[];
  existe: boolean;
  rolId: string | null;
  usuarios: number;
  /** No le falta nada de su definición. Puede tener permisos de más. */
  alDia: boolean;
  /** Lo que le falta respecto al diseño, como `modulo.accion`. */
  faltantes: string[];
}

/** Una cuenta con el rol Huésped y el contacto al que está —o no— vinculada. */
interface AccesoHuesped {
  id: string;
  nombre: string | null;
  email: string;
  estado: string;
  /** Sin vínculo no ve ninguna reserva: la pantalla lo dice, no lo insinúa. */
  vinculado: boolean;
  contacto: { id: string; nombre: string | null; email: string | null } | null;
}

interface ContactoCRM {
  id: string;
  nombre: string | null;
  email: string | null;
  telefono?: string | null;
}

interface CredencialesDeAcceso {
  email: string;
  tempPassword: string;
  inviteToken: string;
}

export default function RolesHospitalityPage() {
  const [catalogo, setCatalogo] = useState<EntradaCatalogo[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [sinPermiso, setSinPermiso] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aplicando, setAplicando] = useState(false);
  const [restableciendo, setRestableciendo] = useState<string | null>(null);

  // Accesos de huésped (§20): el rol solo sirve si hay vínculo con el contacto.
  const [accesos, setAccesos] = useState<AccesoHuesped[]>([]);
  const [rolHuesped, setRolHuesped] = useState<{ id: string; nombre: string } | null>(null);
  const [cargandoAccesos, setCargandoAccesos] = useState(true);
  const [vinculando, setVinculando] = useState<AccesoHuesped | null>(null);
  const [altaAbierta, setAltaAbierta] = useState(false);
  const [busquedaContacto, setBusquedaContacto] = useState('');
  const [contactos, setContactos] = useState<ContactoCRM[]>([]);
  const [buscandoContacto, setBuscandoContacto] = useState(false);
  const [guardandoVinculo, setGuardandoVinculo] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState({ nombre: '', email: '', telefono: '', contactId: '' });
  const [creando, setCreando] = useState(false);
  // Se enseñan una sola vez, para que el Anfitrión los entregue a mano. No se
  // vuelven a pedir ni se guardan en ningún sitio de la interfaz.
  const [credenciales, setCredenciales] = useState<CredencialesDeAcceso | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch('/api/hospitality/roles');
      if (res.status === 403) {
        setSinPermiso(true);
        setCatalogo(null);
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'No se pudo leer el catálogo de roles');
      }
      const data = await res.json();
      setSinPermiso(false);
      setCatalogo(data.catalogo ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el catálogo de roles');
    } finally {
      setCargando(false);
    }
  }, []);

  const cargarAccesos = useCallback(async () => {
    setCargandoAccesos(true);
    try {
      const res = await fetch('/api/hospitality/accesos-huesped');
      if (!res.ok) {
        setAccesos([]);
        setRolHuesped(null);
        return;
      }
      const data = await res.json();
      setRolHuesped(data.rol ?? null);
      setAccesos(data.accesos ?? []);
    } catch {
      setAccesos([]);
    } finally {
      setCargandoAccesos(false);
    }
  }, []);

  useEffect(() => {
    cargar();
    cargarAccesos();
  }, [cargar, cargarAccesos]);

  // Búsqueda de contactos del CRM para vincular o dar acceso. Se hace cuando hay
  // un diálogo abierto, para no consultar contactos sin motivo.
  useEffect(() => {
    if (!vinculando && !altaAbierta) return;
    const t = setTimeout(async () => {
      setBuscandoContacto(true);
      try {
        const params = new URLSearchParams({ tipo: 'person' });
        if (busquedaContacto.trim()) params.set('search', busquedaContacto.trim());
        const res = await fetch(`/api/contacts?${params.toString()}`);
        const data = res.ok ? await res.json() : [];
        setContactos(Array.isArray(data) ? data : []);
      } catch {
        setContactos([]);
      } finally {
        setBuscandoContacto(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [vinculando, altaAbierta, busquedaContacto]);

  const aplicar = async () => {
    setAplicando(true);
    try {
      const res = await fetch('/api/hospitality/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'aplicar' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || 'No se pudo aplicar el catálogo');
        return;
      }
      const creados: string[] = data.creados ?? [];
      const completados: { nombre: string }[] = data.completados ?? [];
      if (!creados.length && !completados.length) {
        toast.success('Los roles ya estaban al día');
      } else {
        toast.success(
          [
            creados.length ? `${creados.length} rol(es) creado(s)` : null,
            completados.length ? `${completados.length} completado(s)` : null,
          ]
            .filter(Boolean)
            .join(' · ')
        );
      }
      await cargar();
    } catch {
      toast.error('Error de conexión al aplicar el catálogo');
    } finally {
      setAplicando(false);
    }
  };

  const restablecer = async (entrada: EntradaCatalogo) => {
    if (!entrada.rolId) return;
    setRestableciendo(entrada.id);
    try {
      const res = await fetch('/api/hospitality/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'restablecer', rolId: entrada.rolId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || 'No se pudo restablecer el rol');
        return;
      }
      toast.success(`«${entrada.nombre}» vuelve a su definición del catálogo`);
      await cargar();
    } catch {
      toast.error('Error de conexión al restablecer el rol');
    } finally {
      setRestableciendo(null);
    }
  };

  const vincularContacto = async (contacto: ContactoCRM) => {
    if (!vinculando) return;
    setGuardandoVinculo(contacto.id);
    try {
      const res = await fetch('/api/hospitality/accesos-huesped', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'vincular', userId: vinculando.id, contactId: contacto.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || 'No se pudo vincular el contacto');
        return;
      }
      toast.success(`${vinculando.nombre || vinculando.email} queda vinculado a ${contacto.nombre || contacto.email}`);
      setVinculando(null);
      setBusquedaContacto('');
      await cargarAccesos();
    } catch {
      toast.error('Error de conexión al vincular el contacto');
    } finally {
      setGuardandoVinculo(null);
    }
  };

  const desvincular = async (acceso: AccesoHuesped) => {
    setGuardandoVinculo(acceso.id);
    try {
      const res = await fetch('/api/hospitality/accesos-huesped', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'desvincular', userId: acceso.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || 'No se pudo desvincular');
        return;
      }
      toast.success(
        `${acceso.nombre || acceso.email} ya no ve ninguna reserva hasta que lo vuelvas a vincular`
      );
      await cargarAccesos();
    } catch {
      toast.error('Error de conexión al desvincular');
    } finally {
      setGuardandoVinculo(null);
    }
  };

  const abrirAlta = (contacto?: ContactoCRM) => {
    setCredenciales(null);
    setBusquedaContacto('');
    setNuevo({
      nombre: contacto?.nombre ?? '',
      email: contacto?.email ?? '',
      telefono: contacto?.telefono ?? '',
      contactId: contacto?.id ?? '',
    });
    setAltaAbierta(true);
  };

  const elegirContactoParaAlta = (contacto: ContactoCRM) => {
    setNuevo((prev) => ({
      ...prev,
      contactId: contacto.id,
      // Los datos del contacto solo rellenan lo que esté vacío: si el Anfitrión
      // ya escribió el email de acceso, no se lo cambiiamos por el del CRM.
      nombre: prev.nombre.trim() || contacto.nombre || '',
      email: prev.email.trim() || contacto.email || '',
      telefono: prev.telefono.trim() || contacto.telefono || '',
    }));
  };

  const crearAcceso = async () => {
    setCreando(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nuevo.nombre.trim(),
          email: nuevo.email.trim(),
          telefono: nuevo.telefono.trim() || undefined,
          roleId: rolHuesped?.id,
          contactId: nuevo.contactId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || 'No se pudo dar acceso al huésped');
        return;
      }
      setCredenciales({
        email: nuevo.email.trim(),
        tempPassword: data.tempPassword ?? '',
        inviteToken: data.inviteToken ?? '',
      });
      toast.success('Acceso creado y vinculado a su contacto');
      await cargarAccesos();
    } catch {
      toast.error('Error de conexión al crear el acceso');
    } finally {
      setCreando(false);
    }
  };

  if (sinPermiso) {
    return (
      <div className="p-10 max-w-xl mx-auto text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto">
          <Lock className="h-7 w-7 text-slate-400" />
        </div>
        <h1 className="text-xl font-bold">Solo el Anfitrión administra los roles</h1>
        <p className="text-sm text-slate-500">
          Los permisos de este módulo los reparte quien tiene la capacidad «crear y cambiar los
          roles de Hospitality». Pídeselo a quien administra la propiedad: desde Equipo → Roles y
          permisos puede concederla.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UserCog className="h-6 w-6" /> Equipo y roles
          </h1>
          <p className="text-sm text-slate-500 max-w-2xl">
            En una propiedad cada rol es un trabajo: quien administra, quien gestiona por encargo,
            quien limpia, quien arregla y el propio huésped. Aplicar el catálogo crea los que
            falten con sus capacidades exactas y completa los que ya existan, sin quitar nada.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={cargar} disabled={cargando}>
            {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-2">Actualizar</span>
          </Button>
          <AccionHospitality capacidad="roles.gestionar">
            <Button onClick={aplicar} disabled={aplicando}>
              {aplicando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              <span className="ml-2">Aplicar catálogo</span>
            </Button>
          </AccionHospitality>
        </div>
      </div>

      {cargando && !catalogo && (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-5 w-32 bg-slate-100 rounded" />
                <div className="h-4 w-full bg-slate-50 rounded mt-2" />
              </CardHeader>
              <CardContent>
                <div className="h-16 bg-slate-50 rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {error && !cargando && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-6 flex items-start gap-3">
            <TriangleAlert className="h-5 w-5 text-red-500 mt-0.5" />
            <div className="space-y-1">
              <p className="font-medium text-red-800">{error}</p>
              <Button size="sm" variant="outline" onClick={cargar}>
                Reintentar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {catalogo && catalogo.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center text-sm text-slate-500">
            El catálogo está vacío. Esto no debería pasar: avisa a soporte.
          </CardContent>
        </Card>
      )}

      {catalogo && catalogo.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {catalogo.map((entrada) => (
            <Card key={entrada.id} className="flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{entrada.nombre}</CardTitle>
                  <div className="flex items-center gap-2">
                    {!entrada.existe && <Badge variant="outline">Sin crear</Badge>}
                    {entrada.existe && entrada.alDia && (
                      <Badge className="bg-emerald-100 text-emerald-700 border-none">
                        <BadgeCheck className="h-3 w-3 mr-1" /> Al día
                      </Badge>
                    )}
                    {entrada.existe && !entrada.alDia && (
                      <Badge className="bg-amber-100 text-amber-800 border-none">
                        Le faltan {entrada.faltantes.length}
                      </Badge>
                    )}
                  </div>
                </div>
                <CardDescription>{entrada.descripcion}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 space-y-4">
                <ul className="text-sm space-y-1">
                  {entrada.capacidades.map((capacidad) => (
                    <li key={capacidad} className="flex items-start gap-2 text-slate-600">
                      <span className="text-emerald-500 mt-0.5">·</span>
                      <span>{CAPACIDADES_HOSPITALITY[capacidad]?.etiqueta ?? capacidad}</span>
                    </li>
                  ))}
                </ul>

                <div className="flex items-center justify-between text-xs text-slate-500 border-t pt-3">
                  <span>
                    {entrada.existe
                      ? `${entrada.usuarios} usuario${entrada.usuarios === 1 ? '' : 's'} con este rol`
                      : 'Todavía no existe en esta cuenta'}
                  </span>
                  <div className="flex items-center gap-2">
                    <Link
                      href="/dashboard/equipo/roles"
                      className="underline underline-offset-2 hover:text-slate-700"
                    >
                      Ver matriz
                    </Link>
                    {entrada.existe && !entrada.alDia && (
                      <AccionHospitality capacidad="roles.gestionar">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => restablecer(entrada)}
                          disabled={restableciendo === entrada.id}
                        >
                          {restableciendo === entrada.id && (
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          )}
                          Restablecer
                        </Button>
                      </AccionHospitality>
                    )}
                  </div>
                </div>

                {entrada.existe && !entrada.alDia && (
                  <details className="text-xs text-slate-500">
                    <summary className="cursor-pointer">Qué le falta</summary>
                    <ul className="mt-2 space-y-1 font-mono">
                      {entrada.faltantes.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Accesos de huésped (§20). El rol Huésped solo sirve si hay vínculo: es
          lo que convierte «este usuario» en «este huésped». */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1">
              <CardTitle className="text-base flex items-center gap-2">
                <UserRoundCheck className="h-4 w-4" /> Huéspedes con acceso
              </CardTitle>
              <CardDescription className="max-w-2xl">
                Una cuenta con el rol Huésped ve únicamente las reservas del contacto al que está
                vinculada. Sin vínculo no ve ninguna: por eso el vínculo no es un detalle.
              </CardDescription>
            </div>
            {rolHuesped && (
              <AccionHospitality capacidad="roles.gestionar">
                <Button size="sm" onClick={() => abrirAlta()}>
                  <UserPlus className="h-4 w-4 mr-2" /> Dar acceso a un huésped
                </Button>
              </AccionHospitality>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {!rolHuesped && !cargandoAccesos && (
            <p className="text-sm text-muted-foreground">
              Todavía no existe el rol Huésped en esta cuenta: aplica el catálogo de arriba y
              vuelve aquí.
            </p>
          )}

          {rolHuesped && cargandoAccesos && (
            <div className="py-6 text-center">
              <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
            </div>
          )}

          {rolHuesped && !cargandoAccesos && accesos.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Ningún usuario tiene todavía el rol Huésped. Da acceso a un huésped para que pueda
              ver sus reservas sin llamarte por teléfono.
            </p>
          )}

          {rolHuesped &&
            accesos.map((acceso) => (
              <div
                key={acceso.id}
                className="flex items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {acceso.nombre || acceso.email}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{acceso.email}</p>
                  <p
                    className={`text-xs ${
                      acceso.vinculado ? 'text-emerald-600' : 'text-amber-600'
                    }`}
                  >
                    {acceso.vinculado
                      ? `Vinculado a ${acceso.contacto?.nombre || acceso.contacto?.email || 'su contacto'}`
                      : 'Sin vínculo: no ve ninguna reserva'}
                  </p>
                </div>
                <AccionHospitality capacidad="roles.gestionar">
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setBusquedaContacto('');
                        setVinculando(acceso);
                      }}
                    >
                      {acceso.vinculado ? 'Cambiar contacto' : 'Vincular contacto'}
                    </Button>
                    {acceso.vinculado && (
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Desvincular"
                        disabled={guardandoVinculo === acceso.id}
                        onClick={() => desvincular(acceso)}
                      >
                        {guardandoVinculo === acceso.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Link2Off className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>
                </AccionHospitality>
              </div>
            ))}
        </CardContent>
      </Card>

      <Card className="bg-slate-50">
        <CardContent className="p-6 text-sm text-slate-600 space-y-2">
          <p className="font-medium text-slate-800">Cómo repartir a la gente</p>
          <p>
            Los roles se asignan a cada persona desde Equipo → Usuarios; el vínculo con el contacto
            del huésped, desde esta pantalla. Los dos pasos juntos son los que hacen que un huésped
            vea sus reservas y nada más.
          </p>
          <p>
            Los roles del catálogo no se renombran ni se borran —hay textos y reglas que los
            nombran— pero sus capacidades sí se ajustan desde la matriz.
          </p>
        </CardContent>
      </Card>

      {/* Vincular un acceso existente con su contacto. */}
      <Dialog
        open={!!vinculando}
        onOpenChange={(abierto) => {
          if (!abierto) {
            setVinculando(null);
            setBusquedaContacto('');
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Contacto de {vinculando?.nombre || vinculando?.email}
            </DialogTitle>
            <DialogDescription>
              El acceso verá las reservas de ese contacto y ninguna otra. Si el huésped todavía no
              existe en el CRM, créalo antes en Contactos.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar por nombre o email…"
              value={busquedaContacto}
              onChange={(e) => setBusquedaContacto(e.target.value)}
            />
          </div>

          <div className="max-h-72 overflow-y-auto space-y-2">
            {buscandoContacto && (
              <div className="py-6 text-center">
                <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
              </div>
            )}
            {!buscandoContacto && contactos.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">
                {busquedaContacto.trim()
                  ? 'Ningún contacto coincide con esa búsqueda.'
                  : 'Todavía no hay contactos en el CRM.'}
              </p>
            )}
            <AccionHospitality capacidad="roles.gestionar">
              {!buscandoContacto &&
                contactos.map((contacto) => (
                  <button
                    key={contacto.id}
                    type="button"
                    disabled={guardandoVinculo === contacto.id}
                    onClick={() => vincularContacto(contacto)}
                    className="w-full text-left rounded-lg border p-3 hover:border-primary/40 transition-colors disabled:opacity-60"
                  >
                    <p className="text-sm font-medium truncate">
                      {contacto.nombre || contacto.email || 'Contacto'}
                    </p>
                    {contacto.email && (
                      <p className="text-xs text-muted-foreground truncate">{contacto.email}</p>
                    )}
                  </button>
                ))}
            </AccionHospitality>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setVinculando(null)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Alta de un acceso de huésped: crea la cuenta con su invitación y la
          vincula en el mismo acto, para que no quede a medias. */}
      <Dialog
        open={altaAbierta}
        onOpenChange={(abierto) => {
          setAltaAbierta(abierto);
          if (!abierto) setCredenciales(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Dar acceso a un huésped</DialogTitle>
            <DialogDescription>
              Se crea una cuenta con el rol Huésped y se vincula a su contacto del CRM. El huésped
              entra con su email y la contraseña temporal que verás al terminar.
            </DialogDescription>
          </DialogHeader>

          {credenciales ? (
            <div className="space-y-3 rounded-lg border bg-emerald-50/50 p-4">
              <p className="text-sm font-medium flex items-center gap-2 text-emerald-800">
                <KeyRound className="h-4 w-4" /> Acceso creado
              </p>
              <p className="text-xs text-slate-600">
                Entrega estas credenciales al huésped. No se vuelven a mostrar.
              </p>
              <div className="text-sm space-y-1 font-mono">
                <p>{credenciales.email}</p>
                <p>{credenciales.tempPassword || '(sin contraseña temporal)'}</p>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
                  Contacto del CRM
                </Label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Buscar el contacto del huésped…"
                    value={busquedaContacto}
                    onChange={(e) => setBusquedaContacto(e.target.value)}
                  />
                </div>
                <div className="max-h-52 overflow-y-auto space-y-2">
                  {buscandoContacto && (
                    <div className="py-4 text-center">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                    </div>
                  )}
                  {!buscandoContacto && contactos.length === 0 && (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      {busquedaContacto.trim()
                        ? 'Ningún contacto coincide con esa búsqueda.'
                        : 'Todavía no hay contactos en el CRM.'}
                    </p>
                  )}
                  {!buscandoContacto &&
                    contactos.map((contacto) => (
                      <button
                        key={contacto.id}
                        type="button"
                        onClick={() => elegirContactoParaAlta(contacto)}
                        className={`w-full text-left rounded-lg border p-3 transition-colors ${
                          nuevo.contactId === contacto.id
                            ? 'border-primary bg-primary/5'
                            : 'hover:border-primary/40'
                        }`}
                      >
                        <p className="text-sm font-medium truncate">
                          {contacto.nombre || contacto.email || 'Contacto'}
                        </p>
                        {contacto.email && (
                          <p className="text-xs text-muted-foreground truncate">
                            {contacto.email}
                          </p>
                        )}
                      </button>
                    ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="acceso-nombre">Nombre</Label>
                  <Input
                    id="acceso-nombre"
                    value={nuevo.nombre}
                    onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="acceso-email">Email de acceso</Label>
                  <Input
                    id="acceso-email"
                    type="email"
                    value={nuevo.email}
                    onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })}
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="acceso-telefono">Teléfono (opcional)</Label>
                  <Input
                    id="acceso-telefono"
                    value={nuevo.telefono}
                    onChange={(e) => setNuevo({ ...nuevo, telefono: e.target.value })}
                  />
                </div>
              </div>

              {!nuevo.contactId && (
                <p className="text-xs text-amber-600">
                  Elige el contacto del huésped: sin él, el acceso no vería ninguna reserva.
                </p>
              )}
            </>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAltaAbierta(false);
                setCredenciales(null);
              }}
            >
              {credenciales ? 'Cerrar' : 'Cancelar'}
            </Button>
            {!credenciales && (
              <AccionHospitality capacidad="roles.gestionar">
                <Button
                  onClick={crearAcceso}
                  disabled={
                    creando ||
                    !nuevo.contactId ||
                    !nuevo.nombre.trim() ||
                    !nuevo.email.trim()
                  }
                >
                  {creando && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Crear el acceso
                </Button>
              </AccionHospitality>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
