'use client';

/**
 * Aspecto y dominio del Booking Engine, en el panel: plantilla (4 marcos
 * visuales), colores/radios de la página pública y el dominio propio del
 * tenant con su verificación DNS.
 *
 * Todo viaja en la MISMA configuración (`hospitality_booking_config`); el
 * guardado lo valida el módulo puro (`booking-plantillas` + `booking-config`):
 * lo inválido no entra, y si el dominio cambia, la verificación se invalida.
 */

import { useState, useRef } from 'react';
import { Loader2, Globe, CheckCircle2, XCircle, RefreshCcw, ImagePlus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { PLANTILLAS_CATALOGO, type PlantillaBooking } from '@/lib/hospitality/booking-plantillas';

export interface AspectoActual {
  plantilla: string | null;
  personalizacion: { colorPrimario: string; colorFondo: string; colorTexto: string; radioTarjeta: string } | null;
  /** Logo del hotel (URL pública); null = sin logo (cabecera con el título). */
  logo: string | null;
  dominio: string | null;
  dominioVerificado: boolean;
  slug: string;
}

const COLORES_SUGERIDOS = ['#0f766e', '#1d4ed8', '#7c3aed', '#b91c1c', '#c2410c', '#0f172a'];

export function AspectoBookingPanel({ actual, onGuardado }: { actual: AspectoActual; onGuardado?: () => void }) {
  const [plantilla, setPlantilla] = useState<PlantillaBooking>((actual.plantilla as PlantillaBooking) || 'clasica');
  const [colorPrimario, setColorPrimario] = useState(actual.personalizacion?.colorPrimario || '#0f766e');
  const [colorFondo, setColorFondo] = useState(actual.personalizacion?.colorFondo || '#ffffff');
  const [colorTexto, setColorTexto] = useState(actual.personalizacion?.colorTexto || '#0f172a');
  const [dominio, setDominio] = useState(actual.dominio || '');
  // Logo de la cabecera: URL pública (la que devuelve la subida a S3/R2).
  const [logo, setLogo] = useState<string | null>(actual.logo ?? null);
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const inputLogoRef = useRef<HTMLInputElement>(null);
  const [verificado, setVerificado] = useState(actual.dominioVerificado);
  const [guardando, setGuardando] = useState(false);
  const [verificando, setVerificando] = useState(false);

  const guardar = async () => {
    setGuardando(true);
    try {
      const res = await fetch('/api/hospitality/booking', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: actual.slug,
          plantilla,
          personalizacion: { colorPrimario, colorFondo, colorTexto },
          logo: logo ?? '',
          dominio: dominio.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar');
      toast.success('Aspecto y dominio guardados');
      setVerificado(Boolean(data.config?.dominioVerificado));
      onGuardado?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setGuardando(false);
    }
  };

  // Subida del logo: va a S3/R2 como archivo público y se guarda su URL en la
  // configuración al pulsar «Guardar» (la subida sola no cambia la página).
  const subirLogo = async (file: File) => {
    setSubiendoLogo(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('tipo', 'booking-logo');
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'No se pudo subir el logo');
      const url = (data?.publicUrl || data?.downloadUrl || data?.url || '') as string;
      if (!url) throw new Error('La subida no devolvió una URL');
      setLogo(url);
      toast.success('Logo listo: pulsa Guardar para aplicarlo');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al subir el logo');
    } finally {
      setSubiendoLogo(false);
      if (inputLogoRef.current) inputLogoRef.current.value = '';
    }
  };

  const verificarDns = async () => {
    if (!dominio.trim()) {
      toast.error('Escribe primero tu dominio, ej: reservas.mihotel.com');
      return;
    }
    setVerificando(true);
    try {
      // Guardar ANTES de verificar: el token TXT se calcula con el dominio ya
      // normalizado y el slug del tenant.
      await guardar();
      const res = await fetch('/api/hospitality/booking/dominio/verificar', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo verificar');
      if (data.verificado) {
        setVerificado(true);
        toast.success('¡Dominio verificado! Ya puedes apuntar el DNS.');
      } else {
        setVerificado(false);
        toast.error(data.motivo === 'sin_dns'
          ? 'Aún no veo el registro TXT. Puede tardar unos minutos en propagarse.'
          : data.error || 'Verificación fallida');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al verificar');
    } finally {
      setVerificando(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Globe className="h-4 w-4 text-muted-foreground" /> Aspecto y dominio
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* ── Plantilla ── */}
        <div>
          <Label className="text-sm font-medium">Plantilla de la página de reservas</Label>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {PLANTILLAS_CATALOGO.map((p) => (
              <button
                key={p.valor}
                type="button"
                onClick={() => setPlantilla(p.valor)}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  plantilla === p.valor ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{p.nombre}</span>
                  {plantilla === p.valor ? <CheckCircle2 className="h-4 w-4 text-primary" /> : null}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{p.descripcion}</p>
              </button>
            ))}
          </div>
        </div>

        {/* ── Personalización ── */}
        <div>
          <Label className="text-sm font-medium">Colores de tu página</Label>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <input
              type="color"
              value={colorPrimario}
              onChange={(e) => setColorPrimario(e.target.value)}
              className="h-9 w-12 cursor-pointer rounded border"
              title="Color del botón principal"
            />
            <input
              type="color"
              value={colorFondo}
              onChange={(e) => setColorFondo(e.target.value)}
              className="h-9 w-12 cursor-pointer rounded border"
              title="Color de fondo"
            />
            <input
              type="color"
              value={colorTexto}
              onChange={(e) => setColorTexto(e.target.value)}
              className="h-9 w-12 cursor-pointer rounded border"
              title="Color del texto"
            />
            <div className="flex gap-1">
              {COLORES_SUGERIDOS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColorPrimario(c)}
                  className="h-6 w-6 rounded-full border shadow-sm"
                  style={{ background: c }}
                  title={`Usar ${c}`}
                />
              ))}
            </div>
          </div>
          {/* Vista previa en vivo con las mismas variables que la página pública */}
          <div
            className="mt-3 rounded-lg border p-3"
            style={{ background: colorFondo, color: colorTexto, ['--primary' as never]: colorPrimario, borderRadius: '0.75rem' }}
          >
            <p className="text-sm font-medium">Vista previa</p>
            <button className="mt-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white" style={{ background: colorPrimario }}>
              Reservar ahora
            </button>
          </div>
        </div>

        {/* ── Logo de la cabecera ── */}
        <div>
          <Label className="text-sm font-medium">Logo de tu página</Label>
          <p className="mt-1 text-xs text-muted-foreground">
            Imagen (PNG, SVG o JPG), máx. 5 MB. Aparece encima del título en tu página de reservas.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logo}
                alt="Logo del hotel"
                className="h-14 w-auto max-w-[180px] rounded-md border bg-white object-contain p-1"
              />
            ) : null}
            <input
              ref={inputLogoRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp,image/x-icon,.png,.jpg,.jpeg,.svg,.webp,.ico"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void subirLogo(f);
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => inputLogoRef.current?.click()}
              disabled={subiendoLogo}
            >
              {subiendoLogo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 h-4 w-4" />}
              {subiendoLogo ? 'Subiendo…' : logo ? 'Cambiar logo' : 'Subir logo'}
            </Button>
            {logo ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => setLogo(null)}>
                <Trash2 className="mr-2 h-4 w-4" /> Quitar
              </Button>
            ) : null}
          </div>
          {logo && logo !== actual.logo ? (
            <p className="mt-2 text-xs text-amber-600">Pulsa «Guardar aspecto y dominio» para aplicarlo.</p>
          ) : null}
        </div>

        {/* ── Dominio propio ── */}
        <div>
          <Label className="text-sm font-medium">Tu propio dominio (opcional)</Label>
          <p className="mt-1 text-xs text-muted-foreground">
            Sirve tu página de reservas en tu propio dominio, ej: <span className="font-mono">reservas.mihotel.com</span>.
            Tras verificar, apunta un <span className="font-mono">CNAME</span> a <span className="font-mono">volkern.app</span>.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Input
              value={dominio}
              onChange={(e) => setDominio(e.target.value)}
              placeholder="reservas.mihotel.com"
              className="max-w-xs font-mono text-sm"
            />
            {dominio.trim() ? (
              verificado ? (
                <Badge variant="outline" className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700">
                  <CheckCircle2 className="h-3 w-3" /> Verificado
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 border-amber-200 bg-amber-50 text-amber-700">
                  <XCircle className="h-3 w-3" /> Sin verificar
                </Badge>
              )
            ) : null}
          </div>
          {dominio.trim() && !verificado ? (
            <div className="mt-2 rounded-md border bg-muted/50 p-3 text-xs">
              <p className="font-medium">Para verificar, crea este registro TXT en tu DNS:</p>
              <p className="mt-1 font-mono text-[11px] break-all">
                _volkern-booking.{dominio.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')} TXT "volkern-booking={actual.slug}"
              </p>
              <Button size="sm" variant="outline" className="mt-2" onClick={verificarDns} disabled={verificando || guardando}>
                {verificando ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <RefreshCcw className="mr-2 h-3 w-3" />}
                Comprobar ahora
              </Button>
            </div>
          ) : null}
        </div>

        <Button onClick={guardar} disabled={guardando}>
          {guardando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Guardar aspecto y dominio
        </Button>
      </CardContent>
    </Card>
  );
}
