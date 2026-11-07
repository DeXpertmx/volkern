const BASE = 'https://www.ocasioncasa.com';
const UA = { 'user-agent': 'Mozilla/5.0 (compatible; VolkernDemo/1.0)', 'accept-language': 'es-ES,es;q=0.9' };

async function get(url) {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.text();
}

const ENT = { nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', uuml: 'ü', ordm: 'º', deg: '°', euro: '€', ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»', frac12: '½', sup2: '²', middot: '·' };
function decode(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n] ?? m);
}
function lineas(html) {
  const limpio = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, '');
  return decode(limpio.replace(/<(br|\/p|\/div|\/li|\/h\d|\/td|\/tr)[^>]*>/gi, '\n').replace(/<[^>]+>/g, '\n'))
    .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
}
const tras = (ls, etiqueta) => {
  const i = ls.findIndex((l) => l.toLowerCase() === etiqueta.toLowerCase());
  return i >= 0 ? ls[i + 1] : null;
};

/**
 * La web mezcla formatos: «240,99 m²» (coma decimal), «240.99 m²» (punto
 * decimal) y «1.800 m²» (punto de millares). Sin distinguirlos, 240,99 se
 * convertía en 24099 y la ficha anunciaba una superficie 100 veces mayor.
 */
const numero = (v) => {
  if (!v) return null;
  let s = String(v).replace(/[^\d.,]/g, '');
  if (!s) return null;
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    const partes = s.split('.');
    if (partes.length > 2) s = partes.slice(0, -1).join('') + '.' + partes[partes.length - 1];
    else if (partes.length === 2 && partes[1].length === 3) s = partes.join('');
  }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
};

const TIPOS = [
  ['local comercial', 'Local Comercial'], ['local-comercial', 'Local Comercial'],
  ['nave industrial', 'Nave Industrial'], ['nave-industrial', 'Nave Industrial'],
  ['casa de campo', 'Casa de campo'], ['casa-de-campo', 'Casa de campo'],
  ['finca rustica', 'Finca rústica'], ['finca-rustica', 'Finca rústica'],
  ['casa con terreno', 'Casa con terreno'], ['casa-con-terreno', 'Casa con terreno'],
  ['atico', 'Ático'], ['ático', 'Ático'], ['duplex', 'Dúplex'], ['dúplex', 'Dúplex'],
  ['piso', 'Piso'], ['casa', 'Casa'], ['chalet', 'Chalet'], ['adosado', 'Adosado'],
  ['apartamento', 'Apartamento'], ['estudio', 'Estudio'], ['parcela', 'Parcela'],
  ['terreno', 'Terreno'], ['solar', 'Solar'], ['oficina', 'Oficina'], ['garaje', 'Garaje'],
  ['edificio', 'Edificio'], ['negocio', 'Negocio'], ['hotel', 'Hotel'],
  ['planta', 'Planta'], ['loft', 'Loft'], ['parking', 'Parking'], ['habitacion', 'Habitación'],
];

/** En la URL, tras `/propiedad/` o `/propiedad-alquiler/`, va el slug. */
function slugDe(url) {
  return url.replace(/^.*\/propiedad(?:-alquiler)?\//, '').replace(/\/$/, '').toLowerCase();
}

function tipoDe(url, ls) {
  const t = tras(ls, 'Tipo');
  if (t && t.length < 40) return t;
  const slug = slugDe(url);
  for (const [clave, valor] of TIPOS) {
    if (slug.startsWith(`${clave}-`) || slug === clave) return valor;
  }
  return 'Inmueble';
}

const PROVINCIAS = {
  malaga: 'Málaga', cordoba: 'Córdoba', madrid: 'Madrid', sevilla: 'Sevilla', granada: 'Granada',
  jaen: 'Jaén', cadiz: 'Cádiz', almeria: 'Almería', huelva: 'Huelva', toledo: 'Toledo',
  guadalajara: 'Guadalajara', barcelona: 'Barcelona', valencia: 'Valencia', alicante: 'Alicante',
};
const provinciaDe = (v) => (v ? PROVINCIAS[v.trim().toLowerCase()] || v.trim() : null);

async function urlsDeListado(ruta, paginas) {
  const urls = new Set();
  for (let p = 1; p <= paginas; p++) {
    const url = p === 1 ? `${BASE}/${ruta}` : `${BASE}/${ruta}/?${p}/`;
    try {
      const html = await get(url);
      for (const m of html.matchAll(/https:\/\/www\.ocasioncasa\.com\/propiedad(?:-alquiler)?\/[a-z0-9\-\/]+/g)) urls.add(m[0].replace(/\/$/, '') + '/');
    } catch (e) { console.warn('listado', url, e.message); }
  }
  return [...urls];
}

function imgsDe(html) {
  const set = new Set();
  for (const m of html.matchAll(/https:\/\/fotos\d*\.apinmo\.com\/\d+\/\d+\/([^"'\s]+?\.(?:jpg|jpeg|png))/gi)) set.add(m[0]);
  return [...set].sort((a, b) => {
    const na = Number((a.match(/-(\d+)\.\w+$/) || [])[1] || 0);
    const nb = Number((b.match(/-(\d+)\.\w+$/) || [])[1] || 0);
    return na - nb;
  });
}

async function detalle(url) {
  const html = await get(url);
  const ls = lineas(html);
  const operacion = url.includes('/propiedad-alquiler/') ? 'alquiler' : 'venta';
  const ref = tras(ls, 'Referencia');
  const provincia = provinciaDe(tras(ls, 'Provincia'));
  const poblacion = tras(ls, 'Población');
  const zona = tras(ls, 'Zona');
  const superficie = numero(tras(ls, 'Construidos') || tras(ls, 'Superficie') || tras(ls, 'Metros'));
  const precio = numero(tras(ls, 'Precio'));
  const simples = numero(tras(ls, 'Dormitorios simples'));
  const dobles = numero(tras(ls, 'Dormitorios dobles'));
  const habitaciones = simples || dobles ? (simples || 0) + (dobles || 0) : null;
  const banos = numero(tras(ls, 'Baños'));
  const conservacion = tras(ls, 'Conservación');

  const iExtras = ls.findIndex((l) => l.toLowerCase() === 'extras');
  const extras = [];
  if (iExtras >= 0) {
    for (let i = iExtras + 1; i < Math.min(iExtras + 16, ls.length); i++) {
      const l = ls[i];
      if (/^(muy eficiente|poco eficiente|consumo de energía|emisiones|en trámite|certificado)/i.test(l)) break;
      if (/^(ascensor|terraza|piscina|jardín|garaje|trastero|aire acondicionado|calefacción|balcón|amueblado|alarma|porche|patio|chimenea|suelo radiante|domótica|solar|bodega|pista de padel|gimnasio|parcela|vistas)/i.test(l)) extras.push(l);
    }
  }

  let iDesc = ls.findIndex((l) => l.toLowerCase() === 'descripción');
  if (iDesc < 0) iDesc = ls.findIndex((l) => l.toLowerCase().startsWith('descripción'));
  let descripcion = [];
  if (iDesc >= 0) {
    for (let i = iDesc + 1; i < ls.length; i++) {
      const l = ls[i];
      if (/^(características|formulario de contacto|pdf|imprimir|envía esta propiedad|comparte esta propiedad|hacer una oferta)$/i.test(l)) break;
      if (l.length > 35 && !/^(descripción|leer más|ver menos)$/i.test(l)) descripcion.push(l);
    }
  }
  descripcion = [...new Set(descripcion)].slice(0, 6);

  return {
    url, operacion, tipo: tipoDe(url, ls), ref, provincia, poblacion, zona,
    superficie, precio, habitaciones, banos, conservacion,
    extras: [...new Set(extras)], descripcion,
    imagenes: imgsDe(html).filter((u) => !/nologo|logo|icon/i.test(u)).slice(0, 8),
  };
}

(async () => {
  const [venta, alquiler] = await Promise.all([urlsDeListado('compra', 4), urlsDeListado('alquileres', 2)]);
  console.log('urls venta:', venta.length, 'alquiler:', alquiler.length);
  const seleccion = [...venta.slice(0, 34), ...alquiler.slice(0, 12)];
  const out = [];
  for (let i = 0; i < seleccion.length; i += 5) {
    const lote = seleccion.slice(i, i + 5);
    const res = await Promise.all(lote.map((u) => detalle(u).catch((e) => { console.warn('detalle', u, e.message); return null; })));
    out.push(...res.filter(Boolean));
  }
  const sinTipo = out.filter((p) => p.tipo === 'Inmueble');
  console.log(`inmuebles=${out.length} sinTipo=${sinTipo.length} conSuperficie=${out.filter((p) => p.superficie).length}`);
  console.log('superficies:', JSON.stringify(out.filter((p) => p.superficie).map((p) => p.superficie).sort((a, b) => a - b)));
  require('fs').writeFileSync('/tmp/oc-inmuebles.json', JSON.stringify(out, null, 2));
  console.log('sin tipo:', JSON.stringify(sinTipo.map((p) => p.url)));
})();
