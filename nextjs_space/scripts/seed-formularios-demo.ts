/**
 * Seed de formularios demo para tenants
 *
 * Uso:
 *   npx tsx scripts/seed-formularios-demo.ts <tenant_slug>
 *   npx tsx scripts/seed-formularios-demo.ts --all       (todos los tenants)
 *
 * Crea 3 formularios WebForm preconfigurados con SurveyJS JSON:
 *   1. Formulario de Contacto     — nombre, email, teléfono, empresa, mensaje
 *   2. Encuesta de Satisfacción   — NPS (Net Promoter Score), calificación, comentarios
 *   3. Registro para Demo         — nombre, email, empresa, cargo, ¿cómo nos conoció?
 */

import { PrismaClient, Prisma } from '@prisma/client';
import * as dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

// ─── Configuraciones de formularios demo ──────────────────────────

const DEMO_FORMS = [
  {
    name: 'Formulario de Contacto',
    config: {
      title: 'Contáctanos',
      description: 'Déjanos tus datos y te contactaremos a la brevedad.',
      pages: [{
        name: 'page1',
        elements: [
          {
            type: 'text',
            name: 'nombre',
            title: 'Nombre completo',
            isRequired: true,
            placeholder: 'Ej. María García',
          },
          {
            type: 'text',
            name: 'email',
            title: 'Correo electrónico',
            isRequired: true,
            inputType: 'email',
            placeholder: 'tu@email.com',
          },
          {
            type: 'text',
            name: 'telefono',
            title: 'Teléfono',
            inputType: 'tel',
            placeholder: '+52 555 123 4567',
          },
          {
            type: 'text',
            name: 'empresa',
            title: 'Empresa',
            placeholder: 'Nombre de tu empresa',
          },
          {
            type: 'comment',
            name: 'mensaje',
            title: 'Mensaje',
            isRequired: true,
            placeholder: 'Cuéntanos cómo podemos ayudarte...',
            rows: 4,
          },
          {
            type: 'checkbox',
            name: 'acepto_privacidad',
            title: 'Acepto la política de privacidad',
            isRequired: true,
          },
        ],
      }],
      showQuestionNumbers: 'off',
      completeText: 'Enviar mensaje',
      completedHtml: '<div style="text-align:center;padding:24px"><h3>✅ ¡Mensaje enviado!</h3><p>Nos pondremos en contacto contigo en menos de 24 horas.</p></div>',
    },
  },

  {
    name: 'Encuesta de Satisfacción',
    config: {
      title: 'Encuesta de Satisfacción',
      description: 'Tu opinión es muy importante para nosotros. Ayúdanos a mejorar.',
      pages: [{
        name: 'page1',
        elements: [
          {
            type: 'rating',
            name: 'nps',
            title: '¿Qué tan probable es que nos recomiendes a un amigo o colega?',
            isRequired: true,
            rateMin: 0,
            rateMax: 10,
            minRateDescription: 'Nada probable',
            maxRateDescription: 'Muy probable',
          },
          {
            type: 'rating',
            name: 'satisfaccion_general',
            title: '¿Qué tan satisfecho estás con nuestro servicio en general?',
            isRequired: true,
            rateMin: 1,
            rateMax: 5,
            minRateDescription: 'Muy insatisfecho',
            maxRateDescription: 'Muy satisfecho',
          },
          {
            type: 'radiogroup',
            name: 'area_mejora',
            title: '¿En qué área crees que deberíamos mejorar más?',
            isRequired: true,
            choices: [
              { value: 'atencion', text: 'Atención al cliente' },
              { value: 'producto', text: 'Calidad del producto/servicio' },
              { value: 'precio', text: 'Precio' },
              { value: 'tiempo', text: 'Tiempo de respuesta' },
              { value: 'comunicacion', text: 'Comunicación' },
            ],
          },
          {
            type: 'comment',
            name: 'comentarios',
            title: 'Comentarios adicionales',
            placeholder: 'Cuéntanos cualquier sugerencia o comentario...',
            rows: 3,
          },
          {
            type: 'text',
            name: 'email_opcional',
            title: 'Email (opcional, si deseas que te contactemos)',
            inputType: 'email',
            placeholder: 'tu@email.com',
          },
        ],
      }],
      showQuestionNumbers: 'off',
      completeText: 'Enviar encuesta',
      completedHtml: '<div style="text-align:center;padding:24px"><h3>🎉 ¡Gracias por tu feedback!</h3><p>Tus respuestas nos ayudan a mejorar cada día.</p></div>',
    },
  },

  {
    name: 'Registro para Demo',
    config: {
      title: 'Solicita una Demo Personalizada',
      description: 'Completa el formulario y uno de nuestros expertos te mostrará cómo Volkern puede transformar tu negocio.',
      pages: [{
        name: 'page1',
        elements: [
          {
            type: 'text',
            name: 'nombre',
            title: 'Nombre completo',
            isRequired: true,
            placeholder: 'Ej. Carlos Ruiz',
          },
          {
            type: 'text',
            name: 'email',
            title: 'Correo electrónico corporativo',
            isRequired: true,
            inputType: 'email',
            placeholder: 'tu@empresa.com',
          },
          {
            type: 'text',
            name: 'empresa',
            title: 'Nombre de la empresa',
            isRequired: true,
            placeholder: 'Tu empresa S.A. de C.V.',
          },
          {
            type: 'text',
            name: 'cargo',
            title: 'Cargo',
            isRequired: true,
            placeholder: 'Ej. Director Comercial',
          },
          {
            type: 'dropdown',
            name: 'numero_empleados',
            title: 'Número de empleados',
            isRequired: true,
            choices: [
              { value: '1-10', text: '1 - 10' },
              { value: '11-50', text: '11 - 50' },
              { value: '51-200', text: '51 - 200' },
              { value: '201-500', text: '201 - 500' },
              { value: '500+', text: 'Más de 500' },
            ],
          },
          {
            type: 'radiogroup',
            name: 'como_nos_conocio',
            title: '¿Cómo nos conociste?',
            choices: [
              { value: 'google', text: 'Búsqueda en Google' },
              { value: 'recomendacion', text: 'Recomendación' },
              { value: 'redes', text: 'Redes sociales' },
              { value: 'evento', text: 'Evento / Conferencia' },
              { value: 'otro', text: 'Otro' },
            ],
          },
          {
            type: 'comment',
            name: 'necesidades',
            title: '¿Qué funcionalidades te interesan más?',
            placeholder: 'CRM, automatización, formularios, pipeline de ventas, etc.',
            rows: 3,
          },
        ],
      }],
      showQuestionNumbers: 'off',
      completeText: 'Solicitar demo',
      completedHtml: '<div style="text-align:center;padding:24px"><h3>🚀 ¡Solicitud recibida!</h3><p>Un experto se pondrá en contacto contigo en las próximas 24 horas para agendar tu demo personalizada.</p></div>',
    },
  },
];

// ─── Helpers ─────────────────────────────────────────────────────

async function seedFormsForTenant(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, nombre: true, slug: true },
  });

  if (!tenant) {
    console.log(`   ⚠️  Tenant ${tenantId} no encontrado, saltando...`);
    return { created: [], skipped: DEMO_FORMS.map(f => f.name) };
  }

  const created: string[] = [];
  const skipped: string[] = [];

  for (const formDef of DEMO_FORMS) {
    const existing = await prisma.webForm.findFirst({
      where: { tenantId: tenant.id, name: formDef.name },
      select: { id: true },
    });

    if (existing) {
      skipped.push(formDef.name);
      continue;
    }

    await prisma.webForm.create({
      data: {
        tenantId: tenant.id,
        name: formDef.name,
        config: formDef.config as Prisma.InputJsonValue,
      },
    });

    created.push(formDef.name);
  }

  return { created, skipped };
}

// ─── Main ─────────────────────────────────────────────────────────

async function main() {
  const arg = process.argv[2];

  if (!arg) {
    console.error('❌ Uso: npx tsx scripts/seed-formularios-demo.ts <tenant_slug>');
    console.error('   o: npx tsx scripts/seed-formularios-demo.ts --all');
    process.exit(1);
  }

  if (arg === '--all') {
    console.log('🌱 Sembrando formularios demo para TODOS los tenants...\n');

    const tenants = await prisma.tenant.findMany({
      where: { estado: 'activo' },
      select: { id: true, nombre: true, slug: true },
      orderBy: { fechaCreacion: 'asc' },
    });

    console.log(`   📋 ${tenants.length} tenants activos encontrados\n`);

    let totalCreated = 0;
    let totalSkipped = 0;

    for (const tenant of tenants) {
      const { created, skipped } = await seedFormsForTenant(tenant.id);
      totalCreated += created.length;
      totalSkipped += skipped.length;

      const icon = created.length > 0 ? '✅' : '⏭️';
      console.log(`   ${icon} ${tenant.nombre} (${tenant.slug}): ${created.length} nuevos, ${skipped.length} ya existentes`);
    }

    console.log(`\n✨ Total: ${totalCreated} formularios creados, ${totalSkipped} omitidos (ya existían)`);
  } else {
    // Single tenant by slug
    const tenant = await prisma.tenant.findUnique({
      where: { slug: arg },
      select: { id: true, nombre: true, slug: true },
    });

    if (!tenant) {
      console.error(`❌ Tenant con slug "${arg}" no encontrado.`);
      process.exit(1);
    }

    console.log(`🌱 Sembrando formularios demo para: ${tenant.nombre} (${tenant.slug})\n`);

    const { created, skipped } = await seedFormsForTenant(tenant.id);

    if (created.length > 0) {
      console.log(`   ✅ ${created.length} formularios creados:`);
      for (const name of created) {
        console.log(`      🆕 ${name}`);
      }
    }
    if (skipped.length > 0) {
      console.log(`   ⏭️  ${skipped.length} ya existían: ${skipped.join(', ')}`);
    }

    console.log(`\n✨ ¡Listo! Revisá los formularios en /dashboard/formularios`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Error:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
