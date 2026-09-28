/**
 * Generador del catálogo de municipios INE (lib/paises-municipios/municipios-ine.ts).
 *
 * Descarga la relación oficial de municipios con su código INE de 5 dígitos
 * (via github.com/IagoLast/pselect, datos del INE) y escribe el módulo TS que
 * consumen los selectores de los formularios (check-in del huésped y parte de
 * viajeros del Ministerio del Interior).
 *
 * Uso:  node scripts/genera-municipios-ine.mjs
 *
 * La salida es determinista (agrupada por provincia, orden alfabético), así que
 * re-ejecutarla solo cambia el fichero si cambió el catálogo del INE. Los
 * códigos van EXACTOS al INE: el Ministerio los valida con su catálogo, el
 * nombre es solo para que el humano elija bien.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DESTINO = path.join(RAIZ, 'lib', 'paises-municipios', 'municipios-ine.ts');
const FUENTE_JSON =
  'https://raw.githubusercontent.com/IagoLast/pselect/master/data/municipios.json';

/** Nombres de provincia por código INE (para agrupar el selector). */
const NOMBRES_PROVINCIA = {
  '01': 'Álava', '02': 'Albacete', '03': 'Alicante', '04': 'Almería', '05': 'Ávila',
  '06': 'Badajoz', '07': 'Baleares', '08': 'Barcelona', '09': 'Burgos', '10': 'Cáceres',
  '11': 'Cádiz', '12': 'Castellón', '13': 'Ciudad Real', '14': 'Córdoba', '15': 'A Coruña',
  '16': 'Cuenca', '17': 'Girona', '18': 'Granada', '19': 'Guadalajara', '20': 'Guipúzcoa',
  '21': 'Huelva', '22': 'Huesca', '23': 'Jaén', '24': 'León', '25': 'Lleida',
  '26': 'La Rioja', '27': 'Lugo', '28': 'Madrid', '29': 'Málaga', '30': 'Murcia',
  '31': 'Navarra', '32': 'Ourense', '33': 'Asturias', '34': 'Palencia', '35': 'Las Palmas',
  '36': 'Pontevedra', '37': 'Salamanca', '38': 'Santa Cruz de Tenerife', '39': 'Cantabria',
  '40': 'Segovia', '41': 'Sevilla', '42': 'Soria', '43': 'Tarragona', '44': 'Teruel',
  '45': 'Toledo', '46': 'Valencia', '47': 'Valladolid', '48': 'Vizcaya', '49': 'Zamora',
  '50': 'Zaragoza', '51': 'Ceuta', '52': 'Melilla',
};

const res = await fetch(FUENTE_JSON);
if (!res.ok) throw new Error(`No se pudo descargar el catálogo: HTTP ${res.status}`);
const datos = JSON.parse(await res.text());

const filas = datos
  .map((m) => ({ id: String(m.id), nm: String(m.nm) }))
  .filter((m) => /^\d{5}$/.test(m.id) && m.nm.length > 0)
  .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : a.nm.localeCompare(b.nm, 'es')));

if (filas.length < 8000) {
  throw new Error(`El catálogo trae ${filas.length} municipios; se esperaban ~8.100`);
}

/** provincia (2 dígitos) → pares [código INE de 5 dígitos, nombre]. */
const porProvincia = {};
for (const m of filas) {
  const prov = m.id.slice(0, 2);
  (porProvincia[prov] ||= []).push([m.id, m.nm]);
}

const salida = `/**
 * Catálogo de municipios de España con su código INE (5 dígitos), agrupados
 * por provincia (los 2 primeros dígitos del código INE son la provincia).
 *
 * Generado por scripts/genera-municipios-ine.mjs — NO editar a mano: se
 * regenera desde la relación oficial del INE (via github.com/IagoLast/
 * pselect). ${filas.length} municipios en ${Object.keys(porProvincia).length} provincias.
 *
 * REGLA: los códigos van EXACTOS al INE (el Ministerio valida el parte contra
 * su catálogo oficial). El nombre es solo para que el humano elija: no
 * «corregir» acentos ni reordenar a mano.
 */

export type MunicipioINE = { codigo: string; nombre: string };

/** Provincia (2 dígitos) → pares [código INE de 5 dígitos, nombre]. */
const MUNICIPIOS: Record<string, Array<[string, string]>> = ${JSON.stringify(porProvincia)};

/** Nombres de provincia por código INE (para agrupar el selector). */
export const NOMBRES_PROVINCIA: Record<string, string> = ${JSON.stringify(NOMBRES_PROVINCIA)};

/** Provincias con municipios, ordenadas por código INE. */
export function provinciasINE(): Array<{ codigo: string; nombre: string }> {
  return Object.keys(MUNICIPIOS)
    .sort()
    .map((codigo) => ({ codigo, nombre: NOMBRES_PROVINCIA[codigo] || codigo }));
}

/**
 * Municipios de una provincia (selector dependiente), con su código INE
 * completo de 5 dígitos. [] si la provincia no existe.
 */
export function municipiosDeProvincia(codigoProvincia: string): MunicipioINE[] {
  return (MUNICIPIOS[codigoProvincia] || []).map(([codigo, nombre]) => ({ codigo, nombre }));
}

/** Nombre de un municipio por su código INE completo; útil para lecturas. */
export function nombreMunicipioINE(codigo: string): string | null {
  const provincia = (codigo || '').slice(0, 2);
  const par = (MUNICIPIOS[provincia] || []).find(([c]) => c === codigo);
  return par ? par[1] : null;
}
`;

fs.mkdirSync(path.dirname(DESTINO), { recursive: true });
fs.writeFileSync(DESTINO, salida);
console.log(
  `Escrito ${path.relative(RAIZ, DESTINO)}: ${filas.length} municipios, ${Object.keys(porProvincia).length} provincias`
);
