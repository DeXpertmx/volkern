/**
 * Volkern CMS - Real Estate Contact Form Component
 *
 * Formulario de contacto para una propiedad específica.
 * Crea un lead en el CRM cuando se envía.
 */

"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, CheckCircle } from "lucide-react";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface PropertyContactFormProps {
  propertyId: string;
  propertyName?: string;
  title?: string;
  description?: string;
  submitText?: string;
  successMessage?: string;
  showPreferredDate?: boolean;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export const PropertyContactForm: React.FC<PropertyContactFormProps> = ({
  propertyId,
  propertyName,
  title = "Solicitar información",
  description = "Completa el formulario y te contactaremos para mostrarte esta propiedad.",
  submitText = "Enviar solicitud",
  successMessage = "¡Gracias! Te contactaremos pronto para coordinar una visita.",
  showPreferredDate = true,
}) => {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    message: "",
    preferredDate: "",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/public/real-estate/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId,
          ...formData,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Error al enviar solicitud");
      }

      setSubmitted(true);
    } catch (err: any) {
      console.error("[PropertyContactForm] Error:", err);
      setError(err.message || "Error de conexión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <Card className="max-w-lg mx-auto border-green-200 bg-green-50/50">
        <CardContent className="py-12 text-center">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <p className="text-lg font-semibold text-green-800">
            {successMessage}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-lg mx-auto">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {propertyName && (
          <p className="text-sm text-muted-foreground mt-1">
            Consultando sobre: <strong>{propertyName}</strong>
          </p>
        )}
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">
              Nombre <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="Tu nombre"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">
              Email <span className="text-red-500">*</span>
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="tu@email.com"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Teléfono</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              value={formData.phone}
              onChange={handleChange}
              placeholder="+34 600 000 000"
            />
          </div>

          {showPreferredDate && (
            <div className="space-y-2">
              <Label htmlFor="preferredDate">
                Fecha preferida para visita
              </Label>
              <Input
                id="preferredDate"
                name="preferredDate"
                type="date"
                value={formData.preferredDate}
                onChange={handleChange}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="message">Mensaje</Label>
            <Textarea
              id="message"
              name="message"
              value={formData.message}
              onChange={handleChange}
              placeholder="Cuéntanos qué te interesa de esta propiedad..."
              rows={3}
            />
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-50 rounded-lg p-2">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Enviando...
              </>
            ) : (
              submitText
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
