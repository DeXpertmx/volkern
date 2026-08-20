import { prisma } from '../db';
import { resolveLeadMapping } from './form-lead-mapping';

export class WebFormService {
  /**
   * Procesa una sumisión de formulario web
   */
  static async processSubmission(params: {
    formId: string;
    payload: any;
    ipAddress?: string;
    userAgent?: string;
  }) {
    const { formId, payload, ipAddress, userAgent } = params;

    const form = await prisma.webForm.findUnique({
      where: { id: formId },
      include: { tenant: true }
    });

    if (!form) throw new Error('Formulario no encontrado');

    // 1. Guardar la sumisión cruda
    const submission = await prisma.webFormSubmission.create({
      data: {
        formId,
        payload,
        ipAddress,
        userAgent,
      }
    });

    // 2. Mapear datos al Lead usando el destino elegido en el formulario.
    const mapped = resolveLeadMapping(
      form.config as any,
      payload,
      await prisma.leadFieldDefinition.findMany({
        where: { tenantId: form.tenantId, activo: true },
        select: { fieldKey: true, activo: true, type: true },
      }),
    );
    const standard = mapped.standard as Record<string, any>;
    const unmapped = Object.fromEntries(mapped.unmapped);
    const leadData: any = {
      tenantId: form.tenantId,
      nombre: standard.nombre || 'Lead Web',
      email: standard.email,
      telefono: standard.telefono,
      empresa: standard.empresa,
      cargo: standard.cargo,
      ubicacion: standard.ubicacion,
      direccion: standard.direccion,
      ciudad: standard.ciudad,
      codigoPostal: standard.codigoPostal,
      pais: standard.pais,
      linkedin: standard.linkedin,
      notas: `Origin: Web Form [${form.name}]\\n\\n${standard.notas || ''}\\n\\nDatos adicionales: ${JSON.stringify(unmapped)}`,
      metadataExterna: mapped.custom,
      origen: 'WEB_FORM',
      estado: 'nuevo',
    };

    if (!leadData.email) {
      console.warn(`[WebForm] Submission ${submission.id} lacks email, skipping lead creation`);
      return submission;
    }

    // 3. Crear el Lead en el CRM
    const lead = await prisma.lead.create({
      data: leadData
    });

    // 4. Vincular el lead a la sumisión
    await prisma.webFormSubmission.update({
      where: { id: submission.id },
      data: { leadId: lead.id }
    });

    // 5. Opcional: Disparar automatizaciones de Marketing
    // await triggerAutomation('new_lead', { leadId: lead.id, tenantId: form.tenantId });

    return { submissionId: submission.id, leadId: lead.id };
  }
}
