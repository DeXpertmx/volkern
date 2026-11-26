/**
 * Estado de un proceso del orquestador pausado en una aprobación de clase C/D.
 *
 * La fila vive en `AgentConversationContext` con la clave `proceso:<approvalId>`:
 * la aprobación es la que manda, así que se lee sin migraciones ni búsquedas
 * por JSON. Se guardan los pasos que quedaban ya resueltos (sin funciones) para
 * poder ejecutarlos desde la ruta de aprobaciones con la identidad y el hilo
 * de quien los pidió, y por tanto con su misma clave de idempotencia.
 */

import { prisma } from '@/lib/db';
import { cargarRolDeUsuario } from './crm-tool-permissions';
import { cargarRestriccionesMcp } from './tool-registry';
import type { PasoProceso, ResultadoPaso } from './orchestracion-inteligente';

/** Paso ya resuelto: argumentos fijos, u omitido por falta de datos. */
export interface PasoPendiente {
  nombre: string;
  herramienta: string;
  args: Record<string, any>;
  esencial?: boolean;
  omitido?: boolean;
}

export interface ProcesoPendiente {
  approvalId: string;
  nombreProceso: string;
  tenantId: string;
  userId: string;
  conversacionId?: string;
  pasos: PasoPendiente[];
}

const claveDeProceso = (approvalId: string) => `proceso:${approvalId}`;

/** Guarda (o reemplaza) el estado del proceso que espera esa aprobación. */
export async function guardarProcesoPendiente(proceso: ProcesoPendiente): Promise<void> {
  const clave = claveDeProceso(proceso.approvalId);
  const datos = {
    tenantId: proceso.tenantId,
    userId: proceso.userId,
    pendiente: proceso as unknown as object,
  };
  const existente = await prisma.agentConversationContext.findUnique({ where: { clave } });
  if (existente) {
    await prisma.agentConversationContext.update({ where: { clave }, data: datos });
  } else {
    await prisma.agentConversationContext.create({ data: { clave, ...datos } });
  }
}

/** Lee el proceso pausado, comprobando que la aprobación es de esa identidad. */
export async function cargarProcesoPendiente(params: {
  approvalId: string;
  tenantId: string;
  userId: string;
}): Promise<ProcesoPendiente | null> {
  const fila = await prisma.agentConversationContext.findUnique({
    where: { clave: claveDeProceso(params.approvalId) },
  });
  if (!fila?.pendiente) return null;

  const proceso = fila.pendiente as unknown as ProcesoPendiente;
  if (proceso.tenantId !== params.tenantId || proceso.userId !== params.userId) return null;
  return proceso;
}

export async function borrarProcesoPendiente(approvalId: string): Promise<void> {
  await prisma.agentConversationContext
    .delete({ where: { clave: claveDeProceso(approvalId) } })
    .catch(() => {});
}

/**
 * Ejecuta los pasos que quedaban cuando se aprobó el paso de clase C.
 *
 * Vuelve a cargar el rol y las restricciones del tenant: aprobar no concede
 * permisos que el rol no tuviera. Devuelve null si la aprobación no venía de
 * un proceso orquestado (herramienta suelta del chat).
 */
export async function reanudarProcesoAprobado(params: {
  approvalId: string;
  tenantId: string;
  userId: string;
}): Promise<{ nombreProceso: string; pasos: ResultadoPaso[]; resumen: string } | null> {
  const proceso = await cargarProcesoPendiente(params);
  if (!proceso) return null;

  // Import dinámico del único ciclo real: el orquestador importa este módulo.
  const { OrquestadorInteligente } = await import('./orchestracion-inteligente');

  const [usuario, restricciones] = await Promise.all([
    cargarRolDeUsuario({ userId: proceso.userId, tenantId: proceso.tenantId }),
    cargarRestriccionesMcp(proceso.tenantId),
  ]);

  const pasos: PasoProceso[] = proceso.pasos.map((p) =>
    p.omitido
      ? { nombre: p.nombre, herramienta: p.herramienta, args: {}, derivar: () => null, esencial: p.esencial }
      : { nombre: p.nombre, herramienta: p.herramienta, args: p.args ?? {}, esencial: p.esencial }
  );

  const resultado = await new OrquestadorInteligente().ejecutarProceso(
    proceso.nombreProceso,
    pasos,
    {
      tenantId: proceso.tenantId,
      userId: proceso.userId,
      // El mismo hilo: la clave de idempotencia de los pasos pendientes sigue
      // siendo la del turno que originó el proceso.
      conversacionId: proceso.conversacionId,
      usuario,
      restricciones,
    }
  );

  await borrarProcesoPendiente(params.approvalId);

  return {
    nombreProceso: resultado.nombreProceso,
    pasos: resultado.pasos,
    resumen: resultado.resumen,
  };
}
