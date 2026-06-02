/**
 * Volkern CMS - Real Estate Property Card Component
 *
 * Muestra una tarjeta individual de propiedad para usar dentro de PropertyGrid
 */

"use client";

import React from "react";
import { Card as UICard, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Bed, Bath, Maximize, MapPin } from "lucide-react";

export interface PropertyCardData {
  id: string;
  nombre: string;
  descripcion?: string;
  precioBase: number;
  moneda: string;
  media?: Array<{ url: string }> | null;
  customFieldValues?: Record<string, any>;
  tenant?: { nombre: string; subdomain: string };
}

interface PropertyCardProps {
  property: PropertyCardData;
  showAgency?: boolean;
  onContact?: (propertyId: string) => void;
  className?: string;
}

export const PropertyCardComponent: React.FC<PropertyCardProps> = ({
  property,
  showAgency = false,
  onContact,
  className,
}) => {
  const fields = property.customFieldValues || {};
  const imageUrl =
    property.media && property.media.length > 0
      ? property.media[0].url
      : "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=600&q=80";

  const formatPrice = (price: number, currency: string) => {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: currency || "EUR",
      maximumFractionDigits: 0,
    }).format(price);
  };

  const operationLabel =
    fields.tipo_operacion === "venta"
      ? "Venta"
      : fields.tipo_operacion === "alquiler"
        ? "Alquiler"
        : "";

  return (
    <UICard
      className={cn(
        "group overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1",
        className
      )}
    >
      {/* Imagen */}
      <div className="relative aspect-[4/3] overflow-hidden">
        <img
          src={imageUrl}
          alt={property.nombre}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
        />
        {operationLabel && (
          <span
            className={cn(
              "absolute top-3 left-3 px-3 py-1 rounded-full text-xs font-semibold text-white shadow-md",
              fields.tipo_operacion === "venta"
                ? "bg-blue-600"
                : "bg-emerald-600"
            )}
          >
            {operationLabel}
          </span>
        )}
        {fields.destacada && (
          <span className="absolute top-3 right-3 bg-amber-500 text-white px-2 py-1 rounded-full text-xs font-bold shadow-md">
            ★ Destacada
          </span>
        )}
      </div>

      <CardContent className="p-4 space-y-3">
        {/* Precio */}
        <div className="flex items-center justify-between">
          <p className="text-xl font-bold text-primary">
            {formatPrice(property.precioBase, property.moneda)}
          </p>
          {fields.tipo_operacion === "alquiler" && (
            <span className="text-xs text-muted-foreground">/mes</span>
          )}
        </div>

        {/* Título */}
        <h3 className="font-semibold text-base line-clamp-1">
          {property.nombre}
        </h3>

        {/* Ubicación */}
        {(fields.zona || fields.direccion) && (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">
              {fields.zona || fields.direccion}
            </span>
          </div>
        )}

        {/* Características */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground pt-1">
          {fields.habitaciones && (
            <div className="flex items-center gap-1">
              <Bed className="w-4 h-4" />
              <span>{fields.habitaciones} hab</span>
            </div>
          )}
          {fields.banos && (
            <div className="flex items-center gap-1">
              <Bath className="w-4 h-4" />
              <span>{fields.banos} baños</span>
            </div>
          )}
          {fields.superficie_total && (
            <div className="flex items-center gap-1">
              <Maximize className="w-4 h-4" />
              <span>{fields.superficie_total} m²</span>
            </div>
          )}
        </div>

        {/* Agencia */}
        {showAgency && property.tenant && (
          <p className="text-xs text-muted-foreground border-t pt-2">
            {property.tenant.nombre}
          </p>
        )}

        {/* Botón contacto */}
        {onContact && (
          <Button
            variant="outline"
            size="sm"
            className="w-full mt-1"
            onClick={(e) => {
              e.preventDefault();
              onContact(property.id);
            }}
          >
            Consultar
          </Button>
        )}
      </CardContent>
    </UICard>
  );
};
