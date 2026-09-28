/**
 * Catálogo de países: código ISO 3166-1 alfa-3 (el que piden los formularios
 * del Ministerio y los del CRM), nombre en español y prefijo telefónico
 * internacional (+34…).
 *
 * El prefijo vive junto al país a propósito: el selector de país rellena el
 * prefijo del teléfono y evita que nadie escriba «612345678» cuando su huésped
 * es de Francia. El código alfa-3 es el que valida el XSD del parte (SES
 * HOSPEDAJES): no abreviar, no inventar códigos.
 *
 * Prefijos según ITU E.164; para el appelado solo se muestra el número, sin
 * espacios, normalizado a «+NNN».
 */

export type PaisInfo = {
  /** ISO 3166-1 alfa-3 (ESP, FRA…). */
  codigo: string;
  /** Nombre en español, para el selector. */
  nombre: string;
  /** Prefijo telefónico internacional con «+» (+34). */
  prefijo: string;
  /** Bandera (emoji) para escanear visualmente la lista. */
  bandera: string;
};
export const PAISES: readonly PaisInfo[] = [
  { codigo: 'ESP', nombre: 'España', prefijo: '+34', bandera: '🇪🇸' },
  { codigo: 'PRT', nombre: 'Portugal', prefijo: '+351', bandera: '🇵🇹' },
  { codigo: 'FRA', nombre: 'Francia', prefijo: '+33', bandera: '🇫🇷' },
  { codigo: 'DEU', nombre: 'Alemania', prefijo: '+49', bandera: '🇩🇪' },
  { codigo: 'ITA', nombre: 'Italia', prefijo: '+39', bandera: '🇮🇹' },
  { codigo: 'GBR', nombre: 'Reino Unido', prefijo: '+44', bandera: '🇬🇧' },
  { codigo: 'IRL', nombre: 'Irlanda', prefijo: '+353', bandera: '🇮🇪' },
  { codigo: 'BEL', nombre: 'Bélgica', prefijo: '+32', bandera: '🇧🇪' },
  { codigo: 'NLD', nombre: 'Países Bajos', prefijo: '+31', bandera: '🇳🇱' },
  { codigo: 'CHE', nombre: 'Suiza', prefijo: '+41', bandera: '🇨🇭' },
  { codigo: 'AUT', nombre: 'Austria', prefijo: '+43', bandera: '🇦🇹' },
  { codigo: 'POL', nombre: 'Polonia', prefijo: '+48', bandera: '🇵🇱' },
  { codigo: 'ROU', nombre: 'Rumanía', prefijo: '+40', bandera: '🇷🇴' },
  { codigo: 'SWE', nombre: 'Suecia', prefijo: '+46', bandera: '🇸🇪' },
  { codigo: 'NOR', nombre: 'Noruega', prefijo: '+47', bandera: '🇳🇴' },
  { codigo: 'DNK', nombre: 'Dinamarca', prefijo: '+45', bandera: '🇩🇰' },
  { codigo: 'FIN', nombre: 'Finlandia', prefijo: '+358', bandera: '🇫🇮' },
  { codigo: 'GRC', nombre: 'Grecia', prefijo: '+30', bandera: '🇬🇷' },
  { codigo: 'CZE', nombre: 'Chequia', prefijo: '+420', bandera: '🇨🇿' },
  { codigo: 'HUN', nombre: 'Hungría', prefijo: '+36', bandera: '🇭🇺' },
  { codigo: 'UKR', nombre: 'Ucrania', prefijo: '+380', bandera: '🇺🇦' },
  { codigo: 'RUS', nombre: 'Rusia', prefijo: '+7', bandera: '🇷🇺' },
  { codigo: 'TUR', nombre: 'Turquía', prefijo: '+90', bandera: '🇹🇷' },
  { codigo: 'MAR', nombre: 'Marruecos', prefijo: '+212', bandera: '🇲🇦' },
  { codigo: 'DZA', nombre: 'Argelia', prefijo: '+213', bandera: '🇩🇿' },
  { codigo: 'TUN', nombre: 'Túnez', prefijo: '+216', bandera: '🇹🇳' },
  { codigo: 'EGY', nombre: 'Egipto', prefijo: '+20', bandera: '🇪🇬' },
  { codigo: 'SEN', nombre: 'Senegal', prefijo: '+221', bandera: '🇸🇳' },
  { codigo: 'NGA', nombre: 'Nigeria', prefijo: '+234', bandera: '🇳🇬' },
  { codigo: 'ZAF', nombre: 'Sudáfrica', prefijo: '+27', bandera: '🇿🇦' },
  { codigo: 'USA', nombre: 'Estados Unidos', prefijo: '+1', bandera: '🇺🇸' },
  { codigo: 'CAN', nombre: 'Canadá', prefijo: '+1', bandera: '🇨🇦' },
  { codigo: 'MEX', nombre: 'México', prefijo: '+52', bandera: '🇲🇽' },
  { codigo: 'GTM', nombre: 'Guatemala', prefijo: '+502', bandera: '🇬🇹' },
  { codigo: 'HND', nombre: 'Honduras', prefijo: '+504', bandera: '🇭🇳' },
  { codigo: 'SLV', nombre: 'El Salvador', prefijo: '+503', bandera: '🇸🇻' },
  { codigo: 'NIC', nombre: 'Nicaragua', prefijo: '+505', bandera: '🇳🇮' },
  { codigo: 'CRI', nombre: 'Costa Rica', prefijo: '+506', bandera: '🇨🇷' },
  { codigo: 'PAN', nombre: 'Panamá', prefijo: '+507', bandera: '🇵🇦' },
  { codigo: 'CUB', nombre: 'Cuba', prefijo: '+53', bandera: '🇨🇺' },
  { codigo: 'DOM', nombre: 'República Dominicana', prefijo: '+1809', bandera: '🇩🇴' },
  { codigo: 'COL', nombre: 'Colombia', prefijo: '+57', bandera: '🇨🇴' },
  { codigo: 'VEN', nombre: 'Venezuela', prefijo: '+58', bandera: '🇻🇪' },
  { codigo: 'ECU', nombre: 'Ecuador', prefijo: '+593', bandera: '🇪🇨' },
  { codigo: 'PER', nombre: 'Perú', prefijo: '+51', bandera: '🇵🇪' },
  { codigo: 'BOL', nombre: 'Bolivia', prefijo: '+591', bandera: '🇧🇴' },
  { codigo: 'CHL', nombre: 'Chile', prefijo: '+56', bandera: '🇨🇱' },
  { codigo: 'ARG', nombre: 'Argentina', prefijo: '+54', bandera: '🇦🇷' },
  { codigo: 'URY', nombre: 'Uruguay', prefijo: '+598', bandera: '🇺🇾' },
  { codigo: 'PRY', nombre: 'Paraguay', prefijo: '+595', bandera: '🇵🇾' },
  { codigo: 'BRA', nombre: 'Brasil', prefijo: '+55', bandera: '🇧🇷' },
  { codigo: 'CHN', nombre: 'China', prefijo: '+86', bandera: '🇨🇳' },
  { codigo: 'JPN', nombre: 'Japón', prefijo: '+81', bandera: '🇯🇵' },
  { codigo: 'KOR', nombre: 'Corea del Sur', prefijo: '+82', bandera: '🇰🇷' },
  { codigo: 'IND', nombre: 'India', prefijo: '+91', bandera: '🇮🇳' },
  { codigo: 'PAK', nombre: 'Pakistán', prefijo: '+92', bandera: '🇵🇰' },
  { codigo: 'BGD', nombre: 'Bangladés', prefijo: '+880', bandera: '🇧🇩' },
  { codigo: 'IDN', nombre: 'Indonesia', prefijo: '+62', bandera: '🇮🇩' },
  { codigo: 'PHL', nombre: 'Filipinas', prefijo: '+63', bandera: '🇵🇭' },
  { codigo: 'VNM', nombre: 'Vietnam', prefijo: '+84', bandera: '🇻🇳' },
  { codigo: 'THA', nombre: 'Tailandia', prefijo: '+66', bandera: '🇹🇭' },
  { codigo: 'AUS', nombre: 'Australia', prefijo: '+61', bandera: '🇦🇺' },
  { codigo: 'NZL', nombre: 'Nueva Zelanda', prefijo: '+64', bandera: '🇳🇿' },
  { codigo: 'ISR', nombre: 'Israel', prefijo: '+972', bandera: '🇮🇱' },
  { codigo: 'ARE', nombre: 'Emiratos Árabes Unidos', prefijo: '+971', bandera: '🇦🇪' },
  { codigo: 'SAU', nombre: 'Arabia Saudí', prefijo: '+966', bandera: '🇸🇦' },
  { codigo: 'AND', nombre: 'Andorra', prefijo: '+376', bandera: '🇦🇩' },
  { codigo: 'LIE', nombre: 'Liechtenstein', prefijo: '+423', bandera: '🇱🇮' },
  { codigo: 'MCO', nombre: 'Mónaco', prefijo: '+377', bandera: '🇲🇨' },
  { codigo: 'SMR', nombre: 'San Marino', prefijo: '+378', bandera: '🇸🇲' },
  { codigo: 'VAT', nombre: 'Vaticano', prefijo: '+379', bandera: '🇻🇦' },
  { codigo: 'ISL', nombre: 'Islandia', prefijo: '+354', bandera: '🇮🇸' },
  { codigo: 'LUX', nombre: 'Luxemburgo', prefijo: '+352', bandera: '🇱🇺' },
  { codigo: 'MLT', nombre: 'Malta', prefijo: '+356', bandera: '🇲🇹' },
  { codigo: 'CYP', nombre: 'Chipre', prefijo: '+357', bandera: '🇨🇾' },
  { codigo: 'BGR', nombre: 'Bulgaria', prefijo: '+359', bandera: '🇧🇬' },
  { codigo: 'HRV', nombre: 'Croacia', prefijo: '+385', bandera: '🇭🇷' },
  { codigo: 'SVK', nombre: 'Eslovaquia', prefijo: '+421', bandera: '🇸🇰' },
  { codigo: 'SVN', nombre: 'Eslovenia', prefijo: '+386', bandera: '🇸🇮' },
  { codigo: 'EST', nombre: 'Estonia', prefijo: '+372', bandera: '🇪🇪' },
  { codigo: 'LVA', nombre: 'Letonia', prefijo: '+371', bandera: '🇱🇻' },
  { codigo: 'LTU', nombre: 'Lituania', prefijo: '+370', bandera: '🇱🇹' },
  { codigo: 'ALB', nombre: 'Albania', prefijo: '+355', bandera: '🇦🇱' },
  { codigo: 'BIH', nombre: 'Bosnia y Herzegovina', prefijo: '+387', bandera: '🇧🇦' },
  { codigo: 'MDA', nombre: 'Moldavia', prefijo: '+373', bandera: '🇲🇩' },
  { codigo: 'MKD', nombre: 'Macedonia del Norte', prefijo: '+389', bandera: '🇲🇰' },
  { codigo: 'MNE', nombre: 'Montenegro', prefijo: '+382', bandera: '🇲🇪' },
  { codigo: 'SRB', nombre: 'Serbia', prefijo: '+381', bandera: '🇷🇸' },
  { codigo: 'GEO', nombre: 'Georgia', prefijo: '+995', bandera: '🇬🇪' },
  { codigo: 'ARM', nombre: 'Armenia', prefijo: '+374', bandera: '🇦🇲' },
  { codigo: 'AZE', nombre: 'Azerbaiyán', prefijo: '+994', bandera: '🇦🇿' },
  { codigo: 'KAZ', nombre: 'Kazajistán', prefijo: '+7', bandera: '🇰🇿' },
];

/** Busca un país por su código alfa-3 (tolerante a mayúsculas/espacios). */
export function paisPorCodigo(codigo: string | null | undefined): PaisInfo | undefined {
  const normalizado = (codigo || '').trim().toUpperCase();
  return PAISES.find((p) => p.codigo === normalizado);
}

/** Prefijo telefónico de un país alfa-3; '' si no está en el catálogo. */
export function prefijoDePais(codigo: string | null | undefined): string {
  return paisPorCodigo(codigo)?.prefijo ?? '';
}

/**
 * Normaliza un teléfono escrito por el humano: quita espacios, guiones y
 * paréntesis; si no empieza por «+» y el país tiene prefijo conocido, se lo
 * añade. Devuelve SIEMPRE lo tecleado si ya traía «+» (el usuario manda).
 */
export function normalizarTelefono(valor: string, codigoPais?: string | null): string {
  const limpio = (valor || '').replace(/[\s().-]/g, '');
  if (!limpio) return '';
  if (limpio.startsWith('+') || limpio.startsWith('00')) return limpio;
  const prefijo = prefijoDePais(codigoPais);
  return prefijo ? `${prefijo}${limpio}` : limpio;
}

/** Nombre en español de un país alfa-3 (para listados y lecturas). */
export function nombrePais(codigo: string | null | undefined): string {
  return paisPorCodigo(codigo)?.nombre ?? (codigo || '');
}

/** País alfa-3 para preseleccionar un selector a partir de un valor guardado:
 * acepta alfa-2/alfa-3 o el nombre en español (el formato histórico del CRM).
 * Devuelve '' si el valor no está en el catálogo (el selector mostrará el
 * placeholder y el valor original se conserva al guardar). */
export function paisASelector(valor: string | null | undefined): string {
  const v = (valor || '').trim();
  if (!v) return '';
  const porCodigo = paisPorCodigo(v);
  if (porCodigo) return porCodigo.codigo;
  const iso2A3: Record<string, string> = {
    ES: 'ESP', MX: 'MEX', US: 'USA', GB: 'GBR', UK: 'GBR', FR: 'FRA',
    DE: 'DEU', IT: 'ITA', PT: 'PRT', CA: 'CAN', AR: 'ARG', CL: 'CHL',
    CO: 'COL', PE: 'PER', BR: 'BRA', IE: 'IRL', BE: 'BEL', NL: 'NLD',
    CH: 'CHE', AT: 'AUT', SE: 'SWE', NO: 'NOR', DK: 'DNK', PL: 'POL',
    JP: 'JPN', CN: 'CHN', IN: 'IND', AU: 'AUS', NZ: 'NZL', MA: 'MAR',
  };
  if (iso2A3[v.toUpperCase()]) return iso2A3[v.toUpperCase()];
  const q = v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return (
    PAISES.find((p) => {
      const n = p.nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      return n === q;
    })?.codigo ?? ''
  );
}

/** Valor a guardar tras elegir en el selector: el nombre en español (mismo
 * formato que ya guardan los formularios del CRM); fuera del catálogo se
 * conserva el valor previo para no perder lo que había. */
export function selectorAPais(codigo: string | null | undefined, previo?: string | null): string {
  if (!codigo) return '';
  return paisPorCodigo(codigo)?.nombre ?? (previo || '');
}

/** País alfa-3 deducido de un teléfono guardado (+34… → ESP). Coincidencia
 * por prefijo más largo primero (así +52 no se come +5, etc.); '' si no
 * empieza por + o el prefijo no está en el catálogo. */
export function paisDesdeTelefono(telefono: string | null | undefined): string {
  const t = (telefono || '').trim();
  if (!t.startsWith('+')) return '';
  const coincidencias = PAISES.filter((p) => t.startsWith(p.prefijo));
  const maxLongitud = Math.max(0, ...coincidencias.map((p) => p.prefijo.length));
  const mejores = coincidencias.filter((p) => p.prefijo.length === maxLongitud);
  // Prefijos compartidos (p. ej. +1: EE. UU./Canadá) no identifican país;
  // dejar el selector sin preselección es más seguro que inventar uno.
  return mejores.length === 1 ? mejores[0].codigo : '';
}
