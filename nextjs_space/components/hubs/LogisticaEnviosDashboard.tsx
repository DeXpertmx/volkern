'use client';

import { useState } from 'react';
import {
  Ship, Package, Search, Loader2, ArrowRight,
  CheckCircle2, Clock, Boxes,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import useSWR from 'swr';
import { motion } from 'framer-motion';

const fetcher = (url: string) => fetch(url).then(res => res.json());

const statusColor: Record<string, string> = {
  PREPARING: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  SHIPPED: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  DELIVERED: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  CANCELLED: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const statusLabel: Record<string, string> = {
  PREPARING: 'Preparando',
  SHIPPED: 'En tránsito',
  DELIVERED: 'Entregado',
  CANCELLED: 'Cancelado',
};

export default function EnviosDashboard() {
  const { data, isLoading } = useSWR('/api/erp/logistics/shipments?limit=50', fetcher);
  const [search, setSearch] = useState('');

  const shipments = data?.shipments || [];

  const filtered = search
    ? shipments.filter((s: any) =>
        s.batchNumber?.toLowerCase().includes(search.toLowerCase()) ||
        s.carrier?.toLowerCase().includes(search.toLowerCase()) ||
        s.trackingNumber?.toLowerCase().includes(search.toLowerCase())
      )
    : shipments;

  return (
    <div className="space-y-8 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
              <Ship className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <h1 className="text-2xl font-black uppercase tracking-tight text-foreground dark:text-white">Gestión de Envíos</h1>
              <p className="text-xs font-bold text-muted-foreground dark:text-slate-500 uppercase tracking-widest">Despachos, tracking y entregas</p>
            </div>
          </div>
        </div>
        <Button className="bg-yellow-600 hover:bg-yellow-500 text-white font-black uppercase text-[10px] h-10 px-5 rounded-xl gap-2">
          <Ship className="w-4 h-4" />
          Nuevo Envío
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <Input
          placeholder="Buscar por referencia, transportista o tracking..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 bg-card dark:bg-slate-900 border-border dark:border-slate-800 text-foreground dark:text-white placeholder:text-muted-foreground/60 dark:placeholder:text-slate-600 rounded-xl h-11"
        />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Envíos', value: shipments.length, icon: Ship, color: 'text-blue-400', bg: 'bg-blue-500/10' },
          { label: 'En Tránsito', value: shipments.filter((s: any) => s.status === 'SHIPPED').length, icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10' },
          { label: 'Entregados', value: shipments.filter((s: any) => s.status === 'DELIVERED').length, icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          { label: 'Preparando', value: shipments.filter((s: any) => s.status === 'PREPARING').length, icon: Package, color: 'text-slate-400', bg: 'bg-slate-500/10' },
        ].map((stat, i) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="border-none shadow-sm bg-card dark:bg-slate-900">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className={`w-10 h-10 rounded-xl ${stat.bg} flex items-center justify-center`}>
                      <Icon className={`w-5 h-5 ${stat.color}`} />
                    </div>
                  </div>
                  <p className="text-2xl font-black text-foreground dark:text-white tracking-tight">{stat.value}</p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground dark:text-slate-500 mt-1">{stat.label}</p>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Shipments Table */}
      <Card className="border-none shadow-sm bg-card dark:bg-slate-900">
        <CardHeader className="pb-4 border-b border-border dark:border-slate-800">
          <CardTitle className="text-lg font-bold uppercase text-foreground dark:text-white tracking-tight">
            Envíos ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="w-6 h-6 animate-spin text-yellow-400" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center p-12 bg-muted/50 dark:bg-slate-800/50 rounded-2xl border border-border dark:border-slate-700">
              <Boxes className="w-10 h-10 text-muted-foreground/40 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground dark:text-slate-500 font-medium">
                {search ? 'No hay envíos que coincidan con la búsqueda' : 'No hay envíos registrados'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((s: any, i: number) => (
                <motion.div
                  key={s.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.02 }}
                  className="flex items-center justify-between p-4 rounded-xl bg-muted/50 dark:bg-slate-800/50 border border-border/50 dark:border-slate-700/50 hover:border-yellow-600/30 transition-all group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-muted dark:bg-slate-800 flex items-center justify-center border border-border dark:border-slate-700">
                      <Package className="w-6 h-6 text-muted-foreground dark:text-slate-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-foreground dark:text-white text-sm">{s.batchNumber}</h4>
                        <Badge className={`border text-[9px] font-black uppercase px-2 py-0.5 ${statusColor[s.status] || ''}`}>
                          {statusLabel[s.status] || s.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground dark:text-slate-500 font-bold mt-0.5">
                        {s.carrier || 'Sin transportista'} • {s.trackingNumber || 'Sin tracking'}
                        {s.erp_sales_orders && ` • Pedido: ${s.erp_sales_orders.batchNumber}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right hidden md:block">
                      <p className="text-[10px] font-bold uppercase text-muted-foreground dark:text-slate-500">
                        {s.status === 'DELIVERED' ? 'Entregado' : s.status === 'SHIPPED' ? 'Despachado' : 'Creado'}
                      </p>
                      <p className="text-xs font-bold text-foreground dark:text-white">
                        {new Date(s.dispatchedAt || s.deliveredAt || s.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" className="rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                      <ArrowRight className="w-4 h-4 text-muted-foreground dark:text-slate-400" />
                    </Button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
