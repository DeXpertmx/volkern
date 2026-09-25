/**
 * Último rechazo del webhook de reservas entrante (401).
 *
 * El webhook ya responde el 401 con `diagnostico` (motivo, longitudes y
 * huellas de lo recibido, jamás el valor — ver route.ts) y lo deja en el log
 * del servicio. Ese dato se perdia: para verlo había que entrar al contenedor.
 * Aquí vive la pieza pura que lo normaliza para que el webhook lo persista y
 * el panel de conectividad lo muestre.
 *
 * Regla de secretos: el objeto persistido/expuesto contiene SOLO metadatos —
 * motivo, esquema, longitudes y huellas SHA-256 truncadas. Ni el valor
 * recibido ni nada del par guardado entran en esta pieza ni salen de ella.
 */

export const MOTIVOS_RECHAZO = [
  'sin_cabecera',
  'esquema_no_basic',
  'cabecera_malformada',
  'encoding_no_utf8',
  'sin_separador',
  'credenciales_no_coinciden',
] as const;

export type MotivoRechazo = (typeof MOTIVOS_RECHAZO)[number];

/**
 * Forma persistida del último rechazo. `usuarioLen`/`passwordLen` y las
 * huellas solo aparecen cuando la cabecera llegó a compararse
 * (`credenciales_no_coinciden`): antes de eso no hay nada que comparar.
 */
export interface RechazoWebhook {
  motivo: MotivoRechazo;
  esquema: string | null;
  usuarioLen?: number;
  passwordLen?: number;
  /** Huella SHA-256 truncada del usuario recibido. */
  usuarioHuella?: string;
  /** Huella SHA-256 truncada del par `usuario:contraseña` recibido. */
  huella?: string;
  /** Momento del rechazo (ISO, lo pone el webhook al registrar). */
  fecha: string;
}

export function esMotivoRechazo(valor: unknown): valor is MotivoRechazo {
  return typeof valor === 'string' && (MOTIVOS_RECHAZO as readonly string[]).includes(valor);
}

/**
 * Toma lo que llega de la BD (Json) y lo reduce a un `RechazoWebhook` limpio,
 * o null si está vacío o es de otra forma. La lectura tolerante evita que un
 * dato auxiliar rompa el panel o el estado público.
 */
export function normalizarRechazoWebhook(valor: unknown): RechazoWebhook | null {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null;
  const v = valor as Record<string, unknown>;
  if (!esMotivoRechazo(v.motivo)) return null;
  const limpio: RechazoWebhook = {
    motivo: v.motivo,
    esquema: typeof v.esquema === 'string' ? v.esquema : null,
    fecha: typeof v.fecha === 'string' ? v.fecha : '',
  };
  for (const campo of ['usuarioLen', 'passwordLen'] as const) {
    if (typeof v[campo] === 'number') limpio[campo] = v[campo] as number;
  }
  for (const campo of ['usuarioHuella', 'huella'] as const) {
    if (typeof v[campo] === 'string') limpio[campo] = v[campo] as string;
  }
  return limpio;
}

/**
 * Convierte el diagnóstico que construye el webhook en lo que se persiste.
 * `fecha` se añade aquí, en el momento del rechazo, para que la marca no
 * dependa del `fechaEdicion` de la fila (que se mueve por cualquier guardado).
 */
export function rechazoDesdeDiagnostico(
  diagnostico: Record<string, unknown>,
  ahora: Date
): RechazoWebhook | null {
  const sinFecha = normalizarRechazoWebhook(diagnostico);
  if (!sinFecha) return null;
  return { ...sinFecha, fecha: ahora.toISOString() };
}

/** Texto del motivo, en el lenguaje del panel (ES). */
export const ETIQUETAS_MOTIVO: Record<MotivoRechazo, string> = {
  sin_cabecera: 'Sin cabecera Authorization',
  esquema_no_basic: 'Esquema no Basic',
  cabecera_malformada: 'Cabecera Basic malformada',
  encoding_no_utf8: 'Credenciales fuera de UTF-8',
  sin_separador: 'Sin separador ":" en Basic',
  credenciales_no_coinciden: 'Credenciales distintas a las guardadas',
};

/** Qué arreglar, por motivo. Igual estilo que conectividad-causa.ts. */
export const CONSEJOS_MOTIVO: Record<MotivoRechazo, string> = {
  sin_cabecera:
    'El emisor envió el POST sin cabecera Authorization. Revisa la plantilla del emisor del proveedor.',
  esquema_no_basic:
    'El emisor usó otro esquema (p. ej. Bearer). El contrato exige HTTP Basic Auth.',
  cabecera_malformada:
    'La cabecera llegó con una forma que no se puede leer. Revisa cómo se monta la cabecera en el emisor.',
  encoding_no_utf8:
    'La credencial trajo bytes que no son UTF-8 (p. ej. latin-1). El emisor debe codificar el par en UTF-8 antes del base64.',
  sin_separador:
    'El base64 no contenía "usuario:contraseña": falta los dos puntos o se envió otro formato.',
  credenciales_no_coinciden:
    'El par recibido no coincide con el guardado: el emisor debe enviar el mismo usuario y contraseña configurados aquí (coteja las huellas abajo).',
};

export interface RechazoLegible {
  motivo: MotivoRechazo;
  etiqueta: string;
  consejo: string;
  esquema: string | null;
  usuarioLen: number | null;
  passwordLen: number | null;
  usuarioHuella: string | null;
  huella: string | null;
  fecha: string | null;
}

/**
 * Rechazo listo para renderizar: motivo en palabras + consejo de arreglo.
 * `null` cuando no hay rechazo persistido o la forma es inválida.
 */
export function rechazoLegible(valor: unknown): RechazoLegible | null {
  const r = normalizarRechazoWebhook(valor);
  if (!r) return null;
  return {
    motivo: r.motivo,
    etiqueta: ETIQUETAS_MOTIVO[r.motivo],
    consejo: CONSEJOS_MOTIVO[r.motivo],
    esquema: r.esquema,
    usuarioLen: r.usuarioLen ?? null,
    passwordLen: r.passwordLen ?? null,
    usuarioHuella: r.usuarioHuella ?? null,
    huella: r.huella ?? null,
    fecha: r.fecha || null,
  };
}
