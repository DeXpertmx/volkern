/**
 * Action registry — maps actionType strings to standalone handler functions.
 * Imported by AutomationEngine.executeAction() to dispatch to domain handlers.
 */
import { ActionHandler } from '../types'

// Communication
import { sendEmail, sendSMS, sendWhatsApp, sendTelegram, sendNotification } from './communication'

// Leads / CRM
import {
  updateLead, updateEstudiante, assignTag, removeTag,
  archiveLead, duplicateLead, calculateAutoScore,
  assignLeadToUser, updateLeadScore, createDeal,
  createTask, createAppointment, addToCampaign,
  removeFromCampaign, enrollInCourse, sendCertificate,
} from './leads'

// Integrations
import {
  generateSimpleInvoice, sendGoCardlessMandate, sendWebhook,
  executeExternalWorkflow, sendSecureWebhook,
  pauseAutomation, activateAutomation,
} from './integrations'

// Inventory
import { notifyLowStock, updateInventory, createPurchaseOrder, adjustStock } from './inventory'

// Production
import { createProductionOrder, updateProductionOrderStatus, notifyProduction, registerProduction } from './production'

// Support
import { createSupportTicket, assignTicket, escalateTicket, notifySLA, closeTicket, createTaskFromTicket } from './support'

// Marketing
import {
  createCampaign, addContactToList, removeContactFromList,
  segmentAudience, scheduleSocialPost, publishSocialPost,
  sendFollowUp, updateNurturing, calculateEngagement,
  generateCampaignReport, sendMarketingEmail,
  createEmailSequence, pauseEmailSequence,
} from './marketing'

// Academy
import { sendOnboarding, createEvaluation, sendSurvey, registerTraining, notifyCertification } from './academy'

// HR
import { updateEmployee, assignRole } from './hr'

// Finance
import {
  generateInvoicePDF, registerExpense, approveExpense, rejectExpense,
  notifyPayment, createPayroll, notifyInvoiceOverdue,
  sendPaymentReminder, adjustBudget, generateFinancialReport,
} from './finance'

// Quality
import {
  createInspection, registerNonConformity, closeNonConformity,
  notifyQualityAlert, generateQualityReport, scheduleCalibration,
} from './quality'

// Projects
import {
  createProject, notifyProjectTeam, updateProgress, createMilestone,
  notifyMilestone, generateProjectReport, createProjectTask, assignDeliverable,
} from './projects'

/**
 * Registry: actionType → ActionHandler
 */
export const ACTION_REGISTRY: Record<string, ActionHandler> = {
  // ── Communication ──
  enviar_email: sendEmail,
  enviar_sms: sendSMS,
  enviar_whatsapp: sendWhatsApp,
  enviar_telegram: sendTelegram,
  enviar_notificacion: sendNotification,

  // ── Leads / CRM ──
  actualizar_lead: updateLead,
  cambiar_etapa_lead: updateLead,  // alias
  asignar_tag: assignTag,
  remover_tag: removeTag,
  asignar_a_usuario: assignLeadToUser,
  actualizar_score: updateLeadScore,
  calcular_score_automatico: calculateAutoScore,
  crear_deal: createDeal,
  archivar_lead: archiveLead,
  duplicar_lead: duplicateLead,

  // ── Students / Academy ──
  actualizar_estudiante: updateEstudiante,
  inscribir_en_curso: enrollInCourse,
  enviar_certificado: sendCertificate,

  // ── Tasks / Appointments ──
  crear_tarea: createTask,
  crear_cita: createAppointment,

  // ── Campaigns ──
  agregar_a_campana: addToCampaign,
  remover_de_campana: removeFromCampaign,

  // ── Integrations / Webhooks ──
  webhook_saliente: sendWebhook,
  crear_factura_stripe: generateSimpleInvoice,
  crear_factura_square: generateSimpleInvoice,
  cobrar_gocardless: generateSimpleInvoice,
  enviar_mandato_gocardless: sendGoCardlessMandate,
  ejecutar_workflow: executeExternalWorkflow,
  webhook_externo_seguro: sendSecureWebhook,
  pausar_automatizacion: pauseAutomation,
  activar_automatizacion: activateAutomation,

  // ── Inventory ──
  notificar_stock: notifyLowStock,
  actualizar_inventario: updateInventory,
  crear_orden_compra: createPurchaseOrder,
  ajustar_stock: adjustStock,

  // ── Production ──
  crear_orden_produccion: createProductionOrder,
  actualizar_estado_orden: updateProductionOrderStatus,
  notificar_produccion: notifyProduction,
  registrar_produccion: registerProduction,

  // ── Support ──
  crear_ticket: createSupportTicket,
  asignar_ticket: assignTicket,
  escalar_ticket: escalateTicket,
  notificar_sla: notifySLA,
  cerrar_ticket: closeTicket,
  crear_tarea_desde_ticket: createTaskFromTicket,

  // ── Marketing ──
  crear_campana: createCampaign,
  agregar_contacto_lista: addContactToList,
  remover_contacto_lista: removeContactFromList,
  segmentar_audiencia: segmentAudience,
  programar_post: scheduleSocialPost,
  publicar_post: publishSocialPost,
  enviar_seguimiento: sendFollowUp,
  actualizar_nurturing: updateNurturing,
  calcular_engagement: calculateEngagement,
  generar_reporte_campana: generateCampaignReport,
  enviar_email_marketing: sendMarketingEmail,
  crear_sequence: createEmailSequence,
  pausar_sequence: pauseEmailSequence,

  // ── Academy ──
  enviar_onboarding: sendOnboarding,
  crear_evaluacion: createEvaluation,
  enviar_encuesta: sendSurvey,
  registrar_capacitacion: registerTraining,
  notificar_certificacion: notifyCertification,

  // ── HR ──
  actualizar_empleado: updateEmployee,
  asignar_rol: assignRole,

  // ── Finance ──
  generar_factura: generateInvoicePDF,
  registrar_gasto: registerExpense,
  aprobar_gasto: approveExpense,
  rechazar_gasto: rejectExpense,
  notificar_pago: notifyPayment,
  crear_nomina: createPayroll,
  notificar_factura_vencida: notifyInvoiceOverdue,
  enviar_recordatorio_pago: sendPaymentReminder,
  ajustar_presupuesto: adjustBudget,
  generar_reporte_financiero: generateFinancialReport,

  // ── Quality ──
  crear_inspeccion: createInspection,
  registrar_no_conformidad: registerNonConformity,
  cerrar_no_conformidad: closeNonConformity,
  notificar_alerta_calidad: notifyQualityAlert,
  generar_informe_calidad: generateQualityReport,
  programar_calibracion: scheduleCalibration,

  // ── Projects ──
  crear_proyecto: createProject,
  notificar_equipo_proyecto: notifyProjectTeam,
  actualizar_progreso: updateProgress,
  crear_milestone: createMilestone,
  notificar_milestone: notifyMilestone,
  generar_reporte_proyecto: generateProjectReport,
  crear_tarea_proyecto: createProjectTask,
  asignar_entregable: assignDeliverable,
}
