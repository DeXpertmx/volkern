'use client'

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Package, AlertTriangle, ArrowRight, TrendingDown, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CriticalItem {
  name: string;
  sku: string;
  current: number;
  min: number;
  warehouse: string;
}

export function InventoryWatchdog() {
  const [data, setData] = useState<{ status: string, items: CriticalItem[], recommendation: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const response = await fetch('/api/v1/inventory/health'); // Necesitaremos este endpoint que llame al skill
        const json = await response.json();
        if (json.success) setData(json.data);
      } catch (e) {
        console.error('Error fetching inventory health:', e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchHealth();
  }, []);

  // Mock data si no hay API aún
  const items = data?.items || [
    { name: 'Motor Industrial XJ-40', sku: 'MOT-001', current: 2, min: 5, warehouse: 'Almacén Central' },
    { name: 'Aceite Lubricante 5W30', sku: 'LUB-442', current: 15, min: 20, warehouse: 'Sede Málaga' }
  ];

  if (isLoading) return <div className="h-full flex items-center justify-center animate-pulse bg-muted/20 rounded-lg">Analizando stock...</div>;

  return (
    <Card className="h-full flex flex-col border-primary/20 bg-background/50 backdrop-blur-sm overflow-hidden">
      <CardHeader className="drag-handle shrink-0">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-orange-500" />
              Inventory Watchdog
            </CardTitle>
            <CardDescription>Alertas de rotura de stock y reorden</CardDescription>
          </div>
          <div className={`px-2 py-1 rounded-full text-[10px] font-bold ${items.length > 0 ? 'bg-destructive/20 text-destructive animate-pulse' : 'bg-green-500/20 text-green-500'}`}>
            {items.length > 0 ? 'CRÍTICO' : 'ÓPTIMO'}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 overflow-y-auto pr-2 scrollbar-thin">
        <div className="space-y-3">
          {items.map((item, i) => (
            <div key={i} className="p-3 rounded-lg border bg-card/50 flex justify-between items-center group hover:border-primary/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <div className="text-sm font-bold">{item.name}</div>
                  <div className="text-[10px] text-muted-foreground">{item.sku} • {item.warehouse}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-black text-destructive">{item.current} <span className="text-[10px] font-normal text-muted-foreground">/ {item.min} min</span></div>
                <div className="text-[10px] flex items-center gap-1 text-primary cursor-pointer hover:underline">
                  <Clock className="h-3 w-3" /> Reordenar
                </div>
              </div>
            </div>
          ))}
          
          <div className="p-4 rounded-xl bg-primary/5 border border-dashed border-primary/20 mt-4">
            <div className="text-xs font-bold text-primary mb-2 flex items-center gap-2">
              <TrendingDown className="h-4 w-4" /> Recomendación de Gemma 4
            </div>
            <p className="text-xs leading-relaxed opacity-80">
              {data?.recommendation || "Se detectaron items bajo el stock mínimo. El tiempo estimado de rotura es de 3 días para Motores XJ-40."}
            </p>
            <Button variant="ghost" size="sm" className="w-full mt-2 h-7 text-[10px] gap-2">
              Generar Órdenes de Compra <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
