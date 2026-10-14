export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/conectividad/reservas-faltantes
 * Reservas VIVAS que el proveedor reporta y el ERP no tiene.
 *
 * Es el aviso temprano del push perdido: el barrido de reconciliación lo
 * detecta, pero corre una vez al día, y hasta entonces el canal tiene vendidas
 * noches que aquí están libres. Esto le pregunta al proveedor en el momento
 * (`lib/hospitality/reservas-faltantes.ts`) y devuelve la lista para que quien
 * opera lance el barrido a mano —el botón «Ejecutar reconciliación», que sí
 * escribe— cuando lo vea.
 *
 * **No escribe nada**: ni reservas, ni logs, ni el estado de la capa, ni un
 * push al canal. Que esta ruta sea segura de llamar desde el panel (incluso en
 * cada carga) es estructural: el módulo que la alimenta solo importa lecturas.
 *
 * Superadmin: sondea todas las propiedades con vínculo activo, de todos los
 * tenants. Es un panel de plataforma y no se le pasa tenant por parámetro (el
 * aislamiento lo pone el vínculo de cada propiedad, no el cliente HTTP).
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import { detectarReservasFaltantes } from '@/lib/hospitality/reservas-faltantes';

// Mismo guardia que el resto de rutas de admin/conectividad.
async function requireSuperadmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { role: true },
  });
  if (!user || user.role?.nombre !== 'Superadmin') {
    return { error: NextResponse.json({ error: 'Acceso denegado' }, { status: 403 }) };
  }
  return { user };
}

export async function GET() {
  try {
    const auth = await requireSuperadmin();
    if ('error' in auth) return auth.error;

    const resumen = await detectarReservasFaltantes();

    // Siempre HTTP 200 con el resumen en el body: un fallo del proveedor es
    // parte de la respuesta (va en `errores`) y el panel tiene que poder
    // enseñarlo. Un 5xx lo reemplazaría el proxy por «error code: 502» y la
    // causa real se perdería.
    return NextResponse.json(resumen, { status: 200 });
  } catch (error) {
    console.error('Error comprobando reservas faltantes del canal:', error);
    return NextResponse.json({ error: 'Error al comprobar las reservas del canal' }, { status: 500 });
  }
}
