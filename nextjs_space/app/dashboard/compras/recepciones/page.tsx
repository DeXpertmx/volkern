'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Clock, Eye, Loader2, PackageCheck, PackageOpen, TrendingUp } from 'lucide-react';
import { formatearImporte } from '@/lib/moneda';
import { useMonedaTenant } from '@/lib/use-moneda-tenant';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

/**
 * Recepciones: la bandeja de lo que está en camino.
 *
 * Son los pedidos enviados al proveedor —parcial o totalmente pendientes—
 * ordenados por la fecha de entrega que comprometió el proveedor: es el orden
 * en el que hay que ir a mirar el almacén.
 */
export default function RecepcionesPage() {
  const moneda = useMonedaTenant();
  const { data, isLoading } = useSWR<any>('/api/compras?limit=100', fetcher);

  const pendientes = useMemo(
    () =>
      ((data?.compras ?? []) as any[])
        .filter((compra) => ['enviada', 'parcial'].includes(compra.estado) && Number(compra.pendiente) > 0)
        .sort((a, b) => {
          const fa = a.fechaEntrega ? new Date(a.fechaEntrega).getTime() : Number.MAX_SAFE_INTEGER;
          const fb = b.fechaEntrega ? new Date(b.fechaEntrega).getTime() : Number.MAX_SAFE_INTEGER;
          return fa - fb;
        }),
    [data?.compras]
  );

  const stats = useMemo(() => {
    const unidades = pendientes.reduce((acc, c) => acc + (Number(c.pendiente) || 0), 0);
    const importe = pendientes.reduce((acc, c) => acc + (Number(c.total) || 0), 0);
    const conFecha = pendientes.filter((c) => Boolean(c.fechaEntrega)).length;
    return { pedidos: pendientes.length, unidades, importe, conFecha };
  }, [pendientes]);

  return (
    <div className="space-y-6">
      {/* KPIs premium */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="glass-card hover:scale-105 transition-all duration-300 premium-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">En camino</p>
                <p className="text-3xl font-bold mt-1 tracking-tight">{stats.pedidos}</p>
              </div>
              <div className="h-12 w-12 bg-blue-100/50 rounded-xl flex items-center justify-center">
                <PackageCheck className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card hover:scale-105 transition-all duration-300 premium-shadow">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Unidades pendientes</p>
                <p className="text-3xl font-bold mt-1 text-amber-600 tracking-tight">{stats.unidades}</p>
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
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Con fecha</p>
                <p className="text-3xl font-bold mt-1 tracking-tight">{stats.conFecha}</p>
              </div>
              <div className="h-12 w-12 bg-slate-100/50 rounded-xl flex items-center justify-center">
                <PackageOpen className="h-6 w-6 text-slate-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="premium-gradient-primary hover:scale-105 transition-all duration-300 shadow-lg border-none text-white">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white/80 uppercase tracking-wider">Importe pendiente</p>
                <p className="text-2xl font-bold mt-1 tracking-tight truncate">
                  {formatearImporte(stats.importe, moneda || 'EUR')}
                </p>
              </div>
              <div className="h-12 w-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                <TrendingUp className="h-6 w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabla */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PackageCheck className="h-5 w-5 text-primary" /> Mercancía esperada
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Entrega prevista</TableHead>
                <TableHead>Almacén de entrada</TableHead>
                <TableHead className="text-right">Pendiente</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-[80px]">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    <span className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Cargando recepciones…
                    </span>
                  </TableCell>
                </TableRow>
              ) : pendientes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <PackageCheck className="h-10 w-10 opacity-40" />
                      <p>
                        No hay nada pendiente de recibir. Los pedidos enviados aparecerán aquí hasta que entre la
                        mercancía.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                pendientes.map((compra) => (
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
                    <TableCell>
                      {compra.fechaEntrega ? (
                        new Date(compra.fechaEntrega).toLocaleDateString('es-ES')
                      ) : (
                        <span className="text-muted-foreground">Sin fecha</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {compra.almacen?.name ?? <span className="text-muted-foreground">Central</span>}
                    </TableCell>
                    <TableCell className="text-right font-medium text-amber-700">{compra.pendiente}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatearImporte(compra.total, compra.moneda || moneda)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={`border-none text-[10px] font-bold uppercase ${
                          compra.estado === 'parcial' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-700'
                        }`}
                      >
                        {compra.estadoEtiqueta}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Link href={`/dashboard/compras/${compra.id}`} aria-label={`Registrar recepción de ${compra.numero}`}>
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
    </div>
  );
}
