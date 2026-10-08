'use client';

/**
 * Volkern Real Estate — Secciones del panel del editor de propiedades.
 *
 * Cada sección recibe el borrador y `actualizar` (autosave con debounce en el
 * shell). «Fotos» replica el diseño de referencia: dropzone con validación
 * JPEG/PNG 50 KB–20 MB, foto destacada con badge «Portada», menú «…»
 * (portada, quitar) y título por foto con contador N/100.
 */

import { useState, useRef, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import {
  HABITACIONES_GRUPOS,
  CAMAS_CATALOGO,
  SERVICIOS_GRUPOS,
  sumarDetalle,
} from '@/lib/real-estate/property-editor-config';
import {
  MAX_TITULO_FOTO,
  hacerPortada,
  type DraftInmueble,
} from '@/lib/real-estate/property-editor-draft';
import { MONEDAS_SELECCIONABLES } from '@/lib/moneda';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import {
  Home,
  MapPin,
  Phone,
  BedDouble,
  Sofa,
  Star,
  MoreHorizontal,
  Loader2,
  Upload,
  X,
  ChevronRight,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Tipos compartidos ───────────────────────────────────────────────────────

interface PropsSeccion {
  draft: DraftInmueble;
  actualizar: (cambios: Partial<DraftInmueble>) => void;
  abrirModal: (cual: 'habitaciones' | 'camas' | 'servicios') => void;
}

interface PropsFotos extends PropsSeccion {
  media: DraftInmueble['media'];
  onChange: (fotos: DraftInmueble['media']) => void;
}

/** Tarjeta clicable que abre un modal de detalle. */
function TarjetaDetalle({
  icono,
  titulo,
  resumen,
  onClick,
}: {
  icono: React.ReactNode;
  titulo: string;
  resumen: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-4 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-accent/40"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
        {icono}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{titulo}</span>
        <span className="block truncate text-sm text-muted-foreground">{resumen}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

function Subtitulo({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-3 text-sm font-semibold">{children}</h3>;
}

// ─── Descripción general ─────────────────────────────────────────────────────

export function SeccionDescripcion({ draft, actualizar, abrirModal }: PropsSeccion) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="ed-nombre">Título del anuncio</Label>
        <Input
          id="ed-nombre"
          value={draft.nombre}
          onChange={(e) => actualizar({ nombre: e.target.value })}
          placeholder="Apartamento céntrico con vistas"
          maxLength={100}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="ed-desc-corta">Descripción corta</Label>
        <Textarea
          id="ed-desc-corta"
          value={draft.descripcion}
          onChange={(e) => actualizar({ descripcion: e.target.value })}
          placeholder="Resumen en una o dos frases"
          rows={2}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="ed-desc-larga">Descripción detallada</Label>
        <Textarea
          id="ed-desc-larga"
          value={draft.longDescription}
          onChange={(e) => actualizar({ longDescription: e.target.value })}
          placeholder="Describe el alojamiento, la zona y qué lo hace especial"
          rows={6}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="ed-seo">Etiquetas SEO (separadas por comas)</Label>
        <Input
          id="ed-seo"
          value={draft.seoTags}
          onChange={(e) => actualizar({ seoTags: e.target.value })}
          placeholder="atico, centro, terraza"
        />
      </div>

      <div className="space-y-2 border-t pt-4">
        <Subtitulo>Detalles del alojamiento</Subtitulo>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="ed-area">Superficie (m²)</Label>
            <Input
              id="ed-area"
              type="number"
              min={0}
              value={draft.areaM2}
              onChange={(e) => actualizar({ areaM2: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ed-year">Año de construcción</Label>
            <Input
              id="ed-year"
              type="number"
              min={0}
              value={draft.yearBuilt}
              onChange={(e) => actualizar({ yearBuilt: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Orientación</Label>
            <Select
              value={draft.orientation || undefined}
              onValueChange={(v) => actualizar({ orientation: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar…" />
              </SelectTrigger>
              <SelectContent>
                {['norte', 'sur', 'este', 'oeste', 'norteoeste', 'nordeste', 'suroeste', 'sudeste'].map(
                  (o) => (
                    <SelectItem key={o} value={o} className="capitalize">
                      {o}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="space-y-2 border-t pt-4">
        <Subtitulo>Habitaciones y equipamiento</Subtitulo>
        <div className="grid gap-3 sm:grid-cols-2">
          <TarjetaDetalle
            icono={<BedDouble className="h-5 w-5 text-muted-foreground" />}
            titulo="Habitaciones"
            resumen={resumenHabitaciones(draft)}
            onClick={() => abrirModal('habitaciones')}
          />
          <TarjetaDetalle
            icono={<BedDouble className="h-5 w-5 text-muted-foreground" />}
            titulo="Distribución de camas"
            resumen={resumenCamas(draft)}
            onClick={() => abrirModal('camas')}
          />
          <TarjetaDetalle
            icono={<Sofa className="h-5 w-5 text-muted-foreground" />}
            titulo="Servicios y equipamiento"
            resumen={resumenServicios(draft)}
            onClick={() => abrirModal('servicios')}
          />
        </div>
      </div>
    </div>
  );
}

function resumenHabitaciones(d: DraftInmueble): string {
  const total = sumarDetalle(d.roomsDetail);
  if (total === 0) return 'Sin configurar';
  return `${total} habitación(es) configurada(s)`;
}

function resumenCamas(d: DraftInmueble): string {
  const total = sumarDetalle(d.bedsDetail);
  if (total === 0) return 'Sin configurar';
  const partes = CAMAS_CATALOGO.filter((c) => (d.bedsDetail[c.id] ?? 0) > 0).map(
    (c) => `${d.bedsDetail[c.id]} ${c.label.toLowerCase()}`
  );
  return partes.length > 0 ? partes.join(', ') : `${total} cama(s)`;
}

function resumenServicios(d: DraftInmueble): string {
  const total = d.servicios.length;
  if (total === 0) return 'Sin configurar';
  return `${total} servicio(s) seleccionado(s)`;
}

// ─── Fotos ───────────────────────────────────────────────────────────────────

const MAX_FOTOS = 30;
const MIN_BYTES = 50 * 1024; // 50 KB
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

export function SeccionFotos({ media, onChange }: PropsFotos) {
  const [subiendo, setSubiendo] = useState(0);
  const [arrastrando, setArrastrando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const subir = useCallback(
    async (files: FileList | File[]) => {
      const lista = Array.from(files);
      if (lista.length === 0) return;
      const slot = MAX_FOTOS - media.length;
      if (slot <= 0) {
        toast.error(`Máximo ${MAX_FOTOS} fotos`);
        return;
      }
      const aceptadas = lista.slice(0, slot);
      let subidas = 0;
      setSubiendo(aceptadas.length);
      try {
        // Galería local: cada subida añade sobre la copia fresca para que el
        // orden del dropzone multiple quede estable aunque los fetch vuelvan
        // desordenados.
        let galeria = media;
        for (const file of aceptadas) {
          if (file.type && !['image/jpeg', 'image/png'].includes(file.type)) {
            toast.error(`${file.name}: solo JPEG o PNG`);
            continue;
          }
          if (file.size < MIN_BYTES || file.size > MAX_BYTES) {
            toast.error(`${file.name}: entre 50 KB y 20 MB`);
            continue;
          }
          const formData = new FormData();
          formData.append('file', file);
          const res = await apiFetch('/api/upload/catalogo', { method: 'POST', body: formData });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            toast.error(err.error || `Error al subir ${file.name}`);
            continue;
          }
          const data = await res.json();
          galeria = [...galeria, { url: data.url }];
          onChange(galeria);
          subidas++;
        }
        if (subidas > 0) toast.success(`${subidas} foto(s) subida(s)`);
      } finally {
        setSubiendo(0);
      }
    },
    [media, onChange]
  );

  const ponerPortada = (indice: number) => onChange(hacerPortada(media, indice));
  const quitar = (indice: number) => onChange(media.filter((_, i) => i !== indice));

  const tituloDe = (foto: DraftInmueble['media'][number]) => foto.titulo ?? '';
  const cambiarTitulo = (indice: number, titulo: string) => {
    const copia = media.map((f, i) =>
      i === indice
        ? { url: f.url, ...(titulo ? { titulo: titulo.slice(0, MAX_TITULO_FOTO) } : {}) }
        : f
    );
    onChange(copia);
  };

  return (
    <div className="space-y-5">
      {/* Dropzone */}
      <div>
        <p className="mb-2 text-sm">Sube o arrastra tus fotos</p>
        <div
          role="button"
          tabIndex={0}
          aria-label="Subir fotos"
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setArrastrando(true);
          }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => {
            e.preventDefault();
            setArrastrando(false);
            if (e.dataTransfer.files.length > 0) subir(e.dataTransfer.files);
          }}
          className={cn(
            'flex h-56 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition-colors',
            arrastrando ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
          )}
        >
          {subiendo > 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Subiendo {subiendo} foto(s)…
            </div>
          ) : (
            <Upload className="h-8 w-8 text-muted-foreground/50" />
          )}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Asegúrate de que tus fotos estén en formato JPEG o PNG, con un tamaño entre 50 KB y 20 MB.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) subir(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {media.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center">
          <Home className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            Aún no hay fotos. Sube la primera para completar la sección.
          </p>
        </div>
      ) : (
        <>
          {/* Foto destacada (portada) */}
          <div>
            <div className="relative overflow-hidden rounded-xl border bg-card">
              <Badge className="absolute left-3 top-3 z-10 border-0 bg-indigo-600 text-white">
                Portada
              </Badge>
              <div className="aspect-[16/7] w-full bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={media[0].url} alt={tituloDe(media[0]) || 'Portada'} className="h-full w-full object-cover" />
              </div>
              <div className="flex items-center gap-2 border-t px-3 py-2.5">
                <input
                  value={tituloDe(media[0])}
                  onChange={(e) => cambiarTitulo(0, e.target.value)}
                  placeholder="Añadir un título"
                  maxLength={MAX_TITULO_FOTO}
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
                />
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {tituloDe(media[0]).length}/{MAX_TITULO_FOTO}
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem disabled>
                      <Star className="h-3.5 w-3.5 mr-2" /> Ya es la portada
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => quitar(0)}
                    >
                      <X className="h-3.5 w-3.5 mr-2" /> Quitar foto
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>

          {/* Resto de la galería */}
          {media.length > 1 && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {media.slice(1).map((foto, i) => {
                const indiceReal = i + 1;
                return (
                  <div key={foto.url + i} className="overflow-hidden rounded-xl border bg-card">
                    <div className="relative aspect-[16/10] bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={foto.url}
                        alt={tituloDe(foto) || `Foto ${indiceReal + 1}`}
                        className="h-full w-full object-cover"
                      />
                      <div className="absolute right-2 top-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="secondary"
                              size="icon"
                              className="h-7 w-7 rounded-full bg-white/90 text-foreground shadow hover:bg-white"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => ponerPortada(indiceReal)}>
                              <Star className="h-3.5 w-3.5 mr-2" /> Hacer portada
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => quitar(indiceReal)}
                            >
                              <X className="h-3.5 w-3.5 mr-2" /> Quitar foto
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 border-t px-3 py-2.5">
                      <input
                        value={tituloDe(foto)}
                        onChange={(e) => cambiarTitulo(indiceReal, e.target.value)}
                        placeholder="Añadir un título"
                        maxLength={MAX_TITULO_FOTO}
                        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
                      />
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {tituloDe(foto).length}/{MAX_TITULO_FOTO}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Ubicación ───────────────────────────────────────────────────────────────

export function SeccionUbicacion({ draft, actualizar }: PropsSeccion) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="ed-ciudad">Ciudad / Zona</Label>
          <Input
            id="ed-ciudad"
            value={draft.city}
            onChange={(e) => actualizar({ city: e.target.value })}
            placeholder="Madrid"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ed-direccion">Dirección</Label>
          <Input
            id="ed-direccion"
            value={draft.address}
            onChange={(e) => actualizar({ address: e.target.value })}
            placeholder="Calle Mayor, 1"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ed-lat">Latitud</Label>
          <Input
            id="ed-lat"
            type="number"
            step="any"
            value={draft.lat}
            onChange={(e) => actualizar({ lat: e.target.value })}
            placeholder="40.4168"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ed-lng">Longitud</Label>
          <Input
            id="ed-lng"
            type="number"
            step="any"
            value={draft.lng}
            onChange={(e) => actualizar({ lng: e.target.value })}
            placeholder="-3.7038"
          />
        </div>
      </div>
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <MapPin className="h-3.5 w-3.5" />
        Las coordenadas alimentan el mapa del sitio web y los portales.
      </p>
    </div>
  );
}

// ─── Contacto ────────────────────────────────────────────────────────────────

export function SeccionContacto({ draft, actualizar }: PropsSeccion) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="ed-owner-name">Nombre del propietario</Label>
          <Input
            id="ed-owner-name"
            value={draft.ownerName}
            onChange={(e) => actualizar({ ownerName: e.target.value })}
            placeholder="María García"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ed-owner-phone">Teléfono</Label>
          <Input
            id="ed-owner-phone"
            value={draft.ownerPhone}
            onChange={(e) => actualizar({ ownerPhone: e.target.value })}
            placeholder="+34 600 000 000"
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="ed-owner-email">Email</Label>
          <Input
            id="ed-owner-email"
            type="email"
            value={draft.ownerEmail}
            onChange={(e) => actualizar({ ownerEmail: e.target.value })}
            placeholder="propietario@ejemplo.com"
          />
        </div>
      </div>
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Phone className="h-3.5 w-3.5" />
        Si el propietario está vinculado a un contacto del CRM, los cambios se sincronizan con su ficha.
      </p>
    </div>
  );
}

// ─── Habitaciones y camas (vista) ────────────────────────────────────────────

export function SeccionHabitaciones({ draft, actualizar, abrirModal }: PropsSeccion) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <TarjetaDetalle
          icono={<BedDouble className="h-5 w-5 text-muted-foreground" />}
          titulo="Habitaciones"
          resumen={resumenHabitaciones(draft)}
          onClick={() => abrirModal('habitaciones')}
        />
        <TarjetaDetalle
          icono={<BedDouble className="h-5 w-5 text-muted-foreground" />}
          titulo="Distribución de camas"
          resumen={resumenCamas(draft)}
          onClick={() => abrirModal('camas')}
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Habitaciones declaradas</CardTitle>
          <CardDescription>
            Recuento por tipo; se muestra en tu sitio web y en los portales.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sumarDetalle(draft.roomsDetail) === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aún no hay habitaciones. Abre «Habitaciones» para configurarlas.
            </p>
          ) : (
            <div className="space-y-4">
              {HABITACIONES_GRUPOS.map((grupo) => {
                const filas = grupo.items.filter((h) => (draft.roomsDetail[h.id] ?? 0) > 0);
                if (filas.length === 0) return null;
                return (
                  <div key={grupo.titulo}>
                    <p className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <User className="h-3 w-3" /> {grupo.titulo}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {filas.map((h) => (
                        <div
                          key={h.id}
                          className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                        >
                          <span>{h.label}</span>
                          <span className="font-medium tabular-nums">{draft.roomsDetail[h.id]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Camas</CardTitle>
          <CardDescription>Distribución declarada por tipo de cama.</CardDescription>
        </CardHeader>
        <CardContent>
          {sumarDetalle(draft.bedsDetail) === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aún no hay camas. Abre «Distribución de camas» para configurarlas.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {CAMAS_CATALOGO.filter((c) => (draft.bedsDetail[c.id] ?? 0) > 0).map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                >
                  <span>{c.label}</span>
                  <span className="font-medium tabular-nums">{draft.bedsDetail[c.id]}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="ed-bedrooms">Habitaciones (listado)</Label>
          <Input
            id="ed-bedrooms"
            type="number"
            min={0}
            value={draft.bedrooms}
            onChange={(e) => actualizar({ bedrooms: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            Se sobreescribe con el contador de «Dormitorio» del modal.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ed-bathrooms">Baños (listado)</Label>
          <Input
            id="ed-bathrooms"
            type="number"
            min={0}
            value={draft.bathrooms}
            onChange={(e) => actualizar({ bathrooms: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            Se sobreescribe con el contador de «Baño» del modal.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Equipamiento (vista) ────────────────────────────────────────────────────

export function SeccionEquipamiento({ draft, abrirModal }: PropsSeccion) {
  const activos = SERVICIOS_GRUPOS.map((g) => ({
    grupo: g,
    items: g.items.filter((i) => draft.servicios.includes(i.id)),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-4">
      <Button variant="outline" onClick={() => abrirModal('servicios')}>
        <Sofa className="h-4 w-4 mr-2" />
        Editar servicios y equipamiento
      </Button>

      {activos.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center">
          <Sofa className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            Sin servicios marcados. Abre el selector para añadirlos.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {activos.map(({ grupo, items }) => (
            <div key={grupo.id}>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {grupo.titulo}
              </p>
              <div className="flex flex-wrap gap-2">
                {items.map((i) => (
                  <Badge key={i.id} variant="secondary">
                    {i.label}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Precios ─────────────────────────────────────────────────────────────────

interface PropsPrecios extends PropsSeccion {
  nombre: string;
  formatear: (n: number) => string;
}

export function SeccionPrecios({ draft, actualizar, formatear }: PropsPrecios) {
  const precio = Number(draft.precioBase) || 0;
  const area = Number(draft.areaM2) || 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="ed-precio">Precio base</Label>
          <Input
            id="ed-precio"
            type="number"
            min={0}
            value={draft.precioBase}
            onChange={(e) => actualizar({ precioBase: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>Moneda</Label>
          <Select
            value={draft.moneda}
            onValueChange={(v) => actualizar({ moneda: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONEDAS_SELECCIONABLES.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Tipo de operación</Label>
          <Select
            value={draft.operationType || undefined}
            onValueChange={(v) => actualizar({ operationType: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="venta">Venta</SelectItem>
              <SelectItem value="alquiler">Alquiler</SelectItem>
              <SelectItem value="traspaso">Traspaso</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Tipo de inmueble</Label>
          <Select
            value={draft.propertyType || undefined}
            onValueChange={(v) => actualizar({ propertyType: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar…" />
            </SelectTrigger>
            <SelectContent>
              {[
                ['casa', 'Casa'],
                ['departamento', 'Departamento'],
                ['oficina', 'Oficina'],
                ['local_comercial', 'Local Comercial'],
                ['terreno', 'Terreno'],
                ['bodega', 'Bodega'],
                ['nave_industrial', 'Nave Industrial'],
                ['edificio', 'Edificio'],
              ].map(([v, l]) => (
                <SelectItem key={v} value={v}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {precio > 0 && (
        <div className="rounded-xl border bg-muted/30 p-4">
          <p className="text-sm text-muted-foreground">Precio de lista</p>
          <p className="text-2xl font-bold">{formatear(precio)}</p>
          {area > 0 && (
            <p className="mt-1 text-sm text-muted-foreground">
              {formatear(precio / area)} / m² · {area} m²
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Disponibilidad ──────────────────────────────────────────────────────────

export function SeccionDisponibilidad({ draft, actualizar }: PropsSeccion) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Estado</Label>
        <Select value={draft.status} onValueChange={(v) => actualizar({ status: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="disponible">Disponible</SelectItem>
            <SelectItem value="reservada">Reservada</SelectItem>
            <SelectItem value="vendida">Vendida</SelectItem>
            <SelectItem value="alquilada">Alquilada</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between rounded-xl border p-4">
        <div>
          <p className="text-sm font-medium">Propiedad activa</p>
          <p className="text-xs text-muted-foreground">
            Las propiedades inactivas no aparecen en el catálogo público.
          </p>
        </div>
        <Switch
          checked={draft.activo}
          onCheckedChange={(v) => actualizar({ activo: v })}
        />
      </div>
      <div className="flex items-center justify-between rounded-xl border p-4">
        <div>
          <p className="text-sm font-medium">Destacada</p>
          <p className="text-xs text-muted-foreground">
            Aparece primero en el listado y en la portada del sitio.
          </p>
        </div>
        <Switch
          checked={draft.destacado}
          onCheckedChange={(v) => actualizar({ destacado: v })}
        />
      </div>
    </div>
  );
}

// ─── Cumplimiento (certificación energética) ─────────────────────────────────

export function SeccionCumplimiento({ draft, actualizar }: PropsSeccion) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Clasificación</Label>
          <Select
            value={draft.energyCert || undefined}
            onValueChange={(v) => actualizar({ energyCert: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar…" />
            </SelectTrigger>
            <SelectContent>
              {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'En trámite'].map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="ed-consumo">Consumo (kWh/m²/año)</Label>
          <Input
            id="ed-consumo"
            type="number"
            step="0.1"
            value={draft.energyCertConsumption}
            onChange={(e) => actualizar({ energyCertConsumption: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ed-emisiones">Emisiones CO₂ (kg/m²/año)</Label>
          <Input
            id="ed-emisiones"
            type="number"
            step="0.1"
            value={draft.energyCertEmission}
            onChange={(e) => actualizar({ energyCertEmission: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ed-organismo">Organismo certificador</Label>
          <Input
            id="ed-organismo"
            value={draft.energyCertBody}
            onChange={(e) => actualizar({ energyCertBody: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ed-fecha-cert">Fecha del certificado</Label>
          <Input
            id="ed-fecha-cert"
            type="date"
            value={draft.energyCertDate}
            onChange={(e) => actualizar({ energyCertDate: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ed-caducidad">Caducidad</Label>
          <Input
            id="ed-caducidad"
            type="date"
            value={draft.energyCertExpiry}
            onChange={(e) => actualizar({ energyCertExpiry: e.target.value })}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="ed-doc-cert">Documento (URL)</Label>
          <Input
            id="ed-doc-cert"
            value={draft.energyCertUrl}
            onChange={(e) => actualizar({ energyCertUrl: e.target.value })}
            placeholder="https://…"
          />
        </div>
      </div>
    </div>
  );
}
