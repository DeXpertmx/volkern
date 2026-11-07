/**
 * Volkern · Widget de Propiedades Inmobiliarias (v2)
 *
 * Inserta el catálogo público de un tenant en cualquier web:
 *
 * <script
 *   src="https://volkern.app/propiedades-embed.js"
 *   data-tenant-id="TU_TENANT_ID"
 *   data-titulo="Nuestras propiedades"
 *   data-color="#2563eb"
 *   data-limite="12"
 *   data-modo="grid"
 * ></script>
 * <div id="volkern-propiedades"></div>
 *
 * Atributos opcionales:
 *   data-container-id     id del contenedor (por defecto «volkern-propiedades»)
 *   data-subtitulo        línea de apoyo bajo el título
 *   data-modo             grid | lista
 *   data-limite           nº de tarjetas (1-100, por defecto 12)
 *   data-solo-destacadas  true | false
 *   data-operacion        venta | alquiler | alquiler_temporada | traspaso
 *   data-ciudad           filtra por zona/ciudad
 *   data-estado           disponible | reservada | vendida | alquilada
 *   data-moneda           fuerza la divisa de presentación
 *   data-ver-todas        true | false (enlace al portal completo)
 *   data-filtros          true | false (buscador y filtros visibles)
 *   data-detalle          embed | portal (por defecto «embed»: la ficha se abre
 *                         dentro del propio widget; «portal» abre el portal
 *                         completo en una pestaña nueva)
 *   data-tema             auto | claro | oscuro
 */

(function () {
  'use strict';

  var ORIGIN = 'https://volkern.app';
  var API_ENDPOINT = ORIGIN + '/api/public/real-estate/propiedades';
  var API_DETALLE = ORIGIN + '/api/public/real-estate/properties';

  // ─── Localizar el <script> que nos cargó ────────────────────────────────
  var scriptTag = document.currentScript;
  if (!scriptTag || !scriptTag.getAttribute('data-tenant-id')) {
    var candidatos = document.querySelectorAll('script[data-tenant-id]');
    scriptTag = candidatos.length ? candidatos[candidatos.length - 1] : null;
  }
  if (!scriptTag) {
    console.error('[Volkern] No se encontró el <script> con data-tenant-id.');
    return;
  }
  if (scriptTag.getAttribute('data-vp-inicializado') === '1') return;
  scriptTag.setAttribute('data-vp-inicializado', '1');

  function attr(name) {
    var value = scriptTag.getAttribute(name);
    return value === null ? null : value.trim();
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  var tenantId = attr('data-tenant-id');
  if (!tenantId) {
    console.error('[Volkern] data-tenant-id es obligatorio.');
    return;
  }

  var CONFIG = {
    tenantId: tenantId,
    containerId: attr('data-container-id') || 'volkern-propiedades',
    titulo: attr('data-titulo') === null ? 'Propiedades' : attr('data-titulo'),
    subtitulo: attr('data-subtitulo') || '',
    color: attr('data-color') || '#2563eb',
    limite: clamp(parseInt(attr('data-limite') || '12', 10) || 12, 1, 100),
    modo: attr('data-modo') === 'lista' ? 'lista' : 'grid',
    soloDestacadas: attr('data-solo-destacadas') === 'true',
    operacion: attr('data-operacion') || '',
    ciudad: attr('data-ciudad') || '',
    estado: attr('data-estado') || '',
    moneda: attr('data-moneda') || '',
    verTodas: attr('data-ver-todas') !== 'false',
    filtros: attr('data-filtros') !== 'false',
    tema: ['claro', 'oscuro'].indexOf(attr('data-tema')) >= 0 ? attr('data-tema') : 'auto',
    detalle: attr('data-detalle') === 'portal' ? 'portal' : 'embed',
  };

  // ─── Contenedor ─────────────────────────────────────────────────────────
  var container = document.getElementById(CONFIG.containerId);
  if (!container) {
    console.warn(
      '[Volkern] No existe #' + CONFIG.containerId + '. El widget se insertará al final del <body>.'
    );
    container = document.createElement('div');
    container.id = CONFIG.containerId;
    document.body.appendChild(container);
  }
  if (container.getAttribute('data-vp-montado') === '1') return;
  container.setAttribute('data-vp-montado', '1');
  if (CONFIG.tema !== 'auto') container.setAttribute('data-vp-tema', CONFIG.tema);
  container.style.setProperty('--vp-accent', CONFIG.color);
  container.style.setProperty('--vp-contrast', contrastePara(CONFIG.color));

  var CID = '#' + (window.CSS && CSS.escape ? CSS.escape(CONFIG.containerId) : CONFIG.containerId);

  // ─── Estado ─────────────────────────────────────────────────────────────
  var state = {
    propiedades: [],
    slug: '',
    total: 0,
    cargando: true,
    error: '',
    // Filtros activos: se siembran con los atributos del script para que los
    // controles muestren lo mismo que se pidió al cargar el widget.
    filtros: {
      q: '',
      operacion: CONFIG.operacion,
      tipo: '',
      ciudad: CONFIG.ciudad,
      minPrecio: '',
      maxPrecio: '',
    },
    // Vista activa: el listado o la ficha de un inmueble dentro del widget.
    vista: 'lista',
    detalleId: '',
    detalle: { cargando: false, error: '', propiedad: null },
  };

  // ─── Iconos (SVG inline, sin dependencias) ──────────────────────────────
  var ICONOS = {
    pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    cama: '<path d="M3 18v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6"/><path d="M3 18h18"/><path d="M5 10V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3"/><path d="M7 10V8h3v2"/>',
    bano: '<path d="M4 12h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-3Z"/><path d="M6 12V5a2 2 0 0 1 4 0"/><path d="M6 19l-1 2"/><path d="M18 19l1 2"/>',
    area: '<path d="M3 9V5a2 2 0 0 1 2-2h4"/><path d="M21 9V5a2 2 0 0 0-2-2h-4"/><path d="M3 15v4a2 2 0 0 0 2 2h4"/><path d="M21 15v4a2 2 0 0 1-2 2h-4"/>',
    auto: '<rect x="3" y="11" width="18" height="6" rx="2"/><path d="M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3"/><circle cx="7.5" cy="17" r="1.5"/><circle cx="16.5" cy="17" r="1.5"/>',
    flecha: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
    edificio: '<path d="M4 21V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16"/><path d="M2 21h20"/><path d="M9 7h2"/><path d="M13 7h2"/><path d="M9 11h2"/><path d="M13 11h2"/><path d="M10 21v-4h4v4"/>',
    estrella: '<path d="m12 3 2.6 5.6 6.1.8-4.5 4.3 1.1 6.1-5.4-3-5.4 3 1.1-6.1L3.3 9.4l6.1-.8Z"/>',
    alerta: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
    recargar: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>',
    lupa: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    filtro: '<path d="M3 5h18"/><path d="M6 12h12"/><path d="M10 19h4"/>',
  };

  function svg(nombre) {
    var nodo = document.createElement('span');
    nodo.className = 'vp-ico';
    nodo.setAttribute('aria-hidden', 'true');
    nodo.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
      'stroke-linecap="round" stroke-linejoin="round">' +
      ICONOS[nombre] +
      '</svg>';
    return nodo;
  }

  function el(tag, clase, texto) {
    var nodo = document.createElement(tag);
    if (clase) nodo.className = clase;
    if (texto !== undefined && texto !== null) nodo.textContent = String(texto);
    return nodo;
  }

  // ─── Utilidades ─────────────────────────────────────────────────────────
  function contrastePara(hex) {
    var limpio = String(hex).replace('#', '');
    if (limpio.length === 3) {
      limpio = limpio.charAt(0) + limpio.charAt(0) + limpio.charAt(1) + limpio.charAt(1) + limpio.charAt(2) + limpio.charAt(2);
    }
    if (!/^[0-9a-fA-F]{6}$/.test(limpio)) return '#ffffff';
    var r = parseInt(limpio.substr(0, 2), 16) / 255;
    var g = parseInt(limpio.substr(2, 2), 16) / 255;
    var b = parseInt(limpio.substr(4, 2), 16) / 255;
    var canal = function (c) {
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    var luminancia = 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
    return luminancia > 0.62 ? '#0f172a' : '#ffffff';
  }

  function urlSegura(url) {
    if (typeof url !== 'string') return null;
    var valor = url.trim();
    if (!valor) return null;
    if (/^(https?:)?\/\//i.test(valor) || valor.charAt(0) === '/') return valor;
    return null;
  }

  function imagenDe(propiedad) {
    var media = propiedad.media;
    if (Array.isArray(media) && media.length > 0) {
      var primera = media[0];
      if (typeof primera === 'string') return urlSegura(primera);
      if (primera && typeof primera === 'object') {
        return urlSegura(primera.url || primera.src || primera.path);
      }
    }
    if (typeof media === 'string') return urlSegura(media);
    return null;
  }

  function importe(valor, moneda) {
    if (!valor || valor <= 0) return 'Precio a consultar';
    try {
      return new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency: moneda || 'EUR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(valor);
    } catch (e) {
      return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(valor) + ' ' + (moneda || '');
    }
  }

  var OPERACIONES = {
    venta: { texto: 'En Venta', color: '#2563eb' },
    alquiler: { texto: 'En Alquiler', color: '#7c3aed' },
    alquiler_temporada: { texto: 'Renta Vacacional', color: '#0d9488' },
    traspaso: { texto: 'Traspaso', color: '#b45309' },
  };

  var ESTADOS = {
    disponible: { texto: 'Disponible', color: '#10b981' },
    reservada: { texto: 'Reservada', color: '#f59e0b' },
    vendida: { texto: 'Vendida', color: '#64748b' },
    alquilada: { texto: 'Alquilada', color: '#3b82f6' },
  };

  var ENERGIA = {
    A: { fondo: '#059669', texto: '#ffffff' },
    B: { fondo: '#16a34a', texto: '#ffffff' },
    C: { fondo: '#84cc16', texto: '#1f2937' },
    D: { fondo: '#facc15', texto: '#1f2937' },
    E: { fondo: '#f59e0b', texto: '#1f2937' },
    F: { fondo: '#f97316', texto: '#ffffff' },
    G: { fondo: '#dc2626', texto: '#ffffff' },
  };

  function sufijoPrecio(operacion) {
    if (operacion === 'alquiler') return '/mes';
    if (operacion === 'alquiler_temporada') return '/noche';
    return '';
  }

  function etiquetaTipo(tipo) {
    if (!tipo) return '';
    return String(tipo)
      .replace(/_/g, ' ')
      .replace(/\b\w/g, function (letra) {
        return letra.toUpperCase();
      });
  }

  function basePortal() {
    var slug = state.slug || CONFIG.tenantId;
    return ORIGIN + '/p/' + encodeURIComponent(slug);
  }

  function urlListado() {
    var params = new URLSearchParams();
    var f = state.filtros;
    if (f.q) params.set('q', f.q);
    if (f.operacion) params.set('operacion', f.operacion);
    if (f.tipo) params.set('tipo', f.tipo);
    if (f.ciudad) params.set('ciudad', f.ciudad);
    if (f.minPrecio) params.set('minPrecio', f.minPrecio);
    if (f.maxPrecio) params.set('maxPrecio', f.maxPrecio);
    var qs = params.toString();
    return basePortal() + '/propiedades' + (qs ? '?' + qs : '');
  }

  function hayFiltros() {
    var f = state.filtros;
    return Boolean(f.q || f.operacion || f.tipo || f.ciudad || f.minPrecio || f.maxPrecio);
  }

  function limpiarFiltros() {
    state.filtros = { q: '', operacion: '', tipo: '', ciudad: '', minPrecio: '', maxPrecio: '' };
    cargar();
  }

  function urlDetalle(id) {
    return basePortal() + '/propiedades/' + encodeURIComponent(id);
  }

  /** Ubicación legible sin repetir la ciudad cuando ya está en la dirección. */
  function textoUbicacion(propiedad) {
    var partes = [propiedad.city, propiedad.address]
      .filter(Boolean)
      .map(function (parte) {
        return String(parte).trim();
      });
    if (
      partes.length === 2 &&
      partes[1].toLowerCase().indexOf(partes[0].toLowerCase()) !== -1
    ) {
      partes = [partes[1]];
    }
    return partes.join(' · ');
  }

  /** Todas las fotos de la ficha, normalizadas a { url, alt }. */
  function imagenesDe(propiedad) {
    var media = propiedad && propiedad.media;
    if (!Array.isArray(media)) {
      var unica = imagenDe(propiedad);
      return unica ? [{ url: unica, alt: propiedad.nombre || 'Propiedad' }] : [];
    }
    return media
      .map(function (item) {
        if (typeof item === 'string') {
          var directa = urlSegura(item);
          return directa ? { url: directa, alt: propiedad.nombre || 'Propiedad' } : null;
        }
        if (item && typeof item === 'object') {
          var url = urlSegura(item.url || item.src || item.path);
          return url
            ? { url: url, alt: item.alt || propiedad.nombre || 'Propiedad' }
            : null;
        }
        return null;
      })
      .filter(Boolean);
  }

  // ─── Ficha dentro del widget ────────────────────────────────────────────
  // Las tarjetas enlazan al portal por defecto desde hace tiempo; abrir la
  // ficha en una pestaña nueva saca al visitante de la web que embebe el
  // widget. En modo «embed» la ficha se pinta en el mismo contenedor y se
  // vuelve al listado sin recargar: los filtros aplicados siguen intactos.

  function alPulsarEscape(evento) {
    if (evento.key === 'Escape' && state.vista === 'detalle') {
      evento.stopPropagation();
      cerrarDetalle();
    }
  }

  function desplazarAlWidget() {
    if (!container.scrollIntoView) return;
    try {
      container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      container.scrollIntoView();
    }
  }

  function abrirDetalle(id) {
    if (!id) return;
    state.vista = 'detalle';
    state.detalleId = id;
    state.detalle = { cargando: true, error: '', propiedad: null };
    render();
    desplazarAlWidget();
    document.addEventListener('keydown', alPulsarEscape);

    fetch(
      API_DETALLE + '/' + encodeURIComponent(id) + '?tenantId=' + encodeURIComponent(CONFIG.tenantId),
      { headers: { Accept: 'application/json' }, credentials: 'omit' }
    )
      .then(function (respuesta) {
        if (!respuesta.ok) throw new Error('HTTP ' + respuesta.status);
        return respuesta.json();
      })
      .then(function (datos) {
        // El visitante pudo volver al listado mientras cargaba.
        if (state.vista !== 'detalle' || state.detalleId !== id) return;
        var propiedad = datos && datos.property ? datos.property : null;
        state.detalle = {
          cargando: false,
          error: propiedad ? '' : 'Puede que ya no esté publicada.',
          propiedad: propiedad,
        };
        render();
      })
      .catch(function (error) {
        console.error('[Volkern] Error al cargar la ficha:', error);
        if (state.vista !== 'detalle' || state.detalleId !== id) return;
        state.detalle = {
          cargando: false,
          error: 'No se pudo conectar con Volkern.',
          propiedad: null,
        };
        render();
      });
  }

  function cerrarDetalle() {
    state.vista = 'lista';
    state.detalleId = '';
    state.detalle = { cargando: false, error: '', propiedad: null };
    document.removeEventListener('keydown', alPulsarEscape);
    render();
    desplazarAlWidget();
  }

  // ─── Estilos ────────────────────────────────────────────────────────────
  var ESTILOS = `
${CID} {
  --vp-accent: #2563eb;
  --vp-contrast: #ffffff;
  --vp-text: #0f172a;
  --vp-muted: #64748b;
  --vp-border: #e2e8f0;
  --vp-surface: #ffffff;
  --vp-surface-2: #f8fafc;
  --vp-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
  --vp-radio: 16px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  color: var(--vp-text);
  line-height: 1.5;
  text-align: left;
  -webkit-font-smoothing: antialiased;
}
${CID} *,
${CID} *::before,
${CID} *::after { box-sizing: border-box; }
${CID} [data-vp-tema="oscuro"],
${CID}[data-vp-tema="oscuro"] {
  --vp-text: #e5e7eb;
  --vp-muted: #94a3b8;
  --vp-border: #1f2937;
  --vp-surface: #0b1220;
  --vp-surface-2: #111a2b;
  --vp-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
}
@media (prefers-color-scheme: dark) {
  ${CID}:not([data-vp-tema="claro"]) {
    --vp-text: #e5e7eb;
    --vp-muted: #94a3b8;
    --vp-border: #1f2937;
    --vp-surface: #0b1220;
    --vp-surface-2: #111a2b;
    --vp-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  }
}

/* ── Cabecera ─────────────────────────────────────────────── */
${CID} .vp-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin: 0 0 20px;
  flex-wrap: wrap;
}
${CID} .vp-title {
  margin: 0;
  font-size: clamp(1.3rem, 2.2vw, 1.7rem);
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--vp-text);
}
${CID} .vp-sub {
  margin: 6px 0 0;
  font-size: 0.95rem;
  color: var(--vp-muted);
}
${CID} .vp-all {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--vp-accent);
  text-decoration: none;
  white-space: nowrap;
}
${CID} .vp-all:hover { text-decoration: underline; }
${CID} .vp-all .vp-ico { width: 16px; height: 16px; }

/* ── Buscador y filtros ───────────────────────────────────── */
${CID} .vp-filtros {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 0 0 14px;
  padding: 12px;
  background: var(--vp-surface);
  border: 1px solid var(--vp-border);
  border-radius: 14px;
  box-shadow: var(--vp-shadow);
}
${CID} .vp-field {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1 1 220px;
  min-width: 180px;
}
${CID} .vp-field .vp-ico {
  position: absolute;
  left: 11px;
  width: 16px;
  height: 16px;
  color: var(--vp-muted);
  pointer-events: none;
}
${CID} .vp-input,
${CID} .vp-select {
  height: 40px;
  min-width: 0;
  padding: 0 12px;
  border: 1px solid var(--vp-border);
  border-radius: 10px;
  background: var(--vp-surface);
  color: var(--vp-text);
  font: inherit;
  font-size: 0.86rem;
}
${CID} .vp-field .vp-input { width: 100%; padding-left: 34px; }
${CID} .vp-select { padding-right: 30px; flex: 0 1 auto; cursor: pointer; }
${CID} .vp-input--ciudad { flex: 1 1 130px; width: 130px; }
${CID} .vp-input:focus-visible,
${CID} .vp-select:focus-visible {
  outline: 2px solid var(--vp-accent);
  outline-offset: 1px;
}
${CID} .vp-range { display: flex; align-items: center; gap: 6px; }
${CID} .vp-range .vp-input { width: 78px; padding: 0 10px; text-align: center; }
${CID} .vp-range-sep { color: var(--vp-muted); }
${CID} .vp-btn-filtros {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 40px;
  padding: 0 16px;
  border: 0;
  border-radius: 10px;
  font: inherit;
  font-size: 0.86rem;
  font-weight: 700;
  color: var(--vp-contrast);
  background: var(--vp-accent);
  cursor: pointer;
  transition: opacity 0.18s ease;
}
${CID} .vp-btn-filtros:hover { opacity: 0.92; }
${CID} .vp-btn-filtros .vp-ico { width: 15px; height: 15px; }
${CID} .vp-results {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 0 0 14px;
  min-height: 20px;
  font-size: 0.8rem;
  color: var(--vp-muted);
}
${CID} .vp-clear {
  border: 0;
  padding: 0;
  background: none;
  font: inherit;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--vp-accent);
  cursor: pointer;
  text-decoration: underline;
}

/* ── Rejilla / lista ──────────────────────────────────────── */
${CID} .vp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
  gap: 22px;
}
${CID} .vp-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
${CID} .vp-list .vp-card { flex-direction: row; }
${CID} .vp-list .vp-media { width: 38%; min-width: 210px; aspect-ratio: auto; }
${CID} .vp-list .vp-body { padding: 18px 20px; }

/* ── Tarjeta ──────────────────────────────────────────────── */
${CID} .vp-card {
  display: flex;
  flex-direction: column;
  background: var(--vp-surface);
  border: 1px solid var(--vp-border);
  border-radius: var(--vp-radio);
  overflow: hidden;
  text-decoration: none;
  color: inherit;
  box-shadow: var(--vp-shadow);
  transition: transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease;
}
${CID} .vp-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 16px 34px rgba(15, 23, 42, 0.14);
  border-color: color-mix(in srgb, var(--vp-accent) 35%, var(--vp-border));
}
${CID} .vp-card:focus-visible {
  outline: 2px solid var(--vp-accent);
  outline-offset: 3px;
}

/* ── Imagen ───────────────────────────────────────────────── */
${CID} .vp-media {
  position: relative;
  aspect-ratio: 4 / 3;
  background: var(--vp-surface-2);
  overflow: hidden;
}
${CID} .vp-media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.5s ease;
}
${CID} .vp-card:hover .vp-media img { transform: scale(1.05); }
${CID} .vp-media::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.18) 0%, rgba(15, 23, 42, 0) 35%, rgba(15, 23, 42, 0) 70%, rgba(15, 23, 42, 0.12) 100%);
  pointer-events: none;
}
${CID} .vp-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--vp-muted);
  opacity: 0.55;
}
${CID} .vp-placeholder .vp-ico { width: 44px; height: 44px; }

/* ── Insignias sobre la imagen ────────────────────────────── */
${CID} .vp-badges {
  position: absolute;
  top: 10px;
  left: 10px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  z-index: 2;
  max-width: calc(100% - 110px);
}
${CID} .vp-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 9px;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: #ffffff;
  background: rgba(15, 23, 42, 0.72);
  backdrop-filter: blur(6px);
}
${CID} .vp-badge--destacada {
  background: #f59e0b;
  color: #1f2937;
}
${CID} .vp-badge .vp-ico { width: 12px; height: 12px; }
${CID} .vp-energia {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 22px;
  padding: 0 6px;
  border-radius: 6px;
  font-size: 0.72rem;
  font-weight: 800;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
}

/* ── Estado (píldora) ─────────────────────────────────────── */
${CID} .vp-status {
  position: absolute;
  right: 10px;
  bottom: 10px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
  color: #0f172a;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.18);
  backdrop-filter: blur(6px);
}
${CID} .vp-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
  flex: none;
}

/* ── Contenido ────────────────────────────────────────────── */
${CID} .vp-body {
  display: flex;
  flex-direction: column;
  flex: 1;
  padding: 16px 18px 18px;
  min-width: 0;
}
${CID} .vp-name {
  margin: 0 0 6px;
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.35;
  color: var(--vp-text);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 2.7em;
}
${CID} .vp-loc {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 0 0 12px;
  font-size: 0.8rem;
  color: var(--vp-muted);
}
${CID} .vp-loc .vp-ico { width: 14px; height: 14px; flex: none; }
${CID} .vp-specs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  margin: 0 0 14px;
  padding: 12px 0 0;
  border-top: 1px solid var(--vp-border);
  list-style: none;
}
${CID} .vp-specs li {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin: 0;
  padding: 0;
  font-size: 0.8rem;
  color: var(--vp-muted);
  white-space: nowrap;
}
${CID} .vp-specs .vp-ico { width: 15px; height: 15px; opacity: 0.85; }
${CID} .vp-foot {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin-top: auto;
}
${CID} .vp-price {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: var(--vp-text);
}
${CID} .vp-suffix {
  margin-left: 3px;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--vp-muted);
}
${CID} .vp-m2 {
  margin: 3px 0 0;
  font-size: 0.74rem;
  color: var(--vp-muted);
}
${CID} .vp-cta {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 8px 13px;
  border-radius: 10px;
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--vp-contrast);
  background: var(--vp-accent);
  white-space: nowrap;
  transition: opacity 0.18s ease, transform 0.18s ease;
}
${CID} .vp-card:hover .vp-cta { opacity: 0.92; transform: translateX(2px); }
${CID} .vp-cta .vp-ico { width: 15px; height: 15px; }

/* ── Ficha dentro del widget ──────────────────────────────── */
${CID} .vp-detail {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
${CID} .vp-back {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid var(--vp-border);
  border-radius: 999px;
  background: var(--vp-surface);
  color: var(--vp-text);
  font: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}
${CID} .vp-back:hover { border-color: var(--vp-accent); color: var(--vp-accent); }
${CID} .vp-galeria-main {
  position: relative;
  aspect-ratio: 16 / 9;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid var(--vp-border);
  background: var(--vp-surface-2);
}
${CID} .vp-galeria-main img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
${CID} .vp-thumbs {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 8px 0 2px;
}
${CID} .vp-thumb {
  flex: none;
  width: 84px;
  height: 62px;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 9px;
  overflow: hidden;
  background: none;
  cursor: pointer;
  opacity: 0.72;
}
${CID} .vp-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
${CID} .vp-thumb[aria-current="true"] { border-color: var(--vp-accent); opacity: 1; }
${CID} .vp-detail-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
${CID} .vp-detail-title {
  margin: 0 0 6px;
  font-size: clamp(1.15rem, 2vw, 1.5rem);
  font-weight: 800;
  letter-spacing: -0.01em;
  line-height: 1.25;
}
${CID} .vp-detail-precio { text-align: right; }
${CID} .vp-detail-precio .vp-price { font-size: 1.5rem; }
${CID} .vp-badges-detalle {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 2px 0 0;
  list-style: none;
  padding: 0;
}
${CID} .vp-detalle-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
  gap: 24px;
  align-items: start;
}
@media (max-width: 760px) {
  ${CID} .vp-detalle-grid { grid-template-columns: 1fr; }
}
${CID} .vp-detalle-col {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}
${CID} .vp-detalle-h {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--vp-muted);
}
${CID} .vp-desc p {
  margin: 0 0 10px;
  font-size: 0.92rem;
  line-height: 1.65;
  color: var(--vp-text);
}
${CID} .vp-desc p:last-child { margin-bottom: 0; }
${CID} .vp-fichas {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}
${CID} .vp-ficha {
  padding: 9px 11px;
  border: 1px solid var(--vp-border);
  border-radius: 10px;
  background: var(--vp-surface-2);
}
${CID} .vp-ficha span {
  display: block;
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--vp-muted);
}
${CID} .vp-ficha strong { font-size: 0.93rem; font-weight: 700; }
${CID} .vp-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}
${CID} .vp-chip {
  padding: 5px 10px;
  border: 1px solid var(--vp-border);
  border-radius: 999px;
  background: var(--vp-surface-2);
  color: var(--vp-text);
  font-size: 0.78rem;
}
${CID} .vp-detail-cta {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  border: 1px solid var(--vp-border);
  border-radius: 14px;
  background: var(--vp-surface-2);
}
${CID} .vp-detail-cta a {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 11px 16px;
  border-radius: 10px;
  background: var(--vp-accent);
  color: var(--vp-contrast);
  font-size: 0.9rem;
  font-weight: 700;
  text-decoration: none;
}
${CID} .vp-detail-cta a:hover { opacity: 0.92; }
${CID} .vp-detail-cta small {
  font-size: 0.75rem;
  line-height: 1.45;
  color: var(--vp-muted);
  text-align: center;
}
${CID} .vp-skel-detalle { display: grid; gap: 10px; }
${CID} .vp-skel-detalle .vp-skel-media { border-radius: 14px; }

/* ── Esqueletos de carga ──────────────────────────────────── */
${CID} .vp-skel {
  border: 1px solid var(--vp-border);
  border-radius: var(--vp-radio);
  overflow: hidden;
  background: var(--vp-surface);
}
${CID} .vp-skel-media,
${CID} .vp-skel-line {
  background: linear-gradient(100deg, var(--vp-surface-2) 30%, var(--vp-border) 50%, var(--vp-surface-2) 70%);
  background-size: 220% 100%;
  animation: vp-shimmer 1.3s ease-in-out infinite;
}
${CID} .vp-skel-media { aspect-ratio: 4 / 3; }
${CID} .vp-skel-body { padding: 16px 18px 18px; }
${CID} .vp-skel-line { height: 11px; border-radius: 999px; margin-bottom: 10px; }
${CID} .vp-skel-line.w-70 { width: 70%; }
${CID} .vp-skel-line.w-45 { width: 45%; }
${CID} .vp-skel-line.w-30 { width: 30%; }
@keyframes vp-shimmer {
  0% { background-position: 130% 0; }
  100% { background-position: -30% 0; }
}

/* ── Estados vacío / error ────────────────────────────────── */
${CID} .vp-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 48px 20px;
  text-align: center;
  border: 1px dashed var(--vp-border);
  border-radius: var(--vp-radio);
  background: var(--vp-surface-2);
  color: var(--vp-muted);
}
${CID} .vp-state .vp-ico { width: 34px; height: 34px; opacity: 0.6; }
${CID} .vp-state strong {
  color: var(--vp-text);
  font-size: 1rem;
}
${CID} .vp-state p { margin: 0; font-size: 0.88rem; max-width: 42ch; }
${CID} .vp-retry {
  margin-top: 4px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid var(--vp-border);
  border-radius: 10px;
  background: var(--vp-surface);
  color: var(--vp-text);
  font: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}
${CID} .vp-retry:hover { border-color: var(--vp-accent); color: var(--vp-accent); }
${CID} .vp-retry .vp-ico { width: 15px; height: 15px; }

/* ── Atribución ───────────────────────────────────────────── */
${CID} .vp-attrib {
  margin-top: 18px;
  padding-top: 12px;
  border-top: 1px solid var(--vp-border);
  font-size: 0.74rem;
  color: var(--vp-muted);
  text-align: right;
}
${CID} .vp-attrib a {
  color: inherit;
  font-weight: 600;
  text-decoration: none;
  border-bottom: 1px dotted currentColor;
}
${CID} .vp-attrib a:hover { color: var(--vp-accent); }

/* ── Móvil ────────────────────────────────────────────────── */
@media (max-width: 640px) {
  ${CID} .vp-grid { grid-template-columns: 1fr; }
  ${CID} .vp-list .vp-card { flex-direction: column; }
  ${CID} .vp-list .vp-media { width: 100%; aspect-ratio: 4 / 3; }
  ${CID} .vp-list .vp-body { padding: 16px 18px 18px; }
  ${CID} .vp-head { align-items: flex-start; flex-direction: column; gap: 8px; }
  ${CID} .vp-field { flex: 1 1 100%; }
  ${CID} .vp-select { flex: 1 1 calc(50% - 4px); }
  ${CID} .vp-input--ciudad { flex: 1 1 100%; width: 100%; }
  ${CID} .vp-range { flex: 1 1 100%; }
  ${CID} .vp-range .vp-input { flex: 1 1 0; width: auto; }
  ${CID} .vp-btn-filtros { flex: 1 1 100%; justify-content: center; }
  ${CID} .vp-detail-head { flex-direction: column; }
  ${CID} .vp-detail-precio { text-align: left; }
  ${CID} .vp-detail-precio .vp-price { font-size: 1.3rem; }
}

@media (prefers-reduced-motion: reduce) {
  ${CID} .vp-card,
  ${CID} .vp-card:hover,
  ${CID} .vp-media img,
  ${CID} .vp-card:hover .vp-media img,
  ${CID} .vp-card:hover .vp-cta { transition: none; transform: none; }
  ${CID} .vp-skel-media,
  ${CID} .vp-skel-line { animation: none; }
}
`;

  function inyectarEstilos() {
    var id = 'volkern-prop-styles-' + CONFIG.containerId;
    if (document.getElementById(id)) return;
    var style = document.createElement('style');
    style.id = id;
    style.textContent = ESTILOS;
    (document.head || document.documentElement).appendChild(style);
  }

  // ─── Bloques de UI ──────────────────────────────────────────────────────
  function construirCabecera() {
    var mostrarEnlace = CONFIG.verTodas && state.total > state.propiedades.length;
    if (!CONFIG.titulo && !CONFIG.subtitulo && !mostrarEnlace) return null;

    var head = el('div', 'vp-head');
    var texto = el('div', 'vp-head-text');

    if (CONFIG.titulo) {
      texto.appendChild(el('h2', 'vp-title', CONFIG.titulo));
    }
    if (CONFIG.subtitulo) {
      texto.appendChild(el('p', 'vp-sub', CONFIG.subtitulo));
    }
    head.appendChild(texto);

    if (mostrarEnlace) {
      var enlace = el('a', 'vp-all', 'Ver todas las propiedades');
      enlace.href = urlListado();
      enlace.target = '_blank';
      enlace.rel = 'noopener noreferrer';
      enlace.appendChild(svg('flecha'));
      head.appendChild(enlace);
    }

    return head;
  }

  function construirTarjeta(propiedad) {
    var operacion = OPERACIONES[propiedad.operationType] || null;
    var estado = ESTADOS[propiedad.status] || { texto: 'Disponible', color: '#10b981' };
    var imagen = imagenDe(propiedad);

    var tarjeta = el('a', 'vp-card');
    tarjeta.href = urlDetalle(propiedad.id);
    if (CONFIG.detalle === 'portal') {
      tarjeta.target = '_blank';
      tarjeta.rel = 'noopener noreferrer';
    } else {
      // El enlace sigue apuntando a la ficha del portal para que «abrir en
      // pestaña nueva» y los modificadores del teclado funcionen; el clic
      // normal se resuelve dentro del propio widget.
      tarjeta.addEventListener('click', function (evento) {
        if (evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return;
        evento.preventDefault();
        abrirDetalle(propiedad.id);
      });
    }
    tarjeta.setAttribute('aria-label', 'Ver detalle de ' + (propiedad.nombre || 'la propiedad'));

    // Imagen
    var media = el('div', 'vp-media');
    if (imagen) {
      var img = document.createElement('img');
      img.src = imagen;
      img.alt = propiedad.nombre || 'Propiedad';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.addEventListener('error', function () {
        media.replaceChild(placeholderImagen(), img);
      });
      media.appendChild(img);
    } else {
      media.appendChild(placeholderImagen());
    }

    // Insignias
    var insignias = el('div', 'vp-badges');
    if (propiedad.destacado || propiedad.featured) {
      var destacada = el('span', 'vp-badge vp-badge--destacada');
      destacada.appendChild(svg('estrella'));
      destacada.appendChild(document.createTextNode('Destacada'));
      insignias.appendChild(destacada);
    }
    if (operacion) {
      var badgeOperacion = el('span', 'vp-badge', operacion.texto);
      badgeOperacion.style.background = operacion.color;
      insignias.appendChild(badgeOperacion);
    }
    var energia = ENERGIA[String(propiedad.energyCert || '').trim().toUpperCase()];
    if (energia) {
      var badgeEnergia = el('span', 'vp-energia', String(propiedad.energyCert).trim().toUpperCase());
      badgeEnergia.style.background = energia.fondo;
      badgeEnergia.style.color = energia.texto;
      badgeEnergia.title = 'Clase energética ' + String(propiedad.energyCert).trim().toUpperCase();
      insignias.appendChild(badgeEnergia);
    }
    if (insignias.childNodes.length > 0) media.appendChild(insignias);

    // Estado
    var pildora = el('span', 'vp-status');
    pildora.style.color = estado.color;
    var punto = el('span', 'vp-dot');
    punto.style.background = estado.color;
    pildora.appendChild(punto);
    pildora.appendChild(document.createTextNode(estado.texto));
    media.appendChild(pildora);

    // Cuerpo
    var cuerpo = el('div', 'vp-body');
    cuerpo.appendChild(el('h3', 'vp-name', propiedad.nombre || 'Propiedad'));

    // Ciudad y dirección suelen solaparse («Monda · Monda» o
    // «Ciudad Jardín · Barrio de Ciudad Jardín, Málaga»): se muestra la más
    // específica una sola vez.
    var ubicacion = textoUbicacion(propiedad);
    if (ubicacion) {
      var loc = el('p', 'vp-loc');
      loc.appendChild(svg('pin'));
      loc.appendChild(document.createTextNode(ubicacion));
      cuerpo.appendChild(loc);
    }

    var especificaciones = [];
    if (propiedad.bedrooms) {
      especificaciones.push(['cama', propiedad.bedrooms + (propiedad.bedrooms === 1 ? ' hab.' : ' hab.')]);
    }
    if (propiedad.bathrooms) {
      especificaciones.push(['bano', propiedad.bathrooms + (propiedad.bathrooms === 1 ? ' baño' : ' baños')]);
    }
    if (propiedad.areaM2) {
      especificaciones.push(['area', propiedad.areaM2 + ' m²']);
    }
    if (propiedad.parking) {
      especificaciones.push(['auto', propiedad.parking + ' estac.']);
    }

    if (especificaciones.length > 0) {
      var lista = el('ul', 'vp-specs');
      especificaciones.forEach(function (item) {
        var li = document.createElement('li');
        li.appendChild(svg(item[0]));
        li.appendChild(document.createTextNode(item[1]));
        lista.appendChild(li);
      });
      cuerpo.appendChild(lista);
    }

    var pie = el('div', 'vp-foot');
    var bloquePrecio = el('div');
    var precio = el('p', 'vp-price', importe(propiedad.precioBase, CONFIG.moneda || propiedad.moneda));
    var sufijo = sufijoPrecio(propiedad.operationType);
    if (sufijo && propiedad.precioBase > 0) {
      precio.appendChild(el('span', 'vp-suffix', sufijo));
    }
    bloquePrecio.appendChild(precio);

    if (
      propiedad.precioBase > 0 &&
      propiedad.areaM2 > 0 &&
      propiedad.operationType !== 'alquiler' &&
      propiedad.operationType !== 'alquiler_temporada'
    ) {
      bloquePrecio.appendChild(
        el('p', 'vp-m2', importe(propiedad.precioBase / propiedad.areaM2, CONFIG.moneda || propiedad.moneda) + ' /m²')
      );
    }
    pie.appendChild(bloquePrecio);

    var cta = el('span', 'vp-cta');
    cta.appendChild(document.createTextNode('Ver detalle'));
    cta.appendChild(svg('flecha'));
    pie.appendChild(cta);

    cuerpo.appendChild(pie);
    tarjeta.appendChild(media);
    tarjeta.appendChild(cuerpo);

    return tarjeta;
  }

  var EXTRAS = [
    ['hasPool', 'Piscina'],
    ['hasGarden', 'Jardín'],
    ['hasTerrace', 'Terraza'],
    ['hasBalcony', 'Balcón'],
    ['hasElevator', 'Ascensor'],
    ['hasStorageRoom', 'Trastero'],
    ['hasParking', 'Parking'],
    ['furnished', 'Amueblado'],
    ['hasAirConditioning', 'Aire acondicionado'],
    ['hasHeating', 'Calefacción'],
  ];

  function fichaDato(etiqueta, valor) {
    var nodo = el('li', 'vp-ficha');
    nodo.appendChild(el('span', null, etiqueta));
    nodo.appendChild(el('strong', null, valor));
    return nodo;
  }

  function construirGaleria(propiedad, imagenes) {
    var galeria = el('div');
    var marco = el('div', 'vp-galeria-main');
    var principal = document.createElement('img');
    principal.src = imagenes[0].url;
    principal.alt = imagenes[0].alt;
    marco.appendChild(principal);
    galeria.appendChild(marco);

    if (imagenes.length > 1) {
      var tiras = el('div', 'vp-thumbs');
      imagenes.slice(0, 10).forEach(function (imagen, indice) {
        var boton = document.createElement('button');
        boton.type = 'button';
        boton.className = 'vp-thumb';
        boton.setAttribute('aria-current', indice === 0 ? 'true' : 'false');
        boton.setAttribute('aria-label', 'Ver foto ' + (indice + 1));
        var miniatura = document.createElement('img');
        miniatura.src = imagen.url;
        miniatura.alt = '';
        miniatura.loading = 'lazy';
        boton.appendChild(miniatura);
        boton.addEventListener('click', function () {
          principal.src = imagen.url;
          principal.alt = imagen.alt;
          Array.prototype.forEach.call(tiras.children, function (hijo) {
            hijo.setAttribute('aria-current', hijo === boton ? 'true' : 'false');
          });
        });
        tiras.appendChild(boton);
      });
      galeria.appendChild(tiras);
    }

    return galeria;
  }

  function construirEsqueletoDetalle() {
    var esqueleto = el('div', 'vp-skel-detalle');
    esqueleto.setAttribute('aria-busy', 'true');
    esqueleto.appendChild(el('div', 'vp-skel-media'));
    esqueleto.appendChild(el('div', 'vp-skel-line w-70'));
    esqueleto.appendChild(el('div', 'vp-skel-line w-45'));
    return esqueleto;
  }

  function construirDetalle() {
    var raiz = el('div', 'vp-detail');

    var volver = el('button', 'vp-back');
    volver.type = 'button';
    volver.appendChild(document.createTextNode('← Volver al listado'));
    volver.addEventListener('click', cerrarDetalle);
    raiz.appendChild(volver);

    if (state.detalle.cargando) {
      raiz.appendChild(construirEsqueletoDetalle());
      return raiz;
    }

    var propiedad = state.detalle.propiedad;

    if (!propiedad) {
      raiz.appendChild(
        construirEstado(
          'error',
          'No pudimos abrir la ficha',
          state.detalle.error || 'La propiedad ya no está disponible.',
          function () {
            abrirDetalle(state.detalleId);
          }
        )
      );
      return raiz;
    }

    var operacion = OPERACIONES[propiedad.operationType] || null;
    var estado = ESTADOS[propiedad.status] || null;
    var imagenes = imagenesDe(propiedad);

    if (imagenes.length > 0) {
      raiz.appendChild(construirGaleria(propiedad, imagenes));
    }

    // Cabecera: título, ubicación, insignias y precio.
    var cabecera = el('div', 'vp-detail-head');
    var bloqueTitulo = el('div');
    bloqueTitulo.appendChild(el('h3', 'vp-detail-title', propiedad.nombre || 'Propiedad'));

    var ubicacion = textoUbicacion(propiedad);
    if (ubicacion) {
      var loc = el('p', 'vp-loc');
      loc.appendChild(svg('pin'));
      loc.appendChild(document.createTextNode(ubicacion));
      bloqueTitulo.appendChild(loc);
    }

    var insignias = el('ul', 'vp-badges-detalle');
    if (operacion) {
      var etiquetaOperacion = el('li', 'vp-chip', operacion.texto);
      etiquetaOperacion.style.color = operacion.color;
      insignias.appendChild(etiquetaOperacion);
    }
    if (estado) {
      var etiquetaEstado = el('li', 'vp-chip', estado.texto);
      etiquetaEstado.style.color = estado.color;
      insignias.appendChild(etiquetaEstado);
    }
    if (propiedad.destacado || propiedad.featured) {
      insignias.appendChild(el('li', 'vp-chip', 'Destacada'));
    }
    if (insignias.childNodes.length > 0) bloqueTitulo.appendChild(insignias);
    cabecera.appendChild(bloqueTitulo);

    var bloquePrecio = el('div', 'vp-detail-precio');
    var precio = el('p', 'vp-price', importe(propiedad.precioBase, CONFIG.moneda || propiedad.moneda));
    var sufijo = sufijoPrecio(propiedad.operationType);
    if (sufijo && propiedad.precioBase > 0) {
      precio.appendChild(el('span', 'vp-suffix', sufijo));
    }
    bloquePrecio.appendChild(precio);
    if (
      propiedad.precioBase > 0 &&
      propiedad.areaM2 > 0 &&
      propiedad.operationType !== 'alquiler' &&
      propiedad.operationType !== 'alquiler_temporada'
    ) {
      bloquePrecio.appendChild(
        el('p', 'vp-m2', importe(propiedad.precioBase / propiedad.areaM2, CONFIG.moneda || propiedad.moneda) + ' /m²')
      );
    }
    cabecera.appendChild(bloquePrecio);
    raiz.appendChild(cabecera);

    // Descripción
    var grid = el('div', 'vp-detalle-grid');
    var principal = el('div', 'vp-detalle-col');
    var texto = String(propiedad.longDescription || propiedad.descripcion || '').trim();
    if (texto) {
      var bloqueDesc = el('div', 'vp-desc');
      texto
        .split(/\r?\n+/)
        .map(function (parrafo) {
          return parrafo.trim();
        })
        .filter(Boolean)
        .forEach(function (parrafo) {
          bloqueDesc.appendChild(el('p', null, parrafo));
        });
      principal.appendChild(el('h4', 'vp-detalle-h', 'Descripción'));
      principal.appendChild(bloqueDesc);
    }

    // Características: banderas del inmueble + servicios del editor.
    var extras = EXTRAS.filter(function (par) {
      return propiedad[par[0]];
    }).map(function (par) {
      return par[1];
    });
    if (Array.isArray(propiedad.servicios)) {
      propiedad.servicios.forEach(function (servicio) {
        if (typeof servicio === 'string' && servicio.trim()) {
          extras.push(etiquetaTipo(servicio.trim()));
        }
      });
    }
    if (extras.length > 0) {
      principal.appendChild(el('h4', 'vp-detalle-h', 'Características'));
      var chips = el('ul', 'vp-chips');
      extras.forEach(function (extra) {
        chips.appendChild(el('li', 'vp-chip', extra));
      });
      principal.appendChild(chips);
    }
    grid.appendChild(principal);

    // Datos y contacto
    var lateral = el('div', 'vp-detalle-col');
    var fichas = el('ul', 'vp-fichas');
    if (propiedad.areaM2) fichas.appendChild(fichaDato('Superficie', propiedad.areaM2 + ' m²'));
    if (propiedad.builtM2) fichas.appendChild(fichaDato('Construidos', propiedad.builtM2 + ' m²'));
    if (propiedad.bedrooms) fichas.appendChild(fichaDato('Habitaciones', String(propiedad.bedrooms)));
    if (propiedad.bathrooms) fichas.appendChild(fichaDato('Baños', String(propiedad.bathrooms)));
    if (propiedad.parking) fichas.appendChild(fichaDato('Estacionamientos', String(propiedad.parking)));
    if (propiedad.yearBuilt) fichas.appendChild(fichaDato('Antigüedad', propiedad.yearBuilt + ' años'));
    if (propiedad.propertyType) fichas.appendChild(fichaDato('Tipo', etiquetaTipo(propiedad.propertyType)));
    if (propiedad.energyCert) {
      fichas.appendChild(fichaDato('Certificado energético', String(propiedad.energyCert).toUpperCase()));
    }
    if (fichas.childNodes.length > 0) {
      lateral.appendChild(el('h4', 'vp-detalle-h', 'Datos del inmueble'));
      lateral.appendChild(fichas);
    }

    var cta = el('div', 'vp-detail-cta');
    var contacto = el('a', null, 'Solicitar información');
    contacto.href = urlDetalle(propiedad.id);
    contacto.target = '_blank';
    contacto.rel = 'noopener noreferrer';
    contacto.appendChild(svg('flecha'));
    cta.appendChild(contacto);
    cta.appendChild(el('small', null, 'Se abre la ficha completa con el formulario de contacto.'));
    lateral.appendChild(cta);

    grid.appendChild(lateral);
    raiz.appendChild(grid);
    raiz.appendChild(construirAtribucion());

    return raiz;
  }

  function placeholderImagen() {
    var nodo = el('div', 'vp-placeholder');
    nodo.appendChild(svg('edificio'));
    return nodo;
  }

  function construirEsqueleto() {
    var bloque = el('div', 'vp-skel');
    var media = el('div', 'vp-skel-media');
    var cuerpo = el('div', 'vp-skel-body');
    cuerpo.appendChild(el('div', 'vp-skel-line w-70'));
    cuerpo.appendChild(el('div', 'vp-skel-line w-45'));
    cuerpo.appendChild(el('div', 'vp-skel-line w-30'));
    bloque.appendChild(media);
    bloque.appendChild(cuerpo);
    return bloque;
  }

  function construirEstado(tipo, titulo, mensaje, alReintentar) {
    var nodo = el('div', 'vp-state');
    nodo.appendChild(svg(tipo === 'error' ? 'alerta' : 'edificio'));
    nodo.appendChild(el('strong', null, titulo));
    if (mensaje) nodo.appendChild(el('p', null, mensaje));
    if (alReintentar) {
      var boton = el('button', 'vp-retry');
      boton.type = 'button';
      boton.appendChild(svg('recargar'));
      boton.appendChild(document.createTextNode('Reintentar'));
      boton.addEventListener('click', alReintentar);
      nodo.appendChild(boton);
    }
    return nodo;
  }

  function construirAtribucion() {
    var nodo = el('div', 'vp-attrib');
    nodo.appendChild(document.createTextNode('Propiedades actualizadas automáticamente por '));
    var enlace = el('a', null, 'Volkern');
    enlace.href = ORIGIN;
    enlace.target = '_blank';
    enlace.rel = 'noopener noreferrer';
    nodo.appendChild(enlace);
    return nodo;
  }

  // ─── Buscador ───────────────────────────────────────────────────────────
  var TIPOS_INMUEBLE = ['Casa', 'Departamento', 'Oficina', 'Local Comercial', 'Terreno'];

  function construirFiltros() {
    var form = el('form', 'vp-filtros');
    form.setAttribute('role', 'search');
    form.setAttribute('aria-label', 'Buscar propiedades');

    // Texto libre
    var buscador = el('div', 'vp-field');
    buscador.appendChild(svg('lupa'));
    var inputBuscar = document.createElement('input');
    inputBuscar.type = 'search';
    inputBuscar.className = 'vp-input';
    inputBuscar.placeholder = 'Buscar por nombre o descripción...';
    inputBuscar.setAttribute('aria-label', 'Buscar por nombre o descripción');
    inputBuscar.value = state.filtros.q;
    buscador.appendChild(inputBuscar);
    form.appendChild(buscador);

    // Operación
    var selectOperacion = document.createElement('select');
    selectOperacion.className = 'vp-select';
    selectOperacion.setAttribute('aria-label', 'Tipo de operación');
    [['', 'Todas las ops.'], ['venta', 'En Venta'], ['alquiler', 'En Alquiler'], ['alquiler_temporada', 'Renta Vacacional'], ['traspaso', 'Traspaso']]
      .forEach(function (opcion) {
        selectOperacion.appendChild(new Option(opcion[1], opcion[0]));
      });
    selectOperacion.value = state.filtros.operacion || '';
    form.appendChild(selectOperacion);

    // Tipo de inmueble
    var selectTipo = document.createElement('select');
    selectTipo.className = 'vp-select';
    selectTipo.setAttribute('aria-label', 'Tipo de inmueble');
    selectTipo.appendChild(new Option('Todos los tipos', ''));
    TIPOS_INMUEBLE.forEach(function (tipo) {
      selectTipo.appendChild(new Option(tipo, tipo));
    });
    selectTipo.value = state.filtros.tipo || '';
    form.appendChild(selectTipo);

    // Ciudad o zona
    var inputCiudad = document.createElement('input');
    inputCiudad.type = 'text';
    inputCiudad.className = 'vp-input vp-input--ciudad';
    inputCiudad.placeholder = 'Ciudad o zona...';
    inputCiudad.setAttribute('aria-label', 'Ciudad o zona');
    inputCiudad.value = state.filtros.ciudad;
    form.appendChild(inputCiudad);

    // Rango de precio
    var rango = el('div', 'vp-range');
    var minimo = document.createElement('input');
    minimo.type = 'text';
    minimo.inputMode = 'numeric';
    minimo.className = 'vp-input';
    minimo.placeholder = 'Mín';
    minimo.setAttribute('aria-label', 'Precio mínimo');
    minimo.value = state.filtros.minPrecio;
    var maximo = document.createElement('input');
    maximo.type = 'text';
    maximo.inputMode = 'numeric';
    maximo.className = 'vp-input';
    maximo.placeholder = 'Máx';
    maximo.setAttribute('aria-label', 'Precio máximo');
    maximo.value = state.filtros.maxPrecio;
    rango.appendChild(minimo);
    rango.appendChild(el('span', 'vp-range-sep', '—'));
    rango.appendChild(maximo);
    form.appendChild(rango);

    var boton = el('button', 'vp-btn-filtros');
    boton.type = 'submit';
    boton.appendChild(svg('filtro'));
    boton.appendChild(document.createTextNode('Filtrar'));
    form.appendChild(boton);

    form.addEventListener('submit', function (evento) {
      evento.preventDefault();
      state.filtros = {
        q: inputBuscar.value.trim(),
        operacion: selectOperacion.value,
        tipo: selectTipo.value,
        ciudad: inputCiudad.value.trim(),
        minPrecio: minimo.value.replace(/[^\d]/g, ''),
        maxPrecio: maximo.value.replace(/[^\d]/g, ''),
      };
      cargar();
    });

    // La «x» nativa del input type=search también limpia la búsqueda.
    inputBuscar.addEventListener('search', function () {
      if (!inputBuscar.value) {
        state.filtros.q = '';
        cargar();
      }
    });

    return form;
  }

  function construirResumen() {
    var resumen = el('div', 'vp-results');
    var texto = el('span');

    if (state.cargando) {
      texto.textContent = 'Buscando propiedades…';
    } else if (!state.error) {
      var mostradas = state.propiedades.length;
      if (mostradas === state.total) {
        texto.textContent = mostradas === 1 ? '1 propiedad' : mostradas + ' propiedades';
      } else {
        texto.textContent = 'Mostrando ' + mostradas + ' de ' + state.total + ' propiedades';
      }
    }
    resumen.appendChild(texto);

    if (hayFiltros() && !state.cargando) {
      var limpiar = el('button', 'vp-clear', 'Limpiar filtros');
      limpiar.type = 'button';
      limpiar.addEventListener('click', limpiarFiltros);
      resumen.appendChild(limpiar);
    }

    return resumen;
  }

  // ─── Render ─────────────────────────────────────────────────────────────
  function render() {
    if (state.vista === 'detalle') {
      container.textContent = '';
      container.appendChild(construirDetalle());
      return;
    }

    var raiz = el('div', 'vp-root');

    var cabecera = construirCabecera();
    if (cabecera) raiz.appendChild(cabecera);

    if (CONFIG.filtros) {
      raiz.appendChild(construirFiltros());
      raiz.appendChild(construirResumen());
    }

    if (state.cargando) {
      var contenedorCarga = el('div', CONFIG.modo === 'lista' ? 'vp-list' : 'vp-grid');
      contenedorCarga.setAttribute('aria-busy', 'true');
      contenedorCarga.setAttribute('aria-live', 'polite');
      var totalEsqueletos = Math.min(CONFIG.limite, 3);
      for (var i = 0; i < totalEsqueletos; i++) {
        contenedorCarga.appendChild(construirEsqueleto());
      }
      raiz.appendChild(contenedorCarga);
    } else if (state.error) {
      raiz.appendChild(
        construirEstado(
          'error',
          'No pudimos cargar las propiedades',
          'Vuelve a intentarlo en unos segundos.',
          cargar
        )
      );
    } else if (state.propiedades.length === 0) {
      var conFiltros = hayFiltros();
      var vacio = construirEstado(
        'vacio',
        conFiltros ? 'Sin resultados para esa búsqueda' : 'No hay propiedades disponibles',
        conFiltros
          ? 'Prueba con otros filtros, amplía la zona o el rango de precio.'
          : 'Publica una propiedad en tu panel para verla aquí.'
      );
      if (conFiltros) {
        var reiniciar = el('button', 'vp-retry', 'Limpiar filtros');
        reiniciar.type = 'button';
        reiniciar.addEventListener('click', limpiarFiltros);
        vacio.appendChild(reiniciar);
      }
      raiz.appendChild(vacio);
    } else {
      var contenedor = el('div', CONFIG.modo === 'lista' ? 'vp-list' : 'vp-grid');
      state.propiedades.forEach(function (propiedad) {
        contenedor.appendChild(construirTarjeta(propiedad));
      });
      raiz.appendChild(contenedor);
    }

    raiz.appendChild(construirAtribucion());

    container.textContent = '';
    container.appendChild(raiz);
  }

  // ─── Carga ──────────────────────────────────────────────────────────────
  function cargar() {
    state.cargando = true;
    state.error = '';
    render();

    var params = new URLSearchParams();
    params.set('tenantId', CONFIG.tenantId);
    params.set('limite', String(CONFIG.limite));
    params.set('offset', '0');
    if (CONFIG.soloDestacadas) params.set('destacadas', 'true');
    if (CONFIG.estado) params.set('estado', CONFIG.estado);
    if (state.filtros.q) params.set('q', state.filtros.q);
    if (state.filtros.operacion) params.set('operacion', state.filtros.operacion);
    if (state.filtros.tipo) params.set('tipo', state.filtros.tipo);
    if (state.filtros.ciudad) params.set('ciudad', state.filtros.ciudad);
    if (state.filtros.minPrecio) params.set('minPrecio', state.filtros.minPrecio);
    if (state.filtros.maxPrecio) params.set('maxPrecio', state.filtros.maxPrecio);

    fetch(API_ENDPOINT + '?' + params.toString(), {
      headers: { Accept: 'application/json' },
      credentials: 'omit',
    })
      .then(function (respuesta) {
        if (!respuesta.ok) throw new Error('HTTP ' + respuesta.status);
        return respuesta.json();
      })
      .then(function (datos) {
        state.propiedades = Array.isArray(datos.properties) ? datos.properties : [];
        state.total = datos && datos.pagination ? datos.pagination.total : state.propiedades.length;
        state.slug = datos && datos.tenant ? datos.tenant.slug || '' : '';
        state.cargando = false;
        state.error = '';
      })
      .catch(function (error) {
        console.error('[Volkern] Error al cargar propiedades:', error);
        state.propiedades = [];
        state.cargando = false;
        state.error = 'No se pudo conectar con Volkern.';
      })
      .then(function () {
        render();
      });
  }

  inyectarEstilos();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', cargar);
  } else {
    cargar();
  }
})();
