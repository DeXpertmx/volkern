'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye, FileText, MousePointerClick, Users, Handshake, Loader2, Wallet } from 'lucide-react';
import { formatearImporte, formatearNumero } from '@/lib/moneda';
import {
  ETIQUETAS_ORIGEN_CIERRE,
  ORIGENES_CIERRE,
} from '@/lib/real-estate/portal-seo';
import type { MetricasPortal } from '@/lib/real-estate/portal-analytics';
import type { PlantillaPortal } from '@/lib/real-estate/portal-templates';

// Los tipos se importan del agregador del servidor (`import type` no arrastra
// Prisma al bundle): el panel y la API no pueden divergir.
interface Fila {
  tenantId: string;
  nombre: string;
  esMatriz: boolean;
  plantilla: PlantillaPortal;
  metricas: MetricasPortal;
}

const DIAS = [7, 30, 90] as const;
const PLANTILLAS: readonly PlantillaPortal[] = ['foto', 'marca'];

/** Importe con la divisa de los cierres; sin divisa, sólo el número. */
function cifra(valor: number, moneda?: string | null): string {
  return moneda ? formatearImporte(valor, moneda, 0) : formatearNumero(valor);
}

/** Sin cierres no hay importe que enseñar (un cero fingiría una medición). */
function valorCerrado(operaciones: number, valor: number, moneda: string | null): string {
  return operaciones === 0 ? '—' : cifra(valor, moneda);
}

/** Conversión de visitas a lead, que es la cifra que justifica el portal. */
function conversion(metricas: MetricasPortal): string {
  const visitas = metricas.visitasPortada + metricas.visitasFichas;
  if (visitas === 0) return '—';
  return `${((metricas.leads / visitas) * 100).toFixed(1)}%`;
}

/**
 * Cierres de las cuentas que hoy publican con esa plantilla.
 *
 * Es la plantilla **actual** de cada cuenta (el cierre no guarda con qué diseño
 * se captó el lead): sirve para comparar diseños, no para reconstruir historia.
 * El dinero se queda en la tabla, donde cada fila tiene una sola divisa.
 */
function cierresPorPlantilla(
  filas: Fila[],
  plantilla: PlantillaPortal
): { operaciones: number } {
  return filas
    .filter((fila) => fila.plantilla === plantilla)
    .reduce(
      (total, fila) => ({ operaciones: total.operaciones + fila.metricas.operaciones }),
      { operaciones: 0 }
    );
}

/** Aviso de los cierres que no se suman por estar en otra divisa. */
function NotaOtrasDivisas({ cuantos }: { cuantos: number }) {
  if (cuantos <= 0) return null;
  return (
    <span className="block text-[10px] font-normal text-muted-foreground">
      +{formatearNumero(cuantos)} en otra divisa
    </span>
  );
}

/**
 * Rendimiento del portal público.
 *
 * La matriz ve su fila y la de sus oficinas; cada oficina ve la suya. Las cifras
 * se separan por plantilla para poder decidir con datos qué hero funciona, en
 * vez de elegirlo por gusto, y los cierres se atribuyen al canal por el que entró
 * el lead para saber qué enlace trae operaciones y no sólo visitas.
 */
export default function PortalAnalyticsPanel() {
  const [dias, setDias] = useState<number>(30);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [red, setRed] = useState<MetricasPortal | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError('');

    fetch(`/api/real-estate/portal/analytics?dias=${dias}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('No se pudo cargar'))))
      .then((datos) => {
        if (!vigente) return;
        setFilas(Array.isArray(datos?.filas) ? datos.filas : []);
        setRed(datos?.red ?? null);
      })
      .catch(() => {
        if (vigente) setError('No pudimos cargar la analítica del portal.');
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });

    return () => {
      vigente = false;
    };
  }, [dias]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Rendimiento del portal</CardTitle>
            <CardDescription>
              Visitas, leads y cierres atribuidos al portal en los últimos {dias} días, por cuenta,
              su plantilla actual y origen.
            </CardDescription>
          </div>
          <div className="flex gap-1">
            {DIAS.map((opcion) => (
              <Button
                key={opcion}
                type="button"
                size="sm"
                variant={dias === opcion ? 'default' : 'outline'}
                onClick={() => setDias(opcion)}
              >
                {opcion} d
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {cargando ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando métricas…
          </div>
        ) : error ? (
          <p className="py-4 text-sm text-muted-foreground">{error}</p>
        ) : filas.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            Todavía no hay visitas registradas en este periodo.
          </p>
        ) : (
          <>
            {red && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <Kpi icono={Eye} etiqueta="Visitas a portada" valor={formatearNumero(red.visitasPortada)} />
                <Kpi icono={FileText} etiqueta="Visitas a fichas" valor={formatearNumero(red.visitasFichas)} />
                <Kpi
                  icono={MousePointerClick}
                  etiqueta="Clics en contacto"
                  valor={formatearNumero(red.clicsContacto)}
                />
                <Kpi icono={Users} etiqueta="Leads del portal" valor={formatearNumero(red.leads)} />
                <Kpi icono={Handshake} etiqueta="Cierres" valor={formatearNumero(red.operaciones)} />
                <Kpi
                  icono={Wallet}
                  etiqueta={`Valor cerrado${red.monedaPrincipal ? ` (${red.monedaPrincipal})` : ''}`}
                  valor={valorCerrado(red.operaciones, red.valorCerrado, red.monedaPrincipal)}
                  nota={
                    red.operacionesOtrasDivisas > 0
                      ? `+${formatearNumero(red.operacionesOtrasDivisas)} en otra divisa, no sumados`
                      : undefined
                  }
                />
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Cuenta</th>
                    <th className="py-2 pr-3 font-medium">Plantilla actual</th>
                    <th className="py-2 pr-3 text-right font-medium">Portada</th>
                    <th className="py-2 pr-3 text-right font-medium">Fichas</th>
                    <th className="py-2 pr-3 text-right font-medium">Clics</th>
                    <th className="py-2 pr-3 text-right font-medium">Leads</th>
                    <th className="py-2 pr-3 text-right font-medium">Cierres</th>
                    <th className="py-2 pr-3 text-right font-medium">Valor cerrado</th>
                    <th className="py-2 text-right font-medium">Conversión</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((fila) => (
                    <tr key={fila.tenantId} className="border-b last:border-0">
                      <td className="py-2 pr-3">
                        <span className="font-medium">{fila.nombre}</span>
                        {fila.esMatriz && (
                          <Badge variant="secondary" className="ml-2 text-[9px] uppercase">
                            Matriz
                          </Badge>
                        )}
                      </td>
                      <td className="py-2 pr-3 capitalize text-muted-foreground">{fila.plantilla}</td>
                      <td className="py-2 pr-3 text-right">{formatearNumero(fila.metricas.visitasPortada)}</td>
                      <td className="py-2 pr-3 text-right">{formatearNumero(fila.metricas.visitasFichas)}</td>
                      <td className="py-2 pr-3 text-right">{formatearNumero(fila.metricas.clicsContacto)}</td>
                      <td className="py-2 pr-3 text-right">{formatearNumero(fila.metricas.leads)}</td>
                      <td className="py-2 pr-3 text-right">{formatearNumero(fila.metricas.operaciones)}</td>
                      <td className="py-2 pr-3 text-right">
                        <span className="block">
                          {valorCerrado(
                            fila.metricas.operaciones,
                            fila.metricas.valorCerrado,
                            fila.metricas.monedaPrincipal
                          )}
                        </span>
                        <NotaOtrasDivisas cuantos={fila.metricas.operacionesOtrasDivisas} />
                      </td>
                      <td className="py-2 text-right text-muted-foreground">
                        {conversion(fila.metricas)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {red && Object.keys(red.porMoneda).length > 1 && (
              <p className="text-xs text-muted-foreground">
                Valor cerrado por divisa:{' '}
                {Object.entries(red.porMoneda)
                  .sort((a, b) => b[1].valorCerrado - a[1].valorCerrado)
                  .map(
                    ([moneda, cierre]) =>
                      `${moneda} ${cifra(cierre.valorCerrado, moneda)} (${formatearNumero(cierre.operaciones)})`
                  )
                  .join(' · ')}
                . Los totales de arriba sólo suman {red.monedaPrincipal}.
              </p>
            )}

            {red && (
              <div className="border-t pt-3">
                <p className="text-sm font-medium">Cierres por origen</p>
                <p className="text-xs text-muted-foreground">
                  De dónde llegó el lead que terminó en operación ganada.
                </p>
                <table className="mt-2 w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Origen</th>
                      <th className="py-2 pr-3 text-right font-medium">Cierres</th>
                      <th className="py-2 text-right font-medium">Valor cerrado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ORIGENES_CIERRE.map((origen) => {
                      const cierre = red.porOrigen[origen];
                      return (
                        <tr key={origen} className="border-b last:border-0">
                          <td className="py-2 pr-3">{ETIQUETAS_ORIGEN_CIERRE[origen]}</td>
                          <td className="py-2 pr-3 text-right">{formatearNumero(cierre.operaciones)}</td>
                          <td className="py-2 text-right text-muted-foreground">
                            <span className="block">
                              {valorCerrado(cierre.operaciones, cierre.valorCerrado, red.monedaPrincipal)}
                            </span>
                            <NotaOtrasDivisas cuantos={cierre.operacionesOtrasDivisas} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {red && (
              <p className="text-xs text-muted-foreground">
                Por plantilla actual: foto —{' '}
                {formatearNumero(red.porPlantilla.foto.visitasPortada)} portada /{' '}
                {formatearNumero(red.porPlantilla.foto.visitasFichas)} fichas /{' '}
                {formatearNumero(red.porPlantilla.foto.clicsContacto)} clics /{' '}
                {formatearNumero(cierresPorPlantilla(filas, 'foto').operaciones)} cierres · marca —{' '}
                {formatearNumero(red.porPlantilla.marca.visitasPortada)} portada /{' '}
                {formatearNumero(red.porPlantilla.marca.visitasFichas)} fichas /{' '}
                {formatearNumero(red.porPlantilla.marca.clicsContacto)} clics /{' '}
                {formatearNumero(cierresPorPlantilla(filas, 'marca').operaciones)} cierres.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Kpi({
  icono: Icono,
  etiqueta,
  valor,
  nota,
}: {
  icono: typeof Eye;
  etiqueta: string;
  valor: string;
  nota?: string;
}) {
  return (
    <div className="rounded-xl border bg-muted/30 p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icono className="h-3.5 w-3.5" /> {etiqueta}
      </div>
      <p className="mt-1 text-xl font-semibold">{valor}</p>
      {nota && <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">{nota}</p>}
    </div>
  );
}
