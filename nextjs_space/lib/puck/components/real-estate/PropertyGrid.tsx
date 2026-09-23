/**
 * Volkern CMS - Real Estate Property Grid Component
 *
 * Componente Puck que muestra un grid de propiedades con filtros.
 * Los datos se obtienen vía API pública en tiempo de renderizado.
 */

"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatearImporte, primeraMoneda } from "@/lib/moneda";
import { PropertyCardComponent } from "./PropertyCard";
import type { PropertyCardData } from "./PropertyCard";
import { Loader2, SlidersHorizontal, Grid3X3, List } from "lucide-react";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface PropertyGridProps {
  title: string;
  subtitle?: string;
  columns: 2 | 3 | 4;
  operationType: "venta" | "alquiler" | "todos";
  maxItems: number;
  showFilters: boolean;
  showMap: boolean;
  showAgency: boolean;
  tenantSlug?: string;
}

// ─── API Fetch Helper ──────────────────────────────────────────────────────────

interface FetchPropertiesParams {
  slug?: string;
  operation?: string;
  city?: string;
  minPrice?: string;
  maxPrice?: string;
  bedrooms?: string;
  limit: number;
  offset: number;
}

async function fetchProperties(params: FetchPropertiesParams): Promise<{
  properties: PropertyCardData[];
  pagination: { total: number; limit: number; offset: number };
}> {
  const searchParams = new URLSearchParams();
  if (params.slug) searchParams.set("slug", params.slug);
  if (params.operation) searchParams.set("operation", params.operation);
  if (params.city) searchParams.set("city", params.city);
  if (params.minPrice) searchParams.set("minPrice", params.minPrice);
  if (params.maxPrice) searchParams.set("maxPrice", params.maxPrice);
  if (params.bedrooms) searchParams.set("bedrooms", params.bedrooms);
  searchParams.set("limit", String(params.limit));
  searchParams.set("offset", String(params.offset));

  const res = await fetch(
    `/api/public/real-estate/properties?${searchParams.toString()}`
  );
  if (!res.ok) return { properties: [], pagination: { total: 0, limit: params.limit, offset: params.offset } };
  return res.json();
}

// ─── Component ─────────────────────────────────────────────────────────────────

export const PropertyGridComponent: React.FC<PropertyGridProps> = ({
  title,
  subtitle,
  columns,
  operationType,
  maxItems,
  showFilters,
  showAgency,
  tenantSlug,
}) => {
  const [properties, setProperties] = useState<PropertyCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Filtros locales
  const [filterCity, setFilterCity] = useState("");
  const [filterMinPrice, setFilterMinPrice] = useState("");
  const [filterMaxPrice, setFilterMaxPrice] = useState("");
  const [filterBedrooms, setFilterBedrooms] = useState("");

  // La divisa del filtro es la de los inmuebles que se están mostrando: la
  // portada pública no tiene sesión de la que leer el tenant, y el símbolo lo
  // resuelve el formateador del módulo de dinero, no esta pantalla.
  const monedaDeLaLista = useMemo(
    () => primeraMoneda(...properties.map((p) => p.moneda)),
    [properties]
  );

  // Obtener slug del tenant desde la URL
  const effectiveSlug = useMemo(() => {
    if (tenantSlug) return tenantSlug;
    if (typeof window !== "undefined") {
      const match = window.location.pathname.match(/^\/p\/([^/]+)/);
      return match ? match[1] : undefined;
    }
    return undefined;
  }, [tenantSlug]);

  const loadProperties = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchProperties({
        slug: effectiveSlug,
        operation: operationType !== "todos" ? operationType : undefined,
        city: filterCity || undefined,
        minPrice: filterMinPrice || undefined,
        maxPrice: filterMaxPrice || undefined,
        bedrooms: filterBedrooms || undefined,
        limit: maxItems || 12,
        offset: 0,
      });
      setProperties(result.properties);
      setTotal(result.pagination?.total || 0);
    } catch (err) {
      console.error("[PropertyGrid] Error loading properties:", err);
      setError("Error al cargar propiedades");
    } finally {
      setLoading(false);
    }
  }, [effectiveSlug, operationType, filterCity, filterMinPrice, filterMaxPrice, filterBedrooms, maxItems]);

  useEffect(() => {
    if (effectiveSlug) {
      loadProperties();
    } else {
      setLoading(false);
    }
  }, [effectiveSlug, loadProperties]);

  const gridCols = {
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
  };

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      {(title || subtitle) && (
        <div className="text-center space-y-2">
          {title && (
            <h2 className="text-3xl md:text-4xl font-bold">{title}</h2>
          )}
          {subtitle && (
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {subtitle}
            </p>
          )}
        </div>
      )}

      {/* Filtros */}
      {showFilters && (
        <div className="bg-muted/30 rounded-xl p-4 md:p-6">
          <div className="flex items-center gap-2 mb-3 text-sm font-medium text-muted-foreground">
            <SlidersHorizontal className="w-4 h-4" />
            <span>Filtrar propiedades</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Ciudad/Zona</label>
              <Input
                placeholder="Ej: Madrid"
                value={filterCity}
                onChange={(e) => setFilterCity(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Precio mínimo</label>
              <Input
                type="number"
                placeholder={formatearImporte(0, monedaDeLaLista, 0)}
                value={filterMinPrice}
                onChange={(e) => setFilterMinPrice(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Precio máximo</label>
              <Input
                type="number"
                placeholder="Sin límite"
                value={filterMaxPrice}
                onChange={(e) => setFilterMaxPrice(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Habitaciones</label>
              <Select value={filterBedrooms} onValueChange={setFilterBedrooms}>
                <SelectTrigger>
                  <SelectValue placeholder="Cualquiera" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Cualquiera</SelectItem>
                  <SelectItem value="1">1+</SelectItem>
                  <SelectItem value="2">2+</SelectItem>
                  <SelectItem value="3">3+</SelectItem>
                  <SelectItem value="4">4+</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            variant="default"
            size="sm"
            className="mt-3"
            onClick={loadProperties}
          >
            Buscar
          </Button>
        </div>
      )}

      {/* Grid de propiedades */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg">{error}</p>
          <Button variant="outline" className="mt-4" onClick={loadProperties}>
            Reintentar
          </Button>
        </div>
      ) : properties.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <div className="text-5xl mb-4">🏠</div>
          <p className="text-lg font-medium">No hay propiedades disponibles</p>
          <p className="text-sm mt-1">
            {effectiveSlug
              ? "Actualmente no tenemos propiedades que coincidan con tu búsqueda."
              : "Configura el slug del tenant en las propiedades del componente."}
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <p>
              {total} propiedad{total !== 1 ? "es" : ""} encontrada
              {total !== 1 ? "s" : ""}
            </p>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Grid3X3 className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <List className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className={cn("grid gap-6", gridCols[columns || 3])}>
            {properties.map((property) => (
              <PropertyCardComponent
                key={property.id}
                property={property}
                showAgency={showAgency}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};
