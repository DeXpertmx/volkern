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
  var API_CONTACTO = ORIGIN + '/api/public/real-estate/contact';

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
    // Datos de contacto directo que publica la API para este tenant.
    whatsapp: null,
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

  function importe(valor, moneda, ceros) {
    if ((!valor || valor <= 0) && !ceros) return 'Precio a consultar';
    if (!valor || valor <= 0) valor = 0;
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

/* ── Tarjeta con calculadora ───────────────────────────────── */
${CID} .vp-card-wrap {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
${CID} .vp-card-wrap > .vp-card { flex: 1 1 auto; }
${CID} .vp-card-hipo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 9px 12px;
  border: 1px solid color-mix(in srgb, var(--vp-accent) 35%, var(--vp-border));
  border-radius: 10px;
  background: var(--vp-surface);
  color: var(--vp-accent);
  font: inherit;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.18s ease, border-color 0.18s ease;
}
${CID} .vp-card-hipo:hover {
  background: color-mix(in srgb, var(--vp-accent) 8%, var(--vp-surface));
  border-color: var(--vp-accent);
}
${CID} .vp-card-hipo:focus-visible { outline: 2px solid var(--vp-accent); outline-offset: 2px; }

/* ── Calculadora en diálogo ────────────────────────────────── */
${CID} .vp-modal-hipo {
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  overflow-y: auto;
  padding: 24px 16px;
  background: rgba(15, 23, 42, 0.55);
}
${CID} .vp-modal-hipo-caja {
  position: relative;
  width: 100%;
  max-width: 720px;
  padding: 18px;
  border-radius: 16px;
  background: var(--vp-surface);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.35);
}
${CID} .vp-modal-hipo-cerrar {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 50%;
  background: var(--vp-surface-2);
  color: var(--vp-muted);
  font: inherit;
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
}
${CID} .vp-modal-hipo-cerrar:hover { color: var(--vp-text); }

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
  font-size: clamp(1.3rem, 1.05rem + 1vw, 1.65rem);
  font-weight: 800;
  letter-spacing: -0.01em;
  line-height: 1.25;
}
${CID} .vp-detail-precio { text-align: right; }
${CID} .vp-detail-precio .vp-price { font-size: 1.5rem; }

/* Cabecera y secciones en tarjetas blancas, como la ficha del portal */
${CID} .vp-detail-head {
  padding: 20px 22px;
  border: 1px solid var(--vp-border);
  border-radius: 14px;
  background: var(--vp-surface);
  box-shadow: var(--vp-shadow);
}
${CID} .vp-detail-info {
  display: flex;
  flex: 1 1 260px;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
${CID} .vp-detail-info .vp-loc { margin: 0; }
${CID} .vp-detail-precio-fila {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-top: 14px;
}
${CID} .vp-detail-precio { text-align: left; }
${CID} .vp-detail-precio .vp-price {
  font-size: clamp(1.55rem, 1.15rem + 1.6vw, 2.25rem);
  color: var(--vp-accent);
}
${CID} .vp-detail-tipo { font-size: 0.8rem; color: var(--vp-muted); text-transform: capitalize; }
${CID} .vp-detail-resumen {
  margin: 12px 0 0;
  font-size: 0.92rem;
  line-height: 1.6;
  color: var(--vp-muted);
}
${CID} .vp-card-sec {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px 20px;
  border: 1px solid var(--vp-border);
  border-radius: 14px;
  background: var(--vp-surface);
  box-shadow: var(--vp-shadow);
}
${CID} .vp-features {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(128px, 1fr));
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}
${CID} .vp-feature {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--vp-surface-2);
}
${CID} .vp-feature-ico { flex: none; font-size: 1.15rem; line-height: 1; }
${CID} .vp-feature-txt { display: flex; flex-direction: column; min-width: 0; }
${CID} .vp-feature-label { font-size: 0.7rem; color: var(--vp-muted); }
${CID} .vp-feature-value { font-size: 0.86rem; font-weight: 700; color: var(--vp-text); }
/* Tres columnas en pantallas anchas, como la ficha del portal: con cuatro, los
   rótulos largos («Aire acondicionado») se parten en dos líneas y las fichas
   dejan de tener la misma altura. */
@media (min-width: 560px) {
  ${CID} .vp-features { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
/* La calculadora es una sección más: su panel no repite tarjeta al colgar de una */
${CID} .vp-card-sec > .vp-hipoteca .vp-hipo {
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  padding: 0;
}
@media (max-width: 520px) {
  ${CID} .vp-detail-head { padding: 16px; }
  ${CID} .vp-card-sec { padding: 14px 16px; }
}
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
${CID} .vp-mapa {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--vp-border);
  border-radius: 12px;
  background: var(--vp-surface-2);
  aspect-ratio: 16 / 9;
}
${CID} .vp-mapa iframe {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
}
${CID} .vp-mapa-pie {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin: 8px 0 0;
  font-size: 0.78rem;
  line-height: 1.5;
  color: var(--vp-muted);
}
${CID} .vp-mapa-pie a {
  color: var(--vp-accent);
  font-weight: 600;
  text-decoration: underline;
}
${CID} .vp-escala-fila {
  display: flex;
  gap: 3px;
  margin: 0 0 10px;
  padding: 0;
  list-style: none;
}
${CID} .vp-escala-letra {
  flex: 1;
  padding: 6px 0;
  border-radius: 5px;
  font-size: 0.72rem;
  font-weight: 800;
  text-align: center;
  opacity: 0.5;
}
${CID} .vp-escala-letra.vp-escala-activa {
  opacity: 1;
  box-shadow: inset 0 0 0 2px var(--vp-text), 0 1px 3px rgba(0, 0, 0, 0.2);
}
${CID} .vp-escala-datos {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
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

/* ── Formulario de contacto de la ficha ───────────────────── */
${CID} .vp-contacto {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  border: 1px solid var(--vp-border);
  border-radius: 14px;
  background: var(--vp-surface-2);
}
${CID} .vp-contacto-sub {
  margin: 0;
  font-size: 0.8rem;
  line-height: 1.5;
  color: var(--vp-muted);
}
${CID} .vp-form { display: grid; gap: 10px; }
${CID} .vp-form label {
  display: block;
  margin-bottom: 4px;
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--vp-muted);
}
${CID} .vp-form input[type="text"],
${CID} .vp-form input[type="email"],
${CID} .vp-form input[type="tel"],
${CID} .vp-form textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 9px 11px;
  border: 1px solid var(--vp-border);
  border-radius: 9px;
  background: var(--vp-surface);
  color: var(--vp-text);
  font: inherit;
  font-size: 0.88rem;
}
${CID} .vp-form textarea { min-height: 64px; resize: vertical; }
${CID} .vp-form input:focus,
${CID} .vp-form textarea:focus {
  outline: 2px solid var(--vp-accent);
  outline-offset: 1px;
  border-color: var(--vp-accent);
}
${CID} .vp-check {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 0.74rem;
  font-weight: 500;
  line-height: 1.45;
  color: var(--vp-muted);
}
${CID} .vp-check input { margin: 2px 0 0; accent-color: var(--vp-accent); }
${CID} .vp-enviar {
  padding: 11px 16px;
  border: 0;
  border-radius: 10px;
  background: var(--vp-accent);
  color: var(--vp-contrast);
  font: inherit;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
}
${CID} .vp-enviar:hover:not([disabled]) { opacity: 0.92; }
${CID} .vp-enviar[disabled] { opacity: 0.65; cursor: progress; }
${CID} .vp-form-error {
  margin: 0;
  font-size: 0.8rem;
  line-height: 1.45;
  color: #dc2626;
}
${CID} .vp-form-ok {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid rgba(22, 163, 74, 0.35);
  border-radius: 10px;
  background: rgba(22, 163, 74, 0.1);
  color: #15803d;
  font-size: 0.84rem;
  line-height: 1.5;
}
${CID} .vp-portal-link {
  font-size: 0.75rem;
  color: var(--vp-muted);
  text-align: center;
  text-decoration: underline;
}
${CID} .vp-whatsapp {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  box-sizing: border-box;
  padding: 11px 14px;
  border-radius: 10px;
  background: #0b7a6b;
  color: #ffffff;
  font-size: 0.85rem;
  font-weight: 600;
  text-decoration: none;
  transition: background 0.15s ease;
}
${CID} .vp-whatsapp:hover { background: #096a5d; }
${CID} .vp-whatsapp:focus-visible { outline: 2px solid var(--vp-accent); outline-offset: 2px; }
${CID} .vp-whatsapp svg { width: 18px; height: 18px; flex: 0 0 auto; }
${CID} .vp-hp { position: absolute; left: -9999px; width: 1px; height: 1px; overflow: hidden; }
${CID} .vp-contacto [hidden] { display: none !important; }
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

/* ── Calculadora hipotecaria ──────────────────────────────── */
${CID} .vp-hipoteca {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
${CID} .vp-hipo {
  padding: 18px;
  border: 1px solid var(--vp-border);
  border-radius: 14px;
  background: var(--vp-surface);
  box-shadow: var(--vp-shadow);
}
${CID} .vp-hipo-resumen {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-around;
  gap: 18px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--vp-border);
}
${CID} .vp-hipo-anillo {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 132px;
  height: 132px;
  border-radius: 50%;
  background: var(--vp-border);
}
${CID} .vp-hipo-hueco {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 96px;
  height: 96px;
  border-radius: 50%;
  background: var(--vp-surface);
  text-align: center;
}
${CID} .vp-hipo-total { font-size: 0.98rem; font-weight: 800; letter-spacing: -0.01em; }
${CID} .vp-hipo-total-sub { font-size: 0.68rem; color: var(--vp-muted); }
${CID} .vp-hipo-leyenda {
  flex: 1 1 200px;
  max-width: 260px;
  margin: 0;
  padding: 0;
  list-style: none;
}
${CID} .vp-hipo-leyenda li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 5px 0;
  border-bottom: 1px solid var(--vp-border);
  font-size: 0.82rem;
}
${CID} .vp-hipo-leyenda li:last-child { border-bottom: 0; }
${CID} .vp-hipo-etiqueta {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--vp-muted);
}
${CID} .vp-hipo-punto { flex: 0 0 auto; width: 9px; height: 9px; border-radius: 50%; }
${CID} .vp-hipo-campos {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
  margin-top: 16px;
}
${CID} .vp-hipo-campo label {
  display: block;
  margin-bottom: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--vp-muted);
}
${CID} .vp-hipo-caja {
  display: flex;
  align-items: stretch;
  overflow: hidden;
  border: 1px solid var(--vp-border);
  border-radius: 9px;
  background: var(--vp-surface);
}
${CID} .vp-hipo-unidad {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 30px;
  padding: 0 6px;
  border-right: 1px solid var(--vp-border);
  background: var(--vp-surface-2);
  color: var(--vp-muted);
  font-size: 0.72rem;
}
${CID} .vp-hipo-input {
  width: 100%;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--vp-border);
  border-radius: 9px;
  background: var(--vp-surface);
  color: var(--vp-text);
  font: inherit;
  font-size: 0.85rem;
}
${CID} .vp-hipo-caja .vp-hipo-input { border: 0; border-radius: 0; }
${CID} .vp-hipo-input:focus-visible { outline: 2px solid var(--vp-accent); outline-offset: 1px; }
${CID} .vp-hipo-acciones {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
}
${CID} .vp-hipo-btn {
  padding: 9px 20px;
  border: 0;
  border-radius: 9px;
  background: var(--vp-accent);
  color: var(--vp-contrast);
  font: inherit;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
}
${CID} .vp-hipo-btn:hover { opacity: 0.92; }
${CID} .vp-hipo-nota { margin: 0; font-size: 0.75rem; color: var(--vp-muted); }
${CID} .vp-hipo-aviso {
  margin: 10px 0 0;
  font-size: 0.7rem;
  line-height: 1.5;
  color: var(--vp-muted);
}

/* ── Móvil ───────────────────────────────────────────────── */
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
  /* El tamaño del precio lo fija su clamp; un valor fijo aquí lo pisaba. */
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

    // El botón de la calculadora no puede ir dentro del enlace de la tarjeta
    // (dos elementos interactivos anidados): la tarjeta se envuelve y el botón
    // queda debajo, como parte de la misma pieza.
    var envoltorio = el('div', 'vp-card-wrap');
    envoltorio.appendChild(tarjeta);

    var hipoteca = construirBotonHipoteca(propiedad);
    if (hipoteca) envoltorio.appendChild(hipoteca);

    return envoltorio;
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

  var LETRAS_ENERGIA = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

  /**
   * Escala A–G con la clase del inmueble marcada, más sus índices.
   * La ficha del widget solo enseñaba la letra suelta («C»), que no dice si
   * eso es bueno o malo: la calificación se lee comparándola con la escala.
   */
  function construirEscalaEnergetica(propiedad) {
    var clase = String(propiedad.energyCert || '').trim().toUpperCase();
    if (!ENERGIA[clase]) return null;

    var bloque = el('div', 'vp-escala');
    var fila = el('ul', 'vp-escala-fila');
    LETRAS_ENERGIA.forEach(function (letra) {
      var color = ENERGIA[letra];
      var item = el('li', 'vp-escala-letra', letra);
      item.style.background = color.fondo;
      item.style.color = color.texto;
      if (letra === clase) {
        item.className += ' vp-escala-activa';
        item.setAttribute('aria-current', 'true');
        item.title = 'Clase energética ' + letra;
      }
      fila.appendChild(item);
    });
    bloque.appendChild(fila);

    var datos = [];
    if (propiedad.energyCertConsumption != null) {
      datos.push(['Consumo', propiedad.energyCertConsumption + ' kWh/m²·año']);
    }
    if (propiedad.energyCertEmission != null) {
      datos.push(['Emisiones', propiedad.energyCertEmission + ' kg CO₂/m²·año']);
    }
    if (propiedad.energyCertBody) {
      datos.push(['Organismo', String(propiedad.energyCertBody)]);
    }
    if (propiedad.energyCertExpiry) {
      datos.push(['Válido hasta', String(propiedad.energyCertExpiry)]);
    }
    if (datos.length > 0) {
      var lista = el('ul', 'vp-escala-datos');
      datos.forEach(function (par) {
        lista.appendChild(fichaDato(par[0], par[1]));
      });
      bloque.appendChild(lista);
    }

    return bloque;
  }

  // ─── Mapa de la ubicación ───────────────────────────────────────────────
  // OpenStreetMap incrustado: no necesita clave ni librerías y respeta el
  // ancho del contenedor. Solo se dibuja si el inmueble tiene coordenadas.
  function construirMapa(propiedad) {
    var lat = Number(propiedad.lat);
    var lng = Number(propiedad.lng);
    if (!isFinite(lat) || !isFinite(lng)) return null;
    if (lat === 0 && lng === 0) return null;

    // Redondeo a 5 decimales: la resta de flotantes dejaba bbox con
    // artefactos del tipo -87.09469999999999.
    var redondear = function (n) { return Number(n.toFixed(5)); };
    var margen = 0.01;
    var bbox = [
      redondear(lng - margen), redondear(lat - margen),
      redondear(lng + margen), redondear(lat + margen),
    ].join(',');
    var punto = redondear(lat) + ',' + redondear(lng);

    var bloque = el('div');
    var marco = el('div', 'vp-mapa');
    var mapa = document.createElement('iframe');
    mapa.setAttribute('title', 'Ubicación de ' + (propiedad.nombre || 'la propiedad'));
    mapa.setAttribute('loading', 'lazy');
    mapa.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
    mapa.src =
      'https://www.openstreetmap.org/export/embed.html?bbox=' + bbox +
      '&layer=mapnik&marker=' + punto;
    marco.appendChild(mapa);
    bloque.appendChild(marco);

    var pie = el('p', 'vp-mapa-pie');
    var lugar = [propiedad.address, propiedad.city].filter(Boolean).join(', ');
    pie.appendChild(document.createTextNode(lugar || 'Ubicación del inmueble'));

    var enlace = el('a', null, 'Ver en el mapa');
    enlace.href =
      'https://www.openstreetmap.org/?mlat=' + redondear(lat) + '&mlon=' + redondear(lng) +
      '#map=16/' + redondear(lat) + '/' + redondear(lng);
    enlace.target = '_blank';
    enlace.rel = 'noopener noreferrer';
    pie.appendChild(enlace);
    bloque.appendChild(pie);

    return bloque;
  }

  function fichaDato(etiqueta, valor) {
    var nodo = el('li', 'vp-ficha');
    nodo.appendChild(el('span', null, etiqueta));
    nodo.appendChild(el('strong', null, valor));
    return nodo;
  }

  // ─── Formulario de contacto de la ficha ─────────────────────────────────
  function construirCampo(sufijo, etiqueta, tipo, nombre, opciones) {
    var envoltorio = el('div');
    var id = 'vp-' + nombre + '-' + sufijo;
    var label = el('label', null, etiqueta);
    label.setAttribute('for', id);
    envoltorio.appendChild(label);

    var campo;
    if (tipo === 'textarea') {
      campo = document.createElement('textarea');
      campo.rows = 3;
    } else {
      campo = document.createElement('input');
      campo.type = tipo;
    }
    campo.id = id;
    campo.name = nombre;
    if (opciones && opciones.placeholder) campo.placeholder = opciones.placeholder;
    if (opciones && opciones.autocomplete) campo.autocomplete = opciones.autocomplete;
    if (opciones && opciones.requerido) campo.required = true;

    envoltorio.appendChild(campo);
    return { envoltorio: envoltorio, campo: campo };
  }

  function construirContacto(propiedad) {
    var bloque = el('div', 'vp-contacto');
    bloque.appendChild(el('h4', 'vp-detalle-h', 'Solicitar información'));
    bloque.appendChild(
      el('p', 'vp-contacto-sub', 'Déjanos tus datos y te respondemos sobre este inmueble.')
    );

    var sufijo = String(propiedad.id || 'inmueble').replace(/[^a-zA-Z0-9_-]/g, '');

    var nombre = construirCampo(sufijo, 'Nombre *', 'text', 'nombre', {
      placeholder: 'Tu nombre',
      autocomplete: 'name',
      requerido: true,
    });
    var email = construirCampo(sufijo, 'Email *', 'email', 'email', {
      placeholder: 'tu@email.com',
      autocomplete: 'email',
      requerido: true,
    });
    var telefono = construirCampo(sufijo, 'Teléfono', 'tel', 'telefono', {
      placeholder: '+34 600 000 000',
      autocomplete: 'tel',
    });
    var mensaje = construirCampo(sufijo, 'Mensaje', 'textarea', 'mensaje', {
      placeholder: '¿Quieres visitarla, saber más detalles…?',
    });

    var form = el('form', 'vp-form');
    form.appendChild(nombre.envoltorio);
    form.appendChild(email.envoltorio);
    form.appendChild(telefono.envoltorio);
    form.appendChild(mensaje.envoltorio);

    var consentimiento = el('label', 'vp-check');
    var casilla = document.createElement('input');
    casilla.type = 'checkbox';
    casilla.name = 'consentimiento';
    casilla.required = true;
    consentimiento.appendChild(casilla);
    consentimiento.appendChild(
      document.createTextNode('Acepto que me contacten por teléfono o email sobre esta propiedad.')
    );
    form.appendChild(consentimiento);

    // Campo trampa: los bots lo rellenan, las personas no lo ven.
    var trampa = el('div', 'vp-hp');
    trampa.setAttribute('aria-hidden', 'true');
    var trampaCampo = document.createElement('input');
    trampaCampo.type = 'text';
    trampaCampo.name = 'website';
    trampaCampo.tabIndex = -1;
    trampaCampo.autocomplete = 'off';
    trampa.appendChild(trampaCampo);
    form.appendChild(trampa);

    var boton = el('button', 'vp-enviar', 'Enviar consulta');
    boton.type = 'submit';
    form.appendChild(boton);

    var error = el('p', 'vp-form-error');
    error.hidden = true;
    error.setAttribute('role', 'alert');
    form.appendChild(error);

    var exito = el(
      'p',
      'vp-form-ok',
      '¡Gracias! Hemos recibido tu consulta y te contactaremos en breve.'
    );
    exito.hidden = true;
    exito.setAttribute('role', 'status');

    var enlace = el('a', 'vp-portal-link', 'Ver la ficha completa en el portal');
    enlace.href = urlDetalle(propiedad.id);
    enlace.target = '_blank';
    enlace.rel = 'noopener noreferrer';

    form.addEventListener('submit', function (evento) {
      evento.preventDefault();
      if (boton.disabled) return;

      error.hidden = true;

      // Bot: se le responde como si todo hubiera ido bien y no se envía nada.
      if (trampaCampo.value.trim() !== '') {
        form.hidden = true;
        exito.hidden = false;
        return;
      }

      boton.disabled = true;
      boton.textContent = 'Enviando…';

      fetch(API_CONTACTO, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'omit',
        body: JSON.stringify({
          slug: state.slug || '',
          tenantId: CONFIG.tenantId,
          propertyId: propiedad.id,
          name: nombre.campo.value.trim(),
          email: email.campo.value.trim(),
          phone: telefono.campo.value.trim(),
          message:
            mensaje.campo.value.trim() ||
            'Solicita información sobre ' + (propiedad.nombre || 'el inmueble') + '.',
          consent: true,
          // Marca el origen: el endpoint avisa al equipo por email solo con
          // los leads que llegan desde este widget.
          origen: 'widget',
        }),
      })
        .then(function (respuesta) {
          if (respuesta.ok) return respuesta.json();
          return respuesta
            .json()
            .catch(function () {
              return {};
            })
            .then(function (cuerpo) {
              throw new Error(cuerpo.error || 'No se pudo enviar la consulta.');
            });
        })
        .then(function () {
          form.reset();
          form.hidden = true;
          exito.hidden = false;
          boton.textContent = 'Enviar consulta';
        })
        .catch(function (fallo) {
          boton.disabled = false;
          boton.textContent = 'Enviar consulta';
          error.textContent =
            (fallo && fallo.message) || 'No se pudo enviar la consulta. Inténtalo de nuevo.';
          error.hidden = false;
        });
    });

    bloque.appendChild(form);
    bloque.appendChild(exito);

    // Acceso directo por WhatsApp justo debajo del formulario.
    var botonWhatsapp = construirBotonWhatsapp(propiedad);
    if (botonWhatsapp) bloque.appendChild(botonWhatsapp);

    bloque.appendChild(enlace);
    return bloque;
  }

  // ─── Contacto directo por WhatsApp ──────────────────────────────────────
  // Solo aparece si el negocio tiene un número conectado y no ha apagado el
  // botón desde su panel; la API pública decide ambos extremos.
  function iconoWhatsapp() {
    var NS = 'http://www.w3.org/2000/svg';
    var nodo = document.createElementNS(NS, 'svg');
    nodo.setAttribute('viewBox', '0 0 24 24');
    nodo.setAttribute('fill', 'none');
    nodo.setAttribute('stroke', 'currentColor');
    nodo.setAttribute('stroke-width', '1.7');
    nodo.setAttribute('stroke-linecap', 'round');
    nodo.setAttribute('stroke-linejoin', 'round');
    nodo.setAttribute('aria-hidden', 'true');
    nodo.setAttribute('focusable', 'false');

    var globo = document.createElementNS(NS, 'path');
    globo.setAttribute(
      'd',
      'M20.5 11.6a8.4 8.4 0 0 1-12.4 7.4L3 20.5l1.5-4.9a8.4 8.4 0 1 1 16 0Z'
    );
    nodo.appendChild(globo);

    var auricular = document.createElementNS(NS, 'path');
    auricular.setAttribute(
      'd',
      'M8.6 8.3c.2-.5.5-.5.8-.5h.4c.2 0 .4 0 .5.4l.7 1.6c.1.2 0 .4-.1.6l-.5.6c-.1.2-.1.4 0 .6.5.8 1.2 1.4 2 1.8.2.1.4.1.6-.1l.6-.7c.2-.2.3-.2.5-.1l1.5.7c.2.1.3.2.3.4v.5c0 .6-.5 1.1-1.1 1.2-.5.1-1.1 0-1.9-.3-1.6-.6-2.9-1.9-3.5-3.4-.3-.7-.4-1.3-.3-1.9 0-.3.1-.5.2-.6Z'
    );
    nodo.appendChild(auricular);
    return nodo;
  }

  // Referencia con la que el asesor identifica el inmueble en el CRM. Misma
  // regla que el servidor (lib/real-estate/referencia.ts): SKU del catálogo y,
  // si no hay, un código estable derivado del id.
  function referenciaDe(propiedad) {
    if (!propiedad) return '';
    if (propiedad.sku && String(propiedad.sku).trim()) return String(propiedad.sku).trim();
    var campos = propiedad.customFieldValues || {};
    if (campos.referencia) return String(campos.referencia).trim();
    var meta = propiedad.metadata || {};
    if (meta.referencia) return String(meta.referencia).trim();
    if (!propiedad.id) return '';
    return 'REF-' + String(propiedad.id).slice(-6).toUpperCase();
  }

  function construirBotonWhatsapp(propiedad) {
    var whatsapp = state.whatsapp;
    if (!whatsapp || !whatsapp.activo || !whatsapp.numero) return null;

    var nombre = propiedad && propiedad.nombre ? propiedad.nombre : 'esta propiedad';
    // La referencia va en el mensaje: es lo único que viaja con el «hola» del
    // visitante hasta el CRM, donde el webhook la guarda en el lead.
    var referencia = referenciaDe(propiedad);
    var texto =
      'Hola, me interesa ' +
      nombre +
      (referencia ? ' (Ref: ' + referencia + ')' : '') +
      '. ¿Sigue disponible?';

    var enlace = el('a', 'vp-whatsapp');
    enlace.href = 'https://wa.me/' + whatsapp.numero + '?text=' + encodeURIComponent(texto);
    enlace.target = '_blank';
    enlace.rel = 'noopener noreferrer';
    enlace.setAttribute('aria-label', 'Contactar por WhatsApp sobre ' + nombre);
    enlace.appendChild(iconoWhatsapp());
    enlace.appendChild(document.createTextNode('Contactar por WhatsApp'));
    return enlace;
  }

  // ─── Calculadora hipotecaria (solo venta) ──────────────────────────────
  // Misma fórmula que la ficha del portal —sistema francés, cuota constante—
  // para que el visitante vea la misma mensualidad aquí y allí. Solo se pinta
  // en inmuebles en venta con precio publicado: un alquiler no tiene hipoteca.
  function calcularHipoteca(datos) {
    var precio = Number(datos.precio) > 0 ? Number(datos.precio) : 0;
    var aportacion = Number(datos.aportacion) > 0 ? Number(datos.aportacion) : 0;
    var principal = Math.max(precio - Math.min(aportacion, precio), 0);
    var anios = Number(datos.anios) > 0 ? Number(datos.anios) : 1;
    var meses = Math.round(anios * 12);
    var interes = Number(datos.interes) > 0 ? Number(datos.interes) : 0;
    var vinculaciones = Number(datos.vinculaciones) > 0 ? Number(datos.vinculaciones) : 0;
    var seguros = Number(datos.seguros) > 0 ? Number(datos.seguros) : 0;
    var tipo = interes / 100 / 12;
    var cuota = 0;

    if (principal > 0) {
      cuota = tipo === 0
        ? principal / meses
        : (principal * tipo) / (1 - Math.pow(1 + tipo, -meses));
    }
    cuota = Math.round(cuota * 100) / 100;

    return {
      cuota: cuota,
      intereses: Math.round(Math.max(cuota * meses - principal, 0)),
      vinculaciones: vinculaciones,
      seguros: seguros,
      total: cuota + vinculaciones + seguros,
    };
  }

  function construirCalculadoraHipotecaria(propiedad) {
    if (!propiedad || propiedad.operationType !== 'venta') return null;
    var precio = Number(propiedad.precioBase) || 0;
    if (precio <= 0) return null;

    var moneda = CONFIG.moneda || propiedad.moneda;

    var bloque = el('div', 'vp-hipoteca');
    bloque.appendChild(el('h4', 'vp-detalle-h', 'Calculadora hipotecaria'));

    var panel = el('div', 'vp-hipo');
    var resumen = el('div', 'vp-hipo-resumen');

    var anillo = el('div', 'vp-hipo-anillo');
    var hueco = el('div', 'vp-hipo-hueco');
    var totalTexto = el('strong', 'vp-hipo-total', '');
    hueco.appendChild(totalTexto);
    hueco.appendChild(el('span', 'vp-hipo-total-sub', 'Mensuales'));
    anillo.appendChild(hueco);
    resumen.appendChild(anillo);

    var leyenda = el('ul', 'vp-hipo-leyenda');
    var valores = {};
    [
      ['capital', 'Capital + intereses', CONFIG.color],
      ['vinculaciones', 'Vinculaciones', '#7dd3fc'],
      ['seguros', 'Seguros', '#fcd34d'],
    ].forEach(function (fila) {
      var li = el('li');
      var etiqueta = el('span', 'vp-hipo-etiqueta');
      var punto = el('span', 'vp-hipo-punto');
      punto.style.background = fila[2];
      etiqueta.appendChild(punto);
      etiqueta.appendChild(document.createTextNode(fila[1]));
      var valor = el('strong', null, '');
      valores[fila[0]] = valor;
      li.appendChild(etiqueta);
      li.appendChild(valor);
      leyenda.appendChild(li);
    });
    resumen.appendChild(leyenda);
    panel.appendChild(resumen);

    var form = el('form', 'vp-hipo-form');
    var rejilla = el('div', 'vp-hipo-campos');
    var sufijoId = String(propiedad.id || 'inmueble').replace(/[^a-zA-Z0-9_-]/g, '');

    function campo(nombre, etiqueta, valor, paso, unidad) {
      var id = 'vp-hipo-' + nombre + '-' + sufijoId;
      var envoltorio = el('div', 'vp-hipo-campo');
      var label = el('label', null, etiqueta);
      label.setAttribute('for', id);
      envoltorio.appendChild(label);

      var input = document.createElement('input');
      input.type = 'number';
      input.id = id;
      input.name = nombre;
      input.min = '0';
      input.step = paso;
      input.value = String(valor);
      input.className = 'vp-hipo-input';

      if (unidad) {
        var caja = el('div', 'vp-hipo-caja');
        caja.appendChild(el('span', 'vp-hipo-unidad', unidad));
        caja.appendChild(input);
        envoltorio.appendChild(caja);
      } else {
        envoltorio.appendChild(input);
      }

      rejilla.appendChild(envoltorio);
      return input;
    }

    // El tipo de partida lo calcula el servidor según la divisa del inmueble y
    // llega en la ficha: el widget no escribe códigos de divisa.
    var interes = Number(propiedad.interesHipotecario);
    if (!(interes > 0)) interes = 3;

    var campos = {
      precio: campo('precio', 'Precio inmueble', precio, '1000', ''),
      aportacion: campo('aportacion', 'Aportación inicial', Math.round(precio * 0.2), '1000', ''),
      interes: campo('interes', 'Interés', interes, '0.1', '%'),
      anios: campo('anios', 'Años a pagar', 30, '1', ''),
      vinculaciones: campo('vinculaciones', 'Vinculaciones', 0, '10', ''),
      seguros: campo('seguros', 'Seguros', 0, '10', ''),
    };

    form.appendChild(rejilla);

    var acciones = el('div', 'vp-hipo-acciones');
    var boton = el('button', 'vp-hipo-btn', 'Calcular');
    boton.type = 'submit';
    acciones.appendChild(boton);
    var interesesTexto = el('p', 'vp-hipo-nota', '');
    acciones.appendChild(interesesTexto);
    form.appendChild(acciones);
    form.appendChild(
      el('p', 'vp-hipo-aviso', 'Estimación orientativa: no incluye impuestos, gastos ni comisiones.')
    );

    function pintar() {
      var resultado = calcularHipoteca({
        precio: campos.precio.value,
        aportacion: campos.aportacion.value,
        interes: campos.interes.value,
        anios: campos.anios.value,
        vinculaciones: campos.vinculaciones.value,
        seguros: campos.seguros.value,
      });

      var total = resultado.total;
      var parte = function (valor) {
        return total > 0 ? (valor / total) * 100 : 0;
      };
      var capital = parte(resultado.cuota);
      var vinculaciones = parte(resultado.vinculaciones);

      totalTexto.textContent = importe(total, moneda, true);
      valores.capital.textContent = importe(resultado.cuota, moneda, true);
      valores.vinculaciones.textContent = importe(resultado.vinculaciones, moneda, true);
      valores.seguros.textContent = importe(resultado.seguros, moneda, true);
      interesesTexto.textContent = 'Intereses totales: ' + importe(resultado.intereses, moneda, true);

      anillo.style.background = total > 0
        ? 'conic-gradient(' + CONFIG.color + ' 0 ' + capital + '%, #7dd3fc ' + capital + '% ' +
          (capital + vinculaciones) + '%, #fcd34d ' + (capital + vinculaciones) + '% 100%)'
        : 'var(--vp-border)';
    }

    form.addEventListener('submit', function (evento) {
      evento.preventDefault();
      pintar();
    });

    pintar();
    panel.appendChild(form);
    bloque.appendChild(panel);

    return bloque;
  }

  /**
   * Botón de la tarjeta que abre la calculadora con el precio de ese inmueble.
   * Solo en venta con precio: un alquiler no tiene hipoteca que calcular.
   */
  function construirBotonHipoteca(propiedad) {
    if (!propiedad || propiedad.operationType !== 'venta') return null;
    if (!(Number(propiedad.precioBase) > 0)) return null;

    var boton = el('button', 'vp-card-hipo', 'Calcular hipoteca');
    boton.type = 'button';
    boton.setAttribute(
      'aria-label',
      'Calcular hipoteca de ' + (propiedad.nombre || 'la propiedad')
    );
    boton.addEventListener('click', function (evento) {
      evento.preventDefault();
      evento.stopPropagation();
      abrirCalculadoraHipoteca(propiedad);
    });
    return boton;
  }

  // Diálogo de la calculadora abierto desde una tarjeta. Se cuelga del propio
  // contenedor para heredar el CSS del widget y no tocar el documento del sitio
  // que lo embebe.
  var modalHipoteca = null;

  function cerrarCalculadoraHipoteca() {
    if (!modalHipoteca) return;
    if (modalHipoteca.parentNode) modalHipoteca.parentNode.removeChild(modalHipoteca);
    modalHipoteca = null;
    document.removeEventListener('keydown', alPulsarEscapeHipoteca);
  }

  function alPulsarEscapeHipoteca(evento) {
    if (evento.key !== 'Escape') return;
    // La ficha del widget también escucha Escape: con la calculadora abierta,
    // cerrar lo de abajo sería desconcertante.
    evento.stopPropagation();
    cerrarCalculadoraHipoteca();
  }

  function abrirCalculadoraHipoteca(propiedad) {
    var bloque = construirCalculadoraHipotecaria(propiedad);
    if (!bloque) return;
    cerrarCalculadoraHipoteca();

    var capa = el('div', 'vp-modal-hipo');
    capa.setAttribute('role', 'dialog');
    capa.setAttribute('aria-modal', 'true');
    capa.setAttribute(
      'aria-label',
      'Calculadora hipotecaria de ' + (propiedad.nombre || 'la propiedad')
    );
    capa.addEventListener('click', function (evento) {
      if (evento.target === capa) cerrarCalculadoraHipoteca();
    });

    var caja = el('div', 'vp-modal-hipo-caja');
    var cerrar = el('button', 'vp-modal-hipo-cerrar', '✕');
    cerrar.type = 'button';
    cerrar.setAttribute('aria-label', 'Cerrar calculadora');
    cerrar.addEventListener('click', cerrarCalculadoraHipoteca);
    caja.appendChild(cerrar);
    caja.appendChild(bloque);
    capa.appendChild(caja);

    container.appendChild(capa);
    modalHipoteca = capa;
    document.addEventListener('keydown', alPulsarEscapeHipoteca);
    if (cerrar.focus) cerrar.focus();
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

    // Cabecera en tarjeta, con la jerarquía de la ficha del portal: título,
    // ubicación, precio grande en color de marca con el tipo a la derecha y el
    // resumen debajo. Antes era texto suelto sobre el fondo y no se leía como
    // una ficha.
    var cabecera = el('div', 'vp-detail-head');
    var bloqueTitulo = el('div', 'vp-detail-info');
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

    var filaPrecio = el('div', 'vp-detail-precio-fila');
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
    filaPrecio.appendChild(bloquePrecio);
    if (propiedad.propertyType) {
      filaPrecio.appendChild(el('span', 'vp-detail-tipo', etiquetaTipo(propiedad.propertyType)));
    }
    bloqueTitulo.appendChild(filaPrecio);

    var resumen = String(propiedad.descripcion || '').trim();
    if (resumen) bloqueTitulo.appendChild(el('p', 'vp-detail-resumen', resumen));

    cabecera.appendChild(bloqueTitulo);
    raiz.appendChild(cabecera);

    // Descripción
    var grid = el('div', 'vp-detalle-grid');
    var principal = el('div', 'vp-detalle-col');

    var texto = String(propiedad.longDescription || '').trim();
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
      var seccionDesc = el('section', 'vp-card-sec');
      seccionDesc.appendChild(el('h4', 'vp-detalle-h', 'Descripción'));
      seccionDesc.appendChild(bloqueDesc);
      principal.appendChild(seccionDesc);
    }

    // Características como fichas con icono, rótulo y valor, igual que en la
    // ficha del portal. Los chips sueltos de antes decían «Piscina» o «Jardín»
    // pero no cuánto medía ni cuántas habitaciones tenía: eso vivía en otra
    // lista aparte y obligaba a cruzar dos bloques para entender el inmueble.
    var rasgos = [];
    function rasgo(icono, etiqueta, valor) {
      if (valor === null || valor === undefined || valor === '') return;
      rasgos.push([icono, etiqueta, String(valor)]);
    }
    rasgo('📐', 'Superficie', propiedad.areaM2 ? propiedad.areaM2 + ' m²' : '');
    rasgo('🏗️', 'Construidos', propiedad.builtM2 ? propiedad.builtM2 + ' m²' : '');
    rasgo('🛏️', 'Habitaciones', propiedad.bedrooms);
    rasgo('🚿', 'Baños', propiedad.bathrooms);
    rasgo('🚗', 'Estacionamientos', propiedad.parking);
    rasgo('📅', 'Antigüedad', propiedad.yearBuilt ? propiedad.yearBuilt + ' años' : '');
    rasgo('🧭', 'Orientación', propiedad.orientation);
    rasgo('🏊', 'Alberca', propiedad.hasPool ? 'Sí' : '');
    rasgo('🌳', 'Jardín', propiedad.hasGarden ? 'Sí' : '');
    rasgo('🌤️', 'Terraza', propiedad.hasTerrace ? 'Sí' : '');
    rasgo('🪟', 'Balcón', propiedad.hasBalcony ? 'Sí' : '');
    rasgo('🛗', 'Ascensor', propiedad.hasElevator ? 'Sí' : '');
    rasgo('📦', 'Trastero', propiedad.hasStorageRoom ? 'Sí' : '');
    rasgo('🅿️', 'Parking', propiedad.hasParking ? 'Sí' : '');
    rasgo('🛋️', 'Amueblado', propiedad.furnished ? 'Sí' : '');
    rasgo('❄️', 'Aire acondicionado', propiedad.hasAirConditioning ? 'Sí' : '');
    rasgo('🔥', 'Calefacción', propiedad.hasHeating ? 'Sí' : '');

    // Los servicios del editor van aparte: son etiquetas, no datos con valor.
    var servicios = Array.isArray(propiedad.servicios)
      ? propiedad.servicios
          .filter(function (servicio) {
            return typeof servicio === 'string' && servicio.trim();
          })
          .map(function (servicio) {
            return etiquetaTipo(servicio.trim());
          })
      : [];

    if (rasgos.length > 0) {
      var seccionRasgos = el('section', 'vp-card-sec');
      seccionRasgos.appendChild(el('h4', 'vp-detalle-h', 'Características'));
      var rejillaRasgos = el('ul', 'vp-features');
      rasgos.forEach(function (dato) {
        var item = el('li', 'vp-feature');
        item.appendChild(el('span', 'vp-feature-ico', dato[0]));
        var textoRasgo = el('span', 'vp-feature-txt');
        textoRasgo.appendChild(el('span', 'vp-feature-label', dato[1]));
        textoRasgo.appendChild(el('span', 'vp-feature-value', dato[2]));
        item.appendChild(textoRasgo);
        rejillaRasgos.appendChild(item);
      });
      seccionRasgos.appendChild(rejillaRasgos);
      principal.appendChild(seccionRasgos);
    }

    if (servicios.length > 0) {
      var seccionServicios = el('section', 'vp-card-sec');
      seccionServicios.appendChild(el('h4', 'vp-detalle-h', 'Servicios y equipamiento'));
      var chips = el('ul', 'vp-chips');
      servicios.forEach(function (servicio) {
        chips.appendChild(el('li', 'vp-chip', servicio));
      });
      seccionServicios.appendChild(chips);
      principal.appendChild(seccionServicios);
    }

    // Calificación energética: escala A–G con la clase del inmueble marcada.
    var escala = construirEscalaEnergetica(propiedad);
    if (escala) {
      var seccionEnergia = el('section', 'vp-card-sec');
      seccionEnergia.appendChild(el('h4', 'vp-detalle-h', 'Calificación energética'));
      seccionEnergia.appendChild(escala);
      principal.appendChild(seccionEnergia);
    }

    // Ubicación: mapa con las coordenadas del inmueble, si las tiene.
    var mapa = construirMapa(propiedad);
    if (mapa) {
      var seccionMapa = el('section', 'vp-card-sec');
      seccionMapa.appendChild(el('h4', 'vp-detalle-h', 'Ubicación'));
      seccionMapa.appendChild(mapa);
      principal.appendChild(seccionMapa);
    }

    grid.appendChild(principal);

    // Contacto
    var lateral = el('div', 'vp-detalle-col');
    lateral.appendChild(construirContacto(propiedad));

    grid.appendChild(lateral);
    raiz.appendChild(grid);

    // La calculadora cierra la ficha, no la abre: llegados aquí el visitante ya
    // vio fotos, datos y mapa, y en el móvil deja de empujar el contenido hacia
    // abajo antes de que haya leído nada.
    var calculadora = construirCalculadoraHipotecaria(propiedad);
    if (calculadora) {
      // Va en la misma tarjeta que el resto de secciones; el panel de dentro
      // deja de dibujar la suya para no encajonar una tarjeta en otra.
      var seccionCalc = el('section', 'vp-card-sec');
      seccionCalc.appendChild(calculadora);
      raiz.appendChild(seccionCalc);
    }

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
    // Un repintado se lleva por delante el nodo del diálogo: se cierra antes de
    // vaciar el contenedor en vez de quedarse con una referencia muerta.
    cerrarCalculadoraHipoteca();

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
        state.whatsapp =
          datos && datos.tenant && datos.tenant.whatsapp ? datos.tenant.whatsapp : null;
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
