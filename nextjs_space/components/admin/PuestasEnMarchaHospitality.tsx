'use client';

/**
 * Puestas en marcha de Hospitality — la vista de triaje del operador.
 *
 * La tarjeta del detalle de tenant contesta «¿qué le falta a este cliente?», una
 * cuenta cada vez. Esta tabla contesta «¿a quién hay que empujar hoy?»: todos los
 * clientes de Hospitality con su puesta en marcha, lo pendiente primero y dentro
 * de lo pendiente lo que ya está en marcha (el cliente empezó y se quedó a
 * medias, que es donde se pierde un alta).
 *
 * Tres cosas que enseña y que no se veían en ningún sitio:
 *
 *  - **Qué falta, en palabras** (`faltantes`): roles por preparar y si hay
 *    propiedad y unidades. Sin abrir la ficha de cada cliente.
 *  - **Módulo apagado con datos dentro**: el operador cortó Hospitality a mano y
 *    la cuenta tiene propiedades a las que el cliente no llega. Eso no es un
 *    onboarding pendiente, es una avería, y va marcado como tal.
 *  - **El enlace del wizard por cliente**: el que se le pasa al cliente para que
 *    termine unidades, tarifas y canales.
 *
 * Todo lo que se ve viene del servidor (`/api/admin/hospitality/puesta-en-marcha`):
 * la interfaz no deduce nada por su cuenta.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  ExternalLink,
  Loader2,
  PlugZap,
  RefreshCw,
  Rocket,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table';

export interface FilaPuestaEnMarcha {
  tenantId: string;
  tenant: string;
  plan: string;
  desde: string;
  moduloApagado: boolean;
  roles: { catalogo: number; alDia: number; pendientes: string[] };
  propiedades: { total: number; unidades: number; primera: { id: string; nombre: string } | null };
  enlaceWizard: string;
  faltantes: string[];
  listo: boolean;
}

export interface ListadoPuestaEnMarcha {
  ok?: boolean;
  error?: string;
  generadoEn?: string;
  totales?: { tenants: number; pendientes: number; listos: number; apagados: number };
  truncado?: boolean;
  tenants?: FilaPuestaEnMarcha[];
}

type Carga =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ok'; listado: ListadoPuestaEnMarcha };

function hace(fecha?: string | null): string {
  if (!fecha) return '—';
  const ms = Date.now() - new Date(fecha).getTime();
  if (Number.isNaN(ms)) return '—';
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'ahora mismo';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

export function PuestasEnMarchaHospitality() {
  const [carga, setCarga] = useState<Carga>({ kind: 'loading' });
  const [soloPendientes, setSoloPendientes] = useState(true);

  const cargar = useCallback(async () => {
    setCarga({ kind: 'loading' });
    try {
      const res = await fetch('/api/admin/hospitality/puesta-en-marcha');
      const data: ListadoPuestaEnMarcha = await res
        .json()
        .catch((): ListadoPuestaEnMarcha => ({ ok: false, error: `HTTP ${res.status}` }));

      if (!res.ok || !data.ok) {
        setCarga({ kind: 'error', message: data.error ?? `HTTP ${res.status}` });
        return;
      }
      setCarga({ kind: 'ok', listado: data });
    } catch (err: unknown) {
      setCarga({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Error desconocido al listar las puestas en marcha',
      });
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const listado = carga.kind === 'ok' ? carga.listado : null;
  const filas = listado?.tenants ?? [];
  const visibles = soloPendientes ? filas.filter((f) => !f.listo) : filas;
  const totales = listado?.totales;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Rocket className="h-5 w-5" />
              Puestas en marcha de Hospitality
            </CardTitle>
            <CardDescription>
              Clientes de Hospitality y qué les falta para poder entrar. Lo pendiente
              primero, y dentro de lo pendiente lo que ya está en marcha.
            </CardDescription>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant={soloPendientes ? 'default' : 'outline'}
              onClick={() => setSoloPendientes(true)}
            >
              Pendientes
            </Button>
            <Button
              size="sm"
              variant={soloPendientes ? 'outline' : 'default'}
              onClick={() => setSoloPendientes(false)}
            >
              Todos
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void cargar()}
              disabled={carga.kind === 'loading'}
              title="Volver a consultar"
            >
              <RefreshCw className={`h-4 w-4 ${carga.kind === 'loading' ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {carga.kind === 'loading' && (
          <p className="flex items-center gap-2 text-sm text-gray-500" role="status">
            <Loader2 className="h-4 w-4 animate-spin" /> Consultando las cuentas…
          </p>
        )}

        {carga.kind === 'error' && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
            <p>{carga.message}</p>
          </div>
        )}

        {totales && (
          <>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="inline-flex items-center gap-1.5 font-medium">
                <Building2 className="h-4 w-4" />
                {totales.tenants} {totales.tenants === 1 ? 'cliente' : 'clientes'} con Hospitality
              </span>
              <span className="text-gray-500">
                {totales.pendientes} con la puesta en marcha a medias · {totales.listos} listos
                {totales.apagados > 0 && ` · ${totales.apagados} con el módulo apagado`}
              </span>
              {listado?.truncado && (
                <Badge variant="secondary" title="Hay más clientes de los que caben en esta consulta">
                  listado parcial
                </Badge>
              )}
              <span className="ml-auto text-xs text-gray-400">
                Actualizado {hace(listado?.generadoEn)}
              </span>
            </div>

            {visibles.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-gray-500">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                {/* Sin ningún cliente de Hospitality, decir «nadie tiene nada a
                    medias» sería engañoso: no es que estén al día, es que no hay. */}
                {totales.tenants === 0
                  ? 'Todavía no hay ningún cliente con Hospitality.'
                  : 'Nadie tiene la puesta en marcha a medias.'}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead className="text-right">Roles</TableHead>
                    <TableHead className="text-right">Propiedades</TableHead>
                    <TableHead className="text-right">Unidades</TableHead>
                    <TableHead>Qué falta</TableHead>
                    <TableHead>Continuar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibles.map((f) => (
                    <TableRow key={f.tenantId}>
                      <TableCell className="font-medium">
                        <Link
                          href={`/admin/saas/tenants/${f.tenantId}`}
                          className="hover:underline"
                          title={`Alta del cliente: ${hace(f.desde)}`}
                        >
                          {f.tenant}
                        </Link>
                        {f.moduloApagado && (
                          <Badge
                            variant="destructive"
                            className="ml-2"
                            title="Tiene datos de Hospitality pero el módulo está apagado: el cliente no lo ve"
                          >
                            <PlugZap className="mr-1 h-3 w-3" />
                            módulo apagado
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="capitalize text-gray-600">{f.plan}</TableCell>
                      <TableCell className="text-right">
                        {f.roles.alDia}
                        <span className="text-gray-400">/{f.roles.catalogo}</span>
                        {f.roles.pendientes.length > 0 && (
                          <span className="block text-[11px] text-gray-500">
                            {f.roles.pendientes.join(', ')}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{f.propiedades.total}</TableCell>
                      <TableCell className="text-right">{f.propiedades.unidades}</TableCell>
                      <TableCell className="max-w-[320px] text-xs text-gray-600">
                        {f.listo ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Listo para el cliente
                          </span>
                        ) : (
                          <ul className="space-y-0.5">
                            {f.faltantes.map((frase) => (
                              <li key={frase}>{frase}</li>
                            ))}
                          </ul>
                        )}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={f.enlaceWizard}
                          className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-[#1A365D] hover:underline"
                        >
                          Wizard <ExternalLink className="h-3 w-3" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            <p className="text-xs text-gray-500">
              Un cliente entra aquí por tener Hospitality de verdad (la vertical del alta, una
              propiedad o los roles del catálogo), no por lo que su plan incluya: casi todos
              los planes llevan la vertical. El detalle por cliente, en su ficha.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
