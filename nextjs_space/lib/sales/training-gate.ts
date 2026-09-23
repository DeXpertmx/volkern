/**
 * Bucle riesgo → roleplay — módulo PURO (sin BD, sin HTTP, sin IA).
 *
 * Lo que completa el ciclo que faltaba: cuando la salud de una oportunidad
 * cae a CRÍTICO (pipeline-health-service), el sistema YA sabe que hay riesgo;
 * lo que no hacía era nada con ese conocimiento. Ahora ordena abrir una
 * SESIÓN DE PRÁCTICA con el gemelo digital de ese cliente concreto
 * (training-skills) y cierra la PUERTA DE CONTACTO: la oportunidad no puede
 * tocarse con el cliente (llamada, email, WhatsApp, reunión, cita) hasta que
 * el vendedor demuestre puntuación mínima practicando CON SUS DATOS.
 *
 * La regla de fondo (inviolable): practicar nunca es castigo ni burocracia.
 * La práctica se lanza con el cliente real de la oportunidad — sus notas,
 * sus objeciones, su historial — para que el ensayo sea LA MISMA conversación
 * que va a pasar. Y la puerta se levanta en cuanto hay demostración, sin
 * fricción extra: la sesión que ya registra el post-mortem ES la llave.
 *
 * Esta es la única definición de «crítico» y del umbral del sistema:
 * pipeline-health-service cae aquí para el estado, y el evento declarado
 * TRAINING_COMPLETED (automation-listener) cuelga del cierre de sesión de
 * aquí. Si cambia el umbral, cambia en este módulo y en ninguna otra parte.
 */

/** La salud a la que se activa la práctica (la misma clasificación del health service). */
export const ESTADO_ACTIVACION = 'CRITICAL' as const;

/** Puntuación mínima (0-100) del post-mortem para levantar la puerta. */
export const PUNTUACION_MINIMA = 70;

/**
 * Etiqueta que marca la puerta en `Deal.tags` — sin migración: las etiquetas
 * son el almacén de estado operativo que el watchdog ya usa (HOT/ZOMBIE) y
 * ven los paneles. El prefijo evita colisiones con etiquetas humanas.
 */
export const ETIQUETA_PUERTA = 'PRACTICA_REQUERIDA';

/** Determina si la salud alcanzada debe abrir la puerta de práctica. */
export function debeAbrirPuerta(healthStatus: string | null | undefined): boolean {
  return healthStatus === ESTADO_ACTIVACION;
}

/** Determina si una puntuación de práctica levanta la puerta. */
export function levantaLaPuerta(score: number | null | undefined): boolean {
  return typeof score === 'number' && Number.isFinite(score) && score >= PUNTUACION_MINIMA;
}

/**
 * Tipos de actividad de DealActivity que SON contacto con el cliente y, por
 * tanto, quedan bloqueados con la puerta activa. Dos familias:
 *  - canónicos: actividad, cita, interaccion (entradas genéricas del CRM)
 *  - del formulario de la ficha: llamada, email, reunión (lo que envía
 *    NuevaActivityForm) — la línea de tiempo los pinta como «actividad» con
 *    subtipo, pero el POST viaja con el tipo del formulario.
 * Lo que no está aquí (nota, tarea, cotización, cambio de etapa, adjunto…)
 * sigue permitido: trabajar la oportunidad por dentro no se castiga — al
 * contrario, es justo lo que se espera mientras se prepara la práctica.
 */
const TIPOS_CONTACTO = new Set(['actividad', 'cita', 'interaccion', 'llamada', 'email', 'reunion']);

/** ¿Este tipo de actividad es contacto con el cliente (bloqueable)? */
export function esContactoConCliente(tipo: string | null | undefined): boolean {
  return typeof tipo === 'string' && TIPOS_CONTACTO.has(tipo);
}

/** Decide si una actividad queda bloqueada por la puerta. */
export function actividadBloqueada(tipo: string | null | undefined, puertaActiva: boolean): boolean {
  return puertaActiva && esContactoConCliente(tipo);
}

/** Une la etiqueta de la puerta a las existentes sin duplicar (lista CSV). */
export function activarEtiqueta(tags: string | null | undefined): string {
  const actuales = (tags ?? '').split(',').map(t => t.trim()).filter(Boolean);
  if (!actuales.includes(ETIQUETA_PUERTA)) actuales.push(ETIQUETA_PUERTA);
  return actuales.join(',');
}

/** Quita la etiqueta de la puerta de la lista CSV (si no está, devuelve lo mismo). */
export function desactivarEtiqueta(tags: string | null | undefined): string | null {
  const restantes = (tags ?? '')
    .split(',')
    .map(t => t.trim())
    .filter(Boolean)
    .filter(t => t !== ETIQUETA_PUERTA);
  return restantes.length > 0 ? restantes.join(',') : null;
}

/** ¿La lista de etiquetas trae la puerta activa? */
export function puertaActivaEnEtiquetas(tags: string | null | undefined): boolean {
  return (tags ?? '')
    .split(',')
    .map(t => t.trim())
    .includes(ETIQUETA_PUERTA);
}

/**
 * Datos del deal que el simulador necesita para armar el gemelo digital —
 * la misma fuente que usa `generateCustomerResponse` (notas e interacciones
 * reales del lead), más el contexto de POR QUÉ toca practicar.
 */
export interface EncargoPractica {
  dealId: string;
  leadId: string;
  tenantId: string;
  usuarioAsignadoId: string | null;
  titulo: string;
  healthScore: number | null;
  /** Texto listo para el encabezado del simulador. */
  motivo(): string;
}

export function encargoDePractica(deal: {
  id: string;
  leadId: string | null;
  tenantId: string;
  usuarioAsignadoId: string | null;
  titulo: string;
  healthScore?: number | null;
}): EncargoPractica | null {
  if (!deal.leadId) return null; // sin lead no hay gemelo digital: no hay qué practicar
  return {
    dealId: deal.id,
    leadId: deal.leadId,
    tenantId: deal.tenantId,
    usuarioAsignadoId: deal.usuarioAsignadoId,
    titulo: deal.titulo,
    healthScore: deal.healthScore ?? null,
    motivo() {
      const salud = this.healthScore ?? null;
      return (
        `La oportunidad «${this.titulo}» está en riesgo crítico` +
        (salud !== null ? ` (salud ${salud}/100)` : '') +
        '. Practica la conversación con este cliente antes de contactarlo.'
      );
    },
  };
}
