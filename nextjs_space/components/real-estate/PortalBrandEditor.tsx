'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ImageUploader } from '@/components/ui/image-uploader';
import { Loader2, Save, MessageCircle, Check } from 'lucide-react';
import { tokensPortal, type PlantillaPortal } from '@/lib/real-estate/portal-templates';
import { fondoHeroMarca, fondoConTextoBlanco } from '@/lib/real-estate/contraste';
import { normalizarTelefono, urlWhatsapp } from '@/lib/real-estate/portal-branding';

interface Marca {
  logoUrl: string;
  primaryColor: string;
  companyName: string;
  claim: string;
  telefono: string;
  nombreCuenta: string;
}

const VACIA: Marca = {
  logoUrl: '',
  primaryColor: '#3b82f6',
  companyName: '',
  claim: '',
  telefono: '',
  nombreCuenta: '',
};

/**
 * Editor de marca del portal.
 *
 * Cada oficina deja aquí su logo, color, nombre comercial, WhatsApp y claim, ve
 * cómo queda el portal antes de guardar y publica sin que nadie más intervenga:
 * al guardar se limpia la caché de marca y se revalidan las páginas públicas.
 */
export default function PortalBrandEditor({ plantilla }: { plantilla: PlantillaPortal }) {
  const [marca, setMarca] = useState<Marca>(VACIA);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    fetch('/api/real-estate/portal/branding')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('No se pudo cargar'))))
      .then((datos) => {
        setMarca({
          logoUrl: datos.logoUrl || '',
          primaryColor: datos.primaryColor || '#3b82f6',
          companyName: datos.companyName || datos.nombreCuenta || '',
          claim: datos.claim || '',
          telefono: datos.telefono || '',
          nombreCuenta: datos.nombreCuenta || '',
        });
      })
      .catch(() => setError('No pudimos cargar la marca actual.'))
      .finally(() => setCargando(false));
  }, []);

  const cambiar = (parcial: Partial<Marca>) => {
    setMarca((prev) => ({ ...prev, ...parcial }));
    setGuardado(false);
  };

  const guardar = async () => {
    setGuardando(true);
    setError('');
    setGuardado(false);

    try {
      const res = await fetch('/api/real-estate/portal/branding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          logoUrl: marca.logoUrl,
          primaryColor: marca.primaryColor,
          companyName: marca.companyName,
          claim: marca.claim,
          telefono: marca.telefono,
        }),
      });

      const datos = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(datos.error || 'No se pudo guardar la marca.');
        return;
      }

      setMarca((prev) => ({ ...prev, ...datos, nombreCuenta: datos.nombreCuenta || prev.nombreCuenta }));
      setGuardado(true);
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  const tokens = tokensPortal(plantilla);
  const hero = fondoHeroMarca(marca.primaryColor);
  const accion = fondoConTextoBlanco(marca.primaryColor);
  const nombreVisible = marca.companyName || marca.nombreCuenta || 'Tu inmobiliaria';
  const whatsapp = urlWhatsapp(
    marca.telefono,
    `Hola, quiero información sobre una propiedad de ${nombreVisible}`
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Marca del portal</CardTitle>
        <CardDescription>
          Logo, color, nombre, WhatsApp y claim. Se publica al guardar, sin esperas.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {cargando ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando marca…
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            {/* ── Formulario ─────────────────────────────────────────────── */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Logo</Label>
                <ImageUploader
                  images={marca.logoUrl ? [marca.logoUrl] : []}
                  onChange={(imgs) => cambiar({ logoUrl: imgs[0] || '' })}
                  maxImages={1}
                />
                <p className="text-xs text-muted-foreground">
                  Fondo transparente y horizontal se ve mejor en la cabecera.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="marca-nombre">Nombre comercial</Label>
                  <Input
                    id="marca-nombre"
                    value={marca.companyName}
                    onChange={(e) => cambiar({ companyName: e.target.value })}
                    placeholder={marca.nombreCuenta || 'Mi inmobiliaria'}
                    maxLength={120}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="marca-telefono">Teléfono / WhatsApp</Label>
                  <Input
                    id="marca-telefono"
                    value={marca.telefono}
                    onChange={(e) => cambiar({ telefono: e.target.value })}
                    placeholder="34612345678"
                    inputMode="tel"
                  />
                  <p className="text-xs text-muted-foreground">
                    {marca.telefono && !normalizarTelefono(marca.telefono)
                      ? 'Incluye el prefijo del país y solo dígitos.'
                      : 'Con prefijo del país, sin + ni espacios. Activa el botón de WhatsApp en las fichas.'}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="marca-claim">Claim</Label>
                <Input
                  id="marca-claim"
                  value={marca.claim}
                  onChange={(e) => cambiar({ claim: e.target.value })}
                  placeholder="Inmobiliaria de barrio, trato directo"
                  maxLength={140}
                />
                <p className="text-xs text-muted-foreground">{marca.claim.length}/140</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="marca-color">Color de marca</Label>
                <div className="flex items-center gap-2">
                  <input
                    id="marca-color"
                    type="color"
                    value={marca.primaryColor}
                    onChange={(e) => cambiar({ primaryColor: e.target.value })}
                    className="h-9 w-12 cursor-pointer rounded border bg-transparent p-0.5"
                    aria-label="Selector de color"
                  />
                  <Input
                    value={marca.primaryColor}
                    onChange={(e) => cambiar({ primaryColor: e.target.value })}
                    className="max-w-[140px] font-mono uppercase"
                    maxLength={7}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  El texto del hero se ajusta solo para no perder contraste.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" onClick={guardar} disabled={guardando}>
                  {guardando ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando…
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" /> Guardar marca
                    </>
                  )}
                </Button>
                {guardado && (
                  <span className="flex items-center gap-1 text-sm font-medium text-emerald-600">
                    <Check className="h-4 w-4" /> Publicado
                  </span>
                )}
                {error && <span className="text-sm text-red-600">{error}</span>}
              </div>
            </div>

            {/* ── Vista previa ───────────────────────────────────────────── */}
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Vista previa
              </Label>
              <div className={`overflow-hidden border ${tokens.radio} bg-white`}>
                <div className="flex items-center justify-between border-b px-3 py-2">
                  <div className="flex items-center gap-2">
                    {marca.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={marca.logoUrl}
                        alt={nombreVisible}
                        className="h-6 max-w-[70px] object-contain"
                      />
                    ) : (
                      <span
                        className="flex h-6 w-6 items-center justify-center rounded text-[11px] font-bold text-white"
                        style={{ backgroundColor: accion }}
                      >
                        {nombreVisible.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span className="text-xs font-semibold text-gray-900">{nombreVisible}</span>
                  </div>
                  <span
                    className="rounded px-2 py-1 text-[10px] font-medium text-white"
                    style={{ backgroundColor: accion }}
                  >
                    Ver catálogo
                  </span>
                </div>

                <div
                  className="px-3 py-4"
                  style={{
                    backgroundImage: `linear-gradient(135deg, ${hero.base} 0%, ${hero.fin} 100%)`,
                    color: hero.texto,
                  }}
                >
                  <p className="text-[9px] font-semibold uppercase tracking-[0.18em] opacity-80">
                    Inmobiliaria
                  </p>
                  <p className={`mt-1 text-sm font-bold leading-tight ${tokens.titulo}`}>
                    {nombreVisible}
                  </p>
                  <p className="mt-1 text-[10px] leading-relaxed opacity-90">
                    {marca.claim || 'Compra, venta y alquiler con atención directa de la oficina.'}
                  </p>
                </div>

                <div className="space-y-2 bg-gray-50 p-3">
                  <p className="text-[10px] font-semibold text-gray-700">¿Te interesa?</p>
                  <div
                    className="rounded px-2 py-1.5 text-center text-[10px] font-medium text-white"
                    style={{ backgroundColor: accion }}
                  >
                    Solicitar información
                  </div>
                  {whatsapp ? (
                    <div className="flex items-center justify-center gap-1 rounded border border-emerald-200 bg-white px-2 py-1.5 text-[10px] font-medium text-emerald-700">
                      <MessageCircle className="h-3 w-3" /> Escribir por WhatsApp
                    </div>
                  ) : (
                    <p className="text-center text-[9px] text-muted-foreground">
                      Añade un WhatsApp para que la ficha tenga botón directo.
                    </p>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                La ficha real usa las fotos y el precio del inmueble; aquí sólo se previsualiza la
                marca.
              </p>
              {plantilla === 'marca' && (
                <Badge variant="secondary" className="text-[9px] uppercase">
                  Plantilla {plantilla}
                </Badge>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
