import { prisma } from '../db';

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

    // 2. Mapear datos al Lead (usando el config del formulario)
    const config = form.config as any;
    const mapping = config.mapping || {};

    const leadData: any = {
      tenantId: form.tenantId,
      nombre: payload[mapping.nombre || 'name'] || 'Lead Web',
      email: payload[mapping.email || 'email'],
      telefono: payload[mapping.telefono || 'phone'],
      notas: `Origin: Web Form [${form.name}]\n\nPayload: ${JSON.stringify(payload, null, 2)}`,
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
