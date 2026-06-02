import { prisma, globalPrisma, getTenantDb, dbContext } from "@/lib/db";
import { REAL_ESTATE_STAGES } from "./setup-pipeline";

/**
 * Seed inicial al activar el módulo inmobiliario para un tenant.
 * Crea:
 *   1. Pipeline stages de real_estate
 *   2. Preset de campos personalizados (si no existe)
 *   3. Automatizaciones pre-configuradas
 */
export async function seedRealEstateModule(tenantId: string) {
  console.log(`🏠 Seeding módulo inmobiliario para tenant ${tenantId}...`);

  const tenantClient = await getTenantDb(tenantId);

  return await dbContext.run({ tenantId, client: tenantClient }, async () => {
    // 1. Crear pipeline stages
    const existingStages = await prisma.pipelineStage.count({
      where: { tenantId, categoria: "real_estate" },
    });

    if (existingStages === 0) {
      console.log(`📊 Creando ${REAL_ESTATE_STAGES.length} pipeline stages...`);
      for (const stage of REAL_ESTATE_STAGES) {
        await prisma.pipelineStage.create({
          data: {
            tenantId,
            ...stage,
          },
        });
      }
      console.log("✅ Pipeline inmobiliario creado");
    } else {
      console.log(`ℹ️ Ya existen ${existingStages} stages, omitiendo...`);
    }

    // 2. Crear automatizaciones base
    const automations = [
      {
        nombre: "Bienvenida a nuevo lead inmobiliario",
        descripcion:
          "Cuando alguien consulta una propiedad, crea una tarea de seguimiento",
        trigger: "LEAD_CREATED",
        flowData: {
          nodes: [
            {
              id: "1",
              type: "condition",
              data: { field: "source", operator: "equals", value: "portal_inmobiliario" },
            },
            {
              id: "2",
              type: "create_task",
              data: {
                title: "Llamar a lead inmobiliario",
                priority: "high",
                dueInHours: 2,
              },
            },
          ],
          edges: [{ from: "1", to: "2" }],
        },
        activo: true,
      },
      {
        nombre: "Recordatorio de visita",
        descripcion: "24h antes de una visita agendada, envía un recordatorio",
        trigger: "BOOKING_CONFIRMED",
        flowData: {
          nodes: [
            {
              id: "1",
              type: "delay",
              data: { duration: "23h" },
            },
            {
              id: "2",
              type: "send_email",
              data: {
                template: "visit-reminder-24h",
                to_field: "lead.email",
              },
            },
          ],
          edges: [{ from: "1", to: "2" }],
        },
        activo: true,
      },
    ];

    for (const auto of automations) {
      const existing = await prisma.automation.findFirst({
        where: { tenantId, nombre: auto.nombre },
      });
      if (!existing) {
        await prisma.automation.create({
          data: {
            tenantId,
            ...auto,
          },
        });
      }
    }
    console.log("✅ Automatizaciones base creadas");

    // 3. Automatizaciones de exportación programada
    const exportAutomations = [
      {
        nombre: "Exportación semanal a Idealista",
        descripcion:
          "Genera feed XML de propiedades disponibles y lo sube a S3 cada lunes",
        trigger: "CRON_WEEKLY",
        flowData: {
          nodes: [
            {
              id: "1",
              type: "export_properties",
              data: {
                format: "xml",
                status: "disponible",
                portal: "idealista",
                uploadToS3: true,
              },
            },
            {
              id: "2",
              type: "notify",
              data: {
                channel: "in-app",
                message:
                  "Feed XML para Idealista generado y subido automáticamente",
              },
            },
          ],
          edges: [{ from: "1", to: "2" }],
        },
        activo: false,
      },
      {
        nombre: "Exportación mensual a Fotocasa",
        descripcion:
          "Genera CSV de propiedades disponibles para Fotocasa cada mes",
        trigger: "CRON_MONTHLY",
        flowData: {
          nodes: [
            {
              id: "1",
              type: "export_properties",
              data: {
                format: "csv",
                status: "disponible",
                portal: "fotocasa",
                uploadToS3: true,
              },
            },
            {
              id: "2",
              type: "notify",
              data: {
                channel: "email",
                to_field: "tenant.billingEmail",
                subject: "Exportación Fotocasa lista",
                message:
                  "El archivo CSV para Fotocasa está disponible para descarga.",
              },
            },
          ],
          edges: [{ from: "1", to: "2" }],
        },
        activo: false,
      },
    ];

    for (const auto of exportAutomations) {
      const existing = await prisma.automation.findFirst({
        where: { tenantId, nombre: auto.nombre },
      });
      if (!existing) {
        await prisma.automation.create({
          data: {
            tenantId,
            ...auto,
          },
        });
      }
    }
    console.log("✅ Automatizaciones de exportación creadas");

    // 4. Verificar/crear preset de campos inmobiliarios
    console.log(
      "ℹ️ El preset de campos inmobiliarios se aplica desde el endpoint de field-definitions"
    );

    console.log(`✅ Módulo inmobiliario listo para tenant ${tenantId}`);
    return { success: true };
  });
}

/**
 * Seed global al iniciar la app (para todos los tenants que ya tienen propiedades)
 */
export async function seedAllRealEstateTenants() {
  const tenantsWithProperties = await globalPrisma.tenant.findMany({
    where: {
      activo: true,
    },
    select: { id: true },
  });

  console.log(`🏗️ Revisando ${tenantsWithProperties.length} tenants...`);

  for (const tenant of tenantsWithProperties) {
    try {
      const tenantClient = await getTenantDb(tenant.id);
      const count = await dbContext.run(
        { tenantId: tenant.id, client: tenantClient },
        async () => {
          return prisma.catalogoItem.count({
            where: { tipo: "inmueble" },
          });
        }
      );

      if (count > 0) {
        console.log(`🔧 Tenant ${tenant.id} tiene ${count} propiedades. Sembrando pipeline...`);
        await seedRealEstateModule(tenant.id);
      }
    } catch (err) {
      console.warn(`⚠️ Error con tenant ${tenant.id}:`, err);
    }
  }

  console.log("✅ Seed global completado");
}
