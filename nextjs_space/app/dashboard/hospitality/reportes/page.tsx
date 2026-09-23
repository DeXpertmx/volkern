'use client';

/**
 * Reportes de hospitality (FASE 3.E del plan de Booking Engine + Payments).
 *
 * Dos pestañas del plan:
 *  - Operación: ocupación, ADR, RevPAR, estancia media, no-shows, cancelaciones,
 *    holds abandonados (caducados sin confirmar frente a confirmados) y partes
 *    de viajeros sin reintentar (rechazados que agotaron sus intentos frente a
 *    aceptados por el Ministerio).
 *  - Ventas: reservas e ingresos por canal, reservas directas, antelación media.
 *
 * Los KPIs salen del módulo puro (`kpisVentana`) vía
 * GET /api/hospitality/dashboard?dias=N — la página no calcula nada. Cada
 * tabla se exporta a CSV con el helper puro compartido (escape RFC 4180).
 */

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CalendarX2,
  Download,
  FileWarning,
  Loader2,
  Moon,
  Percent,
  PlaneTakeoff,
  RefreshCcw,
  TimerOff,
  TrendingUp,
  Users,
  Languages,
  HelpCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatearImporte } from '@/lib/moneda';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  construirCsv,
  descargarCsv,
  nombreArchivoReporte,
} from '@/lib/hospitality/csv';
import { alertaHoldsAbandonados } from '@/lib/hospitality/holds-metrics';
import { alertaRespuestaPreguntas } from '@/lib/hospitality/preguntas-metrics';
import { etiquetaMes as etiquetaMesResenas } from '@/lib/hospitality/resenas-metrics';
import {
  alertaPartesSinReintentar,
  lecturaPartesSinReintentar,
  type MetricasPartesViajeros,
} from '@/lib/hospitality/partes-metrics';

interface ReportesKpis {
  dias: number;
  adr: number | null;
  revpar: number | null;
  estanciaMedia: number | null;
  llegadas: number;
  noShows: number;
  tasaNoShow: number | null;
  cancelaciones: number;
  antelacionMediaDias: number | null;
  antelacionMedianaDias: number | null;
}

interface OcupacionGlobal {
  ocupacionMedia: number;
  unidades: number;
}

interface OcupacionPropiedad {
  propertyId: string;
  nombre: string;
  totalUnidades: number;
  ocupacionMedia: number;
}

interface MixCanal {
  canal: string;
  reservas: number;
  ingresos: number;
}

interface HoldsAbandonados {
  caducados: number;
  confirmados: number;
  cerrados: number;
  tasaAbandono: number | null;
}

interface IdiomasDirectas {
  es: number;
  en: number;
  total: number;
  cuotaEn: number | null;
  ingresosEn: number;
  /** Lectura accionable que produce el módulo puro en la ruta. */
  lectura: string;
}

/** Tasa de respuesta de las preguntas obligatorias del check-in (módulo puro vía la API). */
interface PreguntasRespuesta {
  respuestas: number;
  pendientes: number;
  /** Reservas con pendientes y sin email/teléfono: el recordatorio no puede llegarles. */
  sinContacto: number;
  tasaRespuesta: number | null;
  /** Lectura accionable que produce el módulo puro en la ruta. */
  lectura: string;
  /** Aviso de tasa baja, ya calculado en la ruta con el mismo módulo. */
  aviso?: string | null;
}

/** Reseñas en Reportes (módulo puro vía la API): media, volumen y evolución. */
interface ResenasMetrics {
  total: number;
  media: number | null;
  porPropiedad: Array<{ propertyId: string; nombre: string; total: number; media: number | null }>;
  porCanal: Array<{ canal: string; total: number; media: number | null }>;
  porMes: Array<{ mes: string; total: number; media: number | null }>;
  lectura: string;
}

interface DashboardPayload {
  /** Divisa de los importes del informe: la de las reservas del período y, si
   *  no hay ninguna, la moneda de reporte del tenant. La resuelve la API. */
  moneda: string;
  kpis: { ingresos: number; nochesVendidas: number };
  mixCanales: MixCanal[];
  ocupacionGlobal: OcupacionGlobal;
  ocupacionPropiedades: OcupacionPropiedad[];
  reportesKpis: ReportesKpis;
  holds?: HoldsAbandonados;
  /** Partes de viajeros: aceptados frente a los que el sistema dejó de reintentar. */
  partes?: MetricasPartesViajeros;
  /** ¿Funcionan los recordatorios? Tasa de respuesta de las preguntas obligatorias. */
  preguntas?: PreguntasRespuesta;
  /** Reseñas: ¿cómo puntúan, dónde y mejora con el tiempo? */
  resenas?: ResenasMetrics | null;
  idiomas?: IdiomasDirectas;
}

const RANGOS = [
  { dias: 30, etiqueta: '30 días' },
  { dias: 90, etiqueta: '90 días' },
  { dias: 180, etiqueta: '180 días' },
];

function pct(valor: number | null | undefined, decimales = 1): string {
  return valor == null ? '—' : `${(valor * 100).toFixed(decimales)}%`;
}

function KpiCard({ titulo, valor, sub, icono }: { titulo: string; valor: string; sub?: string; icono: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          {icono}
          {titulo}
        </div>
        <div className="mt-1.5 text-2xl font-bold tracking-tight">{valor}</div>
        {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export default function HospitalityReportes() {
  const [loading, setLoading] = useState(true);
  const [dias, setDias] = useState(30);
  const [data, setData] = useState<DashboardPayload | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/hospitality/dashboard?dias=${dias}`);
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Error al cargar los reportes');
      if (!payload.reportesKpis) throw new Error('La API no expone los KPIs de reportes');
      setData(payload);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al cargar los reportes');
    } finally {
      setLoading(false);
    }
  }, [dias]);

  useEffect(() => {
    load();
  }, [load]);

  // Los importes del informe se escriben con la divisa que devuelve la API —la
  // de las reservas del período y, si no hay ninguna, la del tenant—: esta
  // pantalla no fija ninguna.
  const money = (valor: number | null | undefined) => formatearImporte(valor, data?.moneda || '', 0);

  const k = data?.reportesKpis;
  const holds = data?.holds;
  const partes = data?.partes;
  const idiomas = data?.idiomas;
  const preguntas = data?.preguntas;
  const resenas = data?.resenas ?? undefined;
  // La lectura del abandono (umbral y volumen mínimo) vive en el módulo puro:
  // la página no decide cuándo algo es anómalo.
  const avisoHolds = holds ? alertaHoldsAbandonados(holds) : null;
  const avisoPartes = partes ? alertaPartesSinReintentar(partes) : null;
  const lecturaPartes = partes ? lecturaPartesSinReintentar(partes) : '';
  // Misma regla que aplica la ruta (el mismo módulo puro): la tasa baja y su
  // aviso no pueden leerse distinto según de dónde salgan.
  const avisoPreguntas = preguntas ? alertaRespuestaPreguntas(preguntas) : null;

  const exportarOperacion = () => {
    if (!data) return;
    const csv = construirCsv(
      data.ocupacionPropiedades.map((p) => ({
        propiedad: p.nombre,
        unidades: p.totalUnidades,
        ocupacion_media: Number((p.ocupacionMedia * 100).toFixed(2)),
        adr: data.reportesKpis.adr != null ? Number(data.reportesKpis.adr.toFixed(2)) : '',
        revpar: data.reportesKpis.revpar != null ? Number(data.reportesKpis.revpar.toFixed(2)) : '',
        estancia_media: data.reportesKpis.estanciaMedia != null ? Number(data.reportesKpis.estanciaMedia.toFixed(2)) : '',
        llegadas: data.reportesKpis.llegadas,
        no_shows: data.reportesKpis.noShows,
        tasa_no_show_pct: data.reportesKpis.tasaNoShow != null ? Number((data.reportesKpis.tasaNoShow * 100).toFixed(2)) : '',
        cancelaciones: data.reportesKpis.cancelaciones,
        partes_aceptados: data.partes?.aceptadas ?? '',
        partes_sin_reintentar: data.partes?.sinReintentar ?? '',
        // Desglose del abandono: rechazos del Ministerio (dato del huésped) y
        // entregas que nunca llegaron (servicio/red), que se arreglan distinto.
        partes_sin_reintentar_rechazados: data.partes?.sinReintentarRechazados ?? '',
        partes_sin_reintentar_sin_entregar: data.partes?.sinReintentarSinEntregar ?? '',
        partes_sin_entregar_en_curso: data.partes?.sinEntregarEnCurso ?? '',
        partes_cerrados: data.partes?.cerradas ?? '',
        partes_sin_reintentar_pct:
          data.partes?.tasaSinReintentar != null
            ? Number((data.partes.tasaSinReintentar * 100).toFixed(2))
            : '',
        preguntas_respuestas: data.preguntas?.respuestas ?? '',
        preguntas_pendientes: data.preguntas?.pendientes ?? '',
        preguntas_tasa_pct:
          data.preguntas?.tasaRespuesta != null
            ? Number((data.preguntas.tasaRespuesta * 100).toFixed(2))
            : '',
        preguntas_sin_contacto: data.preguntas?.sinContacto ?? '',
        ventana_dias: data.reportesKpis.dias,
      })),
      { delimitador: ',', bom: true },
    );
    if (!csv) {
      toast.error('No hay datos de ocupación que exportar');
      return;
    }
    descargarCsv(nombreArchivoReporte('operacion'), csv);
    toast.success('Reporte de operación descargado');
  };

  const exportarVentas = () => {
    if (!data) return;
    const csv = construirCsv(
      data.mixCanales.map((c) => ({
        canal: c.canal,
        reservas: c.reservas,
        ingresos: c.ingresos != null ? Number(c.ingresos.toFixed(2)) : 0,
        ingreso_medio: c.reservas > 0 ? Number((c.ingresos / c.reservas).toFixed(2)) : 0,
        antelacion_media_dias: data.reportesKpis.antelacionMediaDias != null ? Number(data.reportesKpis.antelacionMediaDias.toFixed(1)) : '',
        antelacion_mediana_dias: data.reportesKpis.antelacionMedianaDias != null ? Number(data.reportesKpis.antelacionMedianaDias.toFixed(1)) : '',
        directas_es: idiomas?.es ?? 0,
        directas_en: idiomas?.en ?? 0,
        cuota_en_pct: idiomas?.cuotaEn != null ? Number((idiomas.cuotaEn * 100).toFixed(1)) : '',
        ingresos_en: idiomas?.ingresosEn != null ? Number(idiomas.ingresosEn.toFixed(2)) : 0,
        ventana_dias: data.reportesKpis.dias,
      })),
      { delimitador: ',', bom: true },
    );
    if (!csv) {
      toast.error('No hay ventas que exportar');
      return;
    }
    descargarCsv(nombreArchivoReporte('ventas'), csv);
    toast.success('Reporte de ventas descargado');
  };

  const reservasDirectas = data?.mixCanales.find(
    (c) => c.canal.toLowerCase() === 'directa' || c.canal.toLowerCase() === 'direct',
  );

  return (
    <div className="space-y-4">
      {/* Controles */}
      <Card>
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            {RANGOS.map((r) => (
              <Button
                key={r.dias}
                type="button"
                size="sm"
                variant={dias === r.dias ? 'default' : 'outline'}
                onClick={() => setDias(r.dias)}
              >
                {r.etiqueta}
              </Button>
            ))}
          </div>
          <span className="text-xs text-muted-foreground">Últimos {dias} días (incluye hoy)</span>
          <div className="ml-auto flex items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading && !data ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Calculando reportes…
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="operacion" className="space-y-4">
          <TabsList>
            <TabsTrigger value="operacion">Operación</TabsTrigger>
            <TabsTrigger value="ventas">Ventas</TabsTrigger>
          </TabsList>

          {/* ── Operación ─────────────────────────────────────────────── */}
          <TabsContent value="operacion" className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard titulo="ADR" valor={money(k?.adr)} sub="Ingreso medio por noche vendida" icono={<TrendingUp className="h-3.5 w-3.5" />} />
              <KpiCard titulo="RevPAR" valor={money(k?.revpar)} sub="Ingreso por unidad disponible" icono={<Percent className="h-3.5 w-3.5" />} />
              <KpiCard titulo="Estancia media" valor={k?.estanciaMedia != null ? `${k.estanciaMedia.toFixed(1)} noches` : '—'} sub="Noches por reserva" icono={<Moon className="h-3.5 w-3.5" />} />
              <KpiCard titulo="Ocupación media" valor={pct(data?.ocupacionGlobal?.ocupacionMedia ?? null)} sub={data?.ocupacionGlobal ? `Unidades ocupadas sobre ${data.ocupacionGlobal.unidades}` : 'Sin unidades'} icono={<Percent className="h-3.5 w-3.5" />} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard titulo="Llegadas" valor={String(k?.llegadas ?? '—')} sub={`${k?.dias ?? 0} días`} icono={<PlaneTakeoff className="h-3.5 w-3.5" />} />
              <KpiCard titulo="No-shows" valor={String(k?.noShows ?? '—')} sub={k?.tasaNoShow != null ? `Tasa: ${(k.tasaNoShow * 100).toFixed(1)}%` : 'Sin llegadas'} icono={<Users className="h-3.5 w-3.5" />} />
              <KpiCard titulo="Cancelaciones" valor={String(k?.cancelaciones ?? '—')} sub="Reservas canceladas del período" icono={<CalendarX2 className="h-3.5 w-3.5" />} />
              <KpiCard titulo="Ingresos del período" valor={money(data?.kpis.ingresos)} sub={`${data?.kpis.nochesVendidas ?? 0} noches vendidas`} icono={<TrendingUp className="h-3.5 w-3.5" />} />
            </div>

            {/* ── Salud de la retención: el ciclo del hold ──────────────────
                No es un KPI de volumen: es el diagnóstico de si la ventana de
                retención o los canales están fallando. El par exacto
                (caducados frente a confirmados) y la decisión de cuándo avisar
                viven en el módulo puro, no en la página. */}
            <div className="grid gap-3 sm:grid-cols-2">
              <KpiCard
                titulo="Holds abandonados"
                valor={holds && holds.cerrados > 0 ? String(holds.caducados) : '—'}
                sub={
                  holds && holds.cerrados > 0
                    ? `${((holds.tasaAbandono ?? 0) * 100).toFixed(0)}% de ${holds.cerrados} holds cerrados · ${holds.confirmados} confirmados`
                    : 'Sin holds cerrados en el período'
                }
                icono={<TimerOff className="h-3.5 w-3.5" />}
              />
              <div className="rounded-md border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
                {holds && holds.cerrados > 0 ? (
                  <>
                    <span className="font-medium text-foreground">{holds.caducados} caducados</span> frente a{' '}
                    <span className="font-medium text-foreground">{holds.confirmados} confirmados</span> en el período. Un
                    goteo es normal (retenciones que nadie confirmó a tiempo); un pico sostenido apunta a una ventana de
                    retención más corta que el tiempo que tardan en decidir, o a canales que confirman tarde. Ambas se
                    ajustan en la configuración de la propiedad.
                  </>
                ) : (
                  <>
                    Sin holds cerrados en el período: no ha habido retenciones que caduquen sin confirmar. Cuando las haya,
                    aquí verás la proporción entre abandonadas y confirmadas, que es la que dice si la ventana de
                    retención de tus propiedades encaja con cómo trabajas.
                  </>
                )}
              </div>
            </div>

            {avisoHolds && (
              <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{avisoHolds}</span>
              </div>
            )}

            {/* ── ¿El hotel está comunicando lo que el RD le obliga? ────────
                Un parte de viajeros sin reintentar es una estancia que se
                quedó sin comunicar: no lo cuenta ningún otro KPI (las
                «rechazadas» mezclan las que el barrido todavía insiste). El
                par es el del ciclo del parte —aceptados por el Ministerio
                frente a los abandonados— y la cifra, la tasa y su lectura
                vienen del módulo puro vía la API. */}
            {partes && (
              <div className="grid gap-3 sm:grid-cols-2">
                <KpiCard
                  titulo="Partes sin reintentar"
                  valor={partes.cerradas > 0 ? String(partes.sinReintentar) : '—'}
                  sub={
                    partes.cerradas > 0
                      ? `${((partes.tasaSinReintentar ?? 0) * 100).toFixed(0)}% de ${partes.cerradas} partes cerrados · ${partes.aceptadas} aceptados` +
                        // El desglose importa más de lo que parece: un abandono
                        // por rechazo pide corregir el dato del huésped; uno por
                        // falta de respuesta del servicio no tiene nada que
                        // corregir en los datos — se reintenta.
                        (partes.sinReintentar > 0
                          ? ` · ${partes.sinReintentarRechazados} rechazados, ${partes.sinReintentarSinEntregar} sin respuesta`
                          : '')
                      : 'Sin partes cerrados en el período'
                  }
                  icono={<FileWarning className="h-3.5 w-3.5" />}
                />
                <div className="rounded-md border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
                  {lecturaPartes}
                </div>
              </div>
            )}

            {avisoPartes && (
              <div className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{avisoPartes}</span>
              </div>
            )}

            {/* ── ¿Funcionan los recordatorios de las preguntas? ──────────
                La tasa de respuesta de las preguntas obligatorias mide el
                recordatorio de pre-llegada: el par del ciclo completo
                (respondidas frente a pendientes) y su lectura vienen del
                módulo puro vía la API — la misma definición de «pendiente»
                que rellena {{preguntas_pendientes}} en el email. */}
            {preguntas && (
              <div className="grid gap-3 sm:grid-cols-2">
                <KpiCard
                  titulo="Respuesta de preguntas obligatorias"
                  valor={
                    preguntas.respuestas + preguntas.pendientes > 0
                      ? pct(preguntas.tasaRespuesta, 0)
                      : '—'
                  }
                  sub={
                    preguntas.respuestas + preguntas.pendientes > 0
                      ? `${preguntas.respuestas} respondidas · ${preguntas.pendientes} pendientes` +
                        (preguntas.sinContacto > 0 ? ` · ${preguntas.sinContacto} sin contacto` : '')
                      : 'Sin preguntas obligatorias activas en el período'
                  }
                  icono={<HelpCircle className="h-3.5 w-3.5" />}
                />
                <div className="rounded-md border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
                  {preguntas.lectura}
                </div>
              </div>
            )}

            {avisoPreguntas && (
              <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{avisoPreguntas}</span>
              </div>
            )}

            {/* ── Reseñas: ¿cómo puntúan los huéspedes y mejora? ────────
                Media y volumen por propiedad y canal (nativas §21 + histórico
                importado) y evolución mensual por fecha de estancia. La
                lectura viene redactada del módulo puro vía la API — la página
                no interpreta. */}
            {resenas && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between">
                    Reseñas de huéspedes
                    <span className="text-sm font-normal text-muted-foreground">
                      {resenas.total > 0 && resenas.media != null
                        ? `${resenas.media.toFixed(1)} / 5 · ${resenas.total} reseñas`
                        : 'Sin reseñas publicadas en el período'}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {resenas.total === 0 ? (
                    <p className="text-sm text-muted-foreground">{resenas.lectura}</p>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                              <th className="px-3 py-2 font-medium">Propiedad</th>
                              <th className="px-3 py-2 font-medium text-right">Reseñas</th>
                              <th className="px-3 py-2 font-medium text-right">Media</th>
                            </tr>
                          </thead>
                          <tbody>
                            {resenas.porPropiedad.map((p) => (
                              <tr key={p.propertyId} className="border-b last:border-0">
                                <td className="px-3 py-2 font-medium">{p.nombre}</td>
                                <td className="px-3 py-2 text-right">{p.total}</td>
                                <td className="px-3 py-2 text-right">
                                  <Badge variant="outline">{p.media != null ? p.media.toFixed(1) : '—'}</Badge>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Por canal de origen</p>
                          <div className="space-y-1.5">
                            {resenas.porCanal.map((c) => (
                              <div key={c.canal} className="flex items-center justify-between text-sm">
                                <span>
                                  {c.canal}
                                  <span className="ml-1 text-xs text-muted-foreground">({c.total})</span>
                                </span>
                                <Badge variant="outline">{c.media != null ? c.media.toFixed(1) : '—'}</Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Evolución mensual (por estancia)</p>
                          <div className="space-y-1.5">
                            {resenas.porMes.slice(-6).map((m) => (
                              <div key={m.mes} className="flex items-center justify-between text-sm">
                                <span>{etiquetaMesResenas(m.mes)}</span>
                                <span className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">{m.total}</span>
                                  <Badge variant="outline">{m.media != null ? m.media.toFixed(1) : '—'}</Badge>
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      <p className="rounded-md border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">{resenas.lectura}</p>
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  Ocupación por propiedad
                  <Button type="button" size="sm" variant="outline" onClick={exportarOperacion}>
                    <Download className="mr-1 h-3.5 w-3.5" /> Exportar CSV
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2 font-medium">Propiedad</th>
                        <th className="px-3 py-2 font-medium text-right">Unidades</th>
                        <th className="px-3 py-2 font-medium text-right">Ocupación media</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.ocupacionPropiedades || []).map((p) => (
                        <tr key={p.propertyId} className="border-b last:border-0">
                          <td className="px-3 py-2 font-medium">{p.nombre}</td>
                          <td className="px-3 py-2 text-right">{p.totalUnidades}</td>
                          <td className="px-3 py-2 text-right">
                            <Badge variant="outline">{pct(p.ocupacionMedia)}</Badge>
                          </td>
                        </tr>
                      ))}
                      {(data?.ocupacionPropiedades || []).length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-3 py-8 text-center text-muted-foreground">
                            Sin propiedades con unidades.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Ventas ────────────────────────────────────────────────── */}
          <TabsContent value="ventas" className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard titulo="Reservas directas" valor={String(reservasDirectas?.reservas ?? 0)} sub={reservasDirectas ? money(reservasDirectas.ingresos) : 'Sin canal directa'} icono={<TrendingUp className="h-3.5 w-3.5" />} />
              <KpiCard titulo="Antelación media" valor={k?.antelacionMediaDias != null ? `${k.antelacionMediaDias.toFixed(1)} días` : '—'} sub="Reserva → llegada" icono={<PlaneTakeoff className="h-3.5 w-3.5" />} />
              <KpiCard titulo="Antelación mediana" valor={k?.antelacionMedianaDias != null ? `${k.antelacionMedianaDias} días` : '—'} sub="El valor típico" icono={<PlaneTakeoff className="h-3.5 w-3.5" />} />
              <KpiCard titulo="Ingresos del período" valor={money(data?.kpis.ingresos)} sub={`${data?.kpis.nochesVendidas ?? 0} noches vendidas`} icono={<TrendingUp className="h-3.5 w-3.5" />} />
            </div>

            {/* ── Reservas directas por idioma (ES vs EN) ─────────────
                ¿Convierte la web internacional? El idioma viaja con la
                reserva desde la página pública (?lang=en) y la lectura del
                número la produce el módulo puro: la página no interpreta. */}
            {idiomas && (
              <div className="grid gap-3 sm:grid-cols-2">
                <KpiCard
                  titulo="Reservas directas en inglés (EN)"
                  valor={idiomas.total > 0 ? String(idiomas.en) : '—'}
                  sub={
                    idiomas.total > 0
                      ? `${Math.round((idiomas.cuotaEn ?? 0) * 100)}% de ${idiomas.total} reservas directas · ${money(idiomas.ingresosEn)}`
                      : 'Sin reservas directas en el período'
                  }
                  icono={<Languages className="h-3.5 w-3.5" />}
                />
                <div className="rounded-md border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
                  <span className="font-medium text-foreground">{idiomas.es} en español</span> frente a{' '}
                  <span className="font-medium text-foreground">{idiomas.en} en inglés</span> en el período. {idiomas.lectura}
                </div>
              </div>
            )}

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  Reservas e ingresos por canal
                  <Button type="button" size="sm" variant="outline" onClick={exportarVentas}>
                    <Download className="mr-1 h-3.5 w-3.5" /> Exportar CSV
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2 font-medium">Canal</th>
                        <th className="px-3 py-2 font-medium text-right">Reservas</th>
                        <th className="px-3 py-2 font-medium text-right">Ingresos</th>
                        <th className="px-3 py-2 font-medium text-right">Ingreso medio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.mixCanales || []).map((c) => (
                        <tr key={c.canal} className="border-b last:border-0">
                          <td className="px-3 py-2 font-medium">{c.canal}</td>
                          <td className="px-3 py-2 text-right">{c.reservas}</td>
                          <td className="px-3 py-2 text-right">{money(c.ingresos)}</td>
                          <td className="px-3 py-2 text-right">{c.reservas > 0 ? money(c.ingresos / c.reservas) : '—'}</td>
                        </tr>
                      ))}
                      {(data?.mixCanales || []).length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                            Sin reservas en el período.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
