'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ArrowLeft, Clock, FileText, Download, Send, Edit } from 'lucide-react';
import { DocumentPreview } from '@/components/document-preview';
import { DocumentTimeline, TimelineEvent } from '@/components/document-timeline';

interface ItemOrden {
  id: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  total: number;
}

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
  emisor?: { id: string; razonSocial: string; idFiscal: string };
  items: ItemOrden[];
}

export default function OrdenDetallePage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [orden, setOrden] = useState<OrdenVenta | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) fetchOrden();
  }, [id]);

  const fetchOrden = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/ordenes-venta/${id}`);
      if (res.ok) {
        const data = await res.json();
        setOrden(data);
      } else {
        toast.error('Error al cargar la orden');
        router.push('/dashboard/ventas/ordenes');
      }
    } catch (error) {
      toast.error('Error interno al cargar la orden');
      router.push('/dashboard/ventas/ordenes');
    } finally {
      setLoading(false);
    }
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

    if (orden.estado === 'confirmada' || orden.estado === 'completada' || orden.estado === 'en_proceso') {
      events.push({
        id: '2',
        type: 'accepted',
        date: 'Aceptado',
        description: 'Orden confirmada',
      });
    }

    if (orden.estado === 'en_proceso' || orden.estado === 'completada') {
      events.push({
        id: '3',
        type: 'viewed',
        date: 'En proceso',
        description: 'La orden está siendo procesada',
      });
    }

    if (orden.estado === 'completada') {
      events.push({
        id: '4',
        type: 'accepted',
        date: 'Completada',
        description: 'Orden finalizada y entregada',
      });
    }

    return events.reverse();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!orden) return null;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header Panel */}
      <div className="flex items-center justify-between border-b pb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/ventas/ordenes')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">Orden de Venta</h1>
              <Badge variant="outline" className="text-lg font-mono">{orden.numero}</Badge>
            </div>
            <p className="text-muted-foreground mt-1">
              {orden.lead?.nombre || orden.contact?.nombre || 'Cliente sin nombre'} - Creado el {format(new Date(orden.fechaOrden), 'dd/MM/yyyy')}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Edit className="h-4 w-4 mr-2" /> Editar
          </Button>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" /> PDF
          </Button>
          <Button className="premium-gradient-primary border-none shadow-md">
            <Send className="h-4 w-4 mr-2" /> Enviar
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Side: Document Preview Extenso */}
        <div className="md:col-span-2">
          <Card className="glass-card shadow-sm border p-6 bg-white overflow-x-auto min-h-[800px]">
            <DocumentPreview
              title="Orden de Venta"
              number={orden.numero}
              date={format(new Date(orden.fechaOrden), 'dd/MM/yyyy')}
              emisor={{
                razonSocial: orden.emisor?.razonSocial || 'Volkern Hub',
                idFiscal: orden.emisor?.idFiscal || 'VKL-2024-X',
              }}
              cliente={{
                nombre: orden.lead?.nombre || orden.contact?.nombre || 'Cliente',
                idFiscal: orden.lead?.empresa || orden.contact?.email || 'N/A',
              }}
              items={orden.items.map(item => ({
                descripcion: item.descripcion,
                cantidad: item.cantidad,
                precio: item.precioUnitario,
                total: item.total
              }))}
              totals={{
                subtotal: orden.subtotal,
                impuesto: orden.totalImpuestos,
                total: orden.total,
                currency: orden.moneda,
              }}
              notas={orden.fechaEntrega ? `Entrega estimada: ${format(new Date(orden.fechaEntrega), 'dd/MM/yyyy')}` : "Gracias por su compra."}
            />
          </Card>
        </div>

        {/* Right Side: Sidebar Info & Timeline */}
        <div className="space-y-6">
          {/* Status Box */}
          <Card className="premium-shadow">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Estado de la Orden</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <Badge className="text-md py-1 px-3 bg-primary/20 text-primary uppercase">{orden.estado}</Badge>
              </div>
            </CardContent>
          </Card>

          {/* Timeline Box */}
          <Card className="premium-shadow h-auto">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" /> Historial y Seguimiento
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              <DocumentTimeline events={getTimelineEvents(orden)} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// Re-using Card components implicitly
const Card = ({ className, children }: { className?: string, children: React.ReactNode }) => (
  <div className={`rounded-xl border bg-card text-card-foreground shadow-sm ${className || ''}`}>
    {children}
  </div>
);
const CardHeader = ({ className, children }: { className?: string, children: React.ReactNode }) => (
  <div className={`flex flex-col space-y-1.5 p-6 ${className || ''}`}>{children}</div>
);
const CardTitle = ({ className, children }: { className?: string, children: React.ReactNode }) => (
  <h3 className={`font-semibold leading-none tracking-tight ${className || ''}`}>{children}</h3>
);
const CardContent = ({ className, children }: { className?: string, children: React.ReactNode }) => (
  <div className={`p-6 pt-0 ${className || ''}`}>{children}</div>
);
