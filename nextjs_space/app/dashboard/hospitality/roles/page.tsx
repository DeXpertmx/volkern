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
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  UserCog,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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

export default function RolesHospitalityPage() {
  const [catalogo, setCatalogo] = useState<EntradaCatalogo[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [sinPermiso, setSinPermiso] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aplicando, setAplicando] = useState(false);
  const [restableciendo, setRestableciendo] = useState<string | null>(null);

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

  useEffect(() => {
    cargar();
  }, [cargar]);

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

      <Card className="bg-slate-50">
        <CardContent className="p-6 text-sm text-slate-600 space-y-2">
          <p className="font-medium text-slate-800">Cómo repartir a la gente</p>
          <p>
            Los roles se asignan a cada persona desde Equipo → Usuarios. Un usuario con rol
            Huésped necesita además estar vinculado a su contacto del CRM: sin ese vínculo no ve
            ninguna reserva, y el módulo se lo dice en vez de enseñarle las de todos.
          </p>
          <p>
            Los roles del catálogo no se renombran ni se borran —hay textos y reglas que los
            nombran— pero sus capacidades sí se ajustan desde la matriz.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
