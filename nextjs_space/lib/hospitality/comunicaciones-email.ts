/**
 * Editor visual de plantillas de email de Hospitality (plan maestro §21).
 *
 * El email de una plantilla dejó de ser un texto con saltos de línea envuelto en
 * `<p>`: el hotel lo compone con **bloques** (un párrafo, una sección de
 * etiqueta/valor como las del correo del canal, un botón) y se compila a HTML de
 * tabla con estilos en línea, que es lo que renderizan los clientes de correo.
 *
 * Este módulo es puro: no toca la base de datos ni la red, así que el mismo
 * `renderDisenoEmail` que compila el correo del huésped pinta la vista previa en
 * el navegador. Lo que se ve al editar es lo que se envía.
 *
 * Nada de HTML del hotel llega al correo: el texto se **escapa** siempre y solo
 * se reconoce un subconjunto de marcas propio (`**negrita**`, `*cursiva*` y
 * `[texto](enlace)`). Un `<script>` escrito en una plantilla se lee como texto.
 *
 * El dinero no se escribe aquí: la fila «Importe» lleva la variable
 * `{{importe}}`, que ya viene formateada en la divisa del tenant
 * (`lib/moneda.ts`). Este módulo es zona limpia: ni un código de divisa ni un
 * símbolo de dinero.
 */

import { IDIOMA_POR_DEFECTO, IDIOMAS, fechaLarga, idiomaDeValor, type Idioma } from './booking-i18n';
import { formatearImporte, MONEDA_MINIMA_ESQUEMA } from '@/lib/moneda';

export { IDIOMAS, IDIOMA_POR_DEFECTO };

/** Tipos de bloque que sabe componer el editor visual. */
export type BloqueEmailTipo = 'texto' | 'datos' | 'boton';

export const BLOQUE_EMAIL_TIPOS: BloqueEmailTipo[] = ['texto', 'datos', 'boton'];

/** Una fila etiqueta/valor de un bloque `datos`. */
export interface FilaDiseno {
  etiqueta: string;
  valor: string;
}

/** Un bloque del correo. Los campos que no aplican a su tipo se ignoran. */
export interface BloqueEmail {
  tipo: BloqueEmailTipo;
  /** Título de la sección (bloque `datos`). */
  titulo?: string;
  /** Cuerpo del bloque `texto`. */
  texto?: string;
  /** Filas del bloque `datos`. */
  filas?: FilaDiseno[];
  /** Texto del bloque `boton`. */
  botonTexto?: string;
  /** Enlace del bloque `boton` (admite `{{variables}}`). */
  botonEnlace?: string;
}

/** Composición completa del correo. */
export interface DisenoEmail {
  version: 1;
  cabecera?: {
    /** URL del logotipo del hotel. Sin ella, solo el nombre. */
    logotipo?: string;
    nombre?: string;
    /** Etiqueta a la derecha de la cabecera («Reserva confirmada»). */
    etiqueta?: string;
  };
  titulo?: string;
  bloques: BloqueEmail[];
  pie?: string;
}

/** Techos del diseño: una plantilla no es un lienzo en blanco. */
export const LIMITES_DISENO = {
  bloques: 20,
  filas: 15,
  titulo: 120,
  texto: 2000,
  etiqueta: 60,
  valor: 300,
  boton: 80,
  pie: 400,
  cabecera: 120,
} as const;

/** Escapa el HTML de un texto: lo escrito por el hotel se lee, no se ejecuta. */
export function escaparHtml(valor: unknown): string {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * URL utilizable en un enlace: solo http(s) y mailto. Cualquier otro esquema
 * (`javascript:`, `data:`) no se convierte en enlace — se queda como texto.
 */
export function enlaceSeguro(crudo: unknown): string | null {
  const valor = String(crudo ?? '').trim();
  if (!valor) return null;
  if (!/^(https?:\/\/|mailto:)/i.test(valor)) return null;
  if (/[\s"'<>]/.test(valor)) return null;
  return valor;
}

/** Partes de una plantilla: literales y `{{variables}}` alternados. */
function partirPlantilla(plantilla: unknown): string[] {
  return String(plantilla ?? '').split(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/);
}

function valorDeContexto(contexto: Record<string, string>, clave: string): string | null {
  return Object.prototype.hasOwnProperty.call(contexto, clave) ? String(contexto[clave] ?? '') : null;
}

/**
 * Reemplaza `{{variable}}` en un texto plano.
 *
 * Es la regla de interpelación única del módulo (y la que usan las
 * comunicaciones): una variable desconocida se queda tal cual —`{{x}}`— en vez de
 * desaparecer, porque un hueco silencioso se lee como un mensaje bien escrito.
 */
export function interpolarPlantilla(contenido: string, contexto: Record<string, string>): string {
  const partes = partirPlantilla(contenido);
  let salida = '';
  for (let i = 0; i < partes.length; i += 2) {
    salida += partes[i];
    if (i + 1 < partes.length) {
      const valor = valorDeContexto(contexto, partes[i + 1]);
      salida += valor === null ? `{{${partes[i + 1]}}}` : valor;
    }
  }
  return salida;
}

/** Marcas de texto reconocidas dentro de un bloque `texto` o de una fila. */
const MARCAS_INLINE = /(\*\*[^*]+\*\*|\*[^*]+\*|__[^_]+__|\[[^\]]+\]\([^)\s]+\))/g;

/**
 * Un tramo literal de la plantilla, escapado y con las marcas reconocidas.
 *
 * Se escapa **antes** de interpretar las marcas: así un `<b>` escrito por el
 * hotel es texto y no etiqueta, y las marcas (`**`, `[]()`) sobreviven porque no
 * son caracteres especiales del HTML.
 */
function renderizarTramo(tramo: string): string {
  const lineas = tramo.split('\n').map((linea) => {
    let html = '';
    for (const parte of linea.split(MARCAS_INLINE)) {
      if (!parte) continue;
      const negrita = /^\*\*([^*]+)\*\*$/.exec(parte) || /^__([^_]+)__$/.exec(parte);
      if (negrita) {
        html += `<strong>${escaparHtml(negrita[1])}</strong>`;
        continue;
      }
      const cursiva = /^\*([^*]+)\*$/.exec(parte);
      if (cursiva) {
        html += `<em>${escaparHtml(cursiva[1])}</em>`;
        continue;
      }
      const enlace = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(parte);
      if (enlace) {
        const url = enlaceSeguro(enlace[2]);
        html += url
          ? `<a href="${escaparHtml(url)}" style="color:#2563eb;">${escaparHtml(enlace[1])}</a>`
          : escaparHtml(enlace[0]);
        continue;
      }
      html += escaparHtml(parte);
    }
    return html;
  });
  return lineas.join('<br>');
}

/**
 * Un valor del contexto dentro del HTML: escapado y, si ES un enlace, clicable.
 *
 * Los enlaces que el huésped necesita pulsar —el registro de viajeros, la
 * reseña— llegan como variables; sin esto quedarían escritos y no pulsables.
 */
function renderizarValorInterpolado(valor: string): string {
  const url = enlaceSeguro(valor);
  if (url) {
    return `<a href="${escaparHtml(url)}" style="color:#2563eb;">${escaparHtml(url)}</a>`;
  }
  // Un valor del contexto NO lleva marcas: el huésped no escribió `**negrita**`,
  // escribió su nombre. Solo se escapa y se respetan sus saltos de línea.
  return escaparHtml(valor).replace(/\n/g, '<br>');
}

function textoRecortado(valor: unknown): string {
  return String(valor ?? '').trim();
}

function excede(valor: string, techo: number): boolean {
  return valor.length > techo;
}

/**
 * Valida y normaliza el diseño que llega de la API.
 *
 * Devuelve el diseño listo para guardar (recortado, sin bloques vacíos) o el
 * motivo del rechazo. Los techos se **rechazan** en vez de recortarse: un
 * recorte silencioso guardaría un correo que el hotel no escribió.
 */
export function normalizarDiseno(
  crudo: unknown
): { ok: true; diseno: DisenoEmail } | { ok: false; error: string } {
  if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) {
    return { ok: false, error: 'diseno inválido: se espera un objeto' };
  }
  const raiz = crudo as Record<string, unknown>;

  const titulo = textoRecortado(raiz.titulo);
  const pie = textoRecortado(raiz.pie);
  if (excede(titulo, LIMITES_DISENO.titulo)) {
    return { ok: false, error: `El título no puede pasar de ${LIMITES_DISENO.titulo} caracteres` };
  }
  if (excede(pie, LIMITES_DISENO.pie)) {
    return { ok: false, error: `El pie no puede pasar de ${LIMITES_DISENO.pie} caracteres` };
  }

  let cabecera: DisenoEmail['cabecera'];
  if (raiz.cabecera && typeof raiz.cabecera === 'object' && !Array.isArray(raiz.cabecera)) {
    const c = raiz.cabecera as Record<string, unknown>;
    const nombre = textoRecortado(c.nombre);
    const etiqueta = textoRecortado(c.etiqueta);
    if (excede(nombre, LIMITES_DISENO.cabecera) || excede(etiqueta, LIMITES_DISENO.cabecera)) {
      return { ok: false, error: `La cabecera no puede pasar de ${LIMITES_DISENO.cabecera} caracteres por campo` };
    }
    const logotipo = enlaceSeguro(c.logotipo);
    if (nombre || etiqueta || logotipo) {
      cabecera = { ...(logotipo ? { logotipo } : {}), ...(nombre ? { nombre } : {}), ...(etiqueta ? { etiqueta } : {}) };
    }
  }

  const crudos = Array.isArray(raiz.bloques) ? raiz.bloques : [];
  if (crudos.length > LIMITES_DISENO.bloques) {
    return { ok: false, error: `El correo no puede tener más de ${LIMITES_DISENO.bloques} bloques` };
  }

  const bloques: BloqueEmail[] = [];
  for (const bloqueCrudo of crudos) {
    if (!bloqueCrudo || typeof bloqueCrudo !== 'object' || Array.isArray(bloqueCrudo)) continue;
    const b = bloqueCrudo as Record<string, unknown>;
    const tipo = textoRecortado(b.tipo) as BloqueEmailTipo;
    if (!BLOQUE_EMAIL_TIPOS.includes(tipo)) {
      return { ok: false, error: `Tipo de bloque inválido: ${tipo || '(vacío)'}` };
    }

    if (tipo === 'texto') {
      const texto = textoRecortado(b.texto);
      if (!texto) continue;
      if (excede(texto, LIMITES_DISENO.texto)) {
        return { ok: false, error: `Un párrafo no puede pasar de ${LIMITES_DISENO.texto} caracteres` };
      }
      bloques.push({ tipo, texto });
      continue;
    }

    if (tipo === 'datos') {
      const bloqueTitulo = textoRecortado(b.titulo);
      if (excede(bloqueTitulo, LIMITES_DISENO.titulo)) {
        return { ok: false, error: `El título de la sección no puede pasar de ${LIMITES_DISENO.titulo} caracteres` };
      }
      const filasCrudas = Array.isArray(b.filas) ? b.filas : [];
      if (filasCrudas.length > LIMITES_DISENO.filas) {
        return { ok: false, error: `Una sección no puede tener más de ${LIMITES_DISENO.filas} filas` };
      }
      const filas: FilaDiseno[] = [];
      for (const filaCruda of filasCrudas) {
        if (!filaCruda || typeof filaCruda !== 'object' || Array.isArray(filaCruda)) continue;
        const f = filaCruda as Record<string, unknown>;
        const etiqueta = textoRecortado(f.etiqueta);
        const valor = textoRecortado(f.valor);
        if (excede(etiqueta, LIMITES_DISENO.etiqueta)) {
          return { ok: false, error: `Una etiqueta no puede pasar de ${LIMITES_DISENO.etiqueta} caracteres` };
        }
        if (excede(valor, LIMITES_DISENO.valor)) {
          return { ok: false, error: `Un valor no puede pasar de ${LIMITES_DISENO.valor} caracteres` };
        }
        if (!etiqueta && !valor) continue;
        filas.push({ etiqueta, valor });
      }
      if (!bloqueTitulo && filas.length === 0) continue;
      bloques.push({ tipo, ...(bloqueTitulo ? { titulo: bloqueTitulo } : {}), filas });
      continue;
    }

    // boton
    const botonTexto = textoRecortado(b.botonTexto);
    const botonEnlace = textoRecortado(b.botonEnlace);
    if (!botonTexto && !botonEnlace) continue;
    if (excede(botonTexto, LIMITES_DISENO.boton)) {
      return { ok: false, error: `El texto del botón no puede pasar de ${LIMITES_DISENO.boton} caracteres` };
    }
    if (excede(botonEnlace, LIMITES_DISENO.valor)) {
      return { ok: false, error: `El enlace del botón no puede pasar de ${LIMITES_DISENO.valor} caracteres` };
    }
    // El enlace puede ser una URL o una variable ({{enlace_checkin}}): se exige
    // que sea una de las dos, para no guardar un botón que no lleva a ningún sitio.
    if (!botonTexto || (!enlaceSeguro(botonEnlace) && !/\{\{\s*\w+\s*\}\}/.test(botonEnlace))) {
      return { ok: false, error: 'El botón necesita un texto y un enlace válido (https://… o una variable)' };
    }
    bloques.push({ tipo, botonTexto, botonEnlace });
  }

  if (bloques.length === 0) {
    return { ok: false, error: 'El diseño no tiene ningún bloque con contenido' };
  }

  return {
    ok: true,
    diseno: {
      version: 1,
      ...(cabecera ? { cabecera } : {}),
      ...(titulo ? { titulo } : {}),
      bloques,
      ...(pie ? { pie } : {}),
    },
  };
}

/**
 * Compila un texto con variables y marcas a HTML seguro.
 *
 * El tokenizador sustituye primero: los tramos escritos por el hotel llevan el
 * escapado y las marcas, y los valores del contexto solo el escapado y su enlace.
 * Así un huésped llamado `**Ana**` no se convierte en negrita —no escribió una
 * marca, es su nombre—.
 */
export function renderizarPlantillaHtml(plantilla: unknown, contexto: Record<string, string>): string {
  const partes = partirPlantilla(plantilla);
  let html = '';
  for (let i = 0; i < partes.length; i += 2) {
    html += renderizarTramo(partes[i]);
    if (i + 1 >= partes.length) continue;
    const clave = partes[i + 1];
    const valor = valorDeContexto(contexto, clave);
    html += valor === null ? escaparHtml(`{{${clave}}}`) : renderizarValorInterpolado(valor);
  }
  return html;
}

/** Versión en texto plano del diseño (parte `text` del correo y respaldo). */
export function textoPlanoDiseno(diseno: DisenoEmail, contexto: Record<string, string> = {}): string {
  const lineas: string[] = [];
  const push = (valor: string) => {
    const limpio = valor.replace(/\*\*/g, '').replace(/\[([^\]]+)\]\([^)\s]+\)/g, '$1').trim();
    if (limpio) lineas.push(limpio);
  };

  if (diseno.cabecera?.nombre) push(interpolarPlantilla(diseno.cabecera.nombre, contexto));
  if (diseno.cabecera?.etiqueta) push(interpolarPlantilla(diseno.cabecera.etiqueta, contexto));
  if (diseno.titulo) push(interpolarPlantilla(diseno.titulo, contexto));

  for (const bloque of diseno.bloques) {
    if (bloque.tipo === 'texto') {
      push(interpolarPlantilla(bloque.texto || '', contexto));
      continue;
    }
    if (bloque.tipo === 'datos') {
      if (bloque.titulo) push(interpolarPlantilla(bloque.titulo, contexto));
      for (const fila of bloque.filas || []) {
        const etiqueta = interpolarPlantilla(fila.etiqueta, contexto).trim();
        const valor = interpolarPlantilla(fila.valor, contexto).trim();
        if (etiqueta || valor) push(`${etiqueta}:${etiqueta && valor ? ' ' : ''}${valor}`);
      }
      continue;
    }
    if (bloque.botonTexto) {
      const etiqueta = interpolarPlantilla(bloque.botonTexto, contexto).trim();
      const enlace = interpolarPlantilla(bloque.botonEnlace || '', contexto).trim();
      push(enlace ? `${etiqueta}: ${enlace}` : etiqueta);
    }
  }

  if (diseno.pie) push(interpolarPlantilla(diseno.pie, contexto));
  return lineas.join('\n\n');
}

/** Estilos del correo, en línea: los clientes de correo no leen hojas de estilo. */
const ESTILO = {
  fondo: '#f4f4f5',
  tarjeta: '#ffffff',
  borde: '#e4e4e7',
  tinta: '#18181b',
  tenue: '#52525b',
  pie: '#71717a',
  cabeceraSeccion: '#f2f2f2',
  textoSeccion: '#3f3f46',
  enlace: '#2563eb',
} as const;

function filaSeccion(bloque: BloqueEmail, contexto: Record<string, string>): string {
  const filas = (bloque.filas || [])
    .map((fila) => {
      const celda = `border:1px solid ${ESTILO.borde};padding:7px 10px;font-size:13px;vertical-align:top;`;
      return `          <tr>
            <td style="${celda}color:${ESTILO.tenue};width:44%;">${renderizarPlantillaHtml(fila.etiqueta, contexto)}</td>
            <td style="${celda}color:${ESTILO.tinta};text-align:right;">${renderizarPlantillaHtml(fila.valor, contexto)}</td>
          </tr>`;
    })
    .join('\n');

  const cabecera = bloque.titulo
    ? `          <tr>
            <td colspan="2" style="background:${ESTILO.cabeceraSeccion};border:1px solid ${ESTILO.borde};border-bottom:none;padding:7px 10px;font-size:13px;font-weight:bold;color:${ESTILO.textoSeccion};">${renderizarPlantillaHtml(bloque.titulo, contexto)}</td>
          </tr>`
    : '';

  return `      <tr><td style="padding:14px 28px 0 28px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
${cabecera}${cabecera ? '\n' : ''}${filas}
        </table>
      </td></tr>`;
}

/**
 * Compila el diseño a HTML de tabla con estilos en línea.
 *
 * Tabla y no `div`: es lo único que maqueta igual en Gmail, Outlook y el correo
 * del móvil. El ancho es fijo (600px) con respaldo del 100%, que es el estándar
 * de los correos transaccionales.
 */
export function renderDisenoEmail(
  diseno: DisenoEmail,
  contexto: Record<string, string> = {}
): { html: string; text: string } {
  const filas: string[] = [];

  const cabecera = diseno.cabecera;
  if (cabecera && (cabecera.logotipo || cabecera.nombre || cabecera.etiqueta)) {
    const izquierda: string[] = [];
    if (cabecera.logotipo) {
      izquierda.push(
        `<img src="${escaparHtml(cabecera.logotipo)}" alt="${escaparHtml(cabecera.nombre || '')}" width="120" style="display:block;max-height:48px;width:auto;border:0;outline:none;text-decoration:none;" />`
      );
    }
    if (cabecera.nombre) {
      izquierda.push(
        `<div style="font-size:15px;font-weight:bold;color:${ESTILO.tinta};margin-top:${cabecera.logotipo ? '8px' : '0'};">${renderizarPlantillaHtml(cabecera.nombre, contexto)}</div>`
      );
    }
    filas.push(
      `      <tr><td style="padding:24px 28px 0 28px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td align="left" valign="top">${izquierda.join('')}</td>
          <td align="right" valign="top" style="font-size:13px;font-weight:bold;color:${ESTILO.textoSeccion};">${renderizarPlantillaHtml(cabecera.etiqueta || '', contexto)}</td>
        </tr></table>
      </td></tr>`
    );
  }

  if (diseno.titulo) {
    filas.push(
      `      <tr><td style="padding:18px 28px 0 28px;">
        <h1 style="margin:0;font-size:22px;line-height:1.3;color:${ESTILO.tinta};">${renderizarPlantillaHtml(diseno.titulo, contexto)}</h1>
      </td></tr>`
    );
  }

  for (const bloque of diseno.bloques) {
    if (bloque.tipo === 'datos') {
      filas.push(filaSeccion(bloque, contexto));
      continue;
    }
    if (bloque.tipo === 'texto') {
      filas.push(
        `      <tr><td style="padding:14px 28px 0 28px;font-size:14px;line-height:1.6;color:${ESTILO.tinta};">${renderizarPlantillaHtml(bloque.texto || '', contexto)}</td></tr>`
      );
      continue;
    }
    const etiqueta = renderizarPlantillaHtml(bloque.botonTexto || '', contexto);
    const enlace = enlaceSeguro(interpolarPlantilla(bloque.botonEnlace || '', contexto).trim());
    if (etiqueta && enlace) {
      filas.push(
        `      <tr><td style="padding:20px 28px 0 28px;"><a href="${escaparHtml(enlace)}" style="display:inline-block;background:${ESTILO.enlace};color:#ffffff;padding:12px 22px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:bold;">${etiqueta}</a></td></tr>`
      );
    } else if (etiqueta) {
      // Sin enlace utilizable el botón no se inventa: queda como texto.
      filas.push(
        `      <tr><td style="padding:20px 28px 0 28px;font-size:14px;font-weight:bold;color:${ESTILO.tinta};">${etiqueta}</td></tr>`
      );
    }
  }

  if (diseno.pie) {
    filas.push(
      `      <tr><td style="padding:18px 28px 0 28px;border-top:1px solid ${ESTILO.borde};margin-top:16px;"><div style="font-size:12px;line-height:1.5;color:${ESTILO.pie};padding-top:10px;">${renderizarPlantillaHtml(diseno.pie, contexto)}</div></td></tr>`
    );
  }

  const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${ESTILO.fondo};padding:24px 12px;font-family:Arial,Helvetica,sans-serif;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:${ESTILO.tarjeta};border:1px solid ${ESTILO.borde};border-radius:8px;">
${filas.join('\n')}
      <tr><td style="height:24px;line-height:24px;font-size:0;">&nbsp;</td></tr>
    </table>
  </td></tr>
</table>`;

  return { html, text: textoPlanoDiseno(diseno, contexto) };
}

/**
 * Contexto de ejemplo para la vista previa del editor.
 *
 * Es el mismo puñado de datos que usa el envío de prueba, pero sin tocar la base
 * de datos: el editor visual compila el correo en el navegador con este contexto
 * para que el hotel vea las secciones rellenas mientras escribe.
 *
 * El importe se escribe con la divisa del tenant (la pide el llamante); sin ella
 * cae al mínimo del esquema, que es lo mismo que hace `monedaFormateada` en un
 * envío real.
 */
export function contextoEjemplo(params: {
  moneda?: string | null;
  idioma?: unknown;
  /** Origen para los enlaces de ejemplo (en el navegador, `location.origin`). */
  origen?: string;
} = {}): Record<string, string> {
  const idioma = idiomaDeValor(params.idioma) as Idioma;
  const origen = String(params.origen ?? '').replace(/\/+$/, '');
  return {
    nombre: 'María García',
    email: 'maria.garcia@ejemplo.com',
    telefono: '+52 998 555 0102',
    unidad: 'Suite Océano',
    propiedad: 'Villa Mar Azul',
    canal: 'Booking',
    referencia: 'BK-123456',
    checkIn: fechaLarga('2026-10-16T15:00:00Z', idioma),
    checkOut: fechaLarga('2026-10-18T11:00:00Z', idioma),
    noches: '2',
    importe: formatearImporte(2400, params.moneda || MONEDA_MINIMA_ESQUEMA),
    estado: 'confirmed',
    enlace_checkin: `${origen}/checkin/ejemplo?lang=${idioma}`,
    enlace_resena: `${origen}/review/ejemplo?lang=${idioma}`,
    indicaciones: 'Calle del Puerto 12, 2ºA. El portero está en la entrada principal.',
    preguntas_pendientes: 'documento de identidad',
  };
}

/**
 * Diseños sugeridos por evento, en los dos idiomas.
 *
 * La **estructura es una sola** y solo cambian las etiquetas: así una sección
 * nueva no puede existir en español y faltar en inglés, y las variables son las
 * mismas en los dos idiomas por construcción (no por disciplina).
 */
interface TextosDiseno {
  etiquetaConfirmada: string;
  etiquetaLlegada: string;
  etiquetaCheckin: string;
  etiquetaGracias: string;
  etiquetaValora: string;
  detalles: string;
  alojamiento: string;
  huesped: string;
  pago: string;
  entrada: string;
  salida: string;
  noches: string;
  canal: string;
  referencia: string;
  unidad: string;
  propiedad: string;
  nombre: string;
  email: string;
  telefono: string;
  importe: string;
  botonRegistro: string;
  botonResena: string;
  saludoConfirmacion: string;
  saludoLlegada: string;
  saludoSalida: string;
  saludoResena: string;
  pendientes: string;
  pie: string;
}

const TEXTOS_DISENO: Record<Idioma, TextosDiseno> = {
  es: {
    etiquetaConfirmada: 'Reserva confirmada',
    etiquetaLlegada: 'Tu llegada',
    etiquetaCheckin: 'Instrucciones de llegada',
    etiquetaGracias: 'Gracias por tu estancia',
    etiquetaValora: 'Valora tu estancia',
    detalles: 'Detalles de la reserva',
    alojamiento: 'Alojamiento',
    huesped: 'Huésped',
    pago: 'Pago',
    entrada: 'Entrada',
    salida: 'Salida',
    noches: 'Noches',
    canal: 'Canal',
    referencia: 'Referencia',
    unidad: 'Unidad',
    propiedad: 'Propiedad',
    nombre: 'Nombre',
    email: 'Email',
    telefono: 'Teléfono',
    importe: 'Total',
    botonRegistro: 'Completar el registro de viajeros',
    botonResena: 'Dejar mi reseña',
    saludoConfirmacion: 'Hola {{nombre}}, tu reserva en {{propiedad}} está confirmada.',
    saludoLlegada: 'Hola {{nombre}}, tu llegada es el {{checkIn}}.',
    saludoSalida: 'Hola {{nombre}}, gracias por tu estancia en {{propiedad}}.',
    saludoResena: 'Hola {{nombre}}, ¿qué tal tu estancia en {{unidad}}?',
    pendientes: 'Te falta confirmar: {{preguntas_pendientes}}',
    pie: 'Este mensaje lo envía {{propiedad}}. Si necesitas algo, responde a este correo.',
  },
  en: {
    etiquetaConfirmada: 'Booking confirmed',
    etiquetaLlegada: 'Your arrival',
    etiquetaCheckin: 'Arrival instructions',
    etiquetaGracias: 'Thanks for your stay',
    etiquetaValora: 'Rate your stay',
    detalles: 'Reservation details',
    alojamiento: 'Accommodation',
    huesped: 'Guest',
    pago: 'Payment',
    entrada: 'Check-in',
    salida: 'Check-out',
    noches: 'Nights',
    canal: 'Channel',
    referencia: 'Reference',
    unidad: 'Unit',
    propiedad: 'Property',
    nombre: 'Name',
    email: 'Email',
    telefono: 'Phone',
    importe: 'Total',
    botonRegistro: 'Complete the traveller registry',
    botonResena: 'Leave my review',
    saludoConfirmacion: 'Hi {{nombre}}, your booking at {{propiedad}} is confirmed.',
    saludoLlegada: 'Hi {{nombre}}, your arrival is on {{checkIn}}.',
    saludoSalida: 'Hi {{nombre}}, thanks for staying at {{propiedad}}.',
    saludoResena: 'Hi {{nombre}}, how was your stay in {{unidad}}?',
    pendientes: 'Still pending: {{preguntas_pendientes}}',
    pie: 'This message is sent by {{propiedad}}. If you need anything, just reply.',
  },
};

/** Eventos con diseño sugerido (el briefing va a texto plano: no es email al huésped). */
export const EVENTOS_CON_DISENO = ['confirmacion', 'pre_llegada', 'check_in', 'post_salida', 'resena'] as const;

/**
 * Diseño sugerido para un evento e idioma (`null` si el evento no tiene uno).
 *
 * Es el punto de partida del editor visual: el hotel abre una plantilla nueva de
 * email y ya tiene la maqueta del correo transaccional (cabecera, secciones de
 * detalles, alojamiento, huésped y pago, y el botón al registro) en vez de un
 * lienzo en blanco.
 */
export function disenoSugerido(evento: string, idiomaCrudo: unknown): DisenoEmail | null {
  const idioma = idiomaDeValor(idiomaCrudo) as Idioma;
  if (!EVENTOS_CON_DISENO.includes(evento as (typeof EVENTOS_CON_DISENO)[number])) return null;
  const t = TEXTOS_DISENO[idioma] || TEXTOS_DISENO[IDIOMA_POR_DEFECTO];

  const base = {
    version: 1 as const,
    pie: t.pie,
  };

  if (evento === 'confirmacion') {
    return {
      ...base,
      cabecera: { etiqueta: t.etiquetaConfirmada },
      titulo: '{{propiedad}}',
      bloques: [
        { tipo: 'texto', texto: t.saludoConfirmacion },
        {
          tipo: 'datos',
          titulo: t.detalles,
          filas: [
            { etiqueta: t.entrada, valor: '{{checkIn}}' },
            { etiqueta: t.salida, valor: '{{checkOut}}' },
            { etiqueta: t.noches, valor: '{{noches}}' },
            { etiqueta: t.canal, valor: '{{canal}}' },
            { etiqueta: t.referencia, valor: '{{referencia}}' },
          ],
        },
        {
          tipo: 'datos',
          titulo: t.alojamiento,
          filas: [
            { etiqueta: t.unidad, valor: '{{unidad}}' },
            { etiqueta: t.propiedad, valor: '{{propiedad}}' },
          ],
        },
        {
          tipo: 'datos',
          titulo: t.huesped,
          filas: [
            { etiqueta: t.nombre, valor: '{{nombre}}' },
            { etiqueta: t.email, valor: '{{email}}' },
            { etiqueta: t.telefono, valor: '{{telefono}}' },
          ],
        },
        {
          tipo: 'datos',
          titulo: t.pago,
          // Solo el importe: el estado interno del ERP (`confirmed`) no es un
          // dato que el huésped deba leer en su correo, y «Reserva confirmada»
          // ya lo dice en la cabecera.
          filas: [{ etiqueta: t.importe, valor: '{{importe}}' }],
        },
        { tipo: 'boton', botonTexto: t.botonRegistro, botonEnlace: '{{enlace_checkin}}' },
      ],
    };
  }

  if (evento === 'pre_llegada') {
    return {
      ...base,
      cabecera: { etiqueta: t.etiquetaLlegada },
      titulo: '{{propiedad}}',
      bloques: [
        { tipo: 'texto', texto: t.saludoLlegada },
        {
          tipo: 'datos',
          titulo: t.detalles,
          filas: [
            { etiqueta: t.entrada, valor: '{{checkIn}}' },
            { etiqueta: t.salida, valor: '{{checkOut}}' },
            { etiqueta: t.unidad, valor: '{{unidad}}' },
          ],
        },
        { tipo: 'texto', texto: '{{indicaciones}}' },
        { tipo: 'texto', texto: t.pendientes },
        { tipo: 'boton', botonTexto: t.botonRegistro, botonEnlace: '{{enlace_checkin}}' },
      ],
    };
  }

  if (evento === 'check_in') {
    return {
      ...base,
      cabecera: { etiqueta: t.etiquetaCheckin },
      titulo: '{{propiedad}}',
      bloques: [
        { tipo: 'texto', texto: '{{indicaciones}}' },
        {
          tipo: 'datos',
          titulo: t.alojamiento,
          filas: [
            { etiqueta: t.unidad, valor: '{{unidad}}' },
            { etiqueta: t.propiedad, valor: '{{propiedad}}' },
            { etiqueta: t.referencia, valor: '{{referencia}}' },
          ],
        },
        { tipo: 'boton', botonTexto: t.botonRegistro, botonEnlace: '{{enlace_checkin}}' },
      ],
    };
  }

  if (evento === 'post_salida') {
    return {
      ...base,
      cabecera: { etiqueta: t.etiquetaGracias },
      titulo: '{{propiedad}}',
      bloques: [
        { tipo: 'texto', texto: t.saludoSalida },
        { tipo: 'boton', botonTexto: t.botonResena, botonEnlace: '{{enlace_resena}}' },
      ],
    };
  }

  return {
    ...base,
    cabecera: { etiqueta: t.etiquetaValora },
    titulo: '{{propiedad}}',
    bloques: [
      { tipo: 'texto', texto: t.saludoResena },
      { tipo: 'boton', botonTexto: t.botonResena, botonEnlace: '{{enlace_resena}}' },
    ],
  };
}
