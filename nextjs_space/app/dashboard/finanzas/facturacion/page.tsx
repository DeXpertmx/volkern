'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
  Receipt, 
  Search, 
  ExternalLink, 
  CheckCircle2, 
  AlertCircle, 
  Clock,
  ShieldCheck,
  Building2,
  FileText,
  Plus,
  User,
  FileSignature,
  Euro
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { ManualInvoiceModal } from '@/components/finance/ManualInvoiceModal';

interface OrdenPendiente {
  id: string;
  numero: string;
  estado: string;
  fechaOrden: string;
  total: number;
  moneda: string;
  lead?: { nombre: string; empresa: string | null };
  contact?: { nombre: string; email: string };
  _count: { items: number };
}

export default function MesaFacturacionPage() {
  const [ordenes, setOrdenes] = useState<OrdenPendiente[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('pendientes');
  const [manualModalOpen, setManualModalOpen] = useState(false);
  
  // Estado para listado de facturas manuales
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [invoiceSearch, setInvoiceSearch] = useState('');

  useEffect(() => {
    if (activeTab === 'pendientes' || activeTab === 'facturadas') {
      fetchOrdenes();
    }
  }, [activeTab]);

  const fetchOrdenes = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/ordenes-venta?estado=${activeTab === 'pendientes' ? 'pendiente_finanzas' : 'facturada'}`);
      if (res.ok) {
        const data = await res.json();
        setOrdenes(data.ordenes || []);
      }
    } catch (error) {
      toast.error('Error al cargar órdenes');
    } finally {
      setLoading(false);
    }
  };
  
  const fetchInvoices = async () => {
    try {
      setLoadingInvoices(true);
      const params = new URLSearchParams();
      if (invoiceSearch) params.set('search', invoiceSearch);
      const res = await fetch(`/api/invoices?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setInvoices(data.invoices || []);
      }
    } catch (error) {
      toast.error('Error al cargar facturas');
    } finally {
      setLoadingInvoices(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'todas') {
      fetchInvoices();
    }
  }, [invoiceSearch, activeTab]);

  const handleFacturar = async (id: string, numero: string) => {
    try {
      setProcessingId(id);
      const res = await fetch(`/api/ordenes-venta/${id}/facturar`, {
        method: 'POST'
      });

      if (res.ok) {
        toast.success(`Factura ${numero} generada y sellada con éxito`);
        fetchOrdenes();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Error al procesar facturación');
      }
    } catch (error) {
      toast.error('Error de red al facturar');
    } finally {
      setProcessingId(null);
    }
  };

  const formatCurrency = (amount: number, currency: string = 'EUR') => {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(amount);
  };

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight uppercase flex items-center gap-3">
            <Receipt className="h-10 w-10 text-primary" />
            Mesa de Facturación
          </h1>
          <p className="text-muted-foreground font-medium mt-1">
            Revisión y emisión de facturas legales para órdenes confirmadas por Ventas.
          </p>
        </div>
        <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl flex items-center gap-4">
          <div className="h-12 w-12 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-emerald-800 uppercase tracking-widest">Gobernanza Activa</p>
            <p className="text-sm font-bold text-emerald-900 leading-tight">Canal Veri*factu Conectado</p>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <Card className="border-none shadow-xl bg-white overflow-hidden">
        <CardHeader className="border-b bg-slate-50/50">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div>
                <CardTitle>Cola de Revisión Financiera</CardTitle>
                <CardDescription>
                  Gestiona y valida los flujos de facturación legal.
                </CardDescription>
              </div>
              <ManualInvoiceModal 
                open={manualModalOpen} 
                onOpenChange={setManualModalOpen}
                onSuccess={() => {
                  if (activeTab === 'todas') fetchInvoices();
                }}
              />
            </div>
            
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-auto">
              <TabsList className="bg-slate-100 rounded-xl p-1">
                <TabsTrigger value="pendientes" className="rounded-lg px-4 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                  Pendientes {activeTab === 'pendientes' && ordenes.length > 0 && `(${ordenes.length})`}
                </TabsTrigger>
                <TabsTrigger value="facturadas" className="rounded-lg px-4 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                  Facturadas
                </TabsTrigger>
                <TabsTrigger value="todas" className="rounded-lg px-4 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                  <FileText className="h-3.5 w-3.5 mr-1.5" />
                  Todas
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/30">
              <TableRow>
                <TableHead className="w-[150px] font-bold uppercase text-[10px]">Referencia</TableHead>
                <TableHead className="font-bold uppercase text-[10px]">Cliente / Empresa</TableHead>
                <TableHead className="font-bold uppercase text-[10px]">Fecha Solicitud</TableHead>
                <TableHead className="font-bold uppercase text-[10px]">Conceptos</TableHead>
                <TableHead className="text-right font-bold uppercase text-[10px]">Importe Total</TableHead>
                <TableHead className="text-right font-bold uppercase text-[10px]">{activeTab === 'pendientes' ? 'Acciones' : 'Estado'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeTab === 'todas' ? (
                loadingInvoices ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-48 text-center">
                      <div className="flex flex-col items-center gap-2">
                         <Clock className="h-8 w-8 text-slate-300 animate-spin" />
                         <span className="text-sm text-slate-500 font-medium">Cargando facturas...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : invoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-64 text-center">
                      <div className="flex flex-col items-center gap-4 text-slate-400">
                         <div className="h-20 w-20 bg-slate-50 rounded-full flex items-center justify-center">
                            <FileText className="h-10 w-10 text-slate-200" />
                         </div>
                         <div>
                           <p className="text-lg font-bold text-slate-500">Sin facturas</p>
                           <p className="text-sm">
                             No hay facturas registradas. Crea tu primera factura manual con el botón superior.
                           </p>
                         </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  invoices.map((inv: any) => (
                    <TableRow key={inv.id} className="hover:bg-slate-50 transition-colors">
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-primary bg-primary/5">{inv.numero}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                           <div className="h-8 w-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-500">
                             <User className="h-4 w-4" />
                           </div>
                           <div>
                              <p className="text-sm font-bold tracking-tight">
                                {(inv.metadata as any)?.clienteNombre || inv.contact?.nombre || inv.lead?.nombre || 'Cliente'}
                              </p>
                              <p className="text-[10px] text-muted-foreground uppercase">
                                {(inv.metadata as any)?.clienteNif || inv.contact?.email || inv.lead?.email || ''}
                              </p>
                           </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm font-medium text-slate-600">
                        {format(new Date(inv.fechaEmision), 'dd MMM yyyy', { locale: es })}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {inv.isSealed && (
                            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                          )}
                          <Badge variant={inv.isSealed ? 'outline' : 'secondary'} className={cn(
                            'rounded-full px-2 text-[10px]',
                            inv.isSealed ? 'border-emerald-200 text-emerald-700 bg-emerald-50' : ''
                          )}>
                            {inv.isSealed ? 'Sellada' : 'Sin sello'}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-lg font-black tracking-tighter">
                        {formatCurrency(inv.monto, inv.moneda)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge className={cn(
                          'rounded-full text-[10px]',
                          inv.estado === 'completado' ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-slate-100 text-slate-600'
                        )}>
                          {inv.estado === 'completado' ? 'Emitida' : inv.estado === 'pendiente' ? 'Pendiente' : inv.estado}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )
              ) : (
                loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-48 text-center">
                      <div className="flex flex-col items-center gap-2">
                         <Clock className="h-8 w-8 text-slate-300 animate-spin" />
                         <span className="text-sm text-slate-500 font-medium">Cargando datos financieros...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : ordenes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-64 text-center">
                      <div className="flex flex-col items-center gap-4 text-slate-400">
                         <div className="h-20 w-20 bg-slate-50 rounded-full flex items-center justify-center">
                            {activeTab === 'pendientes' ? <CheckCircle2 className="h-10 w-10 text-slate-200" /> : <ShieldCheck className="h-10 w-10 text-slate-200" />}
                         </div>
                         <div>
                           <p className="text-lg font-bold text-slate-500">
                             {activeTab === 'pendientes' ? '¡Al día!' : 'Sin historial'}
                           </p>
                           <p className="text-sm">
                             {activeTab === 'pendientes' 
                               ? 'No hay órdenes pendientes de revisión financiera.' 
                               : 'Todavía no has emitido facturas desde esta mesa.'}
                           </p>
                         </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  ordenes.map((orden) => (
                    <TableRow key={orden.id} className="hover:bg-slate-50 transition-colors">
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-primary bg-primary/5">{orden.numero}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                           <div className="h-8 w-8 bg-slate-100 rounded-lg flex items-center justify-center text-slate-500">
                             <Building2 className="h-4 w-4" />
                           </div>
                           <div>
                              <p className="text-sm font-bold tracking-tight">{orden.lead?.nombre || orden.contact?.nombre}</p>
                              <p className="text-[10px] text-muted-foreground uppercase">{orden.lead?.empresa || 'Cliente Particular'}</p>
                           </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm font-medium text-slate-600">
                        {format(new Date(orden.fechaOrden), 'dd MMM yyyy HH:mm', { locale: es })}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="rounded-full px-3">{orden._count.items} líneas</Badge>
                      </TableCell>
                      <TableCell className="text-right text-lg font-black tracking-tighter">
                        {formatCurrency(orden.total, orden.moneda)}
                      </TableCell>
                      <TableCell className="text-right">
                        {activeTab === 'pendientes' ? (
                          <div className="space-x-2">
                            <Link href={`/dashboard/ventas/ordenes/${orden.id}`}>
                              <Button variant="ghost" size="sm" className="rounded-xl">
                                <ExternalLink className="h-4 w-4 mr-1" /> Revisar
                              </Button>
                            </Link>
                            <Button 
                              size="sm" 
                              className="rounded-xl bg-primary text-white hover:bg-primary/90 shadow-md px-5"
                              onClick={() => handleFacturar(orden.id, orden.numero)}
                              disabled={processingId === orden.id}
                            >
                              {processingId === orden.id ? (
                                 <Clock className="h-4 w-4 animate-spin mr-2" />
                              ) : (
                                 <FileText className="h-4 w-4 mr-2" />
                              )}
                              Facturar
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-2 text-emerald-600 font-bold text-xs uppercase tracking-widest">
                            <ShieldCheck className="h-4 w-4" /> Facturada y Sellada
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Advisory section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <Card className="bg-slate-900 text-white border-none p-6 flex items-start gap-4">
            <div className="p-3 bg-white/10 rounded-2xl text-white">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <p className="font-bold mb-1 tracking-tight">Integridad Fiscal</p>
              <p className="text-xs text-slate-400 leading-relaxed">
                Todas las facturas emitidas desde esta mesa se firman criptográficamente enlazándose con la factura anterior (Ley 11/2021).
              </p>
            </div>
         </Card>
         <Card className="bg-amber-50 border-amber-200 p-6 flex items-start gap-4">
            <div className="p-3 bg-amber-100 rounded-2xl text-amber-600">
              <AlertCircle className="h-6 w-6" />
            </div>
            <div>
              <p className="font-bold text-amber-900 mb-1 tracking-tight">Revisión de NIF/CIF</p>
              <p className="text-xs text-amber-800/70 leading-relaxed">
                Asegúrate de que los datos fiscales del cliente coincidan con el registro antes de facturar para evitar rectificativas.
              </p>
            </div>
         </Card>
         <Card className="bg-blue-50 border-blue-200 p-6 flex items-start gap-4 text-blue-900">
            <div className="p-3 bg-blue-100 rounded-2xl text-blue-600">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <p className="font-bold mb-1 tracking-tight">Resumen de IVA</p>
              <p className="text-xs text-blue-800/70 leading-relaxed">
                El sistema detecta automáticamente si el cliente aplica para tipos reducidos o exenciones basadas en su perfil fiscal.
              </p>
            </div>
         </Card>
      </div>
    </div>
  );
}
