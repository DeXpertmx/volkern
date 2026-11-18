'use client';

/**
 * Estado por inmueble de un portal: qué se publicó, qué cambió y qué falló.
 * El orquestador guarda un hash por inmueble, así que «sin cambios» es el
 * estado normal de una sincronización idempotente.
 */

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface Publicacion {
  id: string;
  propertyId: string;
  propertyName: string | null;
  status: string;
  lastDeliveredAt: string | null;
  lastError: string | null;
  attempts: number;
}

const ESTADOS: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  published: { label: 'Publicado', variant: 'default' },
  updated: { label: 'Actualizado', variant: 'secondary' },
  removed: { label: 'Retirado', variant: 'outline' },
  pending: { label: 'Pendiente', variant: 'outline' },
  error: { label: 'Error', variant: 'destructive' },
};

export function PortalesPublicaciones({ portalKey, recarga }: { portalKey: string; recarga: number }) {
  const [filas, setFilas] = useState<Publicacion[]>([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let activo = true;
    (async () => {
      try {
        const res = await apiFetch(`/api/portal-publications?portalKey=${portalKey}&limit=10`);
        if (!res.ok) throw new Error('No se pudieron cargar las publicaciones');
        const data = await res.json();
        if (!activo) return;
        setFilas(data.publicaciones || []);
        setTotal(data.total || 0);
      } catch {
        if (activo) setFilas([]);
      } finally {
        if (activo) setCargando(false);
      }
    })();
    return () => {
      activo = false;
    };
  }, [portalKey, recarga]);

  if (cargando) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (filas.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Todavía no hay publicaciones. Sincroniza para registrar el estado de cada inmueble.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Últimos {filas.length} de {total} inmuebles con estado en este portal.
      </p>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Inmueble</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Entregado</TableHead>
              <TableHead>Intentos</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((fila) => {
              const estado = ESTADOS[fila.status] || { label: fila.status, variant: 'outline' as const };
              return (
                <TableRow key={fila.id}>
                  <TableCell className="max-w-[240px] truncate">
                    {fila.propertyName || fila.propertyId}
                    {fila.lastError && (
                      <span className="ml-2 text-xs text-destructive">{fila.lastError}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={estado.variant}>{estado.label}</Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs">
                    {fila.lastDeliveredAt
                      ? new Date(fila.lastDeliveredAt).toLocaleString('es-ES')
                      : '—'}
                  </TableCell>
                  <TableCell className="text-xs">{fila.attempts}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
