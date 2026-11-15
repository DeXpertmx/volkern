import { globalPrisma } from '@/lib/db';
import { normalizarPlantilla, type PlantillaPortal } from './portal-templates';

/**
 * Plantilla elegida por la cuenta para su portal.
 *
 * Vive en su `Configuracion` (clave `plantilla_portal`). La leen las tres
 * páginas públicas —portada, catálogo y ficha— para que compartan hero, radios
 * y tipografía: si una oficina cambia de plantilla, no se queda una página con
 * el diseño viejo.
 */
export async function getPlantillaPortal(tenantId: string): Promise<PlantillaPortal> {
  try {
    const fila = await globalPrisma.configuracion.findFirst({
      where: { tenantId, clave: 'plantilla_portal' },
      select: { valor: true },
    });
    return normalizarPlantilla(fila?.valor);
  } catch {
    // Un fallo de lectura no puede tumbar el portal: se abre con la de foto.
    return normalizarPlantilla(undefined);
  }
}
