'use client';

/**
 * Volkern Real Estate — Panel de portales.
 *
 * Una tarjeta por portal soportado: activación, frecuencia, ubicación por
 * defecto (Kyero exige provincia y el maestro no la guarda), enlace del feed con
 * rotación/revocación y sincronización manual. El estado por inmueble vive en
 * `PortalesPublicaciones`.
 */

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Copy, Link2, Loader2, RefreshCw, ShieldOff, Globe, AlertTriangle } from 'lucide-react';
import { PortalesPublicaciones } from './PortalesPublicaciones';

interface PortalConfig {
  defaults?: { country?: string; province?: string; town?: string };
  publicBaseUrl?: string;
}

interface PortalDTO {
  portalKey: string;
  label: string;
  mode: 'pull' | 'push';
  enabled: boolean;
  config: PortalConfig;
  syncFrequencyMinutes: number;
  hasCredentials: boolean;
  feedUrl: string | null;
  feedTokenRevoked: boolean;
  cryptoConfigured: boolean;
  lastSyncAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  stats: Record<string, number>;
}

const FRECUENCIAS = [
  { value: '240', label: 'Cada 4 horas' },
  { value: '360', label: 'Cada 6 horas' },
  { value: '720', label: 'Cada 12 horas' },
  { value: '1440', label: 'Una vez al día' },
];

function fecha(valor: string | null): string {
  if (!valor) return 'Nunca';
  return new Date(valor).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
}

export function PortalesPanel() {
  const [portales, setPortales] = useState<PortalDTO[]>([]);
  const [cargando, setCargando] = useState(true);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);

  const cargar = useCallback(async () => {
    try {
      const res = await apiFetch('/api/portal-connections');
      if (!res.ok) throw new Error('No se pudieron cargar los portales');
      const data = await res.json();
      setPortales(data.portales || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al cargar los portales');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar, recarga]);

  const guardar = async (portal: PortalDTO, cambios: Record<string, unknown>) => {
    setTrabajando(portal.portalKey);
    try {
      const res = await apiFetch(`/api/portal-connections/${portal.portalKey}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cambios),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error([data.error, ...(data.errors || [])].filter(Boolean).join(' · '));
      }
      toast.success('Conexión actualizada');
      setRecarga((n) => n + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setTrabajando(null);
    }
  };

  const sincronizar = async (portal: PortalDTO) => {
    setTrabajando(`${portal.portalKey}:sync`);
    try {
      const res = await apiFetch(`/api/portal-connections/${portal.portalKey}/sync`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error([data.error, ...(data.errors || [])].filter(Boolean).join(' · '));
      }
      toast.success(
        `Sincronizado: ${data.published} nuevos, ${data.updated} actualizados, ${data.unchanged} sin cambios, ${data.skipped.length} omitidos`
      );
      setRecarga((n) => n + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error en la sincronización');
      setRecarga((n) => n + 1);
    } finally {
      setTrabajando(null);
    }
  };

  const rotar = (portal: PortalDTO) => {
    if (!window.confirm('Se generará un enlace nuevo y el anterior dejará de funcionar. ¿Continuar?')) return;
    void guardar(portal, { rotateFeedToken: true });
  };

  const revocar = (portal: PortalDTO) => {
    if (!window.confirm('El portal dejará de poder descargar el feed. ¿Revocar el enlace?')) return;
    void guardar(portal, { revokeFeedToken: true });
  };

  const copiar = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Enlace copiado');
    } catch {
      toast.error('No se pudo copiar el enlace');
    }
  };

  if (cargando) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando portales…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {portales.map((portal) => (
        <Card key={portal.portalKey}>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" /> {portal.label}
                <Badge variant="outline">{portal.mode === 'pull' ? 'Feed XML' : 'Subida'}</Badge>
                {portal.enabled ? <Badge>Activo</Badge> : <Badge variant="secondary">Inactivo</Badge>}
              </CardTitle>
              <CardDescription>
                Última sincronización: {fecha(portal.lastSyncAt)} · {portal.stats.published || 0} publicados,{' '}
                {portal.stats.removed || 0} retirados
              </CardDescription>
            </div>
            <Switch
              checked={portal.enabled}
              disabled={trabajando === portal.portalKey}
              onCheckedChange={(v) => void guardar(portal, { enabled: v })}
              aria-label={`Activar ${portal.label}`}
            />
          </CardHeader>

          <CardContent className="space-y-5">
            {portal.lastError && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{portal.lastError}</span>
              </div>
            )}

            <PortalForm
              portal={portal}
              guardando={trabajando === portal.portalKey}
              onGuardar={(cambios) => void guardar(portal, cambios)}
            />

            <Separator />

            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={() => void sincronizar(portal)}
                disabled={trabajando === `${portal.portalKey}:sync`}
                size="sm"
              >
                {trabajando === `${portal.portalKey}:sync` ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Sincronizar ahora
              </Button>
              {portal.feedUrl && (
                <>
                  <Button variant="outline" size="sm" onClick={() => void copiar(portal.feedUrl!)}>
                    <Copy className="mr-2 h-4 w-4" /> Copiar enlace del feed
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => rotar(portal)}>
                    <Link2 className="mr-2 h-4 w-4" /> Rotar
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => revocar(portal)}>
                    <ShieldOff className="mr-2 h-4 w-4" /> Revocar
                  </Button>
                </>
              )}
              {portal.feedTokenRevoked && <Badge variant="destructive">Enlace revocado</Badge>}
            </div>

            {portal.feedUrl && (
              <p className="break-all rounded bg-muted px-2 py-1 font-mono text-xs">{portal.feedUrl}</p>
            )}

            <PortalesPublicaciones portalKey={portal.portalKey} recarga={recarga} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function PortalForm({
  portal,
  guardando,
  onGuardar,
}: {
  portal: PortalDTO;
  guardando: boolean;
  onGuardar: (cambios: Record<string, unknown>) => void;
}) {
  const [country, setCountry] = useState(portal.config.defaults?.country || 'Spain');
  const [province, setProvince] = useState(portal.config.defaults?.province || '');
  const [town, setTown] = useState(portal.config.defaults?.town || '');
  const [baseUrl, setBaseUrl] = useState(portal.config.publicBaseUrl || '');
  const [frecuencia, setFrecuencia] = useState(String(portal.syncFrequencyMinutes));

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor={`${portal.portalKey}-province`}>Provincia por defecto</Label>
        <Input
          id={`${portal.portalKey}-province`}
          value={province}
          onChange={(e) => setProvince(e.target.value)}
          placeholder="Málaga"
        />
        <p className="text-xs text-muted-foreground">Kyero la exige y el inmueble no la guarda.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${portal.portalKey}-town`}>Población por defecto</Label>
        <Input
          id={`${portal.portalKey}-town`}
          value={town}
          onChange={(e) => setTown(e.target.value)}
          placeholder="Marbella"
        />
        <p className="text-xs text-muted-foreground">Se usa si el inmueble no tiene zona.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${portal.portalKey}-country`}>País</Label>
        <Input
          id={`${portal.portalKey}-country`}
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          placeholder="Spain"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${portal.portalKey}-base`}>URL pública base</Label>
        <Input
          id={`${portal.portalKey}-base`}
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://volkern.app"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Frecuencia</Label>
        <Select value={frecuencia} onValueChange={setFrecuencia}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FRECUENCIAS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-end">
        <Button
          variant="secondary"
          disabled={guardando}
          onClick={() =>
            onGuardar({
              config: {
                defaults: { country, province, town },
                publicBaseUrl: baseUrl,
              },
              syncFrequencyMinutes: Number(frecuencia),
            })
          }
        >
          {guardando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Guardar configuración
        </Button>
      </div>
    </div>
  );
}
