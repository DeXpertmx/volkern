/**
 * Volkern CMS - Real Estate Property Detail Component
 *
 * Componente Puck para mostrar la ficha completa de una propiedad individual
 */

"use client";

import React, { useState, useEffect, use } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Bed,
  Bath,
  Maximize,
  MapPin,
  Calendar,
  Home,
  Car,
  Waves,
  TreePine,
  Warehouse,
  Sun,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Share2,
  Heart,
} from "lucide-react";
import { PropertyContactForm } from "./PropertyContactForm";

interface PropertyDetailProps {
  propertyId: string;
  showContactForm: boolean;
  backLinkText?: string;
  tenantSlug?: string;
}

// ─── Feature Badge Helper ──────────────────────────────────────────────────────

const FEATURE_ICONS: Record<string, { icon: React.ReactNode; label: string }> = {
  ascensor: { icon: <Home className="w-4 h-4" />, label: "Ascensor" },
  parking: { icon: <Car className="w-4 h-4" />, label: "Parking" },
  piscina: { icon: <Waves className="w-4 h-4" />, label: "Piscina" },
  jardin: { icon: <TreePine className="w-4 h-4" />, label: "Jardín" },
  trastero: { icon: <Warehouse className="w-4 h-4" />, label: "Trastero" },
  amueblado: { icon: <Sun className="w-4 h-4" />, label: "Amueblado" },
};

// ─── Image Gallery ─────────────────────────────────────────────────────────────

const ImageGallery: React.FC<{ images: string[]; name: string }> = ({
  images,
  name,
}) => {
  const [current, setCurrent] = useState(0);
  const allImages =
    images.length > 0
      ? images
      : [
          "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1200&q=80",
        ];

  return (
    <div className="relative rounded-xl overflow-hidden group">
      <div className="aspect-[16/9] relative">
        <img
          src={allImages[current]}
          alt={`${name} - Imagen ${current + 1}`}
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-500"
        />
      </div>

      {allImages.length > 1 && (
        <>
          <button
            onClick={() =>
              setCurrent((p) => (p === 0 ? allImages.length - 1 : p - 1))
            }
            className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() =>
              setCurrent((p) => (p === allImages.length - 1 ? 0 : p + 1))
            }
            className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          {/* Dots */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
            {allImages.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrent(idx)}
                className={cn(
                  "w-2 h-2 rounded-full transition-all",
                  idx === current
                    ? "bg-white w-6"
                    : "bg-white/50 hover:bg-white/70"
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

// ─── Main Component ────────────────────────────────────────────────────────────

export const PropertyDetailComponent: React.FC<PropertyDetailProps> = ({
  propertyId,
  showContactForm = true,
  backLinkText,
  tenantSlug,
}) => {
  const [property, setProperty] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!propertyId) {
      setLoading(false);
      setError("ID de propiedad no especificado");
      return;
    }

    const params = new URLSearchParams();
    if (tenantSlug) params.set("slug", tenantSlug);

    fetch(`/api/public/real-estate/properties/${propertyId}?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error("Propiedad no encontrada");
        return r.json();
      })
      .then((data) => {
        // La API devuelve { property: {...} } o data directa
        setProperty(data.property || data);
      })
      .catch((err) => {
        console.error("[PropertyDetail] Error:", err);
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [propertyId, tenantSlug]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-pulse space-y-4 w-full max-w-4xl">
          <div className="aspect-[16/9] bg-muted rounded-xl" />
          <div className="h-8 bg-muted rounded w-2/3" />
          <div className="h-4 bg-muted rounded w-1/3" />
        </div>
      </div>
    );
  }

  if (error || !property) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <div className="text-5xl mb-4">🔍</div>
        <p className="text-lg font-medium">
          {error || "Propiedad no encontrada"}
        </p>
        {backLinkText && (
          <Button variant="outline" className="mt-4" asChild>
            <a href=".">{backLinkText}</a>
          </Button>
        )}
      </div>
    );
  }

  const fields = property.customFieldValues || {};
  const images = (property.media || []).map((m: any) =>
    typeof m === "string" ? m : m.url
  );

  const formatPrice = (price: number, currency: string) => {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: currency || "EUR",
      maximumFractionDigits: 0,
    }).format(price);
  };

  const booleans = ["ascensor", "parking", "piscina", "jardin", "trastero", "amueblado"];

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Back link */}
      {backLinkText && (
        <a
          href="."
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {backLinkText}
        </a>
      )}

      {/* Image Gallery */}
      <ImageGallery images={images} name={property.nombre} />

      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl md:text-4xl font-bold">
              {property.nombre}
            </h1>
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="w-4 h-4" />
              <span>
                {[fields.direccion, fields.zona].filter(Boolean).join(", ") ||
                  "Ubicación no especificada"}
              </span>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-3xl font-bold text-primary">
              {formatPrice(property.precioBase, property.moneda)}
            </p>
            {fields.tipo_operacion === "alquiler" && (
              <span className="text-sm text-muted-foreground">/mes</span>
            )}
          </div>
        </div>

        {/* Status badges */}
        <div className="flex flex-wrap gap-2">
          {fields.estado && (
            <Badge
              variant={
                fields.estado === "disponible"
                  ? "default"
                  : fields.estado === "reservada"
                    ? "secondary"
                    : "outline"
              }
            >
              {fields.estado}
            </Badge>
          )}
          {fields.tipo_operacion && (
            <Badge variant="outline">
              {fields.tipo_operacion === "venta" ? "Venta" : "Alquiler"}
            </Badge>
          )}
          {fields.tipo_inmueble && (
            <Badge variant="outline">{fields.tipo_inmueble}</Badge>
          )}
          {fields.certificacion_energetica && (
            <Badge variant="outline">
              Energía: {fields.certificacion_energetica}
            </Badge>
          )}
        </div>
      </div>

      {/* Key features grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {fields.habitaciones && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center p-4 text-center">
              <Bed className="w-6 h-6 text-primary mb-1" />
              <p className="text-2xl font-bold">{fields.habitaciones}</p>
              <p className="text-xs text-muted-foreground">Habitaciones</p>
            </CardContent>
          </Card>
        )}
        {fields.banos && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center p-4 text-center">
              <Bath className="w-6 h-6 text-primary mb-1" />
              <p className="text-2xl font-bold">{fields.banos}</p>
              <p className="text-xs text-muted-foreground">Baños</p>
            </CardContent>
          </Card>
        )}
        {fields.superficie_total && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center p-4 text-center">
              <Maximize className="w-6 h-6 text-primary mb-1" />
              <p className="text-2xl font-bold">{fields.superficie_total}</p>
              <p className="text-xs text-muted-foreground">m² totales</p>
            </CardContent>
          </Card>
        )}
        {fields.superficie_construida && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center p-4 text-center">
              <Home className="w-6 h-6 text-primary mb-1" />
              <p className="text-2xl font-bold">{fields.superficie_construida}</p>
              <p className="text-xs text-muted-foreground">m² construidos</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Description */}
      {property.descripcion && (
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">Descripción</h2>
          <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
            {property.descripcion}
          </p>
        </div>
      )}

      {/* Long description */}
      {fields.descripcion_larga && (
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">Más detalles</h2>
          <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
            {fields.descripcion_larga}
          </p>
        </div>
      )}

      {/* Features */}
      {booleans.some((b) => fields[b]) && (
        <div className="space-y-3">
          <h2 className="text-xl font-semibold">Características</h2>
          <div className="flex flex-wrap gap-3">
            {booleans.map((key) => {
              if (!fields[key]) return null;
              const feature = FEATURE_ICONS[key];
              return (
                <Badge
                  key={key}
                  variant="secondary"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm"
                >
                  {feature?.icon}
                  {feature?.label || key}
                </Badge>
              );
            })}
          </div>
        </div>
      )}

      {/* Location */}
      {fields.latitud && fields.longitud && (
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">Ubicación</h2>
          <div className="aspect-[16/6] rounded-xl overflow-hidden bg-muted">
            <iframe
              title="Mapa de ubicación"
              width="100%"
              height="100%"
              frameBorder="0"
              src={`https://www.openstreetmap.org/export/embed.html?bbox=${Number(fields.longitud) - 0.01}%2C${Number(fields.latitud) - 0.01}%2C${Number(fields.longitud) + 0.01}%2C${Number(fields.latitud) + 0.01}&layer=mapnik&marker=${fields.latitud}%2C${fields.longitud}`}
              style={{ border: "none" }}
              allowFullScreen
            />
          </div>
        </div>
      )}

      {/* Contact Form */}
      {showContactForm && (
        <div className="bg-muted/30 rounded-xl p-6 md:p-8">
          <PropertyContactForm
            propertyId={property.id}
            propertyName={property.nombre}
          />
        </div>
      )}
    </div>
  );
};
