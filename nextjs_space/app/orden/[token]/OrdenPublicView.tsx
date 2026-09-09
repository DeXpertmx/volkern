'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, Building2, CheckCircle2, Mail, Phone, Download, Printer, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';

interface OrdenPublica {
  numero: string;
  estado: string;
  fechaOrden: string;
  fechaEntrega: string | null;
  subtotal: number;
  descuentoGlobal: number;
  totalImpuestos: number;
  totalRetenciones: number;
  total: number;
  moneda: string;
  notas: string | null;
  condicionesVenta: string | null;
  referenciaCliente: string | null;
  cliente: { nombre: string; empresa: string | null; email: string | null };
  emisor: { razonSocial: string; idFiscal: string; direccion: string | null; email: string | null; telefono: string | null } | null;
  items: Array<{
    concepto: string;
    descripcion: string | null;
    cantidad: number;
    precioUnitario: number;
    descuento: number;
    total: number;
  }>;
  tenantNombre: string;
}

interface Props {
  orden: OrdenPublica;
  logoUrl: string;
  companyName: string;
}

const ESTADOS: Record<string, { label: string; className: string }> = {
  borrador: { label: 'Registrada', className: 'bg-slate-100 text-slate-700 border-slate-200' },
  confirmada: { label: 'Confirmada', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  en_proceso: { label: 'En proceso', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  pendiente_finanzas: { label: 'En revisión financiera', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  facturada: { label: 'Facturada', className: 'bg-violet-50 text-violet-700 border-violet-200' },
  entregada: { label: 'Entregada', className: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  completada: { label: 'Completada', className: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  cancelada: { label: 'Cancelada', className: 'bg-red-50 text-red-700 border-red-200' },
};

export default function OrdenPublicView({ orden, logoUrl, companyName }: Props) {
  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('es-ES', { style: 'currency', currency: orden.moneda }).format(val);

  const estadoInfo = ESTADOS[orden.estado] || ESTADOS.borrador;

  // Token público desde la URL actual: /orden/[token]
  const getToken = (): string | null => {
    const match = window.location.pathname.match(/^\/orden\/([^/]+)\/?$/);
    return match ? match[1] : null;
  };

  const [descargandoPdf, setDescargandoPdf] = useState(false);

  const handleDescargarPDF = async () => {
    const token = getToken();
    if (!token) {
      toast.error('No se pudo identificar esta orden');
      return;
    }
    setDescargandoPdf(true);
    try {
      const res = await fetch(`/api/ordenes-venta/public/${token}/pdf`);
      if (!res.ok) {
        toast.error('No se pudo generar el PDF');
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${orden.numero}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('PDF descargado correctamente');
    } catch {
      toast.error('Error al descargar el PDF');
    } finally {
      setDescargandoPdf(false);
    }
  };

  const handleImprimir = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-slate-50 py-6 sm:py-10 px-3 sm:px-4">
      <div className="max-w-[850px] mx-auto space-y-6">
        {/* Acciones (ocultas al imprimir) */}
        <div className="flex flex-wrap justify-end gap-2 print:hidden">
          <Button variant="secondary" size="sm" onClick={handleDescargarPDF} disabled={descargandoPdf}>
            {descargandoPdf ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            {descargandoPdf ? 'Generando…' : 'Descargar PDF'}
          </Button>
          <Button variant="secondary" size="sm" onClick={handleImprimir}>
            <Printer className="h-4 w-4 mr-2" /> Imprimir
          </Button>
        </div>
        {/* Banner de comprobante */}
        <div className="bg-emerald-600 text-white rounded-2xl p-6 shadow-lg flex items-center gap-4">
          <CheckCircle2 className="h-10 w-10 shrink-0" />
          <div>
            <h1 className="text-xl font-black uppercase tracking-tight">
              Trabajo aceptado y confirmado
            </h1>
            <p className="text-sm text-emerald-50 mt-1">
              Este documento confirma que el servicio ha sido aceptado y la orden registrada en el sistema.
            </p>
          </div>
        </div>

        {/* Documento */}
        <Card className="bg-white text-slate-900 shadow-xl border-none overflow-hidden">
          <CardContent className="p-5 sm:p-8 lg:p-10 space-y-6 sm:space-y-8">
            {/* Header — el logo de la empresa forma parte del documento */}
            <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start sm:gap-6">
              <div className="min-w-0">
                {logoUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={logoUrl}
                      alt={companyName}
                      className="h-16 w-auto max-w-[260px] object-contain"
                    />
                    {orden.emisor?.idFiscal && (
                      <p className="text-xs font-mono text-muted-foreground mt-2">{orden.emisor.idFiscal}</p>
                    )}
                  </>
                ) : (
                  <>
                    <div className="h-14 w-14 bg-primary/10 rounded-xl flex items-center justify-center">
                      <FileText className="h-8 w-8 text-primary" />
                    </div>
                    <div className="mt-2">
                      <h2 className="text-xl font-black uppercase tracking-tighter text-primary">{companyName}</h2>
                      {orden.emisor?.idFiscal && (
                        <p className="text-xs font-mono text-muted-foreground">{orden.emisor.idFiscal}</p>
                      )}
                    </div>
                  </>
                )}
              </div>
              <div className="text-left space-y-1 sm:text-right">
                <h2 className="text-2xl sm:text-3xl font-black tracking-tighter uppercase">Orden de Venta</h2>
                <p className="text-lg font-mono text-muted-foreground">{orden.numero}</p>
                <div className="pt-1">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">Fecha de Emisión</p>
                  <p className="font-bold">{format(new Date(orden.fechaOrden), 'dd/MM/yyyy')}</p>
                </div>
                <Badge className={`mt-2 border ${estadoInfo.className}`}>{estadoInfo.label}</Badge>
              </div>
            </div>

            <Separator className="bg-slate-100" />

            {/* Partes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-10">
              <div className="space-y-2 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-primary">De:</p>
                <p className="font-bold text-lg">{companyName}</p>
                {orden.emisor?.direccion && <p className="text-sm text-muted-foreground">{orden.emisor.direccion}</p>}
                {orden.emisor?.email && (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Mail className="h-3 w-3" /> {orden.emisor.email}
                  </p>
                )}
                {orden.emisor?.telefono && (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="h-3 w-3" /> {orden.emisor.telefono}
                  </p>
                )}
              </div>
              <div className="space-y-2 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Para:</p>
                <p className="font-bold text-lg">{orden.cliente.nombre}</p>
                {orden.cliente.empresa && (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Building2 className="h-3 w-3" /> {orden.cliente.empresa}
                  </p>
                )}
                {orden.cliente.email && (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Mail className="h-3 w-3" /> {orden.cliente.email}
                  </p>
                )}
              </div>
            </div>

            {/* Items */}
            <div className="space-y-3">
              <div className="grid grid-cols-12 gap-1.5 sm:gap-3 pb-2 border-b-2 border-slate-900 px-1 sm:px-2">
                <div className="col-span-4 sm:col-span-6 text-[10px] font-black uppercase">Descripción</div>
                <div className="col-span-2 text-[10px] font-black uppercase text-center">Cant.</div>
                <div className="col-span-3 sm:col-span-2 text-[10px] font-black uppercase text-right">Precio</div>
                <div className="col-span-3 sm:col-span-2 text-[10px] font-black uppercase text-right">Total</div>
              </div>
              {orden.items.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-1.5 sm:gap-3 py-3 px-1 sm:px-2 text-xs sm:text-sm border-b border-slate-50 items-center">
                  <div className="col-span-4 sm:col-span-6 min-w-0">
                    <p className="font-bold break-words">{item.concepto || 'Servicio'}</p>
                    {item.descripcion && <p className="text-xs text-muted-foreground">{item.descripcion}</p>}
                  </div>
                  <div className="col-span-2 text-center font-mono">{item.cantidad}</div>
                  <div className="col-span-3 sm:col-span-2 text-right font-mono">{formatCurrency(item.precioUnitario)}</div>
                  <div className="col-span-3 sm:col-span-2 text-right font-bold">
                    {formatCurrency(item.cantidad * item.precioUnitario * (1 - (item.descuento || 0) / 100))}
                  </div>
                </div>
              ))}
            </div>

            {/* Totales y notas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-10 pt-4">
              <div className="space-y-5 min-w-0 order-2 sm:order-1">
                {orden.notas && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-primary">Notas</p>
                    <p className="text-xs text-muted-foreground italic">{orden.notas}</p>
                  </div>
                )}
                {orden.condicionesVenta && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-primary">Términos y Condiciones</p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">{orden.condicionesVenta}</p>
                  </div>
                )}
                {orden.referenciaCliente && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-primary">Referencia</p>
                    <p className="text-xs text-muted-foreground font-mono">{orden.referenciaCliente}</p>
                  </div>
                )}
              </div>
              <div className="bg-slate-900 rounded-2xl p-5 sm:p-7 text-white space-y-3 shadow-xl order-1 sm:order-2">
                <div className="flex justify-between text-sm opacity-70">
                  <span>Subtotal</span>
                  <span className="font-mono">{formatCurrency(orden.subtotal)}</span>
                </div>
                {orden.descuentoGlobal > 0 && (
                  <div className="flex justify-between text-sm opacity-70">
                    <span>Descuento</span>
                    <span className="font-mono">-{formatCurrency(orden.descuentoGlobal)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm opacity-70">
                  <span>Impuestos</span>
                  <span className="font-mono">{formatCurrency(orden.totalImpuestos)}</span>
                </div>
                {orden.totalRetenciones > 0 && (
                  <div className="flex justify-between text-sm opacity-70">
                    <span>Retenciones</span>
                    <span className="font-mono">-{formatCurrency(orden.totalRetenciones)}</span>
                  </div>
                )}
                <Separator className="bg-white/10" />
                <div className="flex justify-between items-center pt-1">
                  <span className="text-xs font-black uppercase tracking-widest">Total</span>
                  <span className="text-2xl sm:text-3xl font-black tracking-tighter break-words">{formatCurrency(orden.total)}</span>
                </div>
                <p className="text-[10px] text-right opacity-40 uppercase font-bold">Moneda: {orden.moneda}</p>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-6 text-center space-y-2">
              <Separator className="bg-slate-100" />
              <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">
                Documento generado electrónicamente por {companyName}
              </p>
              <p className="text-[10px] text-muted-foreground/60">
                Si tienes dudas sobre esta orden, contacta con {companyName}.
              </p>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-[10px] text-muted-foreground/50">
          Enlace seguro de solo lectura. No requiere cuenta para visualizarlo.
        </p>
      </div>
    </div>
  );
}
