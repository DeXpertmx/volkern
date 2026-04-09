'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Package, Briefcase, Calendar, GraduationCap, Plus, Check } from 'lucide-react';

export interface CatalogoItem {
  id: string;
  nombre: string;
  descripcion: string | null;
  sku: string | null;
  tipo: string;
  precioBase: number;
  moneda: string;
  categoriaFiscal: string;
  duracionMinutos: number | null;
  modalidad: string | null;
  unidad: string;
  tasaImpuesto?: {
    id: string;
    nombre: string;
    codigo: string;
    porcentaje: number;
  } | null;
}

interface CatalogoSelectorProps {
  onSelect: (item: CatalogoItem) => void;
  tipoFiltro?: string; // 'producto' | 'servicio' | 'cita' | 'academia'
  buttonLabel?: string;
  buttonVariant?: 'default' | 'outline' | 'ghost';
  showPrices?: boolean;
}

const TIPOS_ITEM = [
  { value: 'all', label: 'Todos', icon: Package },
  { value: 'producto', label: 'Productos', icon: Package },
  { value: 'servicio', label: 'Servicios', icon: Briefcase },
  { value: 'cita', label: 'Citas', icon: Calendar },
  { value: 'academia', label: 'Academia', icon: GraduationCap },
];

export function CatalogoSelector({
  onSelect,
  tipoFiltro,
  buttonLabel = 'Agregar del Catálogo',
  buttonVariant = 'outline',
  showPrices = true,
}: CatalogoSelectorProps) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<CatalogoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState(tipoFiltro || 'all');

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (activeTab && activeTab !== 'all') params.set('tipo', activeTab);
      if (search) params.set('search', search);
      params.set('activo', 'true');

      const res = await fetch(`/api/catalogo?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch (error) {
      console.error('Error loading catalog:', error);
    } finally {
      setLoading(false);
    }
  }, [activeTab, search]);

  useEffect(() => {
    if (open) {
      fetchItems();
    }
  }, [open, fetchItems]);

  const handleSelect = (item: CatalogoItem) => {
    onSelect(item);
    setOpen(false);
  };

  const formatPrice = (price: number, currency: string) => {
    const symbol = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency;
    return `${symbol}${price.toLocaleString('es-ES', { minimumFractionDigits: 2 })}`;
  };

  const getTipoIcon = (tipo: string) => {
    const found = TIPOS_ITEM.find(t => t.value === tipo);
    return found ? found.icon : Package;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={buttonVariant} size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          {buttonLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Seleccionar del Catálogo</DialogTitle>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar producto o servicio..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Tabs */}
        {!tipoFiltro && (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full">
              {TIPOS_ITEM.map((tipo) => (
                <TabsTrigger key={tipo.value} value={tipo.value} className="flex-1 gap-1">
                  <tipo.icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{tipo.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}

        {/* Items List */}
        <ScrollArea className="h-[400px] pr-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No hay ítems disponibles
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item) => {
                const Icon = getTipoIcon(item.tipo);
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent cursor-pointer transition-colors"
                    onClick={() => handleSelect(item)}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="p-2 bg-muted rounded-md">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{item.nombre}</span>
                          {item.sku && (
                            <code className="text-xs bg-muted px-1 py-0.5 rounded">{item.sku}</code>
                          )}
                        </div>
                        {item.descripcion && (
                          <p className="text-sm text-muted-foreground truncate">
                            {item.descripcion}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          {item.duracionMinutos && (
                            <Badge variant="outline" className="text-xs">
                              {item.duracionMinutos} min
                            </Badge>
                          )}
                          {item.tasaImpuesto && (
                            <Badge variant="secondary" className="text-xs">
                              {item.tasaImpuesto.porcentaje}% {item.tasaImpuesto.nombre}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    {showPrices && (
                      <div className="text-right ml-4">
                        <div className="font-semibold">
                          {formatPrice(item.precioBase, item.moneda)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          / {item.unidad}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

export default CatalogoSelector;
