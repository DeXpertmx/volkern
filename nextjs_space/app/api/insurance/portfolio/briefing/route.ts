import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, ['insurance:read', 'catalogo:read']);
  if (!auth.valid) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const tenantId = auth.tenant!.id;
  const now = new Date();
  const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

  try {
    // 1. Pólizas próximas a vencer agrupadas por urgencia
    const polizasProximas = await prisma.poliza.findMany({
      where: {
        tenantId,
        estado: { in: ['ACTIVA', 'PROXIMA_A_VENCER', 'EN_TRAMITE'] },
        fechaVencimiento: { lte: in90dFromNow(), gte: now },
      },
      include: {
        cliente: { select: { id: true, nombre: true, email: true } },
        aseguradora: { select: { id: true, nombre: true } },
        productoSeguro: { select: { id: true, nombre: true, ramo: true } },
      },
      orderBy: { fechaVencimiento: 'asc' },
    });

    // 2. Pólizas ya vencidas (riesgo de pérdida)
    const polizasVencidas = await prisma.poliza.findMany({
      where: {
        tenantId,
        estado: 'VENCIDA',
      },
      include: {
        cliente: { select: { id: true, nombre: true, email: true } },
        aseguradora: { select: { id: true, nombre: true } },
        productoSeguro: { select: { id: true, nombre: true, ramo: true } },
      },
    });

    // 3. Clientes sin contacto en 6 meses (riesgo de abandono)
    const allPolizasActivas = await prisma.poliza.findMany({
      where: {
        tenantId,
        estado: { in: ['ACTIVA', 'PROXIMA_A_VENCER', 'EN_TRAMITE'] },
      },
      select: { clienteId: true },
      distinct: ['clienteId'],
    });

    const clienteIds = allPolizasActivas.map(p => p.clienteId);

    // Buscar actividad reciente de estos clientes (citas, deals, mensajes)
    const clientesConActividad = await prisma.cita.findMany({
      where: {
        tenantId,
        fechaHora: { gte: sixMonthsAgo },
        OR: clienteIds.map(id => ({ contactId: id })),
      },
      select: { contactId: true },
      distinct: ['contactId'],
    });

    const clientesActivos = new Set(clientesConActividad.map(c => c.contactId).filter(Boolean));
    const clientesSinContacto = clienteIds.filter(id => !clientesActivos.has(id));

    // Datos de los clientes sin contacto
    const clientesRiesgo = clientesSinContacto.length > 0
      ? await prisma.contact.findMany({
          where: { id: { in: clientesSinContacto.slice(0, 20) } },
          select: { id: true, nombre: true, email: true },
        })
      : [];

    // 4. Oportunidades de venta cruzada
    // Detectar patrones: cliente tiene ramo X con aseguradora Y → sugerir ramo Z de la misma aseguradora
    const crossSellOpportunities = await detectCrossSell(tenantId);

    // 5. Agrupar por urgencia
    const urgentes = polizasProximas.filter(p => diasRestantes(p.fechaVencimiento) <= 30);
    const proximas = polizasProximas.filter(p => {
      const d = diasRestantes(p.fechaVencimiento);
      return d > 30 && d <= 60;
    });
    const futuras = polizasProximas.filter(p => diasRestantes(p.fechaVencimiento) > 60);

    // 6. Calcular valor en riesgo
    const valorEnRiesgo = polizasVencidas.reduce((sum, p) => sum + Number(p.primaAnual || 0), 0);
    const valorUrgente = urgentes.reduce((sum, p) => sum + Number(p.primaAnual || 0), 0);

    // 7. Generar acciones recomendadas
    const acciones = generarAcciones(urgentes, polizasVencidas, clientesRiesgo, crossSellOpportunities.length);

    return NextResponse.json({
      generado: now.toISOString(),
      resumen: {
        totalPolizasActivas: allPolizasActivas.length,
        renovacionesProximas: polizasProximas.length,
        urgentes: urgentes.length,
        proximas: proximas.length,
        futuras: futuras.length,
        vencidas: polizasVencidas.length,
        clientesSinContacto: clientesSinContacto.length,
        oportunidadesCrossSell: crossSellOpportunities.length,
        valorEnRiesgo,
        valorUrgente,
      },
      detalle: {
        urgentes: urgentes.slice(0, 10).map(formatearPoliza),
        vencidas: polizasVencidas.slice(0, 5).map(formatearPoliza),
        clientesRiesgo: clientesRiesgo.slice(0, 10).map(c => ({
          id: c.id,
          nombre: c.nombre,
          email: c.email,
        })),
        oportunidades: crossSellOpportunities.slice(0, 10),
      },
      acciones,
    });
  } catch (error) {
    console.error('Error generating portfolio briefing:', error);
    return NextResponse.json({ error: 'Error al generar briefing' }, { status: 500 });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function in90dFromNow(): Date {
  const now = new Date();
  return new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
}

function diasRestantes(fecha: Date): number {
  return Math.ceil((new Date(fecha).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function formatearPoliza(p: any) {
  return {
    id: p.id,
    numeroPoliza: p.numeroPoliza,
    fechaVencimiento: p.fechaVencimiento,
    estado: p.estado,
    diasRestantes: diasRestantes(p.fechaVencimiento),
    primaAnual: p.primaAnual,
    moneda: p.moneda,
    cliente: p.cliente,
    aseguradora: p.aseguradora,
    ramo: p.productoSeguro?.ramo,
    producto: p.productoSeguro?.nombre,
  };
}

async function detectCrossSell(tenantId: string): Promise<any[]> {
  // Obtener todas las pólizas activas con sus ramos y aseguradoras
  const polizas = await prisma.poliza.findMany({
    where: {
      tenantId,
      estado: { in: ['ACTIVA', 'PROXIMA_A_VENCER'] },
    },
    include: {
      cliente: { select: { id: true, nombre: true } },
      aseguradora: { select: { id: true, nombre: true } },
      productoSeguro: { select: { id: true, nombre: true, ramo: true } },
    },
  });

  // Agrupar: qué ramos tiene cada cliente con cada aseguradora
  const    clienteRamos: Record<string, { aseguradoras: Set<string>; ramos: Set<string>; nombre: string }> = {};
  const aseguradoraProductos: Record<string, Set<string>> = {}; // aseguradora → ramos que ofrece

  for (const p of polizas) {
    const cid = p.clienteId;
    if (!clienteRamos[cid]) {
      clienteRamos[cid] = {
        aseguradoras: new Set(),
        ramos: new Set(),
        nombre: p.cliente.nombre,
      };
    }
    clienteRamos[cid].ramos.add(p.productoSeguro.ramo);
    clienteRamos[cid].aseguradoras.add(p.aseguradoraId);

    // Registrar qué ramos ofrece esta aseguradora
    const aid = p.aseguradoraId;
    if (!aseguradoraProductos[aid]) aseguradoraProductos[aid] = new Set();
    aseguradoraProductos[aid].add(p.productoSeguro.ramo);
  }

  // También consultar todos los productos disponibles por aseguradora
  const allProductos = await prisma.productoSeguro.findMany({
    where: { tenantId },
    select: { id: true, nombre: true, ramo: true, aseguradoraId: true },
  });

  for (const prod of allProductos) {
    if (!aseguradoraProductos[prod.aseguradoraId]) {
      aseguradoraProductos[prod.aseguradoraId] = new Set();
    }
    aseguradoraProductos[prod.aseguradoraId].add(prod.ramo);
  }

  // Reglas de venta cruzada: ramos complementarios
  const crossSellRules: Record<string, string[]> = {
    AUTO: ['HOGAR', 'VIDA', 'GASTOS_MEDICOS'],
    HOGAR: ['AUTO', 'VIDA', 'RESPONSABILIDAD_CIVIL'],
    VIDA: ['AHORRO', 'JUBILACION', 'SALUD'],
    SALUD: ['VIDA', 'GASTOS_MEDICOS', 'AHORRO'],
    GASTOS_MEDICOS: ['SALUD', 'VIDA', 'AHORRO'],
    EMPRESARIAL: ['RESPONSABILIDAD_CIVIL', 'INCENDIO', 'TRANSPORTE'],
    RESPONSABILIDAD_CIVIL: ['EMPRESARIAL', 'INCENDIO'],
    AHORRO: ['VIDA', 'JUBILACION'],
    JUBILACION: ['AHORRO', 'VIDA'],
  };

  const oportunidades: any[] = [];    for (const [clienteId, data] of Object.entries(clienteRamos)) {
      const ramosCliente = data.ramos;

      for (const aseguradora of data.aseguradoras) {
        for (const ramo of ramosCliente) {
          const sugeridos = crossSellRules[ramo] || [];
          for (const ramoSugerido of sugeridos) {
            // Si el cliente ya tiene ese ramo, saltar
            if (ramosCliente.has(ramoSugerido)) continue;

            // Si ya hay una oportunidad para este cliente+ramo, saltar
            const existing = oportunidades.find(
              o => o.clienteId === clienteId && o.ramoSugerido === ramoSugerido && o.aseguradora === aseguradora
            );
            if (existing) continue;

            // Buscar el producto específico de la aseguradora para ese ramo
            const producto = allProductos.find(
              p => p.aseguradoraId === aseguradora && p.ramo === ramoSugerido
            );
            if (!producto) continue; // Esta aseguradora no ofrece este ramo

            // Probabilidad basada en reglas
            let probabilidad = 55;
            if (ramo === 'AUTO' && ramoSugerido === 'HOGAR') probabilidad = 75;
            if (ramo === 'VIDA' && ramoSugerido === 'AHORRO') probabilidad = 70;
            if (ramo === 'SALUD' && ramoSugerido === 'VIDA') probabilidad = 65;
            if (ramo === 'AUTO' && ramoSugerido === 'VIDA') probabilidad = 60;

            oportunidades.push({
              clienteId,
              clienteNombre: data.nombre,
              ramoActual: ramo,
              ramoSugerido,
              aseguradora,
              productoId: producto.id,
              productoNombre: producto.nombre,
              probabilidad,
              motivo: `Tiene ${ramo.replace(/_/g, ' ')} — recomendado ${ramoSugerido.replace(/_/g, ' ')}`,
            });
          }
        }
      }
    }

  // Ordenar por probabilidad descendente
  oportunidades.sort((a, b) => b.probabilidad - a.probabilidad);

  return oportunidades;
}

function generarAcciones(
  urgentes: any[],
  vencidas: any[],
  clientesRiesgo: any[],
  totalCrossSell: number,
): string[] {
  const acciones: string[] = [];

  if (vencidas.length > 0) {
    acciones.push(`🔴 ${vencidas.length} pólizas vencidas requieren atención inmediata. Contacta a los clientes para renovar o dar de baja.`);
  }
  if (urgentes.length > 0) {
    acciones.push(`🟡 ${urgentes.length} pólizas vencen en los próximos 30 días. Programa recordatorios de renovación.`);
  }
  if (clientesRiesgo.length > 0) {
    acciones.push(`⚠️ ${clientesRiesgo.length} clientes llevan más de 6 meses sin contacto. Programa una llamada de seguimiento.`);
  }
  if (totalCrossSell > 0) {
    acciones.push(`💡 ${totalCrossSell} oportunidades de venta cruzada detectadas. Revisa las recomendaciones automáticas.`);
  }
  if (acciones.length === 0) {
    acciones.push('✅ Cartera saludable. No hay acciones urgentes pendientes. ¡Buen trabajo!');
  }

  return acciones;
}
