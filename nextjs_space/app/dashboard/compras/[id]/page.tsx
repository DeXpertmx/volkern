'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ArrowLeft, Clock, Loader2, PackageCheck, Receipt, Send, TrendingUp, XCircle,
} from 'lucide-react';
import { calcularTotales, ETIQUETAS_ESTADO, redondear2 } from '@/lib/compras/reglas';
import { formatearImporte } from '@/lib/moneda';
import { useMonedaTenant } from '@/lib/use-moneda-tenant';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const ESTILO_ESTADO: Record<string, string> = {
  borrador: 'bg-slate-100 text-slate-700',
  enviada: 'bg-sky-100 text-sky-700',
  parcial: 'bg-amber-100 text-amber-800',
  recibida: 'bg-emerald-100 text-emerald-700',
  cancelada: 'bg-rose-100 text-rose-700',
};

export default function PedidoCompraDetallePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const moneda = useMonedaTenant();
  const compraId = params?.id;

  const { data, isLoading, mutate } = useSWR<any>(compraId ? `/api/compras/${compraId}` : null, fetcher);
  const compra = data?.compra;

  /** Cantidades a recibir ahora, por línea. Se inicializa con lo pendiente. */
  const [recepcion, setRecepcion] = useState<Record<string, string>>({});
  const [recibiendo, setRecibiendo] = useState(false);
  const [cambiandoEstado, setCambiandoEstado] = useState(false);
  const [avisos, setAvisos] = useState<string[]>([]);

  const lineasPendientes: any[] = useMemo(
    () => (compra?.items ?? []).filter((i: any) => Number(i.pendiente) > 0),
    [compra]
  );

  useEffect(() => {
    if (!compra) return;
    const inicial: Record<string, string> = {};
    for (const item of compra.items ?? []) {
      inicial[item.id] = Number(item.pendiente) > 0 ? String(item.pendiente) : '';
    }
    setRecepcion(inicial);
  }, [compra?.id, compra?.estado, compra?.items?.length]);

  async function cambiarEstado(estado: string) {
    setCambiandoEstado(true);
    try {
      const res = await fetch(`/api/compras/${compraId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado }),
      });
      const cuerpo = await res.json();
      if (!res.ok) {
        toast.error(cuerpo.error ?? 'No se pudo cambiar el estado');
        return;
      }
      toast.success(`Pedido ${estado === 'enviada' ? 'enviado al proveedor' : ETIQUETAS_ESTADO[estado as keyof typeof ETIQUETAS_ESTADO] ?? estado}`);
      mutate();
    } catch {
      toast.error('No se pudo cambiar el estado');
    } finally {
      setCambiandoEstado(false);
    }
  }

  async function registrarRecepcion() {
    const lineas = lineasPendientes
      .map((item) => ({ itemId: item.id, cantidad: Number(recepcion[item.id] ?? 0) }))
      .filter((l) => Number.isFinite(l.cantidad) && l.cantidad > 0);

    if (lineas.length === 0) {
      toast.error('Indica cuánto entra de al menos una línea');
      return;
    }

    setRecibiendo(true);
    try {
      const res = await fetch(`/api/compras/${compraId}/recibir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineas }),
      });
      const cuerpo = await res.json();
      if (!res.ok) {
        toast.error(cuerpo.error ?? 'No se pudo registrar la recepción');
        return;
      }
      setAvisos(cuerpo.avisos ?? []);
      const estado = cuerpo.compra?.estado;
      if (cuerpo.gasto) {
        toast.success(`Pedido recibido. Gasto de ${formatearImporte(cuerpo.gasto.amount, compra?.moneda ?? moneda)} registrado en contabilidad`);
      } else {
        toast.success(estado === 'recibida' ? 'Pedido recibido' : 'Recepción parcial registrada');
      }
      mutate();
    } catch {
      toast.error('No se pudo registrar la recepción');
    } finally {
      setRecibiendo(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-12 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando pedido…
      </div>
    );
  }

  if (!compra) {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-3">
          <p className="font-bold">Este pedido no existe en tu espacio de trabajo</p>
          <Button variant="outline" onClick={() => router.push('/dashboard/compras')}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Volver a Compras
          </Button>
        </CardContent>
      </Card>
    );
  }

  const totales = calcularTotales(
    (compra.items ?? []).map((i: any) => ({
      cantidad: Number(i.cantidad) || 0,
      precioUnitario: Number(i.precioUnitario) || 0,
      porcentajeImpuesto: Number(i.porcentajeImpuesto) || 0,
    }))
  );
  const puedeRecibir = Number(compra.pendiente) > 0 && ['enviada', 'parcial'].includes(compra.estado);
  const transiciones: string[] = compra.transiciones ?? [];
  const recibidas = (compra.items ?? []).filter((i: any) => Number(i.pendiente) === 0).length;

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/compras')} aria-label="Volver">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-3xl font-bold flex items-center gap-2">
              <Receipt className="h-8 w-8 text-primary" />
              {compra.numero}
            </h2>
            <p className="text-muted-foreground mt-1">
              {compra.proveedor?.name ?? 'Sin proveedor'} · pedido el{' '}
              {new Date(compra.fechaPedido).toLocaleDateString('es-ES')}
              {compra.almacen?.name ? ` · entra en ${compra.almacen.name}` : ''}
            </p>
          </div>
          <Badge className={`${ESTILO_ESTADO[compra.estado] ?? 'bg-muted'} border-none text-[10px] font-bold uppercase mt-2`}>
            {compra.estadoEtiqueta}
          </Badge>
        </div>

        <div className="flex gap-2">
          {transiciones.includes('enviada') && (
            <Button onClick={() => cambiarEstado('enviada')} disabled={cambiandoEstado}>
              {cambiandoEstado ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Enviar al proveedor
            </Button>
          )}
          {transiciones.includes('cancelada') && (
            <Button variant="outline" onClick={() => cambiarEstado('cancelada')} disabled={cambiandoEstado}>
              <XCircle className="h-4 w-4 mr-2" /> Cancelar pedido
            </Button>
          )}
        </div>
      </div>

      {/* KPIs premium */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="glass-card hover:scale-105 transition-all duration-300 premium-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Líneas recibidas</p>
                <p className="text-3xl font-bold mt-1 tracking-tight">
                  {recibidas}<span className="text-lg text-muted-foreground font-normal">/{compra.items.length}</span>
                </p>
              </div>
              <div className="h-12 w-12 bg-emerald-100/50 rounded-xl flex items-center justify-center">
                <PackageCheck className="h-6 w-6 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card hover:scale-105 transition-all duration-300 premium-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Por recibir</p>
                <p className="text-3xl font-bold mt-1 text-amber-600 tracking-tight">{compra.pendiente}</p>
              </div>
              <div className="h-12 w-12 bg-amber-100/50 rounded-xl flex items-center justify-center">
                <Clock className="h-6 w-6 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="premium-gradient-primary hover:scale-105 transition-all duration-300 shadow-lg border-none text-white">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white/80 uppercase tracking-wider">Total</p>
                <p className="text-2xl font-bold mt-1 tracking-tight truncate">
                  {formatearImporte(totales.total, compra.moneda || moneda)}
                </p>
                <p className="text-xs text-white/70 mt-1">
                  Base {formatearImporte(totales.subtotal, compra.moneda || moneda)} + IVA{' '}
                  {formatearImporte(totales.totalImpuestos, compra.moneda || moneda)}
                </p>
              </div>
              <div className="h-12 w-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                <TrendingUp className="h-6 w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {avisos.length > 0 && (
        <Card className="border-amber-200 bg-amber-50 border">
          <CardContent className="py-3 space-y-1">
            {avisos.map((aviso) => (
              <p key={aviso} className="text-sm text-amber-900">
                {aviso}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Líneas del pedido</CardTitle>
          <CardDescription>
            {compra.pendiente > 0
              ? `Faltan ${compra.pendiente} por recibir de ${compra.items.length} ${compra.items.length === 1 ? 'línea' : 'líneas'}.`
              : 'Todo lo pedido está recibido.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b">
                  <th className="py-2 pr-3">Concepto</th>
                  <th className="py-2 px-2 text-right">Pedido</th>
                  <th className="py-2 px-2 text-right">Recibido</th>
                  <th className="py-2 px-2 text-right">Pendiente</th>
                  <th className="py-2 px-2 text-right">Precio ud.</th>
                  <th className="py-2 px-2 text-right">IVA</th>
                  <th className="py-2 pl-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(compra.items ?? []).map((item: any) => (
                  <tr key={item.id} className="hover:bg-muted/40 transition-colors">
                    <td className="py-2 pr-3">
                      <span className="font-medium">{item.concepto}</span>
                      {item.catalogoItem?.nombre && (
                        <span className="block text-xs text-muted-foreground">Almacén: {item.catalogoItem.nombre}</span>
                      )}
                      {!item.catalogoItemId && (
                        <span className="block text-xs text-amber-700">Sin artículo de almacén: no mueve existencias</span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-right">{item.cantidad}</td>
                    <td className="py-2 px-2 text-right">{item.cantidadRecibida}</td>
                    <td className="py-2 px-2 text-right font-bold">{item.pendiente}</td>
                    <td className="py-2 px-2 text-right">{formatearImporte(Number(item.precioUnitario), compra.moneda || moneda)}</td>
                    <td className="py-2 px-2 text-right">{item.porcentajeImpuesto}%</td>
                    <td className="py-2 pl-2 text-right font-bold">{formatearImporte(Number(item.total), compra.moneda || moneda)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t">
                  <td colSpan={5} className="py-2 text-right text-muted-foreground text-xs uppercase tracking-wide">
                    Base {formatearImporte(totales.subtotal, compra.moneda || moneda)} · IVA{' '}
                    {formatearImporte(totales.totalImpuestos, compra.moneda || moneda)}
                  </td>
                  <td colSpan={2} className="py-2 pl-2 text-right font-black tracking-tighter">
                    {formatearImporte(totales.total, compra.moneda || moneda)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {compra.notas && (
            <p className="mt-4 text-sm text-muted-foreground border-t pt-3">
              <strong className="text-foreground">Notas:</strong> {compra.notas}
            </p>
          )}
        </CardContent>
      </Card>

      {puedeRecibir && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PackageCheck className="h-5 w-5 text-primary" /> Registrar recepción
            </CardTitle>
            <CardDescription>
              Lo que entres aquí mueve existencias en el almacén y apunta la línea. Cuando el pedido se complete, el
              total se convierte en un gasto en contabilidad.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {lineasPendientes.map((item) => (
                <div key={item.id} className="flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[12rem]">
                    <Label className="text-sm">{item.concepto}</Label>
                    <p className="text-xs text-muted-foreground">
                      Faltan {item.pendiente} de {item.cantidad}
                      {item.catalogoItem?.nombre ? ` · ${item.catalogoItem.nombre}` : ' · sin artículo de almacén'}
                    </p>
                  </div>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max={item.pendiente}
                    value={recepcion[item.id] ?? ''}
                    onChange={(e) => setRecepcion((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    className="w-32"
                    aria-label={`Cantidad recibida de ${item.concepto}`}
                  />
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={registrarRecepcion} disabled={recibiendo}>
                {recibiendo && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Registrar recepción
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  setRecepcion((prev) => {
                    const completo = { ...prev };
                    for (const item of lineasPendientes) completo[item.id] = String(redondear2(item.pendiente));
                    return completo;
                  })
                }
              >
                Recibir todo lo pendiente
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {compra.gasto && (
        <Card className="border-emerald-200 border bg-emerald-50">
          <CardContent className="py-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-bold text-emerald-900">
                Gasto registrado: {formatearImporte(Number(compra.gasto.amount), compra.gasto.currency || compra.moneda || moneda)}
              </p>
              <p className="text-sm text-emerald-800">
                Categoría {compra.gasto.category} · {compra.gasto.status === 'PAID' ? 'pagado' : 'pendiente de pago'}
              </p>
            </div>
            <Link href="/dashboard/finanzas/gastos" className="text-sm font-bold text-emerald-900 underline">
              Ver en Gastos
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
