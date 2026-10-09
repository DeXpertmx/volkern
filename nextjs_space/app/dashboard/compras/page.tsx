'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  CheckCircle, ClipboardList, Clock, Eye, Filter, Loader2, PackageOpen, Plus,
  RefreshCw, Search, Sparkles, TrendingUp, Trash2,
} from 'lucide-react';
import { calcularTotales, type EstadoCompra } from '@/lib/compras/reglas';
import { formatearImporte } from '@/lib/moneda';
import { useMonedaTenant } from '@/lib/use-moneda-tenant';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

/** Colores del estado, para que el ciclo se lea de un vistazo. */
const ESTILO_ESTADO: Record<string, string> = {
  borrador: 'bg-slate-100 text-slate-700',
  enviada: 'bg-sky-100 text-sky-700',
  parcial: 'bg-amber-100 text-amber-800',
  recibida: 'bg-emerald-100 text-emerald-700',
  cancelada: 'bg-rose-100 text-rose-700',
};

const FILTROS: Array<{ id: 'todas' | EstadoCompra; label: string }> = [
  { id: 'todas', label: 'Todos' },
  { id: 'borrador', label: 'Borradores' },
  { id: 'enviada', label: 'Enviados' },
  { id: 'parcial', label: 'Parciales' },
  { id: 'recibida', label: 'Recibidos' },
  { id: 'cancelada', label: 'Cancelados' },
];

function NuevoPedidoDialog({
  abierto,
  onCerrar,
  onCreado,
}: {
  abierto: boolean;
  onCerrar: () => void;
  onCreado: () => void;
}) {
  const router = useRouter();
  const moneda = useMonedaTenant();

  const [guardando, setGuardando] = useState(false);
  const [proveedorId, setProveedorId] = useState('');
  const [almacenId, setAlmacenId] = useState('');
  const [fechaEntrega, setFechaEntrega] = useState('');
  const [notas, setNotas] = useState('');
  const [lineas, setLineas] = useState<LineaForm[]>([lineaVacia()]);
  const [cargandoSugerencias, setCargandoSugerencias] = useState(false);

  // Los catálogos solo se piden cuando el formulario está abierto: no tiene
  // sentido cargar proveedores y almacenes para mirar una lista de pedidos.
  const { data: proveedores } = useSWR<any[]>(abierto ? '/api/erp/suppliers' : null, fetcher);
  const { data: almacenes } = useSWR<any[]>(abierto ? '/api/erp/warehouses' : null, fetcher);
  const { data: catalogoBruto } = useSWR<any>(abierto ? '/api/catalogo?limit=200' : null, fetcher);
  const catalogo: any[] = Array.isArray(catalogoBruto)
    ? catalogoBruto
    : catalogoBruto?.items ?? catalogoBruto?.data ?? [];

  const totales = useMemo(
    () =>
      calcularTotales(
        lineas
          .filter((l) => l.concepto.trim() && Number(l.cantidad) > 0)
          .map((l) => ({
            cantidad: Number(l.cantidad),
            precioUnitario: Number(l.precioUnitario) || 0,
            porcentajeImpuesto: Number(l.porcentajeImpuesto) || 0,
          }))
      ),
    [lineas]
  );

  const lineasValidas = lineas.filter((l) => l.concepto.trim() && Number(l.cantidad) > 0);

  function actualizarLinea(key: string, cambios: Partial<LineaForm>) {
    setLineas((prev) => prev.map((l) => (l.key === key ? { ...l, ...cambios } : l)));
  }

  /** Elegir un artículo del catálogo trae su nombre y su último coste conocido. */
  function elegirArticulo(key: string, catalogoItemId: string) {
    const item = catalogo.find((c) => c.id === catalogoItemId);
    actualizarLinea(key, {
      catalogoItemId,
      ...(item
        ? {
            concepto: item.nombre ?? '',
            precioUnitario: String(item.costOfAcquisition || item.precioBase || ''),
          }
        : {}),
    });
  }

  /**
   * Trae los artículos por debajo de su punto de pedido y los añade como
   * líneas: el operador revisa cantidades y precios antes de crear el pedido.
   */
  async function cargarSugerencias() {
    setCargandoSugerencias(true);
    try {
      const res = await fetch('/api/compras/sugerencias');
      const cuerpo = await res.json();
      if (!res.ok) {
        toast.error(cuerpo.error ?? 'No se pudieron cargar las sugerencias');
        return;
      }
      const sugerencias: any[] = cuerpo.sugerencias ?? [];
      if (sugerencias.length === 0) {
        toast('Ahora mismo no hay artículos por debajo de su punto de pedido');
        return;
      }
      const nuevas: LineaForm[] = sugerencias.map((s) => ({
        key: Math.random().toString(36).slice(2),
        catalogoItemId: s.catalogoItemId,
        concepto: s.nombre,
        cantidad: String(s.cantidadSugerida),
        precioUnitario: String(s.precioUnitario || ''),
        porcentajeImpuesto: '21',
      }));
      setLineas((prev) => [...prev.filter((l) => l.concepto.trim() || l.catalogoItemId), ...nuevas]);
      if (!almacenId && sugerencias[0]?.almacenId) setAlmacenId(sugerencias[0].almacenId);
      toast.success(`${nuevas.length} ${nuevas.length === 1 ? 'artículo añadido' : 'artículos añadidos'} desde las alertas de stock`);
    } catch {
      toast.error('No se pudieron cargar las sugerencias');
    } finally {
      setCargandoSugerencias(false);
    }
  }

  function cerrarDialogo() {
    setProveedorId('');
    setAlmacenId('');
    setFechaEntrega('');
    setNotas('');
    setLineas([lineaVacia()]);
    onCerrar();
  }

  async function crearPedido() {
    if (lineasValidas.length === 0) {
      toast.error('Añade al menos una línea con concepto y cantidad');
      return;
    }
    setGuardando(true);
    try {
      const res = await fetch('/api/compras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proveedorId: proveedorId || null,
          almacenId: almacenId || null,
          notas: notas || null,
          fechaEntrega: fechaEntrega ? new Date(fechaEntrega).toISOString() : null,
          items: lineasValidas.map((l) => ({
            catalogoItemId: l.catalogoItemId || null,
            concepto: l.concepto.trim(),
            cantidad: Number(l.cantidad),
            precioUnitario: Number(l.precioUnitario) || 0,
            porcentajeImpuesto: Number(l.porcentajeImpuesto) || 0,
          })),
        }),
      });
      const cuerpo = await res.json();
      if (!res.ok) {
        toast.error(cuerpo.error ?? 'No se pudo crear el pedido');
        return;
      }
      toast.success(`Pedido ${cuerpo.compra.numero} creado en borrador`);
      onCreado();
      cerrarDialogo();
      router.push(`/dashboard/compras/${cuerpo.compra.id}`);
    } catch {
      toast.error('No se pudo crear el pedido');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={(v) => (v ? undefined : cerrarDialogo())}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo pedido a proveedor</DialogTitle>
          <DialogDescription>
            Se crea en borrador: podrás revisarlo antes de enviarlo. Los artículos de almacén entran en existencias al recibir.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <Label htmlFor="proveedor">Proveedor</Label>
            <select
              id="proveedor"
              value={proveedorId}
              onChange={(e) => setProveedorId(e.target.value)}
              className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Sin proveedor</option>
              {(proveedores ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="almacen">Almacén de entrada</Label>
            <select
              id="almacen"
              value={almacenId}
              onChange={(e) => setAlmacenId(e.target.value)}
              className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Almacén central</option>
              {(almacenes ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="entrega">Entrega prevista</Label>
            <Input
              id="entrega"
              type="date"
              value={fechaEntrega}
              onChange={(e) => setFechaEntrega(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Líneas del pedido</p>
          <Button variant="outline" size="sm" onClick={cargarSugerencias} disabled={cargandoSugerencias}>
            {cargandoSugerencias ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-2" />}
            Añadir sugerencias de stock
          </Button>
        </div>

        <div className="space-y-2">
          {lineas.map((linea) => (
            <div key={linea.key} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-12 sm:col-span-4">
                <Label className="text-xs">Artículo (opcional)</Label>
                <select
                  value={linea.catalogoItemId}
                  onChange={(e) => elegirArticulo(linea.key, e.target.value)}
                  className="mt-1 w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">Sin artículo de almacén</option>
                  {catalogo.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-12 sm:col-span-3">
                <Label className="text-xs">Concepto</Label>
                <Input
                  value={linea.concepto}
                  onChange={(e) => actualizarLinea(linea.key, { concepto: e.target.value })}
                  className="mt-1 h-9"
                  placeholder="Qué se compra"
                  aria-label="Concepto"
                />
              </div>
              <div className="col-span-4 sm:col-span-1">
                <Label className="text-xs">Cant.</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={linea.cantidad}
                  onChange={(e) => actualizarLinea(linea.key, { cantidad: e.target.value })}
                  className="mt-1 h-9"
                  aria-label="Cantidad"
                />
              </div>
              <div className="col-span-4 sm:col-span-2">
                <Label className="text-xs">Precio ud.</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={linea.precioUnitario}
                  onChange={(e) => actualizarLinea(linea.key, { precioUnitario: e.target.value })}
                  className="mt-1 h-9"
                  aria-label="Precio unitario"
                />
              </div>
              <div className="col-span-3 sm:col-span-1">
                <Label className="text-xs">IVA %</Label>
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  value={linea.porcentajeImpuesto}
                  onChange={(e) => actualizarLinea(linea.key, { porcentajeImpuesto: e.target.value })}
                  className="mt-1 h-9"
                  aria-label="IVA"
                />
              </div>
              <div className="col-span-1 flex justify-end">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setLineas((prev) => (prev.length === 1 ? [lineaVacia()] : prev.filter((l) => l.key !== linea.key)))}
                  aria-label="Quitar línea"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setLineas((prev) => [...prev, lineaVacia()])}>
            <Plus className="h-3.5 w-3.5 mr-2" /> Añadir línea
          </Button>
        </div>

        <div className="flex flex-wrap justify-end gap-6 text-sm bg-muted/50 rounded-lg p-3">
          <span className="text-muted-foreground">
            Base: <strong className="text-foreground">{formatearImporte(totales.subtotal, moneda)}</strong>
          </span>
          <span className="text-muted-foreground">
            IVA: <strong className="text-foreground">{formatearImporte(totales.totalImpuestos, moneda)}</strong>
          </span>
          <span className="text-muted-foreground">
            Total: <strong className="text-foreground">{formatearImporte(totales.total, moneda)}</strong>
          </span>
        </div>

        <div>
          <Label htmlFor="notas">Notas</Label>
          <Textarea
            id="notas"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            className="mt-1"
            placeholder="Condiciones, plazos, referencia del proveedor…"
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={cerrarDialogo}>
            Cancelar
          </Button>
          <Button onClick={crearPedido} disabled={guardando || lineasValidas.length === 0}>
            {guardando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Crear pedido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface LineaForm {
  key: string;
  catalogoItemId: string;
  concepto: string;
  cantidad: string;
  precioUnitario: string;
  porcentajeImpuesto: string;
}

function lineaVacia(): LineaForm {
  return {
    key: Math.random().toString(36).slice(2),
    catalogoItemId: '',
    concepto: '',
    cantidad: '1',
    precioUnitario: '',
    porcentajeImpuesto: '21',
  };
}

export default function PedidosCompraPage() {
  const moneda = useMonedaTenant();

  const [filtro, setFiltro] = useState<'todas' | EstadoCompra>('todas');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [nuevoAbierto, setNuevoAbierto] = useState(false);

  const { data, isLoading, mutate } = useSWR<any>(
    `/api/compras?limit=100${filtro === 'todas' ? '' : `&estado=${filtro}`}${search ? `&search=${encodeURIComponent(search)}` : ''}`,
    fetcher
  );
  // Identidad estable: el memo de KPIs depende de este array y, sin el
  // useMemo, se recalcularía en cada render.
  const compras = useMemo<any[]>(() => data?.compras ?? [], [data?.compras]);

  // KPIs sobre el conjunto cargado: pendientes de recibir es el indicador que
  // mira a almacén, recibidos el que ya cerró el ciclo e importe el compromiso
  // con proveedores. Se recalculan solo cuando cambia la lista.
  const stats = useMemo(() => {
    const pedidos = compras.length;
    const pendientes = compras.filter(
      (c) => Number(c.pendiente) > 0 && ['enviada', 'parcial'].includes(c.estado)
    ).length;
    const recibidos = compras.filter((c) => c.estado === 'recibida').length;
    const importe = compras.reduce((acc, c) => acc + (Number(c.total) || 0), 0);
    return { pedidos, pendientes, recibidos, importe };
  }, [compras]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput.trim());
  };

  return (
    <div className="space-y-6">
      {/* Cabecera de acciones */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Un pedido nace en borrador, se envía al proveedor y se cierra registrando la mercancía que entra.
        </p>
        <Button onClick={() => setNuevoAbierto(true)}>
          <Plus className="h-4 w-4 mr-2" /> Nuevo pedido
        </Button>
      </div>

      {/* KPIs premium */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="glass-card hover:scale-105 transition-all duration-300 premium-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Pedidos</p>
                <p className="text-3xl font-bold mt-1 tracking-tight">{data?.total ?? stats.pedidos}</p>
              </div>
              <div className="h-12 w-12 bg-blue-100/50 rounded-xl flex items-center justify-center">
                <ClipboardList className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card hover:scale-105 transition-all duration-300 premium-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Por recibir</p>
                <p className="text-3xl font-bold mt-1 text-amber-600 tracking-tight">{stats.pendientes}</p>
              </div>
              <div className="h-12 w-12 bg-amber-100/50 rounded-xl flex items-center justify-center">
                <Clock className="h-6 w-6 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card hover:scale-105 transition-all duration-300 premium-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Recibidos</p>
                <p className="text-3xl font-bold mt-1 text-emerald-600 tracking-tight">{stats.recibidos}</p>
              </div>
              <div className="h-12 w-12 bg-emerald-100/50 rounded-xl flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="premium-gradient-primary hover:scale-105 transition-all duration-300 shadow-lg border-none text-white">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white/80 uppercase tracking-wider">Importe</p>
                <p className="text-2xl font-bold mt-1 tracking-tight truncate">
                  {formatearImporte(stats.importe, moneda)}
                </p>
              </div>
              <div className="h-12 w-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                <TrendingUp className="h-6 w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSearch} className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[220px] relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por número, proveedor o notas..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filtro} onValueChange={(v) => setFiltro(v as 'todas' | EstadoCompra)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                {FILTROS.map((f) => (
                  <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" variant="secondary">
              <Filter className="h-4 w-4 mr-2" /> Filtrar
            </Button>
            <Button type="button" variant="outline" onClick={() => mutate()} title="Recargar">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Tabla */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" /> Pedidos a proveedor
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Entrega</TableHead>
                <TableHead>Almacén</TableHead>
                <TableHead>Líneas</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-[80px]">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8">
                    <span className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Cargando pedidos…
                    </span>
                  </TableCell>
                </TableRow>
              ) : compras.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <PackageOpen className="h-10 w-10 opacity-40" />
                      <p>Todavía no hay pedidos{filtro === 'todas' ? '' : ' en este estado'}</p>
                      <Button variant="outline" size="sm" className="mt-2" onClick={() => setNuevoAbierto(true)}>
                        <Plus className="h-4 w-4 mr-2" /> Crear el primero
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                compras.map((compra) => (
                  <TableRow
                    key={compra.id}
                    className="cursor-pointer hover:bg-muted/50 border-l-2 border-transparent hover:border-l-primary transition-all animate-fade-in"
                  >
                    <TableCell>
                      <Link href={`/dashboard/compras/${compra.id}`} className="font-medium text-primary hover:underline">
                        {compra.numero}
                      </Link>
                    </TableCell>
                    <TableCell className="font-medium">{compra.proveedor?.name ?? 'Sin proveedor'}</TableCell>
                    <TableCell>{new Date(compra.fechaPedido).toLocaleDateString('es-ES')}</TableCell>
                    <TableCell>
                      {compra.fechaEntrega ? (
                        new Date(compra.fechaEntrega).toLocaleDateString('es-ES')
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {compra.almacen?.name ?? <span className="text-muted-foreground">Central</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant="outline">
                          {compra.items.length} {compra.items.length === 1 ? 'línea' : 'líneas'}
                        </Badge>
                        {Number(compra.pendiente) > 0 && (
                          <span className="text-xs text-amber-700">faltan {compra.pendiente}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatearImporte(compra.total, compra.moneda || moneda)}
                    </TableCell>
                    <TableCell>
                      <Badge className={`${ESTILO_ESTADO[compra.estado] ?? 'bg-muted'} border-none text-[10px] font-bold uppercase`}>
                        {compra.estadoEtiqueta}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Link href={`/dashboard/compras/${compra.id}`} aria-label={`Ver ${compra.numero}`}>
                        <Button variant="ghost" size="icon">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <NuevoPedidoDialog
        abierto={nuevoAbierto}
        onCerrar={() => setNuevoAbierto(false)}
        onCreado={() => mutate()}
      />
    </div>
  );
}
