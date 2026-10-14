'use client';

/**
 * Sección Booking Engine (FASE 3.D) — configuración del lado del hotel.
 *
 * El plan pide: propiedades publicadas, previsualización de la experiencia y
 * enlaces públicos + embeds.
 *
 * Hay UN solo criterio de publicación: la lista que esta pantalla manda
 * (`propiedadesPublicadas`) es la que lee la página pública única
 * (`/reservar/<slug>`). Antes de encender el interruptor la propiedad tiene que
 * estar `conectada` (Puesta en marcha), pero publicar y retirar se hace aquí.
 */

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, Copy, ExternalLink, Globe, Loader2, Plus, RefreshCcw, ShoppingBag, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AccionHospitality } from '@/components/hospitality/AccionHospitality';
import { formatearImporte } from '@/lib/moneda';
import { useMonedaTenant } from '@/lib/use-moneda-tenant';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { AspectoBookingPanel, type AspectoActual } from '@/components/hospitality/booking/AspectoBookingPanel';
import { urlPublicaBooking, codigoEmbedBooking } from '@/lib/hospitality/booking-urls';
// El enlace público y el embed de la página de reservas los compone el módulo
// PURO de URLs (`booking-urls`, sin base de datos): una sola forma de escribir
// la URL en todo el producto — y el módulo de configuración las reexporta.
// (Importarlas del de configuración metía Prisma en el bundle del navegador.)

interface ExtraCatalogoPanel {
  id: string;
  nombre: string;
  descripcionEs: string | null;
  descripcionEn: string | null;
  precio: number;
  moneda: string;
  precioPorNoche: boolean;
  activo: boolean;
  orden: number;
}

const EXTRA_VACIO = {
  id: null as string | null,
  nombre: '',
  precio: '',
  // Sin divisa: la resuelve la API con la moneda de reporte del tenant (el
  // formulario no ofrece elegirla, así que no se inventa una por defecto).
  moneda: '',
  precioPorNoche: false,
  descripcionEs: '',
  descripcionEn: '',
};

interface PropiedadBooking {
  id: string;
  nombre: string;
  ciudad: string | null;
  estado: string;
  unidades: number;
  tarifaDesde: number | null;
  moneda: string;
  /** Publicada en la página de reservas: lo dice la config, no el estado. */
  publicada: boolean;
}

export default function BookingEngineConfig() {
  /** Moneda de reporte del tenant: respaldo de la divisa de cada propiedad. */
  const monedaTenant = useMonedaTenant();
  const [loading, setLoading] = useState(true);
  const [propiedades, setPropiedades] = useState<PropiedadBooking[]>([]);
  const [origen, setOrigen] = useState('');
  const [copiado, setCopiado] = useState<string | null>(null);

  // Catálogo de extras por propiedad (la clave es el propertyId).
  const [extrasPorPropiedad, setExtrasPorPropiedad] = useState<Record<string, ExtraCatalogoPanel[]>>({});
  const [extrasAbiertos, setExtrasAbiertos] = useState<string | null>(null);
  const [borrador, setBorrador] = useState(EXTRA_VACIO);
  const [guardandoExtra, setGuardandoExtra] = useState(false);

  // Aspecto y dominio (plantilla, colores, dominio propio del tenant).
  const [aspecto, setAspecto] = useState<AspectoActual | null>(null);
  // Propiedad que se está publicando/retirando (el switch espera su respuesta).
  const [publicando, setPublicando] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Reutiliza la API del dashboard del módulo: propiedades + unidades + config.
      const [propRes, unitRes, cfgRes] = await Promise.all([
        fetch('/api/hospitality/properties'),
        fetch('/api/hospitality/units'),
        fetch('/api/hospitality/booking'),
      ]);
      const propData = await propRes.json();
      const unitData = await unitRes.json();
      // Qué está publicado lo dice la CONFIG del booking (no el estado de la
      // propiedad): es la misma lista que lee la página pública para decidir qué
      // enseña, así que el panel no puede contar otra cosa.
      const cfgData = cfgRes.ok ? await cfgRes.json() : null;
      const publicadasIds: string[] = (cfgData?.config?.propiedadesPublicadas || []).filter(
        (id: unknown): id is string => typeof id === 'string'
      );

      const props: PropiedadBooking[] = (propData.properties || []).map((p: any) => ({
        id: p.id,
        nombre: p.nombre,
        ciudad: p.ciudad ?? null,
        estado: p.estado ?? 'activa',
        unidades: 0,
        tarifaDesde: null,
        moneda: '',
        publicada: publicadasIds.includes(p.id),
      }));
      // Cada propiedad se escribe con la divisa de sus unidades (la de la más
      // barata, que es la tarifa que se enseña) y, si no tiene ninguna con
      // tarifa, con la moneda de reporte del tenant.
      for (const u of unitData.units || []) {
        const p = props.find((x) => x.id === u.propertyId);
        if (!p) continue;
        p.unidades += 1;
        const tarifa = u.tarifaBase ?? null;
        if (tarifa != null && (p.tarifaDesde == null || tarifa < p.tarifaDesde)) {
          p.tarifaDesde = tarifa;
          p.moneda = u.moneda || p.moneda;
        }
      }
      for (const p of props) {
        if (!p.moneda) p.moneda = monedaTenant;
      }
      setPropiedades(props);
      // Config del Booking Engine: plantilla, colores y dominio para la sección.
      if (cfgData?.config) {
        const c = cfgData.config;
        setAspecto({
          plantilla: c.plantilla ?? null,
          personalizacion: c.personalizacion ?? null,
          dominio: c.dominio ?? null,
          dominioVerificado: Boolean(c.dominioVerificado),
          slug: c.slug ?? '',
        });
      }
    } catch {
      toast.error('Error al cargar las propiedades');
    } finally {
      setLoading(false);
    }
  }, [monedaTenant]);

  useEffect(() => {
    setOrigen(window.location.origin);
    load();
  }, [load]);

  /**
   * Publica o retira una propiedad de la página de reservas.
   *
   * Se manda la lista COMPLETA (la config la guarda tal cual, saneada contra las
   * propiedades del tenant): publicar una propiedad no puede retirar las demás.
   * El resto de la configuración viaja solo con su `slug`, porque la API
   * conserva lo que no se le manda.
   */
  const publicar = async (propertyId: string, valor: boolean) => {
    if (!aspecto?.slug || publicando) return;
    const actuales = propiedades.filter((p) => p.publicada).map((p) => p.id);
    const siguientes = valor
      ? Array.from(new Set([...actuales, propertyId]))
      : actuales.filter((id) => id !== propertyId);

    setPublicando(propertyId);
    try {
      const res = await fetch('/api/hospitality/booking', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: aspecto.slug, propiedadesPublicadas: siguientes }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo cambiar la publicación');
      toast.success(valor ? 'Propiedad publicada en tu motor de reservas' : 'Propiedad retirada de tu motor de reservas');
      setPropiedades((prev) => prev.map((p) => (p.id === propertyId ? { ...p, publicada: valor } : p)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al cambiar la publicación');
      await load();
    } finally {
      setPublicando(null);
    }
  };

  const abrirExtras = async (propertyId: string) => {
    if (extrasAbiertos === propertyId) {
      setExtrasAbiertos(null);
      return;
    }
    setExtrasAbiertos(propertyId);
    setBorrador(EXTRA_VACIO);
    try {
      const res = await fetch(`/api/hospitality/extras?propertyId=${propertyId}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setExtrasPorPropiedad((prev) => ({ ...prev, [propertyId]: data.extras || [] }));
    } catch {
      toast.error('No se pudo cargar el catálogo de extras');
    }
  };

  const guardarExtra = async (propertyId: string) => {
    if (guardandoExtra) return;
    if (!borrador.nombre.trim()) {
      toast.error('El nombre del extra es requerido');
      return;
    }
    const precio = Number(borrador.precio);
    if (!Number.isFinite(precio) || precio < 0) {
      toast.error('El precio debe ser un número ≥ 0');
      return;
    }
    setGuardandoExtra(true);
    try {
      const res = await fetch('/api/hospitality/extras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId,
          id: borrador.id,
          nombre: borrador.nombre,
          precio,
          moneda: borrador.moneda,
          precioPorNoche: borrador.precioPorNoche,
          descripcionEs: borrador.descripcionEs,
          descripcionEn: borrador.descripcionEn,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        toast.error(data?.error || 'No se pudo guardar el extra');
        return;
      }
      toast.success(borrador.id ? 'Extra actualizado' : 'Extra creado');
      setBorrador(EXTRA_VACIO);
      await abrirExtras(propertyId);
      setExtrasAbiertos(propertyId); // reabrir tras recargar
    } finally {
      setGuardandoExtra(false);
    }
  };

  const alternarExtra = async (propertyId: string, extra: ExtraCatalogoPanel) => {
    try {
      const res = await fetch('/api/hospitality/extras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId,
          id: extra.id,
          nombre: extra.nombre,
          precio: extra.precio,
          moneda: extra.moneda,
          precioPorNoche: extra.precioPorNoche,
          descripcionEs: extra.descripcionEs,
          descripcionEn: extra.descripcionEn,
          activo: !extra.activo,
        }),
      });
      if (!res.ok) throw new Error();
      await abrirExtras(propertyId);
      setExtrasAbiertos(propertyId);
    } catch {
      toast.error('No se pudo cambiar el extra');
    }
  };

  // Enlace ES (sin parámetro) y EN (?lang=en) — el idioma lo aplica la página
  // pública vía lib/hospitality/booking-i18n.ts.
  // La página pública es UNA por alojamiento (`/reservar/<slug>`) y enseña las
  // propiedades que estén en la lista de publicación: el enlace y el embed ya no
  // se atan a una propiedad concreta — un enlace por propiedad era el resto de
  // las dos páginas que se unificaron.
  const enlacePublico = () => urlPublicaBooking(origen, aspecto?.slug || '');
  const enlacePublicoEn = () => `${urlPublicaBooking(origen, aspecto?.slug || '')}?lang=en`;

  const snippetEmbed = () => codigoEmbedBooking(origen, aspecto?.slug || '');

  const copiar = async (texto: string, clave: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(clave);
      toast.success('Copiado al portapapeles');
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      toast.error('No se pudo copiar');
    }
  };

  const publicadas = propiedades.filter((p) => p.publicada);

  return (
    <div className="space-y-4">
      {aspecto ? (
        <AspectoBookingPanel
          actual={aspecto}
          onGuardado={() => {
            load();
          }}
        />
      ) : null}

      <Card>
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <Globe className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm">
            {publicadas.length} de {propiedades.length} propiedades publicadas en tu motor de reservas
          </span>
          <span className="text-xs text-muted-foreground hidden lg:inline">
            Cada propiedad se publica con su interruptor, y antes tiene que estar conectada (Puesta en marcha).
          </span>
          <Button size="sm" variant="outline" className="ml-auto" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          </Button>
        </CardContent>
      </Card>

      {/* Una sola página de reservas por alojamiento: aquí se copian su enlace
          (ES/EN) y el embed. El interruptor de cada propiedad de abajo decide
          qué sale en ella — la MISMA lista que lee la página pública. */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Tu página de reservas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!aspecto?.slug ? (
            <p className="text-sm text-muted-foreground">
              Elige la dirección de tu página para poder compartirla.
            </p>
          ) : (
            <>
              <div>
                <span className="text-xs font-medium text-muted-foreground">Enlace público de reserva (español)</span>
                <div className="mt-1 flex gap-2">
                  <Input readOnly value={enlacePublico()} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
                  <Button size="sm" variant="outline" onClick={() => copiar(enlacePublico(), 'link-es')} aria-label="Copiar enlace">
                    {copiado === 'link-es' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => window.open(enlacePublico(), '_blank')} aria-label="Abrir previsualización">
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div>
                <span className="text-xs font-medium text-muted-foreground">Enlace público de reserva (inglés)</span>
                <div className="mt-1 flex gap-2">
                  <Input readOnly value={enlacePublicoEn()} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
                  <Button size="sm" variant="outline" onClick={() => copiar(enlacePublicoEn(), 'link-en')} aria-label="Copiar enlace en inglés">
                    {copiado === 'link-en' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => window.open(enlacePublicoEn(), '_blank')} aria-label="Abrir previsualización en inglés">
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div>
                <span className="text-xs font-medium text-muted-foreground">Embed para tu web (iframe)</span>
                <div className="mt-1 flex gap-2">
                  <Input readOnly value={snippetEmbed()} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
                  <Button size="sm" variant="outline" onClick={() => copiar(snippetEmbed(), 'embed')} aria-label="Copiar embed">
                    {copiado === 'embed' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Publica o retira propiedades con su interruptor: la misma lista decide qué se puede reservar en tu web.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {propiedades.map((p) => {
        const conectada = p.estado === 'conectada';
        const publicada = p.publicada;
        return (
          <Card key={p.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                {p.nombre}
                <Badge variant="outline" className={publicada ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : ''}>
                  {publicada ? 'Publicada' : 'Sin publicar'}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-xs text-muted-foreground">
                {p.unidades} {p.unidades === 1 ? 'unidad' : 'unidades'}
                {p.tarifaDesde != null && ` · desde ${formatearImporte(p.tarifaDesde, p.moneda)}/noche`}
                {p.ciudad ? ` · ${p.ciudad}` : ''}
              </div>

              {/* Publicación: es la lista que lee la página pública, no el estado
                  de la propiedad. Una propiedad conectada se puede publicar y
                  retirar sin volver a tocar la Puesta en marcha. */}
              {conectada ? (
                <div className="flex items-center justify-between gap-2 rounded-md border p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Publicar en el motor de reservas</p>
                    <p className="text-xs text-muted-foreground">
                      {publicada
                        ? 'Aparece en tu página de reservas con sus unidades y precios.'
                        : 'Con el interruptor apagado no se puede reservar esta propiedad desde tu web.'}
                    </p>
                  </div>
                  <AccionHospitality capacidad="reservas.editar">
                    <Switch
                      checked={publicada}
                      disabled={publicando === p.id}
                      onCheckedChange={(v) => publicar(p.id, v)}
                      aria-label={`Publicar ${p.nombre} en el motor de reservas`}
                    />
                  </AccionHospitality>
                </div>
              ) : null}

              {publicada ? (
                <>
                  {/* Extras comprables: catálogo por propiedad. */}
                  <div className="rounded-md border p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Extras comprables</span>
                        <span className="text-xs text-muted-foreground">desayuno, late check-out, traslados…</span>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => abrirExtras(p.id)}>
                        {extrasAbiertos === p.id ? 'Ocultar' : 'Gestionar'}
                      </Button>
                    </div>

                    {extrasAbiertos === p.id && (
                      <div className="space-y-3">
                        {(extrasPorPropiedad[p.id] || []).length === 0 && (
                          <p className="text-xs text-muted-foreground">Todavía no hay extras: crea el primero y aparecerá en tu web.</p>
                        )}
                        {(extrasPorPropiedad[p.id] || []).map((e) => (
                          <div key={e.id} className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">
                                {e.nombre}{' '}
                                <span className="text-xs font-normal text-muted-foreground">
                                  {formatearImporte(e.precio, e.moneda)}
                                  {e.precioPorNoche ? '/noche' : ''}
                                </span>
                              </p>
                              {(e.descripcionEs || e.descripcionEn) && (
                                <p className="text-xs text-muted-foreground truncate">{e.descripcionEs || e.descripcionEn}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Switch checked={e.activo} onCheckedChange={() => alternarExtra(p.id, e)} aria-label={e.activo ? 'Desactivar' : 'Activar'} />
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  setBorrador({
                                    id: e.id,
                                    nombre: e.nombre,
                                    precio: String(e.precio),
                                    moneda: e.moneda,
                                    precioPorNoche: e.precioPorNoche,
                                    descripcionEs: e.descripcionEs || '',
                                    descripcionEn: e.descripcionEn || '',
                                  })
                                }
                              >
                                Editar
                              </Button>
                            </div>
                          </div>
                        ))}

                        <div className="space-y-2 border-t pt-3">
                          <p className="text-xs font-medium text-muted-foreground">
                            {borrador.id ? `Editando: ${borrador.nombre}` : 'Nuevo extra'}
                          </p>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <label className="text-sm">
                              <span className="font-medium">Nombre</span>
                              <Input value={borrador.nombre} onChange={(ev) => setBorrador({ ...borrador, nombre: ev.target.value })} className="mt-1" placeholder="Desayuno buffet" />
                            </label>
                            <label className="text-sm">
                              <span className="font-medium">Precio</span>
                              <Input value={borrador.precio} onChange={(ev) => setBorrador({ ...borrador, precio: ev.target.value })} className="mt-1" inputMode="decimal" placeholder="250" />
                            </label>
                            <label className="text-sm">
                              <span className="font-medium">Descripción (ES)</span>
                              <Input value={borrador.descripcionEs} onChange={(ev) => setBorrador({ ...borrador, descripcionEs: ev.target.value })} className="mt-1" />
                            </label>
                            <label className="text-sm">
                              <span className="font-medium">Descripción (EN)</span>
                              <Input value={borrador.descripcionEn} onChange={(ev) => setBorrador({ ...borrador, descripcionEn: ev.target.value })} className="mt-1" />
                            </label>
                          </div>
                          <div className="flex items-center gap-4">
                            <label className="flex items-center gap-2 text-sm">
                              <Switch checked={borrador.precioPorNoche} onCheckedChange={(v) => setBorrador({ ...borrador, precioPorNoche: v })} aria-label="Precio por noche" />
                              Precio por noche
                            </label>
                            <div className="ml-auto flex gap-2">
                              {borrador.id && (
                                <Button size="sm" variant="ghost" onClick={() => setBorrador(EXTRA_VACIO)}>
                                  Cancelar
                                </Button>
                              )}
                              <AccionHospitality capacidad="reservas.editar">
                                <Button size="sm" onClick={() => guardarExtra(p.id)} disabled={guardandoExtra}>
                                  <Plus className="mr-1 h-4 w-4" />
                                  {borrador.id ? 'Guardar cambios' : 'Crear extra'}
                                </Button>
                              </AccionHospitality>
                            </div>
                          </div>
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <Trash2 className="h-3 w-3" /> Los extras no se borran: desactívalos para dejar de venderlos sin perder el histórico de las reservas.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground">
                    La reserva entra a tu planning como canal «Directa» y, si tienes la cuenta de cobro conectada, el pago se cobra en línea a tu cuenta de Stripe.
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {conectada
                    ? 'Enciende el interruptor de publicación para vender esta propiedad desde tu web.'
                    : 'Completa la Puesta en marcha de esta propiedad para poder publicarla en el motor de reservas.'}
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}

      {!loading && propiedades.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Aún no hay propiedades. Créalas en Propiedades para empezar a vender.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
