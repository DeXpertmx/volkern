'use client';

/**
 * Panel de Hospitality (Superadmin).
 *
 * Dos cosas que hasta ahora solo se veían en los logs:
 *
 *  1. **Estado de los crons de Hospitality** — última ejecución, resultado y
 *     duración de cada job (`/api/cron-status`), más los **avisos** que el job
 *     deja cuando ha ido bien pero hay algo que mirar: el registro de viajeros
 *     publica ahí los partes que ya no va a reintentar, **por tenant**, para no
 *     tener que descubrirlo entrando reserva a reserva. El store es **en
 *     memoria, por proceso**: refleja lo que corrió en el proceso que atiende la
 *     consulta (en serverless, el que conteste). Los jobs disparados por HTTP se
 *     auto-registran en su ruta, así que también aparecen.
 *  2. **Holds caducados por tenant** — cuántos holds `pending` liberó el
 *     barrido en la ventana elegida, en cuántas propiedades y con qué ventana
 *     media (`/api/admin/hospitality/holds`). La lectura útil: un goteo es el
 *     sistema funcionando; un pico sostenido en un tenant suele ser una ventana
 *     `holdHoras` demasiado corta o canales que confirman tarde — las dos cosas
 *     se arreglan en la configuración de la propiedad, no en el código.
 */

import { useCallback, useEffect, useState } from 'react';
import { Clock, CalendarClock, Info, RefreshCw, TimerReset, TriangleAlert } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
import { PuestasEnMarchaHospitality } from '@/components/admin/PuestasEnMarchaHospitality';

interface CronJob {
  id: string;
  label: string;
  schedule: string;
  lastRunAt: string | null;
  lastResult: 'success' | 'error' | 'skipped' | null;
  lastMessage: string | null;
  lastDurationMs: number | null;
  /**
   * Lo que hay que mirar aunque el job haya ido bien (p. ej. partes que el
   * barrido ya no reintenta). El «Detalle» de la tabla los enseña enteros:
   * truncarlos sería esconder justo el dato que se viene a buscar.
   */
  lastAvisos?: string[];
}

interface HoldTenant {
  tenantId: string;
  tenant: string;
  caducados: number;
  propiedadesAfectadas: number;
  horasRetencionMedia: number | null;
  ultimoCaducado: string | null;
}

interface HoldsMetrics {
  ventanaDias: number;
  desde: string;
  total: number;
  truncado: boolean;
  tenants: HoldTenant[];
  generadoEn: string;
}

const VENTANAS = [7, 30, 90] as const;

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

function fechaHora(fecha?: string | null): string {
  if (!fecha) return '—';
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

const RESULTADO: Record<string, { texto: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  success: { texto: 'OK', variant: 'default' },
  error: { texto: 'Error', variant: 'destructive' },
  skipped: { texto: 'Omitido', variant: 'secondary' },
};

export default function AdminHospitality() {
  const [crons, setCrons] = useState<CronJob[]>([]);
  const [loadingCrons, setLoadingCrons] = useState(true);
  const [holds, setHolds] = useState<HoldsMetrics | null>(null);
  const [loadingHolds, setLoadingHolds] = useState(true);
  const [ventana, setVentana] = useState<number>(30);
  const [errorHolds, setErrorHolds] = useState<string | null>(null);

  const loadCrons = useCallback(async () => {
    setLoadingCrons(true);
    try {
      const res = await fetch('/api/cron-status');
      if (res.ok) {
        const data = await res.json();
        const jobs: CronJob[] = Array.isArray(data.jobs) ? data.jobs : [];
        setCrons(jobs.filter((j) => j.id.startsWith('hospitality')));
      }
    } catch {
      // silencioso: el panel muestra el estado vacío
    } finally {
      setLoadingCrons(false);
    }
  }, []);

  const loadHolds = useCallback(async () => {
    setLoadingHolds(true);
    setErrorHolds(null);
    try {
      const res = await fetch(`/api/admin/hospitality/holds?dias=${ventana}`);
      const data = await res.json();
      if (!res.ok) {
        setErrorHolds(data?.error || 'Error al cargar las métricas');
        setHolds(null);
        return;
      }
      setHolds(data);
    } catch {
      setErrorHolds('Error de red al cargar las métricas');
      setHolds(null);
    } finally {
      setLoadingHolds(false);
    }
  }, [ventana]);

  useEffect(() => {
    loadCrons();
  }, [loadCrons]);

  useEffect(() => {
    loadHolds();
  }, [loadHolds]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Hospitality</h1>
          <p className="text-gray-500 mt-1">
            Salud de los jobs de la vertical y holds liberados por caducidad, por tenant
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { loadCrons(); loadHolds(); }}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Actualizar
        </Button>
      </div>

      {/* ── Puestas en marcha: a quién hay que empujar hoy ──────────────────── */}
      <PuestasEnMarchaHospitality />

      {/* ── Estado de los crons ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Estado de los crons de Hospitality
          </CardTitle>
          <CardDescription>
            Última ejecución de cada job programado. En ámbar, lo que hay que mirar
            aunque el job haya ido bien (el registro de viajeros avisa ahí de los partes
            que ya no reintenta, por tenant). El registro es por proceso: en despliegues
            serverless refleja el proceso que atiende esta consulta. Los disparos por HTTP
            se registran solos en su ruta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingCrons ? (
            <p className="text-sm text-gray-500">Cargando…</p>
          ) : crons.length === 0 ? (
            <p className="text-sm text-gray-500">
              Ningún job de Hospitality registrado en este proceso todavía.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Cadencia</TableHead>
                  <TableHead>Última ejecución</TableHead>
                  <TableHead>Resultado</TableHead>
                  <TableHead>Duración</TableHead>
                  <TableHead>Detalle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {crons.map((job) => {
                  const r = job.lastResult ? RESULTADO[job.lastResult] : null;
                  return (
                    <TableRow key={job.id}>
                      <TableCell className="font-medium">{job.label}</TableCell>
                      <TableCell className="font-mono text-xs">{job.schedule}</TableCell>
                      <TableCell>{hace(job.lastRunAt)}</TableCell>
                      <TableCell>
                        {r ? <Badge variant={r.variant}>{r.texto}</Badge> : <span className="text-gray-400">sin ejecutar</span>}
                      </TableCell>
                      <TableCell>{job.lastDurationMs != null ? `${job.lastDurationMs} ms` : '—'}</TableCell>
                      <TableCell className="text-xs text-gray-500 max-w-[280px]">
                        <span className="block truncate">{job.lastMessage || '—'}</span>
                        {job.lastAvisos && job.lastAvisos.length > 0 && (
                          <ul className="mt-1 space-y-0.5">
                            {job.lastAvisos.map((aviso, i) => (
                              <li
                                key={`${job.id}-aviso-${i}`}
                                className="flex items-start gap-1 text-[11px] font-medium text-amber-600"
                              >
                                <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                                <span className="whitespace-normal">{aviso}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Holds caducados por tenant ──────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TimerReset className="h-5 w-5" />
                Holds caducados por tenant
              </CardTitle>
              <CardDescription>
                Reservas pendientes que nadie confirmó y el barrido liberó. Un pico
                sostenido suele ser una ventana de retención corta o canales que
                confirman tarde.
              </CardDescription>
            </div>
            <div className="flex items-center gap-1">
              {VENTANAS.map((d) => (
                <Button
                  key={d}
                  size="sm"
                  variant={ventana === d ? 'default' : 'outline'}
                  onClick={() => setVentana(d)}
                >
                  {d} d
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {errorHolds && <p className="text-sm text-red-600">{errorHolds}</p>}

          {loadingHolds ? (
            <p className="text-sm text-gray-500">Cargando…</p>
          ) : !holds ? null : (
            <>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <span className="inline-flex items-center gap-2 font-medium">
                  <CalendarClock className="h-4 w-4" />
                  {holds.total} {holds.total === 1 ? 'hold caducado' : 'holds caducados'}
                </span>
                <span className="text-gray-500">
                  en los últimos {holds.ventanaDias} días
                  {holds.tenants.length > 0 && ` · ${holds.tenants.length} tenant(s) con actividad`}
                </span>
                {holds.truncado && (
                  <Badge variant="secondary" title="La ventana trae más filas que el tope de la consulta">
                    métricas parciales
                  </Badge>
                )}
              </div>

              {holds.tenants.length === 0 ? (
                <p className="text-sm text-gray-500">
                  Ningún hold caducado en la ventana: o no hay retenciones olvidadas, o
                  la caducidad está desactivada (`holdHoras = 0`).
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tenant</TableHead>
                      <TableHead className="text-right">Caducados</TableHead>
                      <TableHead className="text-right">Propiedades</TableHead>
                      <TableHead className="text-right">Ventana media</TableHead>
                      <TableHead>Último</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {holds.tenants.map((t) => (
                      <TableRow key={t.tenantId}>
                        <TableCell className="font-medium">{t.tenant}</TableCell>
                        <TableCell className="text-right">{t.caducados}</TableCell>
                        <TableCell className="text-right">{t.propiedadesAfectadas}</TableCell>
                        <TableCell className="text-right">
                          {t.horasRetencionMedia != null ? `${t.horasRetencionMedia} h` : '—'}
                        </TableCell>
                        <TableCell title={fechaHora(t.ultimoCaducado)}>
                          {hace(t.ultimoCaducado)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </>
          )}

          <p className="flex items-start gap-2 text-xs text-gray-500">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            Los holds con pagos registrados no caducan nunca: esos los decide una
            persona (se confirman o se cancelan a mano). La fuente es la auditoría del
            barrido, así que lo que se ve aquí es exactamente lo que pasó.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
