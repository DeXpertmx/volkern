'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Code2,
  Copy,
  Check,
  Eye,
  ExternalLink,
  LayoutGrid,
  List,
  Loader2,
  Palette,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const SCRIPT_ORIGIN = 'https://volkern.app';
/**
 * Versión del widget. Al cambiar el script se sube este número para que los
 * sitios que ya lo tienen embebido no sigan sirviendo la copia cacheada.
 */
const SCRIPT_VERSION = '4';
const TITULO_POR_DEFECTO = 'Nuestras propiedades';
const COLOR_POR_DEFECTO = '#2563eb';

const COLORES = [
  { valor: '#2563eb', nombre: 'Azul' },
  { valor: '#0f766e', nombre: 'Verde azulado' },
  { valor: '#7c3aed', nombre: 'Violeta' },
  { valor: '#be123c', nombre: 'Granate' },
  { valor: '#ea580c', nombre: 'Naranja' },
  { valor: '#0f172a', nombre: 'Grafito' },
];

const OPERACIONES = [
  { valor: 'todas', etiqueta: 'Todas' },
  { valor: 'venta', etiqueta: 'Venta' },
  { valor: 'alquiler', etiqueta: 'Alquiler' },
  { valor: 'alquiler_temporada', etiqueta: 'Renta vacacional' },
  { valor: 'traspaso', etiqueta: 'Traspaso' },
];

const LIMITES = ['3', '6', '9', '12', '24'];

interface EmbedSnippetCardProps {
  tenantId?: string;
  className?: string;
}

function escaparAtributo(valor: string) {
  return valor.replace(/"/g, '&quot;');
}

export function EmbedSnippetCard({ tenantId, className }: EmbedSnippetCardProps) {
  const [titulo, setTitulo] = useState(TITULO_POR_DEFECTO);
  const [subtitulo, setSubtitulo] = useState('');
  const [color, setColor] = useState(COLOR_POR_DEFECTO);
  const [limite, setLimite] = useState('12');
  const [modo, setModo] = useState<'grid' | 'lista'>('grid');
  const [soloDestacadas, setSoloDestacadas] = useState(false);
  const [operacion, setOperacion] = useState('todas');
  const [verTodas, setVerTodas] = useState(true);
  const [filtros, setFiltros] = useState(true);
  const [copiado, setCopiado] = useState(false);
  const [tab, setTab] = useState<'codigo' | 'vista'>('codigo');

  const listo = Boolean(tenantId);

  const snippet = useMemo(() => {
    const atributos: string[] = [
      `  src="${SCRIPT_ORIGIN}/propiedades-embed.js?v=${SCRIPT_VERSION}"`,
      `  data-tenant-id="${tenantId || 'TU_TENANT_ID'}"`,
    ];

    if (titulo.trim() && titulo.trim() !== TITULO_POR_DEFECTO) {
      atributos.push(`  data-titulo="${escaparAtributo(titulo.trim())}"`);
    }
    if (subtitulo.trim()) {
      atributos.push(`  data-subtitulo="${escaparAtributo(subtitulo.trim())}"`);
    }
    if (color !== COLOR_POR_DEFECTO) {
      atributos.push(`  data-color="${color}"`);
    }
    if (limite !== '12') {
      atributos.push(`  data-limite="${limite}"`);
    }
    if (modo === 'lista') {
      atributos.push('  data-modo="lista"');
    }
    if (soloDestacadas) {
      atributos.push('  data-solo-destacadas="true"');
    }
    if (operacion !== 'todas') {
      atributos.push(`  data-operacion="${operacion}"`);
    }
    if (!verTodas) {
      atributos.push('  data-ver-todas="false"');
    }
    if (!filtros) {
      atributos.push('  data-filtros="false"');
    }

    return `<script\n${atributos.join('\n')}\n></script>\n<div id="volkern-propiedades"></div>`;
  }, [tenantId, titulo, subtitulo, color, limite, modo, soloDestacadas, operacion, verTodas, filtros]);

  const urlVistaPrevia = useMemo(() => {
    if (!tenantId) return '';
    const params = new URLSearchParams({ tenantId });
    if (titulo.trim()) params.set('titulo', titulo.trim());
    if (subtitulo.trim()) params.set('subtitulo', subtitulo.trim());
    params.set('color', color);
    params.set('limite', limite);
    params.set('modo', modo);
    if (soloDestacadas) params.set('destacadas', '1');
    if (operacion !== 'todas') params.set('operacion', operacion);
    params.set('verTodas', verTodas ? '1' : '0');
    if (!filtros) params.set('filtros', '0');
    return `/embed/propiedades?${params.toString()}`;
  }, [tenantId, titulo, subtitulo, color, limite, modo, soloDestacadas, operacion, verTodas, filtros]);

  const copiar = async () => {
    if (!listo) return;
    try {
      await navigator.clipboard.writeText(snippet);
      setCopiado(true);
      toast.success('Código copiado al portapapeles');
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error('No se pudo copiar. Selecciona el código manualmente.');
    }
  };

  const restablecer = () => {
    setTitulo(TITULO_POR_DEFECTO);
    setSubtitulo('');
    setColor(COLOR_POR_DEFECTO);
    setLimite('12');
    setModo('grid');
    setSoloDestacadas(false);
    setOperacion('todas');
    setVerTodas(true);
    setFiltros(true);
    setTab('codigo');
  };

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="gap-4 border-b bg-muted/30 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Code2 className="h-5 w-5" />
            </span>
            <CardTitle className="text-lg">Incrustar propiedades en tu web</CardTitle>
            <Badge variant="secondary" className="ml-1 text-[10px] font-black uppercase">
              Widget
            </Badge>
          </div>
          <CardDescription>
            Configura el widget y pega el código en tu sitio. Las propiedades se
            actualizan solas cuando cambias tu catálogo en Volkern.
          </CardDescription>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={restablecer}
          className="self-start text-muted-foreground"
        >
          <RotateCcw className="mr-2 h-3.5 w-3.5" />
          Restablecer
        </Button>
      </CardHeader>

      <CardContent className="grid gap-6 p-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        {/* ── Controles ───────────────────────────────────────────── */}
        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="embed-titulo">Título</Label>
            <Input
              id="embed-titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder={TITULO_POR_DEFECTO}
              maxLength={80}
            />
            <p className="text-xs text-muted-foreground">
              Déjalo vacío para ocultar el encabezado.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="embed-subtitulo">Subtítulo (opcional)</Label>
            <Input
              id="embed-subtitulo"
              value={subtitulo}
              onChange={(e) => setSubtitulo(e.target.value)}
              placeholder="Encuentra tu próximo hogar"
              maxLength={120}
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Palette className="h-3.5 w-3.5 text-muted-foreground" />
              Color de marca
            </Label>
            <div className="flex flex-wrap items-center gap-2">
              {COLORES.map((opcion) => (
                <button
                  key={opcion.valor}
                  type="button"
                  title={opcion.nombre}
                  aria-label={`Color ${opcion.nombre}`}
                  aria-pressed={color === opcion.valor}
                  onClick={() => setColor(opcion.valor)}
                  className={cn(
                    'h-8 w-8 rounded-full border-2 transition-transform hover:scale-110',
                    color === opcion.valor
                      ? 'border-foreground ring-2 ring-foreground/20 ring-offset-2 ring-offset-background'
                      : 'border-transparent'
                  )}
                  style={{ backgroundColor: opcion.valor }}
                >
                  {color === opcion.valor && (
                    <Check className="mx-auto h-4 w-4 text-white drop-shadow" />
                  )}
                </button>
              ))}
              <label className="relative flex h-8 w-8 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-dashed">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  aria-label="Color personalizado"
                />
                <Sparkles className="h-4 w-4 text-muted-foreground" />
              </label>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="embed-limite">Propiedades a mostrar</Label>
              <Select value={limite} onValueChange={setLimite}>
                <SelectTrigger id="embed-limite">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LIMITES.map((valor) => (
                    <SelectItem key={valor} value={valor}>
                      {valor} propiedades
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Tipo de operación</Label>
              <Select value={operacion} onValueChange={setOperacion}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPERACIONES.map((opcion) => (
                    <SelectItem key={opcion.valor} value={opcion.valor}>
                      {opcion.etiqueta}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Diseño</Label>
            <div className="inline-flex rounded-lg border p-1">
              <button
                type="button"
                onClick={() => setModo('grid')}
                aria-pressed={modo === 'grid'}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  modo === 'grid'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Tarjetas
              </button>
              <button
                type="button"
                onClick={() => setModo('lista')}
                aria-pressed={modo === 'lista'}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  modo === 'lista'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <List className="h-3.5 w-3.5" />
                Lista
              </button>
            </div>
          </div>

          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="embed-destacadas" className="text-sm font-medium">
                  Solo propiedades destacadas
                </Label>
                <p className="text-xs text-muted-foreground">
                  Muestra únicamente las marcadas con estrella.
                </p>
              </div>
              <Switch
                id="embed-destacadas"
                checked={soloDestacadas}
                onCheckedChange={setSoloDestacadas}
              />
            </div>
            <div className="flex items-center justify-between gap-4 border-t pt-3">
              <div className="space-y-0.5">
                <Label htmlFor="embed-filtros" className="text-sm font-medium">
                  Buscador y filtros
                </Label>
                <p className="text-xs text-muted-foreground">
                  Búsqueda por texto, operación, tipo, zona y precio.
                </p>
              </div>
              <Switch
                id="embed-filtros"
                checked={filtros}
                onCheckedChange={setFiltros}
              />
            </div>
            <div className="flex items-center justify-between gap-4 border-t pt-3">
              <div className="space-y-0.5">
                <Label htmlFor="embed-ver-todas" className="text-sm font-medium">
                  Enlace «Ver todas las propiedades»
                </Label>
                <p className="text-xs text-muted-foreground">
                  Lleva a tu portal público completo.
                </p>
              </div>
              <Switch
                id="embed-ver-todas"
                checked={verTodas}
                onCheckedChange={setVerTodas}
              />
            </div>
          </div>
        </div>

        {/* ── Código / vista previa ───────────────────────────────── */}
        <div className="space-y-3">
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'codigo' | 'vista')}>
            <TabsList className="h-9">
              <TabsTrigger value="codigo" className="gap-1.5 text-xs font-bold uppercase">
                <Code2 className="h-3.5 w-3.5" />
                Código
              </TabsTrigger>
              <TabsTrigger value="vista" className="gap-1.5 text-xs font-bold uppercase">
                <Eye className="h-3.5 w-3.5" />
                Vista previa
              </TabsTrigger>
            </TabsList>

            <TabsContent value="codigo" className="mt-3">
              <div className="relative overflow-hidden rounded-xl border bg-slate-950 text-slate-100">
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    HTML
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={copiar}
                    disabled={!listo}
                    className="h-7 gap-1.5 bg-white/10 text-slate-100 hover:bg-white/20"
                  >
                    {copiado ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                        Copiado
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        Copiar
                      </>
                    )}
                  </Button>
                </div>
                <pre className="max-h-[280px] overflow-auto p-4 text-xs leading-relaxed">
                  <code className="font-mono">{snippet}</code>
                </pre>
              </div>
            </TabsContent>

            <TabsContent value="vista" className="mt-3">
              <div className="overflow-hidden rounded-xl border bg-muted/20">
                {!listo ? (
                  <div className="flex h-[320px] flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                    Inicia sesión para ver la vista previa.
                  </div>
                ) : (
                  <iframe
                    key={urlVistaPrevia}
                    src={urlVistaPrevia}
                    title="Vista previa del widget de propiedades"
                    loading="lazy"
                    className="h-[440px] w-full border-0 bg-white"
                  />
                )}
              </div>
            </TabsContent>
          </Tabs>

          <div className="rounded-lg border bg-muted/30 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Cómo instalarlo
            </p>
            <ol className="space-y-1.5 text-xs text-muted-foreground">
              <li className="flex gap-2">
                <span className="flex h-4 w-4 flex-none items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                  1
                </span>
                Pega el <code className="rounded bg-muted px-1">&lt;script&gt;</code> antes de
                cerrar <code className="rounded bg-muted px-1">&lt;/body&gt;</code>.
              </li>
              <li className="flex gap-2">
                <span className="flex h-4 w-4 flex-none items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                  2
                </span>
                Coloca <code className="rounded bg-muted px-1">&lt;div id=&quot;volkern-propiedades&quot;&gt;</code>{' '}
                donde quieras que aparezcan las propiedades.
              </li>
              <li className="flex gap-2">
                <span className="flex h-4 w-4 flex-none items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                  3
                </span>
                El widget hereda el ancho de su contenedor y se adapta a móvil
                automáticamente.
              </li>
            </ol>
          </div>

          <details className="group rounded-lg border p-4 text-sm">
            <summary className="cursor-pointer list-none font-medium">
              Atributos avanzados
            </summary>
            <dl className="mt-3 space-y-2 text-xs text-muted-foreground">
              {[
                ['data-container-id', 'id del contenedor (por defecto volkern-propiedades)'],
                ['data-ciudad', 'filtra por ciudad o zona'],
                ['data-estado', 'disponible, reservada, vendida o alquilada'],
                ['data-filtros', 'true (por defecto) o false para ocultar el buscador'],
                ['data-moneda', 'fuerza la divisa de presentación'],
                ['data-detalle', 'embed (por defecto) abre la ficha dentro del widget; portal la abre en el portal'],
                ['data-tema', 'auto (por defecto), claro u oscuro'],
              ].map(([atributo, descripcion]) => (
                <div key={atributo} className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                  <dt className="font-mono text-[11px] text-foreground">{atributo}</dt>
                  <dd>{descripcion}</dd>
                </div>
              ))}
            </dl>
          </details>

          <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
            <p className="text-xs text-muted-foreground">
              ¿Prefieres un portal propio? Volkern también lo genera por ti.
            </p>
            <Button variant="outline" size="sm" asChild>
              <a
                href={`/p/${tenantId || ''}/propiedades`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                Ver portal
              </a>
            </Button>
          </div>

          {!listo && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Cargando los datos de tu cuenta…
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
