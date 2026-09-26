'use client';

/**
 * Sección Booking Engine (FASE 3.D) — configuración del lado del hotel.
 *
 * El plan pide: propiedades publicadas, previsualización de la experiencia y
 * enlaces públicos + embeds. La publicación de una propiedad es su estado
 * "conectada" (Puesta en marcha): esta pantalla lista qué se puede vender,
 * da el enlace público y el snippet de embed, y abre la previsualización.
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Reutiliza la API del dashboard del módulo: propiedades + unidades + config.
      const [propRes, unitRes, cfgRes] = await Promise.all([
        fetch('/api/hospitality/properties'),
        fetch('/api/hospitality/units'),
        fetch('/api/hospitality/booking'),
        fetch('/api/hospitality/properties'),
        fetch('/api/hospitality/units'),
      ]);
      const propData = await propRes.json();
      const unitData = await unitRes.json();
      const props: PropiedadBooking[] = (propData.properties || []).map((p: any) => ({
        id: p.id,
        nombre: p.nombre,
        ciudad: p.ciudad ?? null,
        estado: p.estado ?? 'activa',
        unidades: 0,
        tarifaDesde: null,
        moneda: '',
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
      if (cfgRes.ok) {
        const cfgData = await cfgRes.json();
        if (cfgData.config) {
          const c = cfgData.config;
          setAspecto({
            plantilla: c.plantilla ?? null,
            personalizacion: c.personalizacion ?? null,
            logo: c.logo ?? null,
            dominio: c.dominio ?? null,
            dominioVerificado: Boolean(c.dominioVerificado),
            slug: c.slug ?? '',
          });
        }
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
  const enlacePublico = (id: string) => `${origen}/booking/${id}`;
  const enlacePublicoEn = (id: string) => `${origen}/booking/${id}?lang=en`;

  const snippetEmbed = (id: string) =>
    `<iframe src="${enlacePublico(id)}?embed=1" style="width:100%;height:720px;border:0" title="Reservas"></iframe>`;

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

  const publicadas = propiedades.filter((p) => p.estado === 'conectada');

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
            Se publica una propiedad al completar Puesta en marcha (estado «conectada»).
          </span>
          <Button size="sm" variant="outline" className="ml-auto" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          </Button>
        </CardContent>
      </Card>

      {propiedades.map((p) => {
        const publicada = p.estado === 'conectada';
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

              {publicada ? (
                <>
                  <div>
                    <span className="text-xs font-medium text-muted-foreground">Enlace público de reserva (español)</span>
                    <div className="mt-1 flex gap-2">
                      <Input readOnly value={enlacePublico(p.id)} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
                      <Button size="sm" variant="outline" onClick={() => copiar(enlacePublico(p.id), `link-${p.id}`)} aria-label="Copiar enlace">
                        {copiado === `link-${p.id}` ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => window.open(enlacePublico(p.id), '_blank')} aria-label="Abrir previsualización">
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-muted-foreground">Enlace público de reserva (inglés)</span>
                    <div className="mt-1 flex gap-2">
                      <Input readOnly value={enlacePublicoEn(p.id)} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
                      <Button size="sm" variant="outline" onClick={() => copiar(enlacePublicoEn(p.id), `link-en-${p.id}`)} aria-label="Copiar enlace en inglés">
                        {copiado === `link-en-${p.id}` ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => window.open(enlacePublicoEn(p.id), '_blank')} aria-label="Abrir previsualización en inglés">
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-muted-foreground">Embed para tu web (iframe)</span>
                    <div className="mt-1 flex gap-2">
                      <Input readOnly value={snippetEmbed(p.id)} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
                      <Button size="sm" variant="outline" onClick={() => copiar(snippetEmbed(p.id), `embed-${p.id}`)} aria-label="Copiar embed">
                        {copiado === `embed-${p.id}` ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
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
                  Completa la Puesta en marcha de esta propiedad para publicarla en el motor de reservas.
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
