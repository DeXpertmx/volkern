'use client';

/**
 * Volkern Real Estate — Captaciones (contratos de comercialización).
 *
 * Listado operativo de las captaciones con sus filtros por estado y tipo, más el
 * alta del contrato. Una captación es el acuerdo con el propietario de un
 * inmueble, así que las dos cláusulas que el alta pone en primer plano son la
 * exclusividad y la comisión.
 *
 * El modelo, la API (`/api/real-estate/captaciones`) y sus helpers existían desde
 * antes, pero ninguna pantalla los mostraba: la funcionalidad solo era alcanzable
 * por API. Esta es esa interfaz.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { formatearImporte, formatearNumero, MONEDAS_SELECCIONABLES } from '@/lib/moneda';
import {
  CAPTACION_ESTADOS,
  CAPTACION_TIPOS,
  calcularComisionCaptacion,
  etiquetaTipoCaptacion,
  primeraImagenInmueble,
  type CaptacionEstado,
  type CaptacionStatsWire,
  type CaptacionTipo,
  type CaptacionWire,
} from '@/lib/real-estate/captacion-shared';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from '@/components/ui/pagination';
import { toast } from 'sonner';
import {
  FileSignature,
  Plus,
  Search,
  Filter,
  X,
  Loader2,
  Building2,
  RefreshCw,
  ShieldCheck,
  User,
  Percent,
  Trash2,
  Eye,
  CalendarDays,
  BadgeCheck,
} from 'lucide-react';
import { RealEstateModuleNav } from '@/components/real-estate/RealEstateModuleNav';
import { OwnerBadge } from '@/components/real-estate/OwnerCard';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PaginationState {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface Filtros {
  search: string;
  estado: string;
  tipoCaptacion: string;
  desde: string;
  hasta: string;
}

/** Centinela de «sin filtro»: el valor vacío no vale como `SelectItem`. */
const TODOS = 'todos';

const FILTROS_INICIALES: Filtros = {
  search: '',
  estado: TODOS,
  tipoCaptacion: TODOS,
  desde: '',
  hasta: '',
};

interface InmuebleOpcion {
  id: string;
  nombre: string;
  precioBase: number | null;
  moneda: string | null;
  owner?: { name: string | null; phone: string | null; email: string | null; contactId: string | null } | null;
}

interface ContactoOpcion {
  id: string;
  nombre: string;
  email: string | null;
  telefono: string | null;
}

interface AltaForm {
  propiedadId: string;
  contactoPropietarioId: string;
  tipoCaptacion: CaptacionTipo;
  estado: CaptacionEstado;
  fechaInicio: string;
  fechaFin: string;
  fechaFirma: string;
  fechaVencimiento: string;
  esExclusiva: boolean;
  clausulasExclusividad: string;
  precioOferta: string;
  precioMinimo: string;
  comisionPorcentaje: string;
  comisionFija: string;
  comisionMoneda: string;
  comisionCondiciones: string;
  comisionNotas: string;
  condicionesPago: string;
  notasCliente: string;
  notasInternas: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Fecha de hoy en el formato que espera un `<input type="date">`. */
function hoy(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Hoy + `meses`, también en formato de input. */
function dentroDeMeses(meses: number): string {
  const fecha = new Date();
  fecha.setMonth(fecha.getMonth() + meses);
  return fecha.toISOString().slice(0, 10);
}

const formatearFecha = (valor: string | null) =>
  valor
    ? new Date(valor).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

/**
 * Estado inicial del alta. Las fechas nacen razonables —hoy y un año— porque un
 * contrato de exclusividad se firma por temporadas, no por días sueltos, y la
 * divisa la dicta el inmueble o la cuenta, nunca un literal.
 */
const formularioInicial = (moneda: string): AltaForm => ({
  propiedadId: '',
  contactoPropietarioId: '',
  tipoCaptacion: 'exclusiva',
  estado: 'borrador',
  fechaInicio: hoy(),
  fechaFin: dentroDeMeses(12),
  fechaFirma: '',
  fechaVencimiento: '',
  esExclusiva: true,
  clausulasExclusividad: '',
  precioOferta: '',
  precioMinimo: '',
  comisionPorcentaje: '',
  comisionFija: '',
  comisionMoneda: moneda,
  comisionCondiciones: '',
  comisionNotas: '',
  condicionesPago: '',
  notasCliente: '',
  notasInternas: '',
});

function badgeEstado(estado: string) {
  const info = CAPTACION_ESTADOS.find((e) => e.value === estado);
  return (
    <Badge variant="outline" className={`${info?.badge || ''} border`}>
      {info?.label || estado || '—'}
    </Badge>
  );
}

/** Etiqueta de vigencia: cuánto queda, o por qué no está vigente. */
function textoVigencia(captacion: CaptacionWire): { texto: string; clase: string } {
  const fin = new Date(captacion.fechaFin).getTime();
  const dias = Math.round((fin - Date.now()) / 86_400_000);
  if (captacion.estado === 'borrador') return { texto: 'Sin firmar', clase: 'text-muted-foreground' };
  if (captacion.estado === 'cancelada') return { texto: 'Rescindida', clase: 'text-rose-600' };
  if (captacion.estado === 'cerrada') return { texto: 'Operación cerrada', clase: 'text-blue-600' };
  if (dias < 0) return { texto: `Venció hace ${Math.abs(dias)} d`, clase: 'text-amber-600' };
  if (dias === 0) return { texto: 'Vence hoy', clase: 'text-amber-600' };
  return { texto: `${dias} días restantes`, clase: 'text-emerald-600' };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CaptacionesPage() {
  const router = useRouter();

  const [captaciones, setCaptaciones] = useState<CaptacionWire[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [stats, setStats] = useState<CaptacionStatsWire | null>(null);
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INICIALES);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);

  // Alta
  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [monedaTenant, setMonedaTenant] = useState('');
  const [form, setForm] = useState<AltaForm>(() => formularioInicial(''));
  const [inmuebles, setInmuebles] = useState<InmuebleOpcion[]>([]);
  const [contactos, setContactos] = useState<ContactoOpcion[]>([]);
  const [catalogosCargados, setCatalogosCargados] = useState(false);
  const [cargandoCatalogos, setCargandoCatalogos] = useState(false);

  const hayFiltros = useMemo(
    () => Boolean(filtros.search || filtros.desde || filtros.hasta || filtros.estado !== TODOS || filtros.tipoCaptacion !== TODOS),
    [filtros]
  );

  // ─── Carga de datos ─────────────────────────────────────────────────────────

  const fetchCaptaciones = useCallback(
    async (page: number = 1) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set('limit', String(pagination.limit));
        params.set('offset', String((page - 1) * pagination.limit));
        if (filtros.search) params.set('search', filtros.search);
        if (filtros.estado !== TODOS) params.set('estado', filtros.estado);
        if (filtros.tipoCaptacion !== TODOS) params.set('tipoCaptacion', filtros.tipoCaptacion);
        if (filtros.desde) params.set('desde', filtros.desde);
        if (filtros.hasta) params.set('hasta', filtros.hasta);

        const res = await apiFetch(`/api/real-estate/captaciones?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setCaptaciones(data.captaciones || []);
          setPagination((prev) => ({
            ...prev,
            page,
            total: data.pagination?.total || 0,
            totalPages: data.pagination?.totalPages || 0,
          }));
        } else {
          toast.error('No se pudieron cargar las captaciones');
        }
      } catch (error) {
        console.error('[Captaciones] Error fetching:', error);
        toast.error('Error de conexión al cargar captaciones');
      } finally {
        setLoading(false);
      }
    },
    [filtros, pagination.limit]
  );

  const fetchStats = useCallback(async () => {
    try {
      const res = await apiFetch('/api/real-estate/captaciones?stats=true');
      if (res.ok) {
        const data = await res.json();
        if (data.stats) setStats(data.stats);
      }
    } catch (error) {
      console.error('[Captaciones] Error fetching stats:', error);
    }
  }, []);

  const fetchMonedaTenant = useCallback(async () => {
    try {
      const res = await apiFetch('/api/real-estate/dashboard-stats');
      if (res.ok) {
        const data = await res.json();
        if (typeof data.moneda === 'string') setMonedaTenant(data.moneda);
      }
    } catch (error) {
      console.error('[Captaciones] Error fetching tenant currency:', error);
    }
  }, []);

  useEffect(() => {
    fetchCaptaciones(1);
    fetchStats();
    fetchMonedaTenant();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Al cambiar cualquier filtro. La búsqueda escribe 400 ms después de la última
  // tecla: por eso `filtros.search` entra en las dependencias y el retardo se
  // elige según si hay texto.
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCaptaciones(1);
    }, filtros.search ? 400 : 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros.search, filtros.estado, filtros.tipoCaptacion, filtros.desde, filtros.hasta]);

  /** Inmuebles y propietarios del alta: se piden la primera vez que se abre. */
  const cargarCatalogos = useCallback(async () => {
    if (catalogosCargados || cargandoCatalogos) return;
    setCargandoCatalogos(true);
    try {
      const [inmueblesRes, contactosRes] = await Promise.allSettled([
        apiFetch('/api/real-estate/properties?limit=100'),
        apiFetch('/api/contacts?tipo=person'),
      ]);

      if (inmueblesRes.status === 'fulfilled' && inmueblesRes.value.ok) {
        const data = await inmueblesRes.value.json();
        setInmuebles(data.properties || []);
      }
      if (contactosRes.status === 'fulfilled' && contactosRes.value.ok) {
        const data = await contactosRes.value.json();
        setContactos(Array.isArray(data) ? data : []);
      }
      setCatalogosCargados(true);
    } catch (error) {
      console.error('[Captaciones] Error loading lookups:', error);
    } finally {
      setCargandoCatalogos(false);
    }
  }, [catalogosCargados, cargandoCatalogos]);

  // ─── Acciones ───────────────────────────────────────────────────────────────

  const abrirAlta = () => {
    setForm(formularioInicial(monedaTenant));
    setDialogoAbierto(true);
    cargarCatalogos();
  };

  const limpiarFiltros = () => setFiltros(FILTROS_INICIALES);

  const cambiarEstado = async (captacion: CaptacionWire, estado: CaptacionEstado) => {
    try {
      const res = await apiFetch(`/api/real-estate/captaciones/${captacion.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado }),
      });
      if (res.ok) {
        toast.success(`Captación marcada como ${estado}`);
        fetchCaptaciones(pagination.page);
        fetchStats();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || 'No se pudo cambiar el estado');
      }
    } catch {
      toast.error('Error de conexión');
    }
  };

  const eliminar = async (captacion: CaptacionWire) => {
    if (!confirm('¿Eliminar esta captación? Esta acción no se puede deshacer.')) return;
    try {
      const res = await apiFetch(`/api/real-estate/captaciones/${captacion.id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Captación eliminada');
        fetchCaptaciones(1);
        fetchStats();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || 'No se pudo eliminar');
      }
    } catch {
      toast.error('Error de conexión');
    }
  };

  /**
   * Al elegir el inmueble se arrastran sus datos: el precio de oferta y la divisa
   * de la comisión, y el propietario si el inmueble ya lo tiene vinculado en el
   * CRM. Son los datos del contrato que nadie debería tener que volver a teclear.
   */
  const seleccionarInmueble = (propiedadId: string) => {
    const inmueble = inmuebles.find((i) => i.id === propiedadId);
    setForm((prev) => ({
      ...prev,
      propiedadId,
      precioOferta: inmueble?.precioBase ? String(inmueble.precioBase) : prev.precioOferta,
      comisionMoneda: inmueble?.moneda || prev.comisionMoneda || monedaTenant,
      contactoPropietarioId: inmueble?.owner?.contactId || prev.contactoPropietarioId,
    }));
  };

  const comisionPreview = useMemo(() => {
    const precio = parseFloat(form.precioOferta) || 0;
    const pct = form.comisionPorcentaje ? parseFloat(form.comisionPorcentaje) : null;
    const fija = form.comisionFija ? parseFloat(form.comisionFija) : null;
    return calcularComisionCaptacion(precio, pct, fija);
  }, [form.precioOferta, form.comisionPorcentaje, form.comisionFija]);

  const guardar = async () => {
    if (!form.propiedadId) {
      toast.error('Selecciona el inmueble que se capta');
      return;
    }
    if (!form.fechaInicio || !form.fechaFin) {
      toast.error('El contrato necesita fecha de inicio y de fin');
      return;
    }
    if (new Date(form.fechaFin) <= new Date(form.fechaInicio)) {
      toast.error('La fecha de fin debe ser posterior a la de inicio');
      return;
    }
    if (!form.comisionPorcentaje && !form.comisionFija) {
      toast.error('Indica un porcentaje o un importe de comisión');
      return;
    }

    setGuardando(true);
    try {
      const body: Record<string, unknown> = {
        propiedadId: form.propiedadId,
        contactoPropietarioId: form.contactoPropietarioId || undefined,
        tipoCaptacion: form.tipoCaptacion,
        estado: form.estado,
        fechaInicio: form.fechaInicio,
        fechaFin: form.fechaFin,
        esExclusiva: form.esExclusiva,
        comisionMoneda: form.comisionMoneda || undefined,
      };
      if (form.fechaFirma) body.fechaFirma = form.fechaFirma;
      if (form.fechaVencimiento) body.fechaVencimiento = form.fechaVencimiento;
      if (form.clausulasExclusividad) body.clausulasExclusividad = form.clausulasExclusividad;
      if (form.precioOferta) body.precioOferta = parseFloat(form.precioOferta);
      if (form.precioMinimo) body.precioMinimo = parseFloat(form.precioMinimo);
      if (form.comisionPorcentaje) body.comisionPorcentaje = parseFloat(form.comisionPorcentaje);
      if (form.comisionFija) body.comisionFija = parseFloat(form.comisionFija);
      if (form.comisionCondiciones) body.comisionCondiciones = form.comisionCondiciones;
      if (form.comisionNotas) body.comisionNotas = form.comisionNotas;
      if (form.condicionesPago) body.condicionesPago = form.condicionesPago;
      if (form.notasCliente) body.notasCliente = form.notasCliente;
      if (form.notasInternas) body.notasInternas = form.notasInternas;

      const res = await apiFetch('/api/real-estate/captaciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        toast.success('Captación creada');
        setDialogoAbierto(false);
        setForm(formularioInicial(monedaTenant));
        fetchCaptaciones(1);
        fetchStats();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || 'No se pudo crear la captación');
      }
    } catch {
      toast.error('Error de conexión');
    } finally {
      setGuardando(false);
    }
  };

  // ─── Paginación ─────────────────────────────────────────────────────────────

  const getPageNumbers = (): (number | 'ellipsis')[] => {
    const { totalPages, page } = pagination;
    const pages: (number | 'ellipsis')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push('ellipsis');
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
      if (page < totalPages - 2) pages.push('ellipsis');
      pages.push(totalPages);
    }
    return pages;
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  const monedaComision = form.comisionMoneda || monedaTenant;

  return (
    <div className="space-y-6 p-4 md:p-8 pt-6">
      <RealEstateModuleNav />

      {/* Cabecera */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <FileSignature className="h-8 w-8 text-primary" />
            Captaciones
          </h1>
          <p className="text-muted-foreground mt-1">
            Contratos de comercialización con propietarios: exclusividad y comisión
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              fetchCaptaciones(pagination.page);
              fetchStats();
            }}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Actualizar
          </Button>
          <Button onClick={abrirAlta}>
            <Plus className="h-4 w-4 mr-2" />
            Nueva Captación
          </Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard/real-estate/properties">
              <Building2 className="h-4 w-4 mr-2" />
              Inmuebles
            </Link>
          </Button>
        </div>
      </div>

      {/* Métricas */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-5">
        {loading && !stats ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28" />)
        ) : (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total</CardTitle>
                <FileSignature className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatearNumero(stats?.total ?? 0)}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatearNumero((stats?.borrador ?? 0))} en borrador
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Activas</CardTitle>
                <BadgeCheck className="h-4 w-4 text-emerald-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-emerald-600">{formatearNumero(stats?.activas ?? 0)}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatearNumero((stats?.cerradas ?? 0))} cerradas · {formatearNumero((stats?.vencidas ?? 0))} vencidas
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Exclusivas</CardTitle>
                <ShieldCheck className="h-4 w-4 text-indigo-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-indigo-600">{formatearNumero(stats?.exclusivas ?? 0)}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {stats && stats.total > 0
                    ? `${formatearNumero((stats.exclusivas / stats.total) * 100)}% del total`
                    : 'Sin contratos'}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Comisión prom.</CardTitle>
                <Percent className="h-4 w-4 text-purple-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatearNumero(stats?.comisionPromedio ?? 0, 2)}%
                </div>
                <p className="text-xs text-muted-foreground mt-1">Sobre precio ofertado</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Precio ofertado</CardTitle>
                <Building2 className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatearImporte(stats?.valorPromedio ?? 0, monedaTenant, 0)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Promedio captado</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex-1 flex flex-col md:flex-row gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por notas o condiciones..."
                  value={filtros.search}
                  onChange={(e) => setFiltros((prev) => ({ ...prev, search: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && fetchCaptaciones(1)}
                  className="pl-10"
                />
              </div>

              <Select
                value={filtros.estado}
                onValueChange={(v) => setFiltros((prev) => ({ ...prev, estado: v }))}
              >
                <SelectTrigger className="w-[170px]">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todos los estados</SelectItem>
                  {CAPTACION_ESTADOS.map((e) => (
                    <SelectItem key={e.value} value={e.value}>
                      {e.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={filtros.tipoCaptacion}
                onValueChange={(v) => setFiltros((prev) => ({ ...prev, tipoCaptacion: v }))}
              >
                <SelectTrigger className="w-[170px]">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todos los tipos</SelectItem>
                  {CAPTACION_TIPOS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant={mostrarFiltros ? 'default' : 'outline'}
                size="sm"
                onClick={() => setMostrarFiltros(!mostrarFiltros)}
              >
                <Filter className="h-4 w-4 mr-1" />
                Fechas
              </Button>
              {hayFiltros && (
                <Button variant="ghost" size="sm" onClick={limpiarFiltros}>
                  <X className="h-4 w-4 mr-1" />
                  Limpiar
                </Button>
              )}
            </div>
          </div>

          {mostrarFiltros && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-4 border-t animate-in fade-in slide-in-from-top-2 duration-200">
              <div>
                <Label className="text-xs">Creadas desde</Label>
                <Input
                  type="date"
                  value={filtros.desde}
                  onChange={(e) => setFiltros((prev) => ({ ...prev, desde: e.target.value }))}
                />
              </div>
              <div>
                <Label className="text-xs">Creadas hasta</Label>
                <Input
                  type="date"
                  value={filtros.hasta}
                  onChange={(e) => setFiltros((prev) => ({ ...prev, hasta: e.target.value }))}
                />
              </div>
            </div>
          )}
        </CardHeader>
      </Card>

      {/* Tabla */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Cargando captaciones...</p>
              </div>
            </div>
          ) : captaciones.length === 0 ? (
            <div className="text-center py-16">
              <FileSignature className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-40" />
              <h3 className="text-lg font-medium mb-2">No hay captaciones</h3>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                {hayFiltros
                  ? 'Ninguna captación coincide con los filtros seleccionados. Prueba a ajustarlos.'
                  : 'Registra el primer contrato de comercialización con un propietario.'}
              </p>
              {!hayFiltros && (
                <Button onClick={abrirAlta}>
                  <Plus className="h-4 w-4 mr-2" />
                  Crear Primera Captación
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[210px]">Captación</TableHead>
                      <TableHead>Inmueble</TableHead>
                      <TableHead>Propietario</TableHead>
                      <TableHead>Vigencia</TableHead>
                      <TableHead className="text-right">Oferta</TableHead>
                      <TableHead className="text-right">Comisión</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right w-[120px]">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {captaciones.map((captacion) => {
                      const vigencia = textoVigencia(captacion);
                      const comision = calcularComisionCaptacion(
                        captacion.precioOferta || 0,
                        captacion.comisionPorcentaje,
                        captacion.comisionFija
                      );
                      const moneda = captacion.comisionMoneda || captacion.propiedad?.moneda || monedaTenant;
                      const imagen = primeraImagenInmueble(captacion.propiedad?.media);

                      return (
                        <TableRow
                          key={captacion.id}
                          className="group cursor-pointer hover:bg-muted/50"
                          onClick={() => router.push(`/dashboard/real-estate/captaciones/${captacion.id}`)}
                        >
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {etiquetaTipoCaptacion(captacion.tipoCaptacion)}
                              </Badge>
                              {captacion.esExclusiva && (
                                <ShieldCheck className="h-4 w-4 text-indigo-500" aria-label="Exclusiva" />
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1 truncate max-w-[190px]">
                              {captacion.creador?.name || captacion.creador?.email || 'Sin agente'}
                            </p>
                          </TableCell>

                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-14 rounded-md overflow-hidden flex-shrink-0 bg-muted">
                                {imagen ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={imagen} alt={captacion.propiedad?.nombre || ''} className="h-full w-full object-cover" />
                                ) : (
                                  <div className="h-full w-full flex items-center justify-center">
                                    <Building2 className="w-4 h-4 text-muted-foreground/40" />
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0">
                                <span className="font-medium truncate block max-w-[180px]">
                                  {captacion.propiedad?.nombre || 'Inmueble no encontrado'}
                                </span>
                                {captacion.propiedad?.precioBase ? (
                                  <span className="text-xs text-muted-foreground">
                                    {formatearImporte(captacion.propiedad.precioBase, captacion.propiedad.moneda || moneda, 0)}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </TableCell>

                          <TableCell>
                            {captacion.contactoPropietario ? (
                              <OwnerBadge
                                owner={{
                                  name: captacion.contactoPropietario.nombre,
                                  phone: captacion.contactoPropietario.telefono,
                                  email: captacion.contactoPropietario.email,
                                  contactId: captacion.contactoPropietario.id,
                                }}
                              />
                            ) : (
                              <Badge variant="outline" className="text-xs border-dashed text-muted-foreground gap-1">
                                <User className="h-3 w-3" />
                                Sin propietario
                              </Badge>
                            )}
                          </TableCell>

                          <TableCell>
                            <div className="flex items-center gap-1 text-xs">
                              <CalendarDays className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                              <span>{formatearFecha(captacion.fechaInicio)}</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                              hasta {formatearFecha(captacion.fechaFin)}
                            </p>
                            <p className={`text-[11px] font-medium ${vigencia.clase}`}>{vigencia.texto}</p>
                          </TableCell>

                          <TableCell className="text-right font-medium">
                            {formatearImporte(captacion.precioOferta, moneda, 0)}
                          </TableCell>

                          <TableCell className="text-right">
                            <div className="font-medium">
                              {captacion.comisionPorcentaje
                                ? `${formatearNumero(captacion.comisionPorcentaje, 2)}%`
                                : formatearImporte(captacion.comisionFija, moneda, 0)}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {captacion.precioOferta ? formatearImporte(comision, moneda, 0) : '—'}
                            </div>
                          </TableCell>

                          <TableCell>{badgeEstado(captacion.estado)}</TableCell>

                          <TableCell className="text-right">
                            <div
                              className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {captacion.estado === 'borrador' && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-emerald-600"
                                  title="Activar contrato"
                                  onClick={() => cambiarEstado(captacion, 'activa')}
                                >
                                  <BadgeCheck className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                title="Ver detalle"
                                asChild
                              >
                                <Link href={`/dashboard/real-estate/captaciones/${captacion.id}`}>
                                  <Eye className="h-4 w-4" />
                                </Link>
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive"
                                title="Eliminar"
                                onClick={() => eliminar(captacion)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between px-6 py-4 border-t">
                <p className="text-sm text-muted-foreground">
                  Mostrando {Math.min((pagination.page - 1) * pagination.limit + 1, pagination.total)}–
                  {Math.min(pagination.page * pagination.limit, pagination.total)} de{' '}
                  <span className="font-medium">{formatearNumero(pagination.total)}</span> captaciones
                </p>

                {pagination.totalPages > 1 && (
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            if (pagination.page > 1) fetchCaptaciones(pagination.page - 1);
                          }}
                          className={pagination.page <= 1 ? 'pointer-events-none opacity-50' : ''}
                        />
                      </PaginationItem>

                      {getPageNumbers().map((pageNum, idx) =>
                        pageNum === 'ellipsis' ? (
                          <PaginationItem key={`ellipsis-${idx}`}>
                            <PaginationEllipsis />
                          </PaginationItem>
                        ) : (
                          <PaginationItem key={pageNum}>
                            <PaginationLink
                              href="#"
                              isActive={pageNum === pagination.page}
                              onClick={(e) => {
                                e.preventDefault();
                                fetchCaptaciones(pageNum);
                              }}
                            >
                              {pageNum}
                            </PaginationLink>
                          </PaginationItem>
                        )
                      )}

                      <PaginationItem>
                        <PaginationNext
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            if (pagination.page < pagination.totalPages) fetchCaptaciones(pagination.page + 1);
                          }}
                          className={
                            pagination.page >= pagination.totalPages ? 'pointer-events-none opacity-50' : ''
                          }
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Diálogo de alta */}
      <Dialog open={dialogoAbierto} onOpenChange={setDialogoAbierto}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSignature className="h-5 w-5 text-primary" />
              Nueva Captación
            </DialogTitle>
            <DialogDescription>
              Contrato de comercialización con el propietario de un inmueble. Los campos con * son obligatorios.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Inmueble y propietario */}
            <section className="space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                Inmueble y propietario
              </h4>

              <div>
                <Label>
                  Inmueble captado <span className="text-destructive">*</span>
                </Label>
                <Select value={form.propiedadId} onValueChange={seleccionarInmueble}>
                  <SelectTrigger>
                    <SelectValue
                      placeholder={cargandoCatalogos ? 'Cargando inmuebles...' : 'Seleccionar inmueble...'}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {inmuebles.map((inmueble) => (
                      <SelectItem key={inmueble.id} value={inmueble.id}>
                        {inmueble.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {catalogosCargados && inmuebles.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    No hay inmuebles en el catálogo todavía.
                  </p>
                )}
              </div>

              <div>
                <Label>Propietario (contacto del CRM)</Label>
                <Select
                  value={form.contactoPropietarioId || 'ninguno'}
                  onValueChange={(v) =>
                    setForm((prev) => ({ ...prev, contactoPropietarioId: v === 'ninguno' ? '' : v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar propietario..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ninguno">Sin vincular</SelectItem>
                    {contactos.map((contacto) => (
                      <SelectItem key={contacto.id} value={contacto.id}>
                        {contacto.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Se rellena solo si el inmueble ya tiene propietario vinculado en el CRM.
                </p>
              </div>
            </section>

            <Separator />

            {/* Contrato */}
            <section className="space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-primary" />
                Contrato
              </h4>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>
                    Tipo de captación <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={form.tipoCaptacion}
                    onValueChange={(v) =>
                      setForm((prev) => ({
                        ...prev,
                        tipoCaptacion: v as CaptacionTipo,
                        // La exclusividad es la esencia de la captación exclusiva:
                        // el interruptor la sigue salvo que el usuario lo toque.
                        esExclusiva: v === 'exclusiva',
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CAPTACION_TIPOS.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    {CAPTACION_TIPOS.find((t) => t.value === form.tipoCaptacion)?.descripcion}
                  </p>
                </div>

                <div>
                  <Label>Estado inicial</Label>
                  <Select
                    value={form.estado}
                    onValueChange={(v) => setForm((prev) => ({ ...prev, estado: v as CaptacionEstado }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="borrador">Borrador</SelectItem>
                      <SelectItem value="activa">Activa</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Un contrato nace en borrador hasta que el propietario firma.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>
                    Inicio <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="date"
                    value={form.fechaInicio}
                    onChange={(e) => setForm((prev) => ({ ...prev, fechaInicio: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>
                    Fin <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="date"
                    value={form.fechaFin}
                    onChange={(e) => setForm((prev) => ({ ...prev, fechaFin: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Fecha de firma</Label>
                  <Input
                    type="date"
                    value={form.fechaFirma}
                    onChange={(e) => setForm((prev) => ({ ...prev, fechaFirma: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Vencimiento previsto</Label>
                  <Input
                    type="date"
                    value={form.fechaVencimiento}
                    onChange={(e) => setForm((prev) => ({ ...prev, fechaVencimiento: e.target.value }))}
                  />
                </div>
              </div>
            </section>

            <Separator />

            {/* Exclusividad */}
            <section className="space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-indigo-500" />
                Exclusividad
              </h4>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="es-exclusiva" className="text-sm font-medium">
                    Contrato en exclusiva
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    La agencia es la única que comercializa el inmueble durante la vigencia.
                  </p>
                </div>
                <Switch
                  id="es-exclusiva"
                  checked={form.esExclusiva}
                  onCheckedChange={(v) => setForm((prev) => ({ ...prev, esExclusiva: v }))}
                />
              </div>

              {form.esExclusiva && (
                <div>
                  <Label>Cláusulas de exclusividad</Label>
                  <Textarea
                    value={form.clausulasExclusividad}
                    onChange={(e) => setForm((prev) => ({ ...prev, clausulasExclusividad: e.target.value }))}
                    placeholder="Condiciones pactadas: penalización por retirada, autorización de visitas, cartelería..."
                    rows={3}
                  />
                </div>
              )}
            </section>

            <Separator />

            {/* Precio y comisión */}
            <section className="space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Percent className="h-4 w-4 text-purple-500" />
                Precio y comisión
              </h4>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Precio de oferta</Label>
                  <Input
                    type="number"
                    value={form.precioOferta}
                    onChange={(e) => setForm((prev) => ({ ...prev, precioOferta: e.target.value }))}
                    placeholder="250000"
                  />
                </div>
                <div>
                  <Label>Precio mínimo aceptable</Label>
                  <Input
                    type="number"
                    value={form.precioMinimo}
                    onChange={(e) => setForm((prev) => ({ ...prev, precioMinimo: e.target.value }))}
                    placeholder="230000"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Comisión (%)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={form.comisionPorcentaje}
                    onChange={(e) => setForm((prev) => ({ ...prev, comisionPorcentaje: e.target.value }))}
                    placeholder="3"
                  />
                </div>
                <div>
                  <Label>Comisión fija</Label>
                  <Input
                    type="number"
                    value={form.comisionFija}
                    onChange={(e) => setForm((prev) => ({ ...prev, comisionFija: e.target.value }))}
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label>Divisa</Label>
                  <Select
                    value={form.comisionMoneda}
                    onValueChange={(v) => setForm((prev) => ({ ...prev, comisionMoneda: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Moneda" />
                    </SelectTrigger>
                    <SelectContent>
                      {MONEDAS_SELECCIONABLES.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-lg bg-muted/50 p-3 text-sm flex items-center justify-between">
                <span className="text-muted-foreground">Comisión estimada</span>
                <span className="font-semibold text-primary">
                  {form.precioOferta
                    ? formatearImporte(comisionPreview, monedaComision, 0)
                    : 'Indica un precio de oferta'}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div>
                  <Label>Condiciones de la comisión</Label>
                  <Textarea
                    value={form.comisionCondiciones}
                    onChange={(e) => setForm((prev) => ({ ...prev, comisionCondiciones: e.target.value }))}
                    placeholder="Cuándo se devenga y quién la paga"
                    rows={2}
                  />
                </div>
                <div>
                  <Label>Condiciones de pago</Label>
                  <Textarea
                    value={form.condicionesPago}
                    onChange={(e) => setForm((prev) => ({ ...prev, condicionesPago: e.target.value }))}
                    placeholder="Plazos y forma de pago pactados"
                    rows={2}
                  />
                </div>
              </div>
            </section>

            <Separator />

            {/* Notas */}
            <section className="space-y-3">
              <h4 className="text-sm font-semibold">Notas</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label>Para el cliente</Label>
                  <Textarea
                    value={form.notasCliente}
                    onChange={(e) => setForm((prev) => ({ ...prev, notasCliente: e.target.value }))}
                    rows={2}
                  />
                </div>
                <div>
                  <Label>Internas</Label>
                  <Textarea
                    value={form.notasInternas}
                    onChange={(e) => setForm((prev) => ({ ...prev, notasInternas: e.target.value }))}
                    rows={2}
                  />
                </div>
                <div>
                  <Label>Notas de comisión</Label>
                  <Textarea
                    value={form.comisionNotas}
                    onChange={(e) => setForm((prev) => ({ ...prev, comisionNotas: e.target.value }))}
                    rows={2}
                  />
                </div>
              </div>
            </section>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDialogoAbierto(false)}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={guardando}>
              {guardando ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creando...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Crear Captación
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
