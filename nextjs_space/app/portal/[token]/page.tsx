'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { 
  ShieldCheck, 
  Package, 
  FileText, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowRight, 
  Download,
  Info,
  Clock,
  MessageSquare,
  ShieldAlert,
  Loader2,
  Receipt,
  CalendarDays
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function SovereignPortalPage() {
  const params = useParams();
  const token = params.token as string;
  
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<any>(null);
  const [fiscalData, setFiscalData] = useState<any>(null);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [verificationResults, setVerificationResults] = useState<Record<string, any>>({});

  useEffect(() => {
    async function fetchOrder() {
      try {
        const [orderRes, fiscalRes] = await Promise.all([
          fetch(`/api/portal/order/${token}`),
          fetch(`/api/portal/${token}/fiscal`),
        ]);

        if (orderRes.ok) {
          const data = await orderRes.json();
          setOrder(data.order);
        } else {
          throw new Error('No se pudo encontrar el pedido');
        }

        if (fiscalRes.ok) {
          const data = await fiscalRes.json();
          if (data.success) setFiscalData(data);
        }
      } catch (error: any) {
        toast.error(error.message);
      } finally {
        setLoading(false);
      }
    }

    if (token) fetchOrder();
  }, [token]);

  const handleVerify = async (type: string, id: string, hash: string) => {
    if (!hash) {
      toast.error('No hay hash de integridad disponible para verificar');
      return;
    }

    setVerifying(id);
    try {
      const response = await fetch('/api/portal/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, id, hash })
      });
      const result = await response.json();
      setVerificationResults(prev => ({ ...prev, [id]: result }));
      
      if (result.isValid) {
        toast.success('Integridad verificada con éxito');
      } else {
        toast.error('¡Alerta de integridad! El registro ha sido alterado.');
      }
    } catch (error) {
      toast.error('Error al conectar con el motor de verificación');
    } finally {
      setVerifying(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        >
          <Loader2 className="w-12 h-12 text-primary" />
        </motion.div>
        <p className="mt-4 text-slate-600 font-medium">Validando acceso soberano...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-white p-8 rounded-3xl shadow-xl border border-red-100 max-w-md">
          <ShieldAlert className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-black text-slate-900 mb-2">Acceso No Válido</h1>
          <p className="text-slate-500 mb-6">
            El enlace que has utilizado no es válido, ha expirado o ha sido revocado por razones de seguridad.
          </p>
          <Button className="w-full" onClick={() => window.location.reload()}>
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DELIVERED': return 'bg-emerald-500';
      case 'SHIPPED': return 'bg-blue-500';
      case 'PROCESSING': return 'bg-amber-500';
      default: return 'bg-slate-400';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Header Premium */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <span className="font-black tracking-tight text-xl italic">VOLKERN <span className="text-primary font-medium text-xs not-italic">PORTAL</span></span>
          </div>
          <Badge variant="outline" className="bg-slate-50 border-slate-200 text-slate-600 font-bold">
            {order.batchNumber}
          </Badge>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-6 pt-8 space-y-8">
        {/* Resumen del Pedido */}
        <section>
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight">Hola, {order.contact.nombre}</h1>
              <p className="text-slate-500">Aquí puedes verificar el estado de tu pedido.</p>
            </div>
          </div>

          <Card className="rounded-3xl border-none shadow-xl shadow-slate-200/50 overflow-hidden">
            <div className={`h-2 ${getStatusColor(order.status)}`} />
            <CardContent className="p-6">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Estado Actual</span>
                  <div className="text-2xl font-black text-slate-900">{order.status}</div>
                </div>
                <div className="p-3 bg-slate-100 rounded-2xl">
                  {order.status === 'DELIVERED' ? <CheckCircle2 className="w-8 h-8 text-emerald-500" /> : <Clock className="w-8 h-8 text-amber-500 animate-pulse" />}
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="w-px bg-slate-200 relative">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-primary" />
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-slate-300" />
                  </div>
                  <div className="flex-1 space-y-6">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm font-bold text-slate-900">Pedido Confirmado</p>
                        <p className="text-xs text-slate-400">{new Date(order.createdAt).toLocaleDateString()}</p>
                      </div>
                      <Badge className="bg-emerald-50 text-emerald-600 border-none">Completado</Badge>
                    </div>
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm font-bold text-slate-900">Promesa de Entrega</p>
                        <p className="text-xs text-slate-400">{order.deliveryPromise ? new Date(order.deliveryPromise).toLocaleDateString() : 'Pendiente'}</p>
                      </div>
                      <Badge className="bg-blue-50 text-blue-600 border-none">En Proceso</Badge>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <Tabs defaultValue="items" className="w-full">
          <TabsList className="grid w-full grid-cols-4 bg-white p-1 rounded-2xl shadow-sm border border-slate-100">
            <TabsTrigger value="items" className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-white transition-all font-bold">Items</TabsTrigger>
            <TabsTrigger value="fiscal" className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-white transition-all font-bold">Fiscal</TabsTrigger>
            <TabsTrigger value="verification" className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-white transition-all font-bold">Seguridad</TabsTrigger>
            <TabsTrigger value="claims" className="rounded-xl data-[state=active]:bg-primary data-[state=active]:text-white transition-all font-bold">Soporte</TabsTrigger>
          </TabsList>

          <TabsContent value="items" className="space-y-4 mt-6">
            {order.items.map((item: any) => (
              <Card key={item.id} className="rounded-2xl border-none shadow-md overflow-hidden bg-white">
                <CardContent className="p-4 flex gap-4">
                  <div className="w-16 h-16 bg-slate-100 rounded-xl flex items-center justify-center">
                    <Package className="w-8 h-8 text-slate-400" />
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-start">
                      <h3 className="font-bold text-slate-900 leading-tight">{item.catalogItem.nombre}</h3>
                      <span className="text-xs font-black text-primary">x{item.quantity}</span>
                    </div>
                    <p className="text-xs text-slate-400 mb-2">SKU: {item.catalogItem.sku}</p>
                    <div className="flex gap-2">
                      <Badge variant="outline" className="text-[10px] h-5">{item.fulfillmentType}</Badge>
                      <Badge variant="outline" className="text-[10px] h-5 bg-blue-50 text-blue-600 border-blue-100">{item.status}</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="verification" className="space-y-6 mt-6">
            {/* Widget de Integridad del Pedido */}
            <Card className="rounded-3xl border-none shadow-xl bg-slate-900 text-white overflow-hidden relative">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <ShieldCheck className="w-24 h-24" />
              </div>
              <CardContent className="p-8">
                <h3 className="text-xl font-black mb-2 flex items-center gap-2">
                  Motor de Confianza Volkern
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                </h3>
                <p className="text-slate-400 text-sm mb-6">
                  Este pedido está respaldado por trazabilidad inmutable. Verifica que la información no haya sido alterada.
                </p>
                
                <div className="space-y-4">
                  <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Sello Digital del Pedido</span>
                      {verificationResults[order.id]?.isValid ? (
                        <Badge className="bg-emerald-500 text-white border-none">VERIFICADO</Badge>
                      ) : (
                        <Badge variant="outline" className="text-slate-500 border-slate-700">SIN VERIFICAR</Badge>
                      )}
                    </div>
                    <div className="font-mono text-[10px] text-slate-500 break-all mb-4">
                      {order.integrityHash || 'NO_HASH_AVAILABLE'}
                    </div>
                    <Button 
                      className="w-full bg-primary hover:bg-primary/90 text-white font-bold h-12 rounded-xl"
                      onClick={() => handleVerify('ORDER', order.id, order.integrityHash)}
                      disabled={verifying === order.id}
                    >
                      {verifying === order.id ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
                      Validar Integridad
                    </Button>
                  </div>

                  {/* Verificación de Lotes vinculados */}
                  {order.items.flatMap((i: any) => i.reservations).map((res: any) => res.lot && (
                    <div key={res.lot.id} className="bg-white/5 rounded-2xl p-4 border border-white/10">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Lote: {res.lot.batchNumber}</span>
                        {verificationResults[res.lot.id]?.isValid ? (
                          <Badge className="bg-emerald-500 text-white border-none">VERIFICADO</Badge>
                        ) : (
                          <Badge variant="outline" className="text-slate-500 border-slate-700">SIN VERIFICAR</Badge>
                        )}
                      </div>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="w-full text-slate-400 hover:text-white hover:bg-white/5 text-xs h-8"
                        onClick={() => handleVerify('LOT', res.lot.id, res.lot.integrityHash)}
                        disabled={verifying === res.lot.id}
                      >
                        {verifying === res.lot.id ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <ShieldCheck className="w-3 h-3 mr-2" />}
                        Verificar Sello de Calidad
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="fiscal" className="space-y-6 mt-6">
            {!fiscalData ? (
              <Card className="rounded-3xl border-none shadow-xl bg-white p-8 text-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
                <p className="text-sm font-bold text-slate-500">Cargando información fiscal...</p>
              </Card>
            ) : (
              <>
                {/* Perfil Fiscal */}
                {fiscalData.perfilFiscal && (
                  <Card className="rounded-3xl border-none shadow-xl bg-gradient-to-br from-slate-900 to-slate-800 text-white overflow-hidden">
                    <CardContent className="p-6">
                      <div className="flex items-center gap-2 mb-4">
                        <ShieldCheck className="w-5 h-5 text-emerald-400" />
                        <span className="text-xs font-bold uppercase tracking-widest opacity-60">Perfil Fiscal</span>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-xs opacity-50">NIF/CIF</p>
                          <p className="font-bold">{fiscalData.perfilFiscal.nif || '—'}</p>
                        </div>
                        <div>
                          <p className="text-xs opacity-50">Razón Social</p>
                          <p className="font-bold truncate">{fiscalData.perfilFiscal.razonSocial || '—'}</p>
                        </div>
                        <div>
                          <p className="text-xs opacity-50">Régimen Fiscal</p>
                          <p className="font-bold">{fiscalData.perfilFiscal.regimenFiscal || '—'}</p>
                        </div>
                        <div>
                          <p className="text-xs opacity-50">País</p>
                          <p className="font-bold">{fiscalData.perfilFiscal.country || '—'}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Cards de IVA e IRPF */}
                <div className="grid grid-cols-2 gap-4">
                  <Card className="rounded-2xl border-none shadow-md bg-white overflow-hidden">
                    <div className="h-1.5 bg-blue-500" />
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-black uppercase tracking-widest text-slate-400">IVA {fiscalData.vatSummary?.currentQuarter || ''}</p>
                        {fiscalData.vatSummary?.isFiled ? (
                          <Badge className="bg-emerald-50 text-emerald-600 border-none text-[10px]">Presentado</Badge>
                        ) : (
                          <Badge className="bg-amber-50 text-amber-600 border-none text-[10px]">Pendiente</Badge>
                        )}
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500">Repercutido</span>
                          <span className="font-bold text-blue-600">{fiscalData.vatSummary?.outputVat || '0,00 €'}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500">Soportado</span>
                          <span className="font-bold text-orange-600">{fiscalData.vatSummary?.inputVat || '0,00 €'}</span>
                        </div>
                        <div className="border-t pt-2 flex justify-between text-xs">
                          <span className="font-bold text-slate-700">Resultado</span>
                          <span className="font-black text-lg">{fiscalData.vatSummary?.result || '0,00 €'}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="rounded-2xl border-none shadow-md bg-white overflow-hidden">
                    <div className="h-1.5 bg-purple-500" />
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-black uppercase tracking-widest text-slate-400">IRPF Retenciones</p>
                        {fiscalData.irpfSummary?.isFiled ? (
                          <Badge className="bg-emerald-50 text-emerald-600 border-none text-[10px]">Presentado</Badge>
                        ) : (
                          <Badge className="bg-amber-50 text-amber-600 border-none text-[10px]">Pendiente</Badge>
                        )}
                      </div>
                      <p className="text-3xl font-black text-purple-600 mb-1">{fiscalData.irpfSummary?.totalWithholding || '0,00 €'}</p>
                      <p className="text-xs text-slate-400 font-medium">Retenciones del trimestre</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Próximos Vencimientos */}
                {fiscalData.upcomingDeadlines?.length > 0 && (
                  <Card className="rounded-3xl border-none shadow-xl bg-white overflow-hidden">
                    <CardHeader className="pb-3 pt-5 px-6">
                      <div className="flex items-center gap-2">
                        <CalendarDays className="w-5 h-5 text-amber-500" />
                        <CardTitle className="text-sm font-black">Próximos Vencimientos</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="divide-y divide-slate-100">
                        {fiscalData.upcomingDeadlines.map((dl: any) => (
                          <div key={`${dl.model}-${dl.periodLabel}`} className="flex items-center justify-between px-6 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-xs font-black text-amber-600">
                                {dl.model}
                              </div>
                              <div>
                                <p className="text-sm font-bold text-slate-800">{dl.name}</p>
                                <p className="text-xs text-slate-400">{dl.periodLabel}</p>
                              </div>
                            </div>
                            <Badge className={dl.daysUntilDue <= 7 ? 'bg-red-50 text-red-600 border-none' : 'bg-amber-50 text-amber-600 border-none'}>
                              {dl.daysUntilDue === 0 ? 'Hoy' : `${dl.daysUntilDue} días`}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Facturas */}
                <Card className="rounded-3xl border-none shadow-xl bg-white overflow-hidden">
                  <CardHeader className="pb-3 pt-5 px-6 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <Receipt className="w-5 h-5 text-slate-500" />
                      <CardTitle className="text-sm font-black">Facturas y Documentos</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    {!fiscalData.invoices?.length ? (
                      <div className="p-8 text-center">
                        <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                        <p className="text-sm font-bold text-slate-400">No hay facturas disponibles</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {fiscalData.invoices.map((inv: any) => (
                          <div key={inv.id} className="flex items-center justify-between px-6 py-3 hover:bg-slate-50 transition-colors">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                                <FileText className="w-5 h-5 text-slate-500" />
                              </div>
                              <div>
                                <p className="text-sm font-bold text-slate-800">Factura {inv.numero}</p>
                                <div className="flex items-center gap-2 text-xs text-slate-400">
                                  <span>{inv.monto}</span>
                                  <span>•</span>
                                  <span>{new Date(inv.fechaEmision).toLocaleDateString('es-ES')}</span>
                                  {inv.aeatStatus && (
                                    <>
                                      <span>•</span>
                                      <span className={cn(
                                        'font-bold',
                                        inv.aeatStatus === 'ACCEPTED' ? 'text-emerald-600' : 'text-amber-600'
                                      )}>{inv.aeatStatus}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {inv.estado && (
                                <Badge variant="outline" className="text-[10px] h-5">
                                  {inv.estado}
                                </Badge>
                              )}
                              {inv.urlPdf && (
                                <a href={inv.urlPdf} target="_blank" rel="noopener noreferrer">
                                  <Button variant="ghost" size="icon" className="w-8 h-8 rounded-full">
                                    <Download className="w-4 h-4" />
                                  </Button>
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          <TabsContent value="claims" className="mt-6">
            <Card className="rounded-3xl border-none shadow-xl bg-white p-6">
              <h3 className="text-xl font-black text-slate-900 mb-2">Centro de Soporte</h3>
              <p className="text-slate-500 text-sm mb-6">
                ¿Tienes alguna duda o incidencia con tu pedido? Abre una reclamación formal aquí.
              </p>
              
              <div className="space-y-4">
                <Button variant="outline" className="w-full justify-between h-14 rounded-2xl border-slate-200 hover:bg-slate-50 px-6">
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-blue-50 rounded-xl text-blue-500">
                      <Info className="w-5 h-5" />
                    </div>
                    <span className="font-bold text-slate-700">Consultar Estado</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                </Button>

                <Button variant="outline" className="w-full justify-between h-14 rounded-2xl border-slate-200 hover:bg-slate-50 px-6">
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-red-50 rounded-xl text-red-500">
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <span className="font-bold text-slate-700">Reportar Incidencia</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                </Button>

                <Button variant="outline" className="w-full justify-between h-14 rounded-2xl border-slate-200 hover:bg-slate-50 px-6">
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-emerald-50 rounded-xl text-emerald-500">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <span className="font-bold text-slate-700">Confirmar Recepción</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                </Button>
              </div>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Documentos */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-5 h-5 text-slate-400" />
            <h2 className="text-xl font-black text-slate-900 tracking-tight">Documentos y Evidencia</h2>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <Card className="rounded-2xl border-none shadow-md bg-white p-4 text-center group cursor-pointer hover:shadow-lg transition-all">
              <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center mx-auto mb-3 text-slate-400 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                <Download className="w-6 h-6" />
              </div>
              <p className="text-xs font-black text-slate-900">Resumen del Pedido</p>
              <p className="text-[10px] text-slate-400">PDF • 1.2 MB</p>
            </Card>

            <Card className="rounded-2xl border-none shadow-md bg-white p-4 text-center group cursor-pointer hover:shadow-lg transition-all">
              <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center mx-auto mb-3 text-slate-400 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                <FileText className="w-6 h-6" />
              </div>
              <p className="text-xs font-black text-slate-900">Certificado CoA</p>
              <p className="text-[10px] text-slate-400">PDF • 0.8 MB</p>
            </Card>
          </div>
        </section>
      </main>

      {/* Footer Powered By */}
      <footer className="mt-12 text-center">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          Infraestructura de Confianza Soberana por <span className="text-slate-900">VOLKERN ERP</span>
        </p>
      </footer>
    </div>
  );
}
