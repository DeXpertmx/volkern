/**
 * Seed — Aseguradoras con los 6 bloques de datos (Ficha completa)
 *
 * Puebla AXA y MAPFRE con la ficha completa: Identificación Legal (1),
 * Regulación y Licencias (2), Contacto/Representación (3), Parámetros
 * Operativos (4), Configuración Financiera (5) e Integración Técnica (6).
 *
 * Usa upsert con `update`, por lo que es idempotente: si la aseguradora
 * ya existe (p.ej. creada por seed-insurance-demo.ts o lib/insurance/seed.ts),
 * la enriquece sin duplicar ni borrar nada.
 *
 * Uso:
 *   npx tsx scripts/seed-aseguradoras-bloques.ts            # tenant 'demo'
 *   TENANT_ID=<id> npx tsx scripts/seed-aseguradoras-bloques.ts
 *   npx tsx scripts/seed-aseguradoras-bloques.ts <tenantId>
 */

import prisma from '../lib/db';

const TENANT_ID = process.env.TENANT_ID || process.argv[2] || 'demo';

const ASEGURADORAS = [
  {
    nombre: 'AXA Seguros',
    // Bloque 1: Identificación Legal y Fiscal
    nif: 'A28010172',
    razonSocial: 'AXA España, S.A. de Seguros y Reaseguros',
    nombreComercial: 'AXA',
    direccion: 'Av. de los Madroños 25, Parque Empresarial La Moraleja',
    codigoPostal: '28050',
    provincia: 'Madrid',
    pais: 'España',
    regimenFiscal: 'Gran Contribuyente (AEAT)',
    // Bloque 2: Regulación y Licencias
    numeroRegistro: 'C-0019/2004-DGSFP',
    ramosAutorizados: ['Vida', 'Salud', 'Autos', 'Diversos', 'Caución', 'RC General'],
    fechaVigenciaLicenciaInicio: new Date('2024-01-01T00:00:00Z'),
    fechaVigenciaLicenciaFin: new Date('2027-12-31T00:00:00Z'),
    // Bloque 3: Contacto y Representación Legal
    representanteLegal: {
      nombre: 'María Dolores Dancausa Treviño',
      documento: 'DNI 50098712-X',
      cargo: 'Consejera Delegada',
    },
    mesaEntradas: 'notificaciones@axa.es',
    contactosOperativos: [
      { cargo: 'Director de Suscripción', nombre: 'Javier Ruiz', email: 'suscripcion@axa.es', telefono: '+34 912 100 200' },
      { cargo: 'Director de Siniestros', nombre: 'Carmen Ortega', email: 'siniestros@axa.es', telefono: '+34 912 100 300' },
      { cargo: 'Soporte Técnico/IT', nombre: 'Equipo Integraciones', email: 'integraciones@axa.es', telefono: '+34 912 100 400' },
    ],
    // Bloque 4: Parámetros Operativos y Comerciales
    modelosComision: [
      { nombre: 'Comisión inicial', tipo: 'inicial', pct: 15, aplicaA: 'corredor' },
      { nombre: 'Comisión de renovación', tipo: 'renovacion', pct: 10, aplicaA: 'corredor' },
      { nombre: 'Sobre-comisión volumen', tipo: 'sobre_comision', pct: 3, aplicaA: 'agente' },
    ],
    condicionesPago: {
      diasGracia: 30,
      politicaCancelacion: 'Sin pago a los 30 días de la fecha de vencimiento, la póliza se cancela por falta de pago.',
      requiereAnticipo: false,
    },
    limitesSuscripcion: {
      montoMaximoAutomatico: 250000,
      moneda: 'EUR',
      requiereAprobacionManual: true,
    },
    gestionSiniestros: {
      slaRespuestaHoras: 24,
      limiteIndemnizacion: 1000000,
      tipoLimite: 'por_evento',
      deducible: 500,
    },
    // Bloque 5: Configuración Financiera y Bancaria
    cuentasBancarias: [
      {
        banco: 'Santander',
        tipoCuenta: 'recaudacion',
        numeroCuenta: 'ES91 0049 0001 2345 6789 0123',
        iban: 'ES9100490001234567890123',
        swift: 'BSCHESMMXXX',
        moneda: 'EUR',
      },
      {
        banco: 'BBVA',
        tipoCuenta: 'pago_siniestros',
        numeroCuenta: 'ES85 0182 2222 3333 4444 5555',
        iban: 'ES8501822222333344445555',
        swift: 'BBVAESMMXXX',
        moneda: 'EUR',
      },
    ],
    monedaBase: 'EUR',
    monedaLiquidacion: 'EUR',
    // Bloque 6: Integración Técnica y Seguridad
    integracionApi: {
      apiKey: 'axa_live_9f2c7d1e0a4b6c8d',
      oauth: {
        clientId: 'volkern-axa-client',
        clientSecret: 'axa-secret-staging',
        tokenUrl: 'https://api.axa.es/oauth/token',
      },
      endpoints: {
        staging: 'https://staging.api.axa.es/v1',
        produccion: 'https://api.axa.es/v1',
      },
      formatos: ['JSON', 'XML'],
      certificados: {
        ssl: 'axa-prod-2026.pem',
        firmaDigital: 'firma-axa-2026.p12',
      },
    },
    notas: 'Aseguradora ancla del programa. Integración AXA Partner API habilitada.',
    email: 'info@axa.es',
    web: 'https://www.axa.es',
    telefono: '+34 912 000 000',
    activa: true,
  },
  {
    nombre: 'MAPFRE',
    // Bloque 1
    nif: 'A28100458',
    razonSocial: 'MAPFRE, S.A.',
    nombreComercial: 'MAPFRE',
    direccion: 'Carretera de Pozuelo 52, Majadahonda',
    codigoPostal: '28220',
    provincia: 'Madrid',
    pais: 'España',
    regimenFiscal: 'Gran Contribuyente (AEAT)',
    // Bloque 2
    numeroRegistro: 'C-0027/2005-DGSFP',
    ramosAutorizados: ['Vida', 'Salud', 'Autos', 'Hogar', 'Empresas', 'Caución'],
    fechaVigenciaLicenciaInicio: new Date('2025-01-01T00:00:00Z'),
    fechaVigenciaLicenciaFin: new Date('2028-12-31T00:00:00Z'),
    // Bloque 3
    representanteLegal: {
      nombre: 'Antonio Huertas Mejías',
      documento: 'DNI 30055667-W',
      cargo: 'Presidente Ejecutivo',
    },
    mesaEntradas: 'notificaciones@mapfre.com',
    contactosOperativos: [
      { cargo: 'Director de Suscripción', nombre: 'Lucía Fernández', email: 'suscripcion@mapfre.com', telefono: '+34 915 812 200' },
      { cargo: 'Director de Siniestros', nombre: 'Pablo Serrano', email: 'siniestros@mapfre.com', telefono: '+34 915 812 300' },
      { cargo: 'Soporte Técnico/IT', nombre: 'API Team', email: 'api@mapfre.com', telefono: '+34 915 812 400' },
    ],
    // Bloque 4
    modelosComision: [
      { nombre: 'Comisión inicial', tipo: 'inicial', pct: 12, aplicaA: 'corredor' },
      { nombre: 'Comisión de renovación', tipo: 'renovacion', pct: 8, aplicaA: 'corredor' },
    ],
    condicionesPago: {
      diasGracia: 45,
      politicaCancelacion: 'Cancelación automática si no se abona la prima dentro de los 45 días posteriores al vencimiento.',
      requiereAnticipo: true,
    },
    limitesSuscripcion: {
      montoMaximoAutomatico: 400000,
      moneda: 'EUR',
      requiereAprobacionManual: false,
    },
    gestionSiniestros: {
      slaRespuestaHoras: 12,
      limiteIndemnizacion: 2000000,
      tipoLimite: 'por_poliza',
      deducible: 300,
    },
    // Bloque 5
    cuentasBancarias: [
      {
        banco: 'CaixaBank',
        tipoCuenta: 'recaudacion',
        numeroCuenta: 'ES54 2100 1234 5678 9012 3456',
        iban: 'ES5421001234567890123456',
        swift: 'CAIXESBBXXX',
        moneda: 'EUR',
      },
    ],
    monedaBase: 'EUR',
    monedaLiquidacion: 'EUR',
    // Bloque 6
    integracionApi: {
      apiKey: 'mapfre_live_4b8a2c6e1f3d5a7b',
      oauth: {
        clientId: 'volkern-mapfre-client',
        clientSecret: 'mapfre-secret-prod',
        tokenUrl: 'https://api.mapfre.com/oauth/token',
      },
      endpoints: {
        staging: 'https://apistaging.mapfre.com/v2',
        produccion: 'https://api.mapfre.com/v2',
      },
      formatos: ['JSON', 'XML', 'EDI'],
      certificados: {
        ssl: 'mapfre-prod-2026.pem',
        firmaDigital: 'firma-mapfre-2026.p12',
      },
    },
    notas: 'Convenio marco con red de corredores. API v2 con soporte EDI para flotillas.',
    email: 'contacto@mapfre.com',
    web: 'https://www.mapfre.com',
    telefono: '+34 915 812 000',
    activa: true,
  },
];

async function main() {
  console.log(`🏢 Sembrando aseguradoras (6 bloques) para tenant ${TENANT_ID}...\n`);

  for (const ase of ASEGURADORAS) {
    const { nombre, ...data } = ase;
    const result = await prisma.aseguradora.upsert({
      where: { tenantId_nombre: { tenantId: TENANT_ID, nombre } },
      update: {
        ...data,
        representanteLegal: data.representanteLegal as any,
        contactosOperativos: data.contactosOperativos as any,
        modelosComision: data.modelosComision as any,
        condicionesPago: data.condicionesPago as any,
        limitesSuscripcion: data.limitesSuscripcion as any,
        gestionSiniestros: data.gestionSiniestros as any,
        cuentasBancarias: data.cuentasBancarias as any,
        integracionApi: data.integracionApi as any,
      },
      create: {
        tenantId: TENANT_ID,
        nombre,
        ...data,
        representanteLegal: data.representanteLegal as any,
        contactosOperativos: data.contactosOperativos as any,
        modelosComision: data.modelosComision as any,
        condicionesPago: data.condicionesPago as any,
        limitesSuscripcion: data.limitesSuscripcion as any,
        gestionSiniestros: data.gestionSiniestros as any,
        cuentasBancarias: data.cuentasBancarias as any,
        integracionApi: data.integracionApi as any,
      },
    });
    console.log(`  ✅ ${nombre} — ${data.nif} | Reg: ${data.numeroRegistro} | ${data.monedaBase}`);
    console.log(`     • Representante: ${(data.representanteLegal as any)?.nombre}`);
    console.log(`     • ${(data.contactosOperativos as any)?.length} contactos operativos | ${(data.cuentasBancarias as any)?.length} cuentas`);
    console.log(`     • Comisiones: ${(data.modelosComision as any)?.map((m: any) => `${m.tipo} ${m.pct}%`).join(', ')}`);
    console.log(`     • API: ${(data.integracionApi as any)?.endpoints?.produccion} [${(data.integracionApi as any)?.formatos?.join('/')}]`);
  }

  const total = await prisma.aseguradora.count({ where: { tenantId: TENANT_ID } });
  console.log(`\n📊 Total aseguradoras del tenant ${TENANT_ID}: ${total}`);
  console.log('✅ Seed completado.\n');
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
