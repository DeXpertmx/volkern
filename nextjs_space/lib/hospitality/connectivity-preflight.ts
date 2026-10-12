/**
 * Preflight de las credenciales de Conectividad de Canales.
 *
 * Cuando el proveedor contesta con «esta es la URL, este el partner id y este
 * el Basic Auth», el operador tiene UNA sola oportunidad de pegarlo bien. Un
 * espacio de más, unas comillas heredadas de un PDF o un `usuario:contraseña`
 * metido entero en el campo del usuario no dan un error claro: dan un 401 que
 * parece «credenciales inválidas» y cuesta horas. Este módulo puro dice, campo
 * a campo, qué está mal y cómo arreglarlo, y devuelve los valores ya
 * normalizados para guardarlos tal cual.
 *
 * Reglas duras que aplica:
 * - URL: http(s), con host, sin credenciales embebidas, sin query ni fragmento
 *   y sin espacios ni saltos de línea. La ruta del contrato se añade sola; si
 *   el operador pega una ruta distinta, es un error (llamaría a un 404 del
 *   borde y volvería a parecer un problema de credenciales).
 * - Basic Auth (RFC 7617): el usuario no puede contener `:`, y usuario y
 *   contraseña se comparan byte a byte, así que un espacio o una comilla de
 *   más es un fallo de autenticación, no un detalle cosmético.
 *
 * Módulo SIN dependencias: lo importa la pantalla de admin (cliente), la API
 * y el script de operador, así que no puede arrastrar Prisma ni el descifrado
 * de secretos (hay una guardia que prohíbe que la pantalla importe
 * `connectivity.ts`).
 */

/** Ruta del contrato (canal manager v2). Se inyecta o se toma este valor por defecto. */
export const PREFIJO_API_POR_DEFECTO = '/api/v2/cm';

export type CampoPreflight = 'baseUrl' | 'partnerId' | 'username' | 'password';
export type GravedadPreflight = 'error' | 'aviso';

export interface AvisoPreflight {
  campo: CampoPreflight;
  gravedad: GravedadPreflight;
  /** Qué está mal, sin repetir el valor (los mensajes se pintan en pantalla). */
  mensaje: string;
  /** Qué hacer para arreglarlo. */
  arreglo?: string;
}

export interface EntradaPreflight {
  baseUrl?: string | null;
  partnerId?: string | null;
  username?: string | null;
  password?: string | null;
  /** Ruta del contrato; por defecto `PREFIJO_API_POR_DEFECTO`. */
  prefijoApi?: string;
  /** true = los tres campos de credenciales son obligatorios (alta completa). */
  exigirTodo?: boolean;
}

export interface ResultadoPreflight {
  /** Sin errores (los avisos no bloquean el guardado). */
  ok: boolean;
  bloqueantes: AvisoPreflight[];
  advertencias: AvisoPreflight[];
  avisos: AvisoPreflight[];
  /** Valores listos para guardar (recortados donde corresponde, contraseña intacta). */
  valores: {
    baseUrl: string | null;
    partnerId: string | null;
    username: string | null;
    password: string | null;
  };
  /** URL final que usará el adapter (base + ruta del contrato), o null. */
  urlContrato: string | null;
}

export const ETIQUETAS_CAMPO: Record<CampoPreflight, string> = {
  baseUrl: 'URL del servicio',
  partnerId: 'ID de socio',
  username: 'Usuario API',
  password: 'Contraseña API',
};

/** Caracteres invisibles que viajan con el copiar y pegar y rompen la autenticación. */
const INVISIBLES: Array<{ caracter: string; nombre: string }> = [
  { caracter: '\u00a0', nombre: 'espacio duro' },
  { caracter: '\u200b', nombre: 'espacio de ancho cero' },
  { caracter: '\u200c', nombre: 'no-empalmador de ancho cero' },
  { caracter: '\ufeff', nombre: 'marca de orden de bytes (BOM)' },
  { caracter: '\u2018', nombre: 'comilla tipográfica' },
  { caracter: '\u2019', nombre: 'comilla tipográfica' },
  { caracter: '\u201c', nombre: 'comilla tipográfica' },
  { caracter: '\u201d', nombre: 'comilla tipográfica' },
];

function invisiblesEn(valor: string): string[] {
  const nombres = new Set<string>();
  for (const { caracter, nombre } of INVISIBLES) {
    if (valor.includes(caracter)) nombres.add(nombre);
  }
  return [...nombres];
}

function hayControl(valor: string): boolean {
  // Controles ASCII (incluye \r, \n y \t) y DEL.
  // eslint-disable-next-line no-control-regex
  return /[\u0000-\u001f\u007f]/.test(valor);
}

function esHostLocal(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]' || host.endsWith('.local');
}

function describirInvisibles(nombres: string[]): string {
  return `trae caracteres invisibles (${nombres.join(', ')}) que no se ven pero rompen la autenticación`;
}

/**
 * Solo los textos se revisan como credenciales. Cualquier otra cosa (número,
 * objeto, boolean de un cliente descuidado) se trata como «campo no enviado»:
 * quien decide si eso es un error de tipo es la API, no el preflight.
 */
function comoTexto(valor: unknown): string | null | undefined {
  if (valor === undefined || valor === null) return valor as null | undefined;
  return typeof valor === 'string' ? valor : undefined;
}

function normalizarPrefijo(prefijo?: string): string {
  const bruto = (prefijo ?? PREFIJO_API_POR_DEFECTO).trim();
  const conBarra = bruto.startsWith('/') ? bruto : `/${bruto}`;
  return conBarra.replace(/\/+$/, '');
}

// ─── URL del servicio ──────────────────────────────────────────────────────

function revisarBaseUrl(
  valor: string | null | undefined,
  prefijo: string,
  exigir: boolean,
): { valor: string | null; avisos: AvisoPreflight[] } {
  const avisos: AvisoPreflight[] = [];
  if (valor === undefined || valor === null) {
    // Sin `exigirTodo` la URL no está en juego (el guardado parcial de
    // credenciales es válido); con él —alta completa o script de operador— una
    // configuración sin URL no puede darse por buena.
    if (exigir) {
      avisos.push({
        campo: 'baseUrl',
        gravedad: 'error',
        mensaje: 'Falta la URL del servicio.',
        arreglo: 'Viene en la misma respuesta del proveedor que el usuario y la contraseña.',
      });
    }
    return { valor: null, avisos };
  }

  if (valor.trim() === '') {
    avisos.push({
      campo: 'baseUrl',
      gravedad: 'error',
      mensaje: 'La URL del servicio está vacía.',
      arreglo: 'Pega en la variable del servidor la URL que envía el proveedor en su respuesta.',
    });
    return { valor: null, avisos };
  }

  if (hayControl(valor)) {
    avisos.push({
      campo: 'baseUrl',
      gravedad: 'error',
      mensaje: 'La URL trae un salto de línea o una tabulación.',
      arreglo: 'Vuelve a copiarla de la respuesta del proveedor: debería ser una sola línea sin espacios.',
    });
    return { valor: null, avisos };
  }

  const recortada = valor.trim();
  if (recortada !== valor) {
    avisos.push({
      campo: 'baseUrl',
      gravedad: 'aviso',
      mensaje: 'La URL venía con espacios alrededor; se recortan.',
    });
  }

  const invisibles = invisiblesEn(recortada);
  if (invisibles.length > 0) {
    avisos.push({
      campo: 'baseUrl',
      gravedad: 'error',
      mensaje: `La URL ${describirInvisibles(invisibles)}.`,
      arreglo: 'Escríbela a mano o vuelve a copiarla desde la respuesta original.',
    });
  }

  if (/\s/.test(recortada)) {
    avisos.push({
      campo: 'baseUrl',
      gravedad: 'error',
      mensaje: 'La URL tiene un espacio en medio.',
      arreglo: 'Debe ser una sola URL continua, sin espacios.',
    });
  }

  let url: URL;
  try {
    url = new URL(recortada);
  } catch {
    avisos.push({
      campo: 'baseUrl',
      gravedad: 'error',
      mensaje: 'La URL no se puede interpretar como dirección.',
      arreglo: 'Debe empezar por https:// y traer el host completo (por ejemplo https://host-del-proveedor).',
    });
    return { valor: null, avisos };
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    avisos.push({
      campo: 'baseUrl',
      gravedad: 'error',
      mensaje: `Solo se admiten http y https (llega «${url.protocol}»).`,
      arreglo: 'Copia la URL tal cual la envía el proveedor, empezando por https://.',
    });
  } else if (url.protocol === 'http:' && !esHostLocal(url.hostname)) {
    avisos.push({
      campo: 'baseUrl',
      gravedad: 'aviso',
      mensaje: 'La URL va por http sin cifrado, y el Basic Auth viaja en claro.',
      arreglo: 'Confírmalo con el proveedor antes de abrir a producción: lo esperable es https.',
    });
  }

  if (url.username !== '' || url.password !== '') {
    avisos.push({
      campo: 'baseUrl',
      gravedad: 'error',
      mensaje: 'La URL trae credenciales embebidas (usuario:contraseña@host).',
      arreglo: 'Quita esa parte: el usuario y la contraseña van en sus propios campos.',
    });
  }

  if (url.search !== '') {
    avisos.push({
      campo: 'baseUrl',
      gravedad: 'error',
      mensaje: 'La URL trae una consulta (?algo=valor) que el contrato no usa.',
      arreglo: 'Quédate solo con el host (y, como mucho, la ruta del contrato).',
    });
  }

  if (url.hash !== '') {
    avisos.push({
      campo: 'baseUrl',
      gravedad: 'error',
      mensaje: 'La URL trae un fragmento (#algo) que no forma parte del contrato.',
      arreglo: 'Corta la URL antes del #.',
    });
  }

  const ruta = url.pathname.replace(/\/+$/, '');
  const origen = `${url.protocol}//${url.host}`;

  if (ruta === '') {
    return { valor: origen, avisos };
  }
  if (ruta === prefijo) {
    return { valor: `${origen}${prefijo}`, avisos };
  }
  if (ruta.endsWith(prefijo)) {
    avisos.push({
      campo: 'baseUrl',
      gravedad: 'aviso',
      mensaje: 'La URL ya trae la ruta del contrato precedida de otra ruta; se usa tal cual.',
      arreglo: `Comprueba con el proveedor si esa ruta previa es correcta (¿basta con ${origen}?).`,
    });
    return { valor: `${origen}${ruta}`, avisos };
  }

  avisos.push({
    campo: 'baseUrl',
    gravedad: 'error',
    mensaje: 'La URL apunta a una ruta distinta de la del contrato.',
    arreglo: `Usa solo el host (${origen}) o la URL completa del contrato (${origen}${prefijo}); otras rutas acaban en un 404 del borde.`,
  });
  return { valor: null, avisos };
}

// ─── Partner ID ────────────────────────────────────────────────────────────

function revisarPartnerId(
  valor: string | null | undefined,
  exigir: boolean,
): { valor: string | null; avisos: AvisoPreflight[] } {
  const avisos: AvisoPreflight[] = [];
  if (valor === undefined || valor === null) {
    if (exigir) {
      avisos.push({
        campo: 'partnerId',
        gravedad: 'error',
        mensaje: 'Falta el ID de socio.',
        arreglo: 'Es el identificador que el proveedor asigna al dar de alta la cuenta (no es tu email).',
      });
    }
    return { valor: null, avisos };
  }

  const recortado = valor.trim();
  if (recortado === '') {
    avisos.push({
      campo: 'partnerId',
      gravedad: exigir ? 'error' : 'aviso',
      mensaje: exigir ? 'El ID de socio está vacío.' : 'El ID de socio viene vacío: no se cambiará el actual.',
      arreglo: 'Cópialo de la respuesta del proveedor.',
    });
    return { valor: null, avisos };
  }

  if (recortado !== valor) {
    avisos.push({
      campo: 'partnerId',
      gravedad: 'aviso',
      mensaje: 'El ID de socio venía con espacios alrededor; se recortan.',
    });
  }

  const invisibles = invisiblesEn(recortado);
  if (invisibles.length > 0) {
    avisos.push({
      campo: 'partnerId',
      gravedad: 'error',
      mensaje: `El ID de socio ${describirInvisibles(invisibles)}.`,
      arreglo: 'Vuelve a copiarlo desde la respuesta original.',
    });
  }

  if (hayControl(recortado)) {
    avisos.push({
      campo: 'partnerId',
      gravedad: 'error',
      mensaje: 'El ID de socio trae un salto de línea o una tabulación.',
      arreglo: 'Es un identificador de una sola línea.',
    });
  } else if (/\s/.test(recortado)) {
    avisos.push({
      campo: 'partnerId',
      gravedad: 'error',
      mensaje: 'El ID de socio tiene un espacio en medio.',
      arreglo: 'Cópialo tal cual viene, sin espacios.',
    });
  }

  if (recortado.includes('://') || recortado.includes('/')) {
    avisos.push({
      campo: 'partnerId',
      gravedad: 'error',
      mensaje: 'El ID de socio parece una URL.',
      arreglo: 'La URL va en la variable del servidor; aquí solo el identificador.',
    });
  }
  if (recortado.includes('@')) {
    avisos.push({
      campo: 'partnerId',
      gravedad: 'error',
      mensaje: 'El ID de socio parece una dirección de correo.',
      arreglo: 'Pídele al proveedor el identificador de cuenta: no es un email.',
    });
  }
  if (recortado.includes(':')) {
    avisos.push({
      campo: 'partnerId',
      gravedad: 'error',
      mensaje: 'El ID de socio contiene «:»: parece un «usuario:contraseña».',
      arreglo: 'Separa usuario y contraseña en sus campos.',
    });
  }

  if (recortado.length < 2) {
    avisos.push({
      campo: 'partnerId',
      gravedad: 'error',
      mensaje: 'El ID de socio es demasiado corto.',
      arreglo: 'Revisa que no se haya copiado solo un trozo.',
    });
  } else if (recortado.length > 64) {
    avisos.push({
      campo: 'partnerId',
      gravedad: 'error',
      mensaje: 'El ID de socio es demasiado largo: parece que se ha pegado algo más.',
      arreglo: 'El identificador suele ser corto (letras, números y guiones).',
    });
  } else if (
    !/^[A-Za-z0-9._-]+$/.test(recortado) &&
    // Si ya hay un error, avisar además de caracteres raros solo mete ruido.
    !avisos.some((a) => a.gravedad === 'error')
  ) {
    avisos.push({
      campo: 'partnerId',
      gravedad: 'aviso',
      mensaje: 'El ID de socio trae caracteres poco habituales.',
      arreglo: 'Confírmalo con el proveedor si el valor no coincide letra por letra con su respuesta.',
    });
  }

  return { valor: recortado, avisos };
}

// ─── Basic Auth (usuario + contraseña) ─────────────────────────────────────

interface ResultadoBasicAuth {
  username: string | null;
  password: string | null;
  avisos: AvisoPreflight[];
}

function revisarBasicAuth(
  usuarioEntrada: string | null | undefined,
  passwordEntrada: string | null | undefined,
  partnerId: string | null,
  exigir: boolean,
): ResultadoBasicAuth {
  const avisos: AvisoPreflight[] = [];
  let username = usuarioEntrada ?? null;
  let password = passwordEntrada ?? null;

  // ── Usuario ──
  if (username !== null) {
    const recortado = username.trim();

    if (recortado === '') {
      avisos.push({
        campo: 'username',
        gravedad: exigir ? 'error' : 'aviso',
        mensaje: exigir ? 'El usuario API está vacío.' : 'El usuario API viene vacío: no se cambiará el actual.',
        arreglo: 'Cópialo de la respuesta del proveedor.',
      });
      username = null;
    } else {
      if (recortado !== username) {
        avisos.push({
          campo: 'username',
          gravedad: 'aviso',
          mensaje: 'El usuario venía con espacios alrededor; se recortan.',
        });
      }
      username = recortado;

      // «usuario:contraseña» pegado entero en un solo campo: el error de pegado
      // más habitual. Se separa solo si la contraseña todavía está vacía, y se
      // avisa de lo que se ha interpretado.
      const partido = password === null || password.trim() === ''
        ? /^([^:\s]+):(.+)$/.exec(recortado)
        : null;
      if (partido) {
        username = partido[1];
        password = partido[2];
        avisos.push({
          campo: 'username',
          gravedad: 'aviso',
          mensaje: 'El usuario traía la contraseña detrás de «:»: se han separado.',
          arreglo: 'Comprueba en pantalla que el usuario y la contraseña quedan cada uno en su campo.',
        });
      } else if (username.includes(':')) {
        avisos.push({
          campo: 'username',
          gravedad: 'error',
          mensaje: 'El usuario contiene «:», y el Basic Auth usa ese carácter como separador.',
          arreglo: 'Deja solo el usuario aquí y pon la contraseña en su campo.',
        });
      }

      const invisibles = invisiblesEn(username);
      if (invisibles.length > 0) {
        avisos.push({
          campo: 'username',
          gravedad: 'error',
          mensaje: `El usuario ${describirInvisibles(invisibles)}.`,
          arreglo: 'Vuelve a copiarlo desde la respuesta original.',
        });
      }
      if (hayControl(username)) {
        avisos.push({
          campo: 'username',
          gravedad: 'error',
          mensaje: 'El usuario trae un salto de línea o una tabulación.',
          arreglo: 'Es un identificador de una sola línea.',
        });
      } else if (/\s/.test(username)) {
        avisos.push({
          campo: 'username',
          gravedad: 'aviso',
          mensaje: 'El usuario tiene un espacio en medio.',
          arreglo: 'Confírmalo con el proveedor: casi siempre es un espacio de más al copiar.',
        });
      }
      if (!username.includes(':') && username.includes('@')) {
        avisos.push({
          campo: 'username',
          gravedad: 'aviso',
          mensaje: 'El usuario parece una dirección de correo.',
          arreglo: 'Algunos proveedores usan el email como usuario; confírmalo antes de guardar.',
        });
      }
      if (username.length > 128) {
        avisos.push({
          campo: 'username',
          gravedad: 'error',
          mensaje: 'El usuario es demasiado largo: parece que se ha pegado algo más.',
          arreglo: 'Cópialo otra vez desde la respuesta del proveedor.',
        });
      }
    }
  } else if (exigir) {
    avisos.push({
      campo: 'username',
      gravedad: 'error',
      mensaje: 'Falta el usuario API.',
      arreglo: 'Los tres datos (ID de socio, usuario y contraseña) vienen juntos en la respuesta del proveedor.',
    });
  }

  // ── Contraseña ──
  if (password !== null) {
    if (password === '') {
      avisos.push({
        campo: 'password',
        gravedad: exigir ? 'error' : 'aviso',
        mensaje: exigir ? 'La contraseña API está vacía.' : 'La contraseña viene vacía: no se cambiará la actual.',
        arreglo: 'Cópiala de la respuesta del proveedor.',
      });
      password = null;
    } else {
      // La contraseña NO se recorta nunca: Basic Auth se compara byte a byte y
      // el guardado la escribiría distinta a la que mandó el proveedor.
      if (password.trim() !== password) {
        avisos.push({
          campo: 'password',
          gravedad: 'error',
          mensaje: 'La contraseña empieza o acaba en un espacio (o un salto de línea).',
          arreglo:
            'Se compara byte a byte: ese espacio provoca un 401 que parece «credenciales inválidas». Vuelve a copiarla sin espacios de los extremos.',
        });
      }

      const conComillas = /^(['"]).*\1$/.test(password) && password.length >= 2;
      if (conComillas) {
        avisos.push({
          campo: 'password',
          gravedad: 'error',
          mensaje: 'La contraseña viene entre comillas.',
          arreglo: 'Quita las comillas: forman parte del documento de donde la copiaste, no de la contraseña.',
        });
      }

      const invisibles = invisiblesEn(password);
      if (invisibles.length > 0) {
        avisos.push({
          campo: 'password',
          gravedad: 'error',
          mensaje: `La contraseña ${describirInvisibles(invisibles)}.`,
          arreglo: 'Vuelve a copiarla desde la respuesta original o escríbela a mano.',
        });
      }
      if (hayControl(password)) {
        avisos.push({
          campo: 'password',
          gravedad: 'error',
          mensaje: 'La contraseña trae un salto de línea o una tabulación.',
          arreglo: 'Debe ser una sola línea sin saltos.',
        });
      }
      if (password.length > 256) {
        avisos.push({
          campo: 'password',
          gravedad: 'error',
          mensaje: 'La contraseña es demasiado larga: parece que se ha pegado algo más.',
          arreglo: 'Cópiala otra vez, sola, desde la respuesta del proveedor.',
        });
      }
    }
  } else if (exigir) {
    avisos.push({
      campo: 'password',
      gravedad: 'error',
      mensaje: 'Falta la contraseña API.',
      arreglo: 'Los tres datos (ID de socio, usuario y contraseña) vienen juntos en la respuesta del proveedor.',
    });
  }

  // ── Cruces entre campos: el síntoma típico de un pegado apresurado ──
  if (username && password && username === password) {
    avisos.push({
      campo: 'password',
      gravedad: 'error',
      mensaje: 'La contraseña es igual que el usuario.',
      arreglo: 'Se ha pegado el mismo valor en los dos campos: revisa la respuesta del proveedor.',
    });
  }
  if (username && partnerId && username === partnerId) {
    // Aiosell asigna el usuario de Basic Auth IDÉNTICO al ID de socio
    // («the partner id which is the username and used as partnerid in the
    // endpoints as well», WhatsApp 9-oct-2026). Ya no es error: es el
    // esquema real del proveedor — solo se apunta, no bloquea.
    avisos.push({
      campo: 'username',
      gravedad: 'aviso',
      mensaje: 'El usuario es igual que el ID de socio (esquema Aiosell: son el mismo valor por diseño).',
      arreglo: 'Nada: es lo esperado con este proveedor; el preflight solo lo anota.',
    });
  }
  if (password && partnerId && password === partnerId) {
    avisos.push({
      campo: 'password',
      gravedad: 'error',
      mensaje: 'La contraseña es igual que el ID de socio.',
      arreglo: 'Cada campo lleva su valor: revisa la respuesta del proveedor.',
    });
  }

  return { username, password, avisos };
}

// ─── Entrada principal ─────────────────────────────────────────────────────

/**
 * Revisa las credenciales y la URL antes de guardar. No lanza nunca: devuelve
 * errores bloqueantes, avisos y los valores normalizados.
 *
 * `undefined`/`null` significa «este campo no se toca» (el guardado ignora los
 * campos vacíos, así que editar solo la contraseña es válido). Con
 * `exigirTodo: true` —alta completa o script de operador— un campo vacío es un
 * error.
 */
export function preflightConectividad(entrada: EntradaPreflight): ResultadoPreflight {
  const prefijo = normalizarPrefijo(entrada.prefijoApi);
  const exigir = entrada.exigirTodo === true;

  const base = revisarBaseUrl(comoTexto(entrada.baseUrl), prefijo, exigir);
  const partner = revisarPartnerId(comoTexto(entrada.partnerId), exigir);
  const auth = revisarBasicAuth(
    comoTexto(entrada.username),
    comoTexto(entrada.password),
    partner.valor,
    exigir,
  );

  const avisos = [...base.avisos, ...partner.avisos, ...auth.avisos];
  const bloqueantes = avisos.filter((a) => a.gravedad === 'error');
  const advertencias = avisos.filter((a) => a.gravedad === 'aviso');

  const urlContrato = base.valor
    ? base.valor.endsWith(prefijo)
      ? base.valor
      : `${base.valor}${prefijo}`
    : null;

  return {
    ok: bloqueantes.length === 0,
    bloqueantes,
    advertencias,
    avisos,
    valores: {
      baseUrl: base.valor,
      partnerId: partner.valor,
      username: auth.username,
      password: auth.password,
    },
    urlContrato,
  };
}

/** Línea corta para un toast o la salida de un script. */
export function resumenPreflight(resultado: ResultadoPreflight): string {
  if (!resultado.ok) {
    const primero = resultado.bloqueantes[0];
    const resto = resultado.bloqueantes.length - 1;
    return `${ETIQUETAS_CAMPO[primero.campo]}: ${primero.mensaje}${
      resto > 0 ? ` (y ${resto} error(es) más)` : ''
    }`;
  }
  if (resultado.advertencias.length > 0) {
    return `Sin errores, con ${resultado.advertencias.length} aviso(s) a revisar.`;
  }
  return 'Credenciales con el formato correcto.';
}
