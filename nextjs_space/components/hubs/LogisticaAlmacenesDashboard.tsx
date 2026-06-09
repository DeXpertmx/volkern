'use client';

import { useState } from 'react';
import {
  Package, MapPin, Search, Loader2, Plus,
  Building2, Boxes, HardDrive, ArrowRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import useSWR from 'swr';
import { motion } from 'framer-motion';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function AlmacenesDashboard() {
  const { data, isLoading } = useSWR('/api/erp/logistics/warehouse', fetcher);
  const [search, setSearch] = useState('');

  const warehouses = data?.warehouses || [];

  const filtered = search
    ? warehouses.filter((w: any) =>
        w.name.toLowerCase().includes(search.toLowerCase()) ||
        (w.location || '').toLowerCase().includes(search.toLowerCase())
      )
    : warehouses;

  return (
    <div className="space-y-8 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <h1 className="text-2xl font-black uppercase tracking-tight text-foreground dark:text-white">Gestión de Almacenes</h1>
              <p className="text-xs font-bold text-muted-foreground dark:text-slate-500 uppercase tracking-widest">WMS, recepción y control de existencias</p>
            </div>
          </div>
        </div>
        <Button className="bg-yellow-600 hover:bg-yellow-500 text-white font-black uppercase text-[10px] h-10 px-5 rounded-xl gap-2">
          <Plus className="w-4 h-4" />
          Registrar Recepción
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <Input
          placeholder="Buscar almacén..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 bg-card dark:bg-slate-900 border-border dark:border-slate-800 text-foreground dark:text-white placeholder:text-muted-foreground/60 dark:placeholder:text-slate-600 rounded-xl h-11"
        />
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {[
          { label: 'Almacenes Activos', value: warehouses.length, icon: Building2, desc: 'Centros de distribución' },
          { label: 'Recepciónes', value: '--', icon: Package, desc: 'Este mes' },
          { label: 'Items en Stock', value: data?.kpis?.totalStockUnits?.toLocaleString() || '--', icon: Boxes, desc: 'Unidades totales' },
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
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
                      <Icon className="w-6 h-6 text-yellow-400" />
                    </div>
                    <div>
                      <p className="text-2xl font-black text-foreground dark:text-white tracking-tight">{stat.value}</p>
                      <p className="text-xs font-bold text-muted-foreground dark:text-slate-500">{stat.desc}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Warehouse List */}
      <Card className="border-none shadow-sm bg-card dark:bg-slate-900">
        <CardHeader className="pb-4 border-b border-border dark:border-slate-800">
          <CardTitle className="text-lg font-bold uppercase text-foreground dark:text-white tracking-tight">
            Almacenes ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="w-6 h-6 animate-spin text-yellow-400" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center p-12 bg-muted/50 dark:bg-slate-800/50 rounded-2xl border border-border dark:border-slate-700">
              <HardDrive className="w-10 h-10 text-muted-foreground/40 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground dark:text-slate-500 font-medium">
                {search ? 'No hay almacenes que coincidan' : 'No hay almacenes registrados'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((w: any, i: number) => (
                <motion.div
                  key={w.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="flex items-center justify-between p-4 rounded-xl bg-muted/50 dark:bg-slate-800/50 border border-border/50 dark:border-slate-700/50 hover:border-yellow-600/30 transition-all group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-muted dark:bg-slate-800 flex items-center justify-center border border-border dark:border-slate-700">
                      <Building2 className="w-6 h-6 text-muted-foreground dark:text-slate-400" />
                    </div>
                    <div>
                      <h4 className="font-bold text-foreground dark:text-white text-sm">{w.name}</h4>
                      <p className="text-xs text-muted-foreground dark:text-slate-500 font-bold mt-0.5">
                        {w.location || 'Sin ubicación'} • {w._count?.stockLevels || 0} items en stock
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right hidden md:block">
                      <p className="text-[10px] font-bold uppercase text-muted-foreground dark:text-slate-500">Capacidad</p>
                      <p className="text-sm font-bold text-foreground dark:text-white">{w._count?.stockLevels || 0} SKUs</p>
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
