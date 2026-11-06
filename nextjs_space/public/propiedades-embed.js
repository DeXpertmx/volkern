/**
 * Volkern Real Estate - Widget de Propiedades Embebible
 *
 * Uso:
 * <script
 *   src="https://volkern.app/propiedades-embed.js"
 *   data-tenant-id="TU_TENANT_ID"
 *   data-container-id="volkern-propiedades"
 *   data-titulo="Nuestras propiedades"
 *   data-color="#2563eb"
 *   data-limite="12"
 *   data-modo="grid"
 *   data-solo-destacadas="false"
 * ></script>
 * <div id="volkern-propiedades"></div>
 */

(function () {
  'use strict';

  // ─── Configuración ────────────────────────────────────────────────────────
  const API_BASE = 'https://volkern.app/api/public/real-estate/propiedades';

  const scriptTag =
    document.currentScript ||
    document.querySelector('script[data-tenant-id]');

  const tenantId = scriptTag?.getAttribute('data-tenant-id');
  const containerId =
    scriptTag?.getAttribute('data-container-id') || 'volkern-propiedades';
  const titulo = scriptTag?.getAttribute('data-titulo') || 'Propiedades';
  const color = scriptTag?.getAttribute('data-color') || '#2563eb';
  const limite = parseInt(scriptTag?.getAttribute('data-limite') || '12', 10);
  const modo = scriptTag?.getAttribute('data-modo') || 'grid'; // grid | lista
  const soloDestacadas =
    scriptTag?.getAttribute('data-solo-destacadas') === 'true';
  const moneda = scriptTag?.getAttribute('data-moneda') || null;

  if (!tenantId) {
    console.error(
      'Volkern Propiedades: data-tenant-id es requerido'
    );
    return;
  }

  // ─── Estado ───────────────────────────────────────────────────────────────
  let properties = [];
  let container = document.getElementById(containerId);

  if (!container) {
    container = document.createElement('div');
    container.id = containerId;
    document.body.appendChild(container);
  }

  // ─── Utilidades ───────────────────────────────────────────────────────────
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function formatearImporte(valor, monedaCod) {
    if (!valor && valor !== 0) return 'Consultar precio';
    try {
      return new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency: monedaCod || 'EUR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(valor);
    } catch (e) {
      return valor.toString() + ' ' + (monedaCod || '');
    }
  }

  function getImagen(property) {
    if (Array.isArray(property.media) && property.media.length > 0) {
      const first = property.media[0];
      if (typeof first === 'string') return first;
      if (first && first.url) return first.url;
    }
    return null;
  }

  function getEstadoTexto(status) {
    const map = {
      disponible: 'Disponible',
      reservada: 'Reservada',
      vendida: 'Vendida',
      alquilada: 'Alquilada',
    };
    return map[status] || status || '—';
  }

  function getEstadoColor(status) {
    const map = {
      disponible: '#10b981',
      reservada: '#f59e0b',
      vendida: '#10b981',
      alquilada: '#3b82f6',
    };
    return map[status] || '#6b7280';
  }

  // ─── Estilos CSS ──────────────────────────────────────────────────────────
  const styles = `
    #${containerId} {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      color: #1f2937;
    }

    #${containerId} .volkern-prop-titulo {
      font-size: 1.5rem;
      font-weight: 700;
      margin-bottom: 1rem;
      color: ${color};
    }

    #${containerId} .volkern-prop-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 1.5rem;
    }

    #${containerId} .volkern-prop-lista {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    #${containerId} .volkern-prop-card {
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      overflow: hidden;
      background: white;
      transition: transform 0.2s, box-shadow 0.2s;
      display: flex;
      flex-direction: column;
    }

    #${containerId} .volkern-prop-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 10px 25px rgba(0,0,0,0.1);
    }

    #${containerId} .volkern-prop-card.imagen {
      aspect-ratio: 4 / 3;
      background: #f3f4f6;
      position: relative;
    }

    #${containerId} .volkern-prop-card.imagen img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    #${containerId} .volkern-prop-card.imagen .volkern-prop-placeholder {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #9ca3af;
      font-size: 2rem;
    }

    #${containerId} .volkern-prop-card.imagen .volkern-prop-estado {
      position: absolute;
      top: 0.5rem;
      right: 0.5rem;
      padding: 0.25rem 0.75rem;
      border-radius: 20px;
      font-size: 0.75rem;
      font-weight: 600;
      color: white;
      background: rgba(0,0,0,0.7);
    }

    #${containerId} .volkern-prop-card.contenido {
      padding: 1rem;
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    #${containerId} .volkern-prop-card h3 {
      font-size: 1rem;
      font-weight: 600;
      margin: 0 0 0.5rem 0;
      line-height: 1.3;
    }

    #${containerId} .volkern-prop-card p.descripcion {
      font-size: 0.875rem;
      color: #6b7280;
      margin: 0 0 0.75rem 0;
      line-height: 1.4;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    #${containerId} .volkern-prop-card .meta {
      display: flex;
      gap: 0.75rem;
      font-size: 0.875rem;
      color: #6b7280;
      margin-bottom: 0.75rem;
    }

    #${containerId} .volkern-prop-card .meta span {
      display: flex;
      align-items: center;
      gap: 0.375rem;
    }

    #${containerId} .volkern-prop-card .precio {
      font-size: 1.125rem;
      font-weight: 700;
      color: ${color};
      margin-bottom: 0.5rem;
    }

    #${containerId} .volkern-prop-card .ver-mas {
      margin-top: auto;
      display: inline-block;
      padding: 0.5rem 1rem;
      background: ${color};
      color: white;
      text-decoration: none;
      border-radius: 6px;
      font-size: 0.875rem;
      font-weight: 500;
      text-align: center;
    }

    #${containerId} .volkern-prop-card .ver-mas:hover {
      opacity: 0.9;
    }

    #${containerId} .volkern-prop-vacio {
      text-align: center;
      padding: 3rem 1rem;
      color: #6b7280;
    }

    #${containerId} .volkern-prop-cargando {
      text-align: center;
      padding: 2rem 1rem;
      color: #6b7280;
      font-size: 0.875rem;
    }

    #${containerId} .volkern-powered {
      text-align: center;
      padding: 0.5rem;
      font-size: 0.75rem;
      color: #9ca3af;
      border-top: 1px solid #e5e7eb;
      margin-top: 1rem;
    }

    #${containerId} .volkern-powered a {
      color: ${color};
      text-decoration: none;
    }

    @media (max-width: 640px) {
      #${containerId} .volkern-prop-grid {
        grid-template-columns: 1fr;
      }
    }
  `;

  // ─── Render ───────────────────────────────────────────────────────────────
  function render() {
    container.innerHTML = '';

    // Inyectar estilos
    const styleEl = document.createElement('style');
    styleEl.textContent = styles;
    container.appendChild(styleEl);

    // Título
    if (titulo) {
      const h2 = document.createElement('h2');
      h2.className = 'volkern-prop-titulo';
      h2.textContent = escapeHtml(titulo);
      container.appendChild(h2);
    }

    if (properties.length === 0) {
      const vacio = document.createElement('div');
      vacio.className = 'volkern-prop-vacio';
      vacio.textContent = 'No hay propiedades disponibles';
      container.appendChild(vacio);
    } else {
      const grid = document.createElement('div');
      grid.className = modo === 'lista'
        ? 'volkern-prop-lista'
        : 'volkern-prop-grid';

      properties.forEach((prop) => {
        const card = document.createElement('div');
        card.className = 'volkern-prop-card';

        const imagen = getImagen(prop);
        const precio = formatearImporte(prop.precioBase, moneda || prop.moneda);
        const estadoTexto = getEstadoTexto(prop.status);
        const estadoColor = getEstadoColor(prop.status);

        card.innerHTML = `
          <div class="imagen">
            ${imagen
              ? `<img src="${escapeHtml(imagen)}" alt="${escapeHtml(prop.nombre)}" />`
              : `<div class="volkern-prop-placeholder">🏠</div>`}
            <span class="volkern-prop-estado" style="background:${estadoColor}">${escapeHtml(estadoTexto)}</span>
          </div>
          <div class="contenido">
            <h3>${escapeHtml(prop.nombre)}</h3>
            ${prop.descripcion ? `<p class="descripcion">${escapeHtml(prop.descripcion)}</p>` : ''}
            <div class="meta">
              ${prop.operationType ? `<span>🏷️ ${escapeHtml(prop.operationType)}</span>` : ''}
              ${prop.propertyType ? `<span>🏠 ${escapeHtml(prop.propertyType)}</span>` : ''}
              ${prop.city ? `<span>📍 ${escapeHtml(prop.city)}</span>` : ''}
              ${prop.bedrooms ? `<span>🛏️ ${prop.bedrooms}</span>` : ''}
              ${prop.areaM2 ? `<span>📐 ${prop.areaM2} m²</span>` : ''}
            </div>
            <div class="precio">${escapeHtml(precio)}</div>
            <a href="#" class="ver-mas" data-id="${prop.id}">Ver detalle</a>
          </div>
        `;

        const link = card.querySelector('.ver-mas');
        link.addEventListener('click', function (e) {
          e.preventDefault();
          const id = this.getAttribute('data-id');
          // Abrir en nueva pestaña la página de detalle en Volkern
          window.open(
            `https://volkern.app/p/${tenantId}/propiedad-${id}`,
            '_blank'
          );
        });

        grid.appendChild(card);
      });

      container.appendChild(grid);
    }

    // Atribución
    const powered = document.createElement('div');
    powered.className = 'volkern-powered';
    powered.innerHTML = `Powered by <a href="https://volkern.app" target="_blank" rel="noopener">Volkern</a>`;
    container.appendChild(powered);
  }

  // ─── Cargar propiedades ──────────────────────────────────────────────────
  async function loadProperties() {
    const cargando = document.createElement('div');
    cargando.className = 'volkern-prop-cargando';
    cargando.textContent = 'Cargando propiedades…';
    container.appendChild(cargando);

    try {
      const params = new URLSearchParams({
        tenantId,
        limite: String(limite),
        offset: '0',
      });
      if (soloDestacadas) params.set('destacadas', 'true');

      const response = await fetch(`${API_BASE}?${params.toString()}`);
      if (!response.ok) throw new Error('Error al cargar propiedades');

      const data = await response.json();
      properties = data.properties || [];
    } catch (error) {
      console.error('Volkern Propiedades: Error al cargar', error);
      properties = [];
    } finally {
      render();
    }
  }

  // ─── Iniciar ─────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadProperties);
  } else {
    loadProperties();
  }
})();
