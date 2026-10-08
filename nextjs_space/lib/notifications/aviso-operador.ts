/**
 * Aviso al operador de la plataforma — fuera de la aplicación.
 *
 * Un aviso que solo se ve abriendo el panel no sirve para lo que se le pide a un
 * aviso: enterarse sin ir a mirar. Este módulo es el canal que ya usa el latido
 * de `uptime-developers` —Resend al `ADMIN_EMAIL`, con Apprise como extra— pero
 * con nombre propio y en un solo sitio, para que el siguiente job que tenga algo
 * que decir al operador no vuelva a inventarse el envío.
 *
 * Canales, en este orden y cada uno independiente de los demás:
 *
 *   1. **`console`** — siempre. Es el rastro que sobrevive aunque los webhooks
 *      externos estén caídos, y es lo que queda en los logs del VPS.
 *   2. **Apprise** — opcional, si hay `OPERADOR_APPRISE_URL` (o, por
 *      compatibilidad, `UPTIME_APPRISE_URL`). Una URL prebuilt que puede
 *      repartir a email, Telegram, Slack…
 *   3. **Resend → `ADMIN_EMAIL`** — el canal que no depende de nada del stack
 *      multi-tenant: un correo y ya.
 *
 * Un fallo de un canal se registra y **no impide** los demás: lo peor que puede
 * pasar aquí es un aviso que no llega, así que se intentan todos y se informa
 * exactamente de lo que pasó.
 *
 * Lo que este módulo NO hace: decidir si toca avisar. Eso es del job (y es
 * donde vive el intervalo, la deduplicación y el sentido común).
 */

export interface AvisoOperador {
  title: string;
  body: string;
  /** Etiqueta para los canales que la admitan (Apprise). */
  tag?: string;
  type?: 'info' | 'warning' | 'error';
}

export interface ResultadoAvisoOperador {
  /** Siempre `true`: el log no puede fallar. */
  consola: true;
  /** `enviado` · `sin_configurar` · `fallo`. */
  apprise: 'enviado' | 'sin_configurar' | 'fallo';
  resend: 'enviado' | 'sin_configurar' | 'fallo';
  /** Mensajes de los canales que fallaron, para que el job los cuente. */
  errores: string[];
}

const TIMEOUT_MS = 5_000;

/** URL prebuilt de Apprise para avisos del operador (o la del uptime como respaldo). */
export function appriseDeOperador():
  | string
  | undefined {
  return process.env.OPERADOR_APPRISE_URL || process.env.UPTIME_APPRISE_URL;
}

/** ¿Hay al menos un canal que saque el aviso de la aplicación? */
export function hayCanalExterno(): boolean {
  const apprise = Boolean(appriseDeOperador());
  const email = Boolean(process.env.ADMIN_EMAIL && process.env.RESEND_API_KEY);
  return apprise || email;
}

export async function avisarOperador(
  aviso: AvisoOperador
): Promise<ResultadoAvisoOperador> {
  const errores: string[] = [];

  // 1) Console primero: el rastro no depende de nadie.
  console.warn(`[aviso-operador] ${aviso.title}\n${aviso.body}`);

  // 2) Apprise (opcional).
  let apprise: ResultadoAvisoOperador['apprise'] = 'sin_configurar';
  const appriseUrl = appriseDeOperador();
  if (appriseUrl) {
    apprise = 'fallo';
    try {
      const r = await fetch(appriseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: aviso.title,
          body: aviso.body,
          type: aviso.type ?? 'warning',
          tag: aviso.tag ?? 'volkern-operador',
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (r.ok) apprise = 'enviado';
      else {
        errores.push(`Apprise HTTP ${r.status}`);
        console.error(`[aviso-operador] Apprise falló: HTTP ${r.status}`);
      }
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : String(err);
      errores.push(`Apprise: ${mensaje}`);
      console.error(`[aviso-operador] Apprise error: ${mensaje}`);
    }
  }

  // 3) Resend a ADMIN_EMAIL.
  let resend: ResultadoAvisoOperador['resend'] = 'sin_configurar';
  const adminEmail = process.env.ADMIN_EMAIL;
  const resendKey = process.env.RESEND_API_KEY;
  if (adminEmail && resendKey) {
    resend = 'fallo';
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || 'Volkern Operador <noreply@volkern.app>',
          to: [adminEmail],
          subject: aviso.title,
          text: aviso.body,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (r.ok) resend = 'enviado';
      else {
        const cuerpo = await r.text().catch(() => '');
        errores.push(`Resend HTTP ${r.status}`);
        console.error(
          `[aviso-operador] Resend falló: HTTP ${r.status} — ${cuerpo.slice(0, 200)}`
        );
      }
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : String(err);
      errores.push(`Resend: ${mensaje}`);
      console.error(`[aviso-operador] Resend error: ${mensaje}`);
    }
  }

  return { consola: true, apprise, resend, errores };
}
