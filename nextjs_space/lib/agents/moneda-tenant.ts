import { primeraMoneda } from '@/lib/moneda';

/**
 * Divisa de reporte de un tenant, para los mensajes que el agente le escribe.
 *
 * `Tenant.moneda` es la fuente autoritativa de la divisa de una cuenta, y sin
 * embargo el motor de agentes escribía el euro a mano: un tenant en pesos recibía
 * «Ingresos: 10.000 €» aunque toda su plataforma estuviera en pesos. Esto es lo
 * que consulta quien tiene que escribir dinero dentro de un mensaje.
 *
 * Devuelve cadena vacía cuando el tenant no declara divisa o la consulta no se
 * puede completar. En ese caso el importe se escribe sin símbolo —que es lo
 * honesto— en lugar de inventarle una divisa, y la respuesta del chatbot sale
 * igual: un mensaje no puede dejar de enviarse porque falle una lectura de
 * divisa, así que el error se traga a propósito.
 */
export async function monedaDelTenant(tenantId: string): Promise<string> {
  if (!tenantId) return '';

  try {
    const { prisma } = await import('@/lib/db');
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { moneda: true },
    });
    return primeraMoneda(tenant?.moneda);
  } catch {
    return '';
  }
}

/**
 * Divisa con la que escribir el dinero de una conversación.
 *
 * Prefiere la que ya trae el llamador —el chatbot lee el tenant en la misma
 * petición y no hace falta repetir la consulta— y solo mira en la base de datos
 * cuando no la tiene, para que el motor siga siendo correcto aunque un llamador
 * futuro se olvide de pasarla.
 */
export async function monedaDeLaConversacion(
  tenantId: string,
  moneda?: string | null
): Promise<string> {
  const declarada = primeraMoneda(moneda);
  return declarada || monedaDelTenant(tenantId);
}
