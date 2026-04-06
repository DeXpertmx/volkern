'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  Search,
  Package,
  Briefcase,
  Plus,
  Loader2,
  X,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CatalogoItemResult {
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

interface TasaImpuesto {
  id: string;
  nombre: string;
  codigo: string;
  porcentaje: number;
}

interface CatalogSearchSelectProps {
  value?: CatalogoItemResult | null;
  onSelect: (item: CatalogoItemResult) => void;
  onClear?: () => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  showPriceOnSelect?: boolean;
  moneda?: string;
  allowQuickCreate?: boolean;
}

const TIPOS_ITEM = [
  { value: 'producto', label: 'Producto', icon: Package },
  { value: 'servicio', label: 'Servicio', icon: Briefcase },
];

const CATEGORIAS_FISCALES = [
  { value: 'general', label: 'General (IVA estándar)' },
  { value: 'reducido', label: 'Reducido' },
  { value: 'super_reducido', label: 'Super Reducido' },
  { value: 'exento', label: 'Exento de IVA' },
];

export function CatalogSearchSelect({
  value,
  onSelect,
  onClear,
  placeholder = 'Buscar en catálogo...',
  className,
  disabled = false,
  showPriceOnSelect = true,
  moneda = 'EUR',
  allowQuickCreate = true,
}: CatalogSearchSelectProps) {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<CatalogoItemResult[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [tasasImpuesto, setTasasImpuesto] = useState<TasaImpuesto[]>([]);
  
  // Quick Create Modal
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [quickCreateLoading, setQuickCreateLoading] = useState(false);
  const [quickCreateData, setQuickCreateData] = useState({
    nombre: '',
    tipo: 'servicio',
    precioBase: 0,
    categoriaFiscal: 'general',
    tasaImpuestoId: '',
    descripcion: '',
  });
  
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Cargar tasas de impuesto para Quick Create
  useEffect(() => {
    const fetchTasas = async () => {
      try {
        const res = await fetch('/api/configuracion/fiscal/tasas?activo=true');
        if (res.ok) {
          const data = await res.json();
          setTasasImpuesto(data.tasas || data || []);
        }
      } catch (error) {
        console.error('Error loading tax rates:', error);
      }
    };
    fetchTasas();
  }, []);

  // Búsqueda con debounce
  const searchCatalog = useCallback(async (query: string) => {
    if (!query || query.length < 2) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({
        search: query,
        activo: 'true',
        limit: '10',
      });
      const res = await fetch(`/api/catalogo?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.items || []);
      }
    } catch (error) {
      console.error('Error searching catalog:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Manejar cambio de búsqueda con debounce
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    if (search.length >= 2) {
      debounceTimerRef.current = setTimeout(() => {
        searchCatalog(search);
      }, 300);
    } else {
      setResults([]);
    }

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [search, searchCatalog]);

  // Cerrar dropdown cuando se hace clic fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Manejar teclas
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;

    const totalItems = results.length + (allowQuickCreate && search.length >= 2 ? 1 : 0);

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev + 1) % totalItems);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev - 1 + totalItems) % totalItems);
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex < results.length) {
          handleSelect(results[highlightedIndex]);
        } else if (allowQuickCreate && search.length >= 2) {
          handleOpenQuickCreate();
        }
        break;
      case 'Escape':
        setIsOpen(false);
        break;
    }
  };

  const handleSelect = (item: CatalogoItemResult) => {
    onSelect(item);
    setSearch('');
    setIsOpen(false);
    setResults([]);
  };

  const handleClear = () => {
    if (onClear) {
      onClear();
    }
    setSearch('');
  };

  const handleOpenQuickCreate = () => {
    setQuickCreateData({
      nombre: search,
      tipo: 'servicio',
      precioBase: 0,
      categoriaFiscal: 'general',
      tasaImpuestoId: tasasImpuesto.length > 0 ? tasasImpuesto[0].id : '',
      descripcion: '',
    });
    setShowQuickCreate(true);
    setIsOpen(false);
  };

  const handleQuickCreate = async () => {
    if (!quickCreateData.nombre || quickCreateData.precioBase <= 0) {
      toast.error('Nombre y precio son requeridos');
      return;
    }

    setQuickCreateLoading(true);
    try {
      const res = await fetch('/api/catalogo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: quickCreateData.nombre,
          tipo: quickCreateData.tipo,
          precioBase: quickCreateData.precioBase,
          categoriaFiscal: quickCreateData.categoriaFiscal,
          tasaImpuestoId: quickCreateData.tasaImpuestoId || null,
          descripcion: quickCreateData.descripcion || null,
          moneda: moneda,
          activo: true,
        }),
      });

      if (res.ok) {
        const newItem = await res.json();
        toast.success(`"${newItem.nombre}" registrado en el catálogo`);
        handleSelect(newItem);
        setShowQuickCreate(false);
      } else {
        const error = await res.json();
        toast.error(error.error || 'Error al crear ítem');
      }
    } catch (error) {
      toast.error('Error al crear ítem');
    } finally {
      setQuickCreateLoading(false);
    }
  };

  const formatPrice = (price: number, currency: string) => {
    const symbol = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency;
    return `${symbol}${price.toLocaleString('es-ES', { minimumFractionDigits: 2 })}`;
  };

  // Si hay un valor seleccionado, mostrar como badge
  if (value) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <div className="flex-1 flex items-center gap-2 px-3 py-2 border rounded-md bg-muted/50">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium truncate">{value.nombre}</span>
              {value.sku && (
                <code className="text-xs bg-background px-1 py-0.5 rounded border">
                  {value.sku}
                </code>
              )}
            </div>
            {showPriceOnSelect && (
              <div className="text-sm text-muted-foreground">
                {formatPrice(value.precioBase, value.moneda)}
                {value.tasaImpuesto && (
                  <span className="ml-2">+ {value.tasaImpuesto.porcentaje}% {value.tasaImpuesto.nombre}</span>
                )}
              </div>
            )}
          </div>
          {!disabled && onClear && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 shrink-0"
              onClick={handleClear}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={cn('relative', className)}>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              if (e.target.value.length >= 2) {
                setIsOpen(true);
                setHighlightedIndex(0);
              }
            }}
            onFocus={() => {
              if (search.length >= 2) setIsOpen(true);
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className="pl-10 pr-10"
          />
          {loading && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>

        {/* Dropdown de resultados */}
        {isOpen && (search.length >= 2) && (
          <div
            ref={dropdownRef}
            className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-[300px] overflow-y-auto"
          >
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : results.length === 0 ? (
              <div className="p-3 text-sm text-muted-foreground text-center">
                No se encontraron resultados para "{search}"
              </div>
            ) : (
              results.map((item, index) => (
                <div
                  key={item.id}
                  className={cn(
                    'flex items-center justify-between p-3 cursor-pointer transition-colors',
                    index === highlightedIndex ? 'bg-accent' : 'hover:bg-accent/50'
                  )}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="p-1.5 bg-muted rounded">
                      {item.tipo === 'producto' ? (
                        <Package className="h-4 w-4" />
                      ) : (
                        <Briefcase className="h-4 w-4" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{item.nombre}</span>
                        {item.sku && (
                          <code className="text-xs bg-muted px-1 py-0.5 rounded">
                            {item.sku}
                          </code>
                        )}
                      </div>
                      {item.descripcion && (
                        <p className="text-xs text-muted-foreground truncate">
                          {item.descripcion}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right ml-3 shrink-0">
                    <div className="font-semibold">
                      {formatPrice(item.precioBase, item.moneda)}
                    </div>
                    {item.tasaImpuesto && (
                      <Badge variant="secondary" className="text-xs">
                        {item.tasaImpuesto.porcentaje}%
                      </Badge>
                    )}
                  </div>
                </div>
              ))
            )}

            {/* Opción de Quick Create */}
            {allowQuickCreate && search.length >= 2 && (
              <>
                {results.length > 0 && (
                  <div className="border-t" />
                )}
                <div
                  className={cn(
                    'flex items-center gap-3 p-3 cursor-pointer transition-colors',
                    highlightedIndex === results.length ? 'bg-accent' : 'hover:bg-accent/50'
                  )}
                  onClick={handleOpenQuickCreate}
                  onMouseEnter={() => setHighlightedIndex(results.length)}
                >
                  <div className="p-1.5 bg-primary/10 rounded">
                    <Plus className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <span className="font-medium text-primary">
                      + Registrar "{search}" como nuevo
                    </span>
                    <p className="text-xs text-muted-foreground">
                      Crear nuevo ítem en el catálogo
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Modal de Quick Create */}
      <Dialog open={showQuickCreate} onOpenChange={setShowQuickCreate}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Registrar Nuevo Ítem en Catálogo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Nombre *</Label>
              <Input
                value={quickCreateData.nombre}
                onChange={(e) =>
                  setQuickCreateData({ ...quickCreateData, nombre: e.target.value })
                }
                placeholder="Nombre del producto o servicio"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tipo *</Label>
                <Select
                  value={quickCreateData.tipo}
                  onValueChange={(v) =>
                    setQuickCreateData({ ...quickCreateData, tipo: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_ITEM.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        <div className="flex items-center gap-2">
                          <t.icon className="h-4 w-4" />
                          {t.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Precio Base * ({moneda})</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={quickCreateData.precioBase || ''}
                  onChange={(e) =>
                    setQuickCreateData({
                      ...quickCreateData,
                      precioBase: parseFloat(e.target.value) || 0,
                    })
                  }
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Categoría Fiscal *</Label>
                <Select
                  value={quickCreateData.categoriaFiscal}
                  onValueChange={(v) =>
                    setQuickCreateData({ ...quickCreateData, categoriaFiscal: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS_FISCALES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Tasa de Impuesto</Label>
                <Select
                  value={quickCreateData.tasaImpuestoId}
                  onValueChange={(v) =>
                    setQuickCreateData({ ...quickCreateData, tasaImpuestoId: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    {tasasImpuesto.map((tasa) => (
                      <SelectItem key={tasa.id} value={tasa.id}>
                        {tasa.nombre} ({tasa.porcentaje}%)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Descripción (opcional)</Label>
              <Textarea
                value={quickCreateData.descripcion}
                onChange={(e) =>
                  setQuickCreateData({ ...quickCreateData, descripcion: e.target.value })
                }
                placeholder="Descripción del producto o servicio..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowQuickCreate(false)}
              disabled={quickCreateLoading}
            >
              Cancelar
            </Button>
            <Button onClick={handleQuickCreate} disabled={quickCreateLoading}>
              {quickCreateLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Check className="h-4 w-4 mr-2" />
              )}
              Guardar y Seleccionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default CatalogSearchSelect;
