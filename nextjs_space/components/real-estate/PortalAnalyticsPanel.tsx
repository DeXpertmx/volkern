'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye, FileText, MousePointerClick, Users, Handshake, Loader2 } from 'lucide-react';
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

function numero(valor: number): string {
  return (Number(valor) || 0).toLocaleString('es-ES');
}

/** Conversión de visitas a lead, que es la cifra que justifica el portal. */
function conversion(metricas: MetricasPortal): string {
  const visitas = metricas.visitasPortada + metricas.visitasFichas;
  if (visitas === 0) return '—';
  return `${((metricas.leads / visitas) * 100).toFixed(1)}%`;
}

/**
 * Rendimiento del portal público.
 *
 * La matriz ve su fila y la de sus oficinas; cada oficina ve la suya. Las cifras
 * se separan por plantilla para poder decidir con datos qué hero funciona, en
 * vez de elegirlo por gusto.
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
              Visitas, clics y leads de los últimos {dias} días, por cuenta y plantilla.
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
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <Kpi icono={Eye} etiqueta="Visitas a portada" valor={numero(red.visitasPortada)} />
                <Kpi icono={FileText} etiqueta="Visitas a fichas" valor={numero(red.visitasFichas)} />
                <Kpi
                  icono={MousePointerClick}
                  etiqueta="Clics en contacto"
                  valor={numero(red.clicsContacto)}
                />
                <Kpi icono={Users} etiqueta="Leads del portal" valor={numero(red.leads)} />
                <Kpi icono={Handshake} etiqueta="Operaciones" valor={numero(red.operaciones)} />
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Cuenta</th>
                    <th className="py-2 pr-3 font-medium">Plantilla</th>
                    <th className="py-2 pr-3 text-right font-medium">Portada</th>
                    <th className="py-2 pr-3 text-right font-medium">Fichas</th>
                    <th className="py-2 pr-3 text-right font-medium">Clics</th>
                    <th className="py-2 pr-3 text-right font-medium">Leads</th>
                    <th className="py-2 pr-3 text-right font-medium">Operaciones</th>
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
                      <td className="py-2 pr-3 text-right">{numero(fila.metricas.visitasPortada)}</td>
                      <td className="py-2 pr-3 text-right">{numero(fila.metricas.visitasFichas)}</td>
                      <td className="py-2 pr-3 text-right">{numero(fila.metricas.clicsContacto)}</td>
                      <td className="py-2 pr-3 text-right">{numero(fila.metricas.leads)}</td>
                      <td className="py-2 pr-3 text-right">{numero(fila.metricas.operaciones)}</td>
                      <td className="py-2 text-right text-muted-foreground">
                        {conversion(fila.metricas)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {red && (
              <p className="text-xs text-muted-foreground">
                Por plantilla: foto — {numero(red.porPlantilla.foto.visitasPortada)} portada /{' '}
                {numero(red.porPlantilla.foto.visitasFichas)} fichas /{' '}
                {numero(red.porPlantilla.foto.clicsContacto)} clics · marca —{' '}
                {numero(red.porPlantilla.marca.visitasPortada)} portada /{' '}
                {numero(red.porPlantilla.marca.visitasFichas)} fichas /{' '}
                {numero(red.porPlantilla.marca.clicsContacto)} clics.
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
}: {
  icono: typeof Eye;
  etiqueta: string;
  valor: string;
}) {
  return (
    <div className="rounded-xl border bg-muted/30 p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icono className="h-3.5 w-3.5" /> {etiqueta}
      </div>
      <p className="mt-1 text-xl font-semibold">{valor}</p>
    </div>
  );
}
