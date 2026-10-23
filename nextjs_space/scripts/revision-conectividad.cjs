/**
 * Revisión de conectividad, SOLO LECTURA.
 *
 * Responde a la pregunta «¿está todo activo y sincronizado?» con datos, en tres
 * bloques, sin escribir nada (ni en la BD ni en el canal) y sin imprimir ningún
 * secreto:
 *
 *   1. NUESTRO LADO — propiedades, unidades, vínculos con el canal, planes de
 *      tarifa y estado del proveedor en la BD.
 *   2. LO QUE EMPUJAMOS — el último push de cada tipo con su estado, su horizonte
 *      (la ventana de fechas que viajó) y los códigos de habitación incluidos.
 *   3. EL CANAL — `property_details` (catálogo real del proveedor, con qué
 *      anuncios tienen inventario / tarifas / reservas conectados) y
 *      `Fetch Reservations` con la ventana profunda, para cruzar lo que el canal
 *      dice tener contra lo que hay en el ERP.
 *
 * Uso (dentro del contenedor de la app):
 *   docker cp scripts/revision-conectividad.cjs <contenedor>:/tmp/ && \
 *   docker exec -u root <contenedor> node /tmp/revision-conectividad.cjs
 *
 * Variables: TENANT_ID (obligatoria), HOTEL_CODE y DIAS_RESERVAS (opcionales).
 * Nada de esto empuja al canal: es una sonda tipo GET/POST de consulta.
 */
const crypto = require('crypto');
const { PrismaClient } = require('/app/node_modules/@prisma/client');

const TENANT_ID = process.env.TENANT_ID || 'cmuy1wvzk002lmi01pie3kp40';
const HOTEL_CODE = process.env.HOTEL_CODE || '75fdbbce2e';
// startDate/endDate de Fetch Reservations filtran por FECHA DE RESERVA
// (`bookedOn`), no por estancia: se abre la ventana hacia atrás para no dejar
// fuera reservas vivas hechas hace meses.
const DIAS_RESERVAS = Number(process.env.DIAS_RESERVAS || 730);

// ── Descifrado: misma primitiva que lib/core/crypto.ts (aes-256-cbc) ──────────
const CLAVE_POR_DEFECTO = 'volkern-nexus-default-32-chars-key';
function descifrar(texto) {
  if (!texto || typeof texto !== 'string') return null;
  const partes = texto.split(':');
  if (partes.length !== 2) return texto; // no tiene forma cifrada
  try {
    const key = Buffer.from(String(process.env.ENCRYPTION_KEY || CLAVE_POR_DEFECTO).padEnd(32, '0').slice(0, 32));
    const iv = Buffer.from(partes[0], 'hex');
    const d = crypto.createDecipheriv('aes-256-cbc', key, iv);
    return Buffer.concat([d.update(Buffer.from(partes[1], 'hex')), d.final()]).toString();
  } catch (e) {
    return null; // clave distinta o valor ilegible: se trata como «sin credencial»
  }
}

/** Nada de secretos en la salida: se redacta el par Basic y sus partes. */
function saneado(valor, secretos) {
  let texto = typeof valor === 'string' ? valor : JSON.stringify(valor);
  for (const s of secretos) {
    if (s && s.length >= 4) texto = texto.split(s).join('[REDACTADO]');
  }
  const b64 = Buffer.from(`${secretos[0] || ''}:${secretos[1] || ''}`).toString('base64');
  if (b64.length > 8) texto = texto.split(b64).join('[REDACTADO]');
  return texto;
}

function recortar(texto, n) {
  return texto.length > n ? `${texto.slice(0, n)}… (${texto.length} caracteres)` : texto;
}

/**
 * Anuncios del canal declarados por el proveedor. La respuesta trae
 * `connected_channels` como lista de {operation, partner_id, hotel_code}: el
 * proveedor empuja el MISMO hotel a varios anuncios de cada OTA, así que una
 * habitación solo es vendible en un anuncio concreto si ese anuncio tiene sus
 * tres operaciones (inventory, rates, reservation). Se agrupa por anuncio para
 * que se vea de un vistazo cuál está a medias.
 */
function anunciosDelCanal(detalle) {
  const bruto = detalle?.connected_channels ?? detalle?.channels ?? null;
  const lista = Array.isArray(bruto) ? bruto : Array.isArray(bruto?.data) ? bruto.data : null;
  if (!lista) return null;
  const porAnuncio = new Map();
  for (const item of lista) {
    if (!item || typeof item !== 'object') continue;
    const clave = `${item.partner_id ?? '—'} ${item.hotel_code ?? '—'}`;
    const fila = porAnuncio.get(clave) || { operaciones: new Set(), extra: [] };
    if (item.operation) fila.operaciones.add(String(item.operation));
    const resto = Object.entries(item)
      .filter(([k]) => !['operation', 'partner_id', 'hotel_code'].includes(k))
      .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`);
    fila.extra.push(...resto);
    porAnuncio.set(clave, fila);
  }
  return [...porAnuncio.entries()].map(([clave, fila]) => ({
    anuncio: clave,
    operaciones: [...fila.operaciones].sort(),
    detalle: [...new Set(fila.extra)],
  }));
}

(async () => {
  const prisma = new PrismaClient();
  try {
    // ── 1. Nuestro lado ──────────────────────────────────────────────────────
    const [config, proveedor, propiedades, unidades, mappings, planes, syncs] = await Promise.all([
      prisma.hospitalityConnectivityConfig.findUnique({ where: { tenantId: TENANT_ID } }),
      prisma.connectivityProvider.findFirst({ where: { providerKey: 'channel_connectivity' } }),
      prisma.hospitalityProperty.findMany({
        where: { tenantId: TENANT_ID },
        select: { id: true, nombre: true, estado: true, units: { select: { id: true, codigo: true, nombre: true, estado: true, tarifaBase: true } } },
        orderBy: { nombre: 'asc' },
      }),
      prisma.hospitalityUnit.count({ where: { tenantId: TENANT_ID } }),
      prisma.connectivityMapping.findMany({
        where: { tenantId: TENANT_ID },
        select: { unitId: true, externalPropertyId: true, externalUnitCode: true, externalRatePlanCode: true, estado: true, provider: true },
      }),
      prisma.hospitalityRatePlan.findMany({
        where: { tenantId: TENANT_ID },
        select: { unitId: true, codigo: true, tarifa: true, activo: true, minNoches: true },
      }),
      prisma.hospitalitySyncLog.groupBy({
        by: ['tipo', 'estado'],
        where: { tenantId: TENANT_ID, fechaCreacion: { gt: new Date(Date.now() - 30 * 86400000) } },
        _count: { _all: true },
        _max: { fechaCreacion: true },
      }),
    ]);

    console.log('=== 1. NUESTRO LADO ===');
    console.log(
      `conectividad activa: ${config?.activo ? 'sí' : 'NO'} · partner guardado: ${config?.partnerIdEnc ? 'sí' : 'no'} · proveedor(plataforma): ${proveedor?.estado} · errores acumulados: ${proveedor?.contadorErrores ?? '—'}`
    );
    console.log(`unidades en el tenant: ${unidades} · vínculos con el canal: ${mappings.length}`);
    for (const p of propiedades) {
      console.log(`  · "${p.nombre}" [${p.estado}] — ${p.units.length} unidad(es)`);
      for (const u of p.units) {
        const m = mappings.find((x) => x.unitId === u.id);
        const rp = planes.filter((x) => x.unitId === u.id && x.activo);
        const vinculo = m ? `${m.externalUnitCode}/${m.externalRatePlanCode ?? '(sin tarifa)'}` : 'SIN VÍNCULO';
        const tarifas = rp.length ? rp.map((x) => `${x.codigo ?? '(sin código)'} ${x.tarifa}`).join(', ') : `base ${u.tarifaBase ?? '—'}`;
        console.log(`      ${u.codigo.padEnd(8)} ${u.estado.padEnd(10)} canal: ${vinculo.padEnd(22)} tarifas: ${tarifas}`);
      }
    }
    console.log('  empujes de los últimos 30 días (tipo · estado · cuántos · el último):');
    for (const s of syncs.sort((a, b) => a.tipo.localeCompare(b.tipo))) {
      console.log(`      ${s.tipo.padEnd(24)} ${s.estado.padEnd(6)} ${String(s._count._all).padStart(4)}  ${s._max.fechaCreacion ? new Date(s._max.fechaCreacion).toISOString() : ''}`);
    }

    // ── 2. Lo que empujamos ──────────────────────────────────────────────────
    console.log('\n=== 2. LO QUE EMPUJAMOS (último de cada tipo) ===');
    for (const tipo of ['inventory', 'rates', 'inventory_restrictions', 'rates_restrictions']) {
      const log = await prisma.hospitalitySyncLog.findFirst({
        where: { tenantId: TENANT_ID, tipo },
        orderBy: { fechaCreacion: 'desc' },
        select: { fechaCreacion: true, operacion: true, estado: true, httpStatus: true, requestPayload: true, errorMensaje: true },
      });
      if (!log) {
        console.log(`  ${tipo}: sin registros`);
        continue;
      }
      const payload = log.requestPayload || {};
      const updates = Array.isArray(payload.updates) ? payload.updates : [];
      const fechas = updates.map((u) => [u.startDate, u.endDate]).filter(([a]) => a);
      const desde = fechas.length ? fechas.map(([a]) => a).sort()[0] : '—';
      const hasta = fechas.length ? fechas.map(([, b]) => b).sort().slice(-1)[0] : '—';
      const rooms = new Set();
      const planes = new Set();
      for (const u of updates) {
        // Inventario: `rooms`; tarifas: `rates` con su par habitación/tarifa.
        for (const r of [...(u.rooms || []), ...(u.rates || [])]) {
          if (r && r.roomCode) rooms.add(r.roomCode);
          if (r && r.rateplanCode) planes.add(r.rateplanCode);
        }
      }
      console.log(
        `  ${tipo}: ${log.estado} ${log.httpStatus ?? ''} · operación ${log.operacion ?? '—'} · ${new Date(log.fechaCreacion).toISOString()}`
      );
      console.log(
        `      horizonte ${desde} → ${hasta} · ${updates.length} tramo(s) · habitaciones: ${[...rooms].sort().join(', ') || '—'}${planes.size ? ` · tarifas: ${[...planes].sort().join(', ')}` : ''}`
      );
      if (log.errorMensaje) console.log(`      error: ${recortar(String(log.errorMensaje), 200)}`);
    }

    // ── 3. El canal (solo lectura) ───────────────────────────────────────────
    const partnerId = descifrar(proveedor?.partnerIdEnc) || descifrar(config?.partnerIdEnc);
    const usuario = descifrar(proveedor?.usernameEnc);
    const clave = descifrar(proveedor?.passwordEnc);
    const base = (process.env.CONNECTIVITY_BASE_URL || '').trim().replace(/\/+$/, '');
    const baseContrato = base.endsWith('/api/v2/cm') ? base : `${base}/api/v2/cm`;
    const puedeSondear = Boolean(partnerId && usuario && clave && base);
    const auth = Buffer.from(`${usuario || ''}:${clave || ''}`).toString('base64');
    const cabeceras = { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json', Accept: 'application/json' };
    const secretos = [usuario, clave, auth];

    const urlDetalle = `${baseContrato}/property_details/${encodeURIComponent(HOTEL_CODE)}?partnerId=${encodeURIComponent(partnerId || '')}`;
    let detalle = null;
    if (puedeSondear) try {
      const res = await fetch(urlDetalle, { headers: cabeceras, signal: AbortSignal.timeout(20000) });
      const texto = await res.text();
      console.log(`  property_details ${HOTEL_CODE}: HTTP ${res.status}`);
      if (!res.ok) {
        console.log(`      ${recortar(saneado(texto, secretos), 400)}`);
      } else {
        detalle = JSON.parse(texto);
        console.log(
          `      ${detalle.hotel_name ?? '(sin nombre)'} · ${detalle.currency ?? '—'} · ${detalle.timezone ?? '—'} · categoría ${detalle.property_category ?? '—'}`
        );
        const rooms = Array.isArray(detalle.rooms) ? detalle.rooms : [];
        console.log(`      catálogo: ${rooms.length} habitación(es)`);
        for (const r of rooms) {
          const planes = (r.rateplans || []).map((x) => x.rateplan_id || x.rateplan_code || x.code).filter(Boolean);
          console.log(
            `        ${String(r.room_id ?? r.room_code).padEnd(6)} ${String(r.room_name ?? '').slice(0, 40).padEnd(42)} activa: ${r.active ?? '—'} · occ ${r.min_occ ?? '—'}-${r.max_occ ?? '—'} · planes: ${planes.join(', ') || '—'}`
          );
        }
        const anuncios = anunciosDelCanal(detalle);
        if (anuncios) {
          console.log(`      anuncios del canal declarados por el proveedor (${anuncios.length}):`);
          const COMPLETO = ['inventory', 'rates', 'reservation'];
          for (const a of anuncios) {
            const faltan = COMPLETO.filter((o) => !a.operaciones.includes(o));
            const veredicto = faltan.length === 0 ? 'COMPLETO' : `SIN ${faltan.join('/')}`;
            const extra = a.detalle.length ? ` · ${a.detalle.join(' ')}` : '';
            console.log(`        ${a.anuncio.padEnd(26)} ${a.operaciones.join('+').padEnd(34)} ${veredicto}${extra}`);
          }
          const aMedias = anuncios.filter((a) => COMPLETO.some((o) => !a.operaciones.includes(o)));
          if (aMedias.length) {
            console.log(`      ⚠ ${aMedias.length} de ${anuncios.length} anuncio(s) sin las tres operaciones: un anuncio sin \`rates\` no puede vender, por eso aparece cerrado en la OTA aunque el inventario llegue.`);
          }
        } else {
          console.log('      (la respuesta no trae ningún campo de anuncios de canal)');
        }
      }
    } catch (e) {
      console.log(`  property_details: fallo de sonda — ${e && e.message ? e.message : e}`);
    }

    const hoy = new Date();
    const desde = new Date(hoy.getTime() - DIAS_RESERVAS * 86400000).toISOString().slice(0, 10);
    const hasta = new Date(hoy.getTime() + 30 * 86400000).toISOString().slice(0, 10);
    if (puedeSondear) try {
      const res = await fetch(`${baseContrato}/data/${encodeURIComponent(partnerId)}`, {
        method: 'POST',
        headers: cabeceras,
        body: JSON.stringify({ type: 'reservation', hotelCode: HOTEL_CODE, startDate: desde, endDate: hasta }),
        signal: AbortSignal.timeout(20000),
      });
      const texto = await res.text();
      console.log(`  Fetch Reservations (fecha de RESERVA) ${desde} → ${hasta}: HTTP ${res.status}`);
      if (!res.ok) {
        console.log(`      ${recortar(saneado(texto, secretos), 400)}`);
      } else {
        let cuerpo = null;
        try {
          cuerpo = JSON.parse(texto);
        } catch {
          cuerpo = null;
        }
        const lista = Array.isArray(cuerpo) ? cuerpo : Array.isArray(cuerpo?.data) ? cuerpo.data : [];
        console.log(`      el canal reporta ${lista.length} reserva(s):`);
        if (lista.length) {
          console.log(`      campos del contrato: ${Object.keys(lista[0]).join(', ')}`);
        }
        for (const r of lista) {
          console.log(`        ${recortar(saneado(r, secretos), 400)}`);
        }
      }
    } catch (e) {
      console.log(`  Fetch Reservations: fallo de sonda — ${e && e.message ? e.message : e}`);
    }

    // ── 4. Cruce interno contra lo último empujado ───────────────────────────
    // Reconstrucción de la guardia del producto (`lib/hospitality/inventario-
    // divergencias.ts`): el estado que el canal tiene por bueno es el del push
    // MÁS NUEVO que cubre cada noche (UPSERT por rango). Se compara contra la
    // disponibilidad interna con la misma regla del Availability Engine.
    //
    // Diferencia deliberada con la guardia: aquí la ventana es larga (por
    // defecto 270 días, `DIAS_CRUCE`) porque el riesgo de sobreventa no se
    // acaba a los 30 días — y la guardia del producto juzga 30 por defecto.
    const DIAS_CRUCE = Number(process.env.DIAS_CRUCE || 270);
    const VENTANA_LOGS_DIAS = 100;
    const FUERA_DE_VENTA = ['maintenance', 'out_of_service'];
    const SIN_PRODUCCION = ['cancelled', 'no_show'];

    const iso = (d) => d.toISOString().slice(0, 10);
    const sumarDias = (texto, n) => {
      const d = new Date(`${texto}T00:00:00.000Z`);
      d.setUTCDate(d.getUTCDate() + n);
      return iso(d);
    };
    const hoyIso = iso(new Date());
    const ultimaNoche = sumarDias(hoyIso, DIAS_CRUCE - 1);

    const [logsInv, unidadesInv, reservasInv, bloquesInv] = await Promise.all([
      prisma.hospitalitySyncLog.findMany({
        where: {
          tenantId: TENANT_ID,
          tipo: 'inventory',
          estado: 'exito',
          fechaCreacion: { gt: new Date(Date.now() - VENTANA_LOGS_DIAS * 86400000) },
        },
        orderBy: { fechaCreacion: 'desc' },
        select: { fechaCreacion: true, requestPayload: true },
        take: 300,
      }),
      prisma.hospitalityUnit.findMany({
        where: { tenantId: TENANT_ID },
        select: {
          id: true,
          codigo: true,
          estado: true,
          mappings: {
            where: { provider: 'channel_connectivity', estado: 'activo' },
            select: { externalUnitCode: true },
          },
        },
      }),
      prisma.hospitalityReservation.findMany({
        where: { tenantId: TENANT_ID, estado: { notIn: SIN_PRODUCCION } },
        select: { unitId: true, checkIn: true, checkOut: true, estado: true },
      }),
      prisma.hospitalityUnitBlock.findMany({
        where: { tenantId: TENANT_ID, estado: 'activo' },
        select: { unitId: true, fechaInicio: true, fechaFin: true },
      }),
    ]);

    // El push más nuevo que cubre cada noche gana; el rango es inclusivo.
    const empujado = new Map();
    for (const log of logsInv) {
      const tramos = log.requestPayload?.updates;
      if (!Array.isArray(tramos)) continue;
      for (const tramo of tramos) {
        if (!tramo?.startDate || !tramo?.endDate) continue;
        let fecha = tramo.startDate;
        let guarda = 0;
        while (fecha <= tramo.endDate && guarda < 400) {
          if (fecha >= hoyIso && fecha <= ultimaNoche) {
            for (const room of tramo.rooms || []) {
              const code = room?.roomCode;
              const available = room?.available;
              if (!code || typeof available !== 'number' || !Number.isFinite(available)) continue;
              const k = `${code}|${fecha}`;
              if (!empujado.has(k)) {
                empujado.set(k, { available, cuando: new Date(log.fechaCreacion).toISOString() });
              }
            }
          }
          fecha = sumarDias(fecha, 1);
          guarda += 1;
        }
      }
    }

    const internas = unidadesInv.filter((u) => u.estado && !FUERA_DE_VENTA.includes(u.estado));
    const interno = new Map();
    for (const u of internas) {
      const code = u.mappings?.[0]?.externalUnitCode;
      if (!code) continue;
      let fecha = hoyIso;
      for (let i = 0; i < DIAS_CRUCE; i += 1) {
        const dia = new Date(`${fecha}T00:00:00.000Z`).getTime();
        const ocupada = reservasInv.some(
          (r) =>
            r.unitId === u.id &&
            new Date(r.checkIn).setUTCHours(0, 0, 0, 0) <= dia &&
            new Date(r.checkOut).setUTCHours(0, 0, 0, 0) > dia
        );
        const bloqueada = bloquesInv.some(
          (b) =>
            b.unitId === u.id &&
            new Date(b.fechaInicio).setUTCHours(0, 0, 0, 0) <= dia &&
            new Date(b.fechaFin).setUTCHours(0, 0, 0, 0) > dia
        );
        const k = `${code}|${fecha}`;
        interno.set(k, (interno.get(k) || 0) + (ocupada || bloqueada ? 0 : 1));
        fecha = sumarDias(fecha, 1);
      }
    }

    console.log(`\n=== 4. INTERNO vs ÚLTIMO EMPUJADO (${hoyIso} → ${ultimaNoche}) ===`);
    const codigos = [...new Set([...interno.keys()].map((k) => k.split('|')[0]))].sort();
    const abiertasTotales = [];
    for (const code of codigos) {
      const clases = { abiertaSinJustificar: [], cerradaSinJustificar: [], sinDato: [] };
      let fecha = hoyIso;
      for (let i = 0; i < DIAS_CRUCE; i += 1) {
        const k = `${code}|${fecha}`;
        const emp = empujado.get(k);
        const int = interno.get(k) ?? 0;
        if (!emp) clases.sinDato.push(fecha);
        else if (emp.available > 0 && int === 0) clases.abiertaSinJustificar.push({ fecha, empujadoEn: emp.cuando });
        else if (emp.available === 0 && int > 0) clases.cerradaSinJustificar.push(fecha);
        fecha = sumarDias(fecha, 1);
      }
      const rangoDe = (lista) =>
        lista.length ? `${lista[0].fecha ?? lista[0]} → ${lista[lista.length - 1].fecha ?? lista[lista.length - 1]}` : '—';
      console.log(
        `  ${code}: abiertas sin justificar ${clases.abiertaSinJustificar.length} (${rangoDe(clases.abiertaSinJustificar)}) · cerradas sin justificar ${clases.cerradaSinJustificar.length} (${rangoDe(clases.cerradaSinJustificar)}) · sin dato ${clases.sinDato.length}`
      );
      if (clases.abiertaSinJustificar.length) {
        abiertasTotales.push({ code, ...clases.abiertaSinJustificar[0] });
        const ejemplo = clases.abiertaSinJustificar[0];
        console.log(
          `      ⚠ sobreventa: el canal tiene ABIERTA la primera de ellas (${ejemplo.fecha}) desde el push del ${ejemplo.empujadoEn}`
        );
      }
    }
    console.log(
      abiertasTotales.length
        ? '  ⚠ hay noches cerradas aquí y abiertas en el canal: se venden y no se pueden servir. Se cierran reempujando inventario con un horizonte que las alcance.'
        : '  sin noches cerradas aquí y abiertas en el canal (para la ventana juzgada)'
    );
    console.log('\n(fin de la revisión: nada se ha escrito ni se ha empujado al canal)');
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => {
  console.error('FALLO:', e && e.message ? e.message : e);
  process.exit(1);
});
