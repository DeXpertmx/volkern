'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import Link from 'next/link';
import {
  Plus, Search, FileText, Eye, Download, Send, Filter,
  TrendingUp, Clock, CheckCircle, XCircle, RefreshCw,
  Building2, User, Calendar
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { DocumentPreview } from '@/components/document-preview';
import { DocumentTimeline, TimelineEvent } from '@/components/document-timeline';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

interface OrdenVenta {
  id: string;
  numero: string;
  estado: string;
  fechaOrden: string;
  fechaEntrega: string | null;
  subtotal: number;
  totalImpuestos: number;
  total: number;
  moneda: string;
  lead?: { id: string; nombre: string; email: string; empresa: string | null };
  contact?: { id: string; nombre: string; email: string; tipo: string };
  contrato?: { id: string; numero: string; titulo: string };
  cotizacion?: { id: string; numero: string; titulo: string };
  deal?: { id: string; titulo: string; valor: number };
  emisor?: { id: string; razonSocial: string; idFiscal: string };
  _count: { items: number };
}

const ESTADOS = [
  { value: 'borrador', label: 'Borrador', color: 'bg-gray-100 text-gray-800' },
  { value: 'pendiente', label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'confirmada', label: 'Confirmada', color: 'bg-blue-100 text-blue-800' },
  { value: 'en_proceso', label: 'En Proceso', color: 'bg-purple-100 text-purple-800' },
  { value: 'completada', label: 'Completada', color: 'bg-green-100 text-green-800' },
  { value: 'cancelada', label: 'Cancelada', color: 'bg-red-100 text-red-800' },
];

export default function OrdenesVentaPage() {
  const router = useRouter();
  const [ordenes, setOrdenes] = useState<OrdenVenta[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEstado, setFilterEstado] = useState<string>('all');
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [selectedOrden, setSelectedOrden] = useState<OrdenVenta | null>(null);
  const [isQuickViewOpen, setIsQuickViewOpen] = useState(false);

  // Estadísticas
  const [stats, setStats] = useState({
    total: 0,
    pendientes: 0,
    completadas: 0,
    valorTotal: 0,
  });

  useEffect(() => {
    fetchOrdenes();
  }, [pagination.page, filterEstado]);

  const fetchOrdenes = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      });
      if (filterEstado !== 'all') params.set('estado', filterEstado);
      if (searchTerm) params.set('search', searchTerm);

      const res = await fetch(`/api/ordenes-venta?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setOrdenes(data.ordenes || []);
        setPagination(prev => ({
          ...prev,
          total: data.pagination?.total || 0,
          totalPages: data.pagination?.totalPages || 0,
        }));

        // Calcular estadísticas
        const allOrdenes = data.ordenes || [];
        setStats({
          total: data.pagination?.total || 0,
          pendientes: allOrdenes.filter((o: OrdenVenta) => ['pendiente', 'confirmada', 'en_proceso'].includes(o.estado)).length,
          completadas: allOrdenes.filter((o: OrdenVenta) => o.estado === 'completada').length,
          valorTotal: allOrdenes.reduce((sum: number, o: OrdenVenta) => sum + o.total, 0),
        });
      }
    } catch (error) {
      toast.error('Error al cargar órdenes');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPagination(prev => ({ ...prev, page: 1 }));
    fetchOrdenes();
  };

  const getTimelineEvents = (orden: OrdenVenta): TimelineEvent[] => {
    const events: TimelineEvent[] = [
      {
        id: '1',
        type: 'created',
        date: format(new Date(orden.fechaOrden), 'dd MMM yyyy', { locale: es }),
        description: 'Orden de venta registrada',
        user: 'Sistema'
      }
    ];

    if (orden.estado === 'confirmada') {
      events.push({
        id: '2',
        type: 'accepted',
        date: 'Confirmado',
        description: 'Orden confirmada por el departamento de ventas',
      });
    }

    if (orden.estado === 'en_proceso') {
      events.push({
        id: '3',
        type: 'viewed',
        date: 'En curso',
        description: 'La orden está siendo procesada / preparada',
      });
    }

    if (orden.estado === 'completada') {
      events.push({
        id: '4',
        type: 'accepted',
        date: 'Finalizado',
        description: 'Orden entregada y completada satisfactoriamente',
      });
    }

    return events.reverse();
  };

  const getEstadoBadge = (estado: string) => {
    const config = ESTADOS.find(e => e.value === estado);
    return config ? (
      <Badge className={config.color}>{config.label}</Badge>
    ) : (
      <Badge variant="outline">{estado}</Badge>
    );
  };

  const formatCurrency = (amount: number, currency: string = 'EUR') => {
    const symbols: Record<string, string> = {
      EUR: '€', USD: '$', MXN: '$', CLP: '$', ARS: '$', COP: '$', PEN: 'S/', GBP: '£'
    };
    return `${symbols[currency] || '$'}${amount.toLocaleString('es-ES', { minimumFractionDigits: 2 })}`;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <FileText className="h-8 w-8 text-primary" />
            Órdenes de Venta
          </h1>
          <p className="text-muted-foreground mt-1">
            Gestiona las órdenes de venta y su seguimiento
          </p>
        </div>
        <Link href="/dashboard/ventas/ordenes/nueva">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Nueva Orden
          </Button>
        </Link>
      </div>

      {/* Stats Cards */}
      {/* Stats Cards Premium */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="glass-card hover:scale-105 transition-all duration-300 premium-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Órdenes</p>
                <p className="text-3xl font-bold mt-1 tracking-tight">{stats.total}</p>
              </div>
              <div className="h-12 w-12 bg-blue-100/50 rounded-xl flex items-center justify-center">
                <FileText className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card hover:scale-105 transition-all duration-300 premium-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Pendientes</p>
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
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Completadas</p>
                <p className="text-3xl font-bold mt-1 text-emerald-600 tracking-tight">{stats.completadas}</p>
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
                <p className="text-sm font-medium text-white/80 uppercase tracking-wider">Valor Total</p>
                <p className="text-2xl font-bold mt-1 tracking-tight truncate">{formatCurrency(stats.valorTotal)}</p>
              </div>
              <div className="h-12 w-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                <TrendingUp className="h-6 w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSearch} className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por número, cliente..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filterEstado} onValueChange={setFilterEstado}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                {ESTADOS.map(e => (
                  <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" variant="secondary">
              <Filter className="h-4 w-4 mr-2" />
              Filtrar
            </Button>
            <Button type="button" variant="outline" onClick={fetchOrdenes}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Items</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Relacionado</TableHead>
                <TableHead className="w-[120px]">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Cargando...
                  </TableCell>
                </TableRow>
              ) : ordenes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No hay órdenes de venta
                  </TableCell>
                </TableRow>
              ) : (
                ordenes.map((orden) => (
                  <TableRow
                    key={orden.id}
                    className="cursor-pointer hover:bg-muted/50 border-l-2 border-transparent hover:border-l-primary transition-all animate-fade-in"
                    onClick={() => {
                      setSelectedOrden(orden);
                      setIsQuickViewOpen(true);
                    }}
                  >
                    <TableCell>
                      <Link href={`/dashboard/ventas/ordenes/${orden.id}`} className="font-medium text-primary hover:underline">
                        {orden.numero}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {orden.lead ? (
                          <>
                            <User className="h-4 w-4 text-blue-500" />
                            <div>
                              <p className="font-medium">{orden.lead.nombre}</p>
                              <p className="text-xs text-muted-foreground">{orden.lead.empresa || orden.lead.email}</p>
                            </div>
                          </>
                        ) : orden.contact ? (
                          <>
                            <Building2 className="h-4 w-4 text-green-500" />
                            <div>
                              <p className="font-medium">{orden.contact.nombre}</p>
                              <p className="text-xs text-muted-foreground">{orden.contact.email}</p>
                            </div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p>{format(new Date(orden.fechaOrden), 'dd/MM/yyyy', { locale: es })}</p>
                        {orden.fechaEntrega && (
                          <p className="text-xs text-muted-foreground">
                            Entrega: {format(new Date(orden.fechaEntrega), 'dd/MM/yyyy', { locale: es })}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{orden._count.items} items</Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(orden.total, orden.moneda)}
                    </TableCell>
                    <TableCell>{getEstadoBadge(orden.estado)}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {orden.cotizacion && (
                          <Link href={`/dashboard/cotizaciones/${orden.cotizacion.id}`} className="text-xs text-blue-600 hover:underline">
                            COT: {orden.cotizacion.numero}
                          </Link>
                        )}
                        {orden.contrato && (
                          <Link href={`/dashboard/contratos/${orden.contrato.id}`} className="text-xs text-purple-600 hover:underline">
                            CONT: {orden.contrato.numero}
                          </Link>
                        )}
                        {orden.deal && (
                          <Link href={`/dashboard/pipeline/${orden.deal.id}`} className="text-xs text-green-600 hover:underline">
                            Deal: {orden.deal.titulo}
                          </Link>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Link href={`/dashboard/ventas/ordenes/${orden.id}`}>
                          <Button variant="ghost" size="icon">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Button variant="ghost" size="icon">
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon">
                          <Send className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          <Button
            variant="outline"
            disabled={pagination.page === 1}
            onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
          >
            Anterior
          </Button>
          <span className="flex items-center px-4">
            Página {pagination.page} de {pagination.totalPages}
          </span>
          <Button
            variant="outline"
            disabled={pagination.page === pagination.totalPages}
            onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
          >
            Siguiente
          </Button>
        </div>
      )}

      {/* Quick View Sheet */}
      <Sheet open={isQuickViewOpen} onOpenChange={setIsQuickViewOpen}>
        <SheetContent className="sm:max-w-3xl overflow-y-auto bg-muted/20 border-l-none p-0">
          {selectedOrden && (
            <div className="flex flex-col h-full">
              <div className="p-6 bg-background border-b flex items-center justify-between sticky top-0 z-20">
                <div>
                  <Badge variant="outline" className="font-mono mb-1">{selectedOrden.numero}</Badge>
                  <SheetTitle className="text-xl">Orden de Venta</SheetTitle>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(`/dashboard/ventas/ordenes/${selectedOrden.id}`)}
                  >
                    Editar <FileText className="h-4 w-4 ml-2" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setIsQuickViewOpen(false)}>
                    <XCircle className="h-5 w-5" />
                  </Button>
                </div>
              </div>

              <div className="flex-1 p-6">
                <Tabs defaultValue="preview" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 mb-6">
                    <TabsTrigger value="preview">Vista Previa</TabsTrigger>
                    <TabsTrigger value="history">Estado y Seguimiento</TabsTrigger>
                  </TabsList>

                  <TabsContent value="preview" className="mt-0">
                    <div className="scale-[0.85] origin-top border shadow-inner rounded-xl overflow-hidden bg-white">
                      <DocumentPreview
                        title="Orden de Venta"
                        number={selectedOrden.numero}
                        date={format(new Date(selectedOrden.fechaOrden), 'dd/MM/yyyy')}
                        emisor={{
                          razonSocial: 'Volkern Hub',
                          idFiscal: 'VKL-2024-X',
                        }}
                        cliente={{
                          nombre: selectedOrden.lead?.nombre || selectedOrden.contact?.nombre || 'Cliente',
                          idFiscal: selectedOrden.lead?.email || selectedOrden.contact?.email,
                        }}
                        items={[]} // En el listado no suelen venir items, el preview manejará el estado vacío elegante
                        totals={{
                          subtotal: selectedOrden.subtotal,
                          impuesto: selectedOrden.totalImpuestos,
                          total: selectedOrden.total,
                          currency: selectedOrden.moneda,
                        }}
                        notas="Entrega estimada: "
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="history" className="mt-0 bg-background rounded-xl border p-8">
                    <h4 className="font-bold text-lg mb-6 flex items-center gap-2">
                      <Clock className="h-5 w-5 text-primary" /> Seguimiento de la Orden
                    </h4>
                    <DocumentTimeline events={getTimelineEvents(selectedOrden)} />
                  </TabsContent>
                </Tabs>
              </div>

              <div className="p-6 bg-background border-t mt-auto sticky bottom-0 z-20">
                <Button className="w-full premium-gradient-primary border-none shadow-lg h-12 text-lg" onClick={() => router.push(`/dashboard/ventas/ordenes/${selectedOrden.id}`)}>
                  Gestionar Orden
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
