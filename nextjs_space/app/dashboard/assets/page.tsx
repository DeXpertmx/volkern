'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Package, 
  User, 
  Clock, 
  ShieldCheck, 
  Plus, 
  Search, 
  Filter,
  Monitor,
  Smartphone,
  Car,
  Key,
  AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function AssetsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const { data: assets } = useSWR(`/api/assets?search=${encodeURIComponent(searchTerm)}`, fetcher);

  const getIcon = (category: string) => {
    switch (category) {
      case 'HARDWARE': return <Monitor className="w-5 h-5" />;
      case 'SOFTWARE': return <Key className="w-5 h-5" />;
      case 'VEHICLE': return <Car className="w-5 h-5" />;
      case 'MOBILE': return <Smartphone className="w-5 h-5" />;
      default: return <Package className="w-5 h-5" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'AVAILABLE': return 'bg-emerald-50 text-emerald-600';
      case 'ASSIGNED': return 'bg-indigo-50 text-indigo-600';
      case 'MAINTENANCE': return 'bg-amber-50 text-amber-600';
      case 'RETIRED': return 'bg-slate-50 text-slate-400';
      default: return 'bg-slate-50 text-slate-600';
    }
  };

  const assetList = assets?.data || (Array.isArray(assets) ? assets : null);
  const displayAssets = (assetList && assetList.length > 0) ? assetList : Array(6).fill({});

  return (
    <div className="p-8 space-y-8 bg-[#fafafa] min-h-screen">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="space-y-1">
          <h1 className="text-4xl font-black text-slate-900 uppercase tracking-tight">Volkern <span className="text-primary">Assets</span></h1>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" /> Protocolo de Confianza para Activos Internos
          </p>
          {assets?.fallback && (
             <p className="text-[10px] font-bold text-rose-500 uppercase flex items-center gap-1 mt-1">
               <AlertCircle className="w-3 h-3" /> Conexión con base de datos inestable. Mostrando caché local.
             </p>
          )}
        </div>
        <div className="flex gap-3">
           <Button variant="outline" className="rounded-2xl border-slate-200 h-12 font-black uppercase text-[10px] tracking-widest px-6 bg-white">
              Importar CSV
           </Button>
           <Button className="rounded-2xl h-12 px-8 font-black uppercase text-[10px] tracking-widest shadow-xl shadow-primary/20">
              <Plus className="w-4 h-4 mr-2" /> Nuevo Activo
           </Button>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { label: 'Total Activos', value: assetList?.length || 0, sub: 'Valor en libros', color: 'slate' },
          { label: 'En Uso', value: assetList?.filter((a:any) => a.status === 'ASSIGNED').length || 0, sub: 'Ocupación real', color: 'indigo' },
          { label: 'Próximas Renovaciones', value: assetList?.filter((a:any) => a.renewalDate).length || 0, sub: 'Próximos 30 días', color: 'amber' },
          { label: 'Garantías Vencidas', value: '0', sub: 'Acción requerida', color: 'rose' }
        ].map((stat, i) => (
          <Card key={i} className="p-6 rounded-[2.5rem] border-none shadow-sm bg-white">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">{stat.label}</p>
            <h3 className={cn("text-3xl font-black mb-1", `text-${stat.color}-600`)}>{stat.value}</h3>
            <p className="text-[9px] font-bold text-slate-400 uppercase">{stat.sub}</p>
          </Card>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="flex gap-4">
        <div className="flex-1 relative">
           <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
           <input 
            type="text" 
            placeholder="Buscar por nombre, serial o empleado..."
            className="w-full h-14 pl-12 pr-4 rounded-2xl bg-white border-none shadow-sm text-[10px] font-bold uppercase focus:ring-primary/20"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
           />
        </div>
        <Button variant="outline" className="h-14 rounded-2xl border-none bg-white px-6 shadow-sm font-black text-[10px] uppercase tracking-widest">
           <Filter className="w-4 h-4 mr-2" /> Filtros
        </Button>
      </div>

      {/* Assets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {displayAssets.map((asset: any, i: number) => (
          <Card key={i} className={cn("group overflow-hidden rounded-[2.5rem] border-none shadow-sm bg-white hover:shadow-2xl transition-all duration-500", !asset.id && "opacity-40")}>
            <div className="p-8 space-y-6">
              <div className="flex justify-between items-start">
                <div className="h-14 w-14 rounded-3xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-primary/5 group-hover:text-primary transition-colors">
                  {getIcon(asset.category || 'HARDWARE')}
                </div>
                <Badge className={cn("border-none px-4 py-1.5 rounded-full font-black text-[8px] uppercase tracking-widest shadow-sm", getStatusColor(asset.status || 'AVAILABLE'))}>
                  {asset.status || 'AVAILABLE'}
                </Badge>
              </div>

              <div className="space-y-2">
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight line-clamp-1">
                  {asset.name || 'Sin nombre'}
                </h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Serial: {asset.serialNumber || 'N/A'}
                </p>
              </div>

              <div className="pt-4 border-t border-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                   <div className="h-8 w-8 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-400">
                      <User className="w-4 h-4" />
                   </div>
                   <div>
                      <p className="text-[7px] font-black text-slate-300 uppercase tracking-widest">Asignado a</p>
                      <p className="text-[9px] font-black text-slate-700 uppercase">
                        {asset.assignments?.[0]?.employee?.fullName || 'Disponible'}
                      </p>
                   </div>
                </div>
                {asset.renewalDate && (
                  <div className="text-right">
                    <p className="text-[7px] font-black text-slate-300 uppercase tracking-widest">Renovación</p>
                    <p className="text-[9px] font-black text-rose-500 uppercase">
                      {new Date(asset.renewalDate).toLocaleDateString()}
                    </p>
                  </div>
                )}
              </div>
            </div>
            
            {asset.id && (
              <div className="px-8 py-4 bg-slate-50 flex justify-between items-center opacity-0 group-hover:opacity-100 transition-opacity">
                <button className="text-[9px] font-black uppercase tracking-widest text-primary hover:underline">Ver Historial</button>
                <button className="text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-900 transition-colors">Editar</button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
