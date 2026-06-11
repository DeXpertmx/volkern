/**
 * Seed de formularios demo para tenants
 *
 * Uso:
 *   npx tsx scripts/seed-formularios-demo.ts <tenant_slug>
 *   npx tsx scripts/seed-formularios-demo.ts --all       (todos los tenants)
 *
 * Crea 7 formularios WebForm preconfigurados con SurveyJS JSON:
 *   1. Formulario de Contacto     — nombre, email, teléfono, empresa, mensaje
 *   2. Encuesta de Satisfacción   — NPS (Net Promoter Score), calificación, comentarios
 *   3. Registro para Demo         — nombre, email, empresa, cargo, ¿cómo nos conoció?
 *   4. NPS Avanzado              — NPS con lógica condicional (detractor/pasivo/promotor)
 *   5. Onboarding Wizard          — Multi-step de 3 páginas con progress bar
 *   6. Solicitud con Documentos   — File upload (PDF, JPG, DOCX, máx. 10MB)
 *   7. Captación Inmobiliaria     — tipo de propiedad, presupuesto, ubicación, urgencia
 */

import { PrismaClient, Prisma } from '@prisma/client';
import * as dotenv from 'dotenv';

// Only load dotenv when running as CLI (not when imported by API routes)
const isRunDirectly = process.argv[1]?.endsWith('seed-formularios-demo.ts') ||
                      process.argv[1]?.endsWith('seed-formularios-demo.js');

// Lazy prisma — created only when needed
let _prisma: PrismaClient | null = null;
function getPrisma(): PrismaClient {
  if (!_prisma) {
    if (isRunDirectly) {
      dotenv.config();
    }
    _prisma = new PrismaClient();
  }
  return _prisma;
}

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

  // ─── NPS Avanzado con lógica condicional ──────────────────────
  {
    name: 'NPS Avanzado',
    config: {
      title: 'Net Promoter Score®',
      description: 'Ayúdanos a entender tu experiencia con nosotros. Tus respuestas nos permiten mejorar cada día.',
      pages: [{
        name: 'page1',
        elements: [
          {
            type: 'text',
            name: 'nombre',
            title: 'Tu nombre',
            isRequired: true,
            placeholder: 'Ej. Laura Fernández',
          },
          {
            type: 'text',
            name: 'email',
            title: 'Tu email',
            isRequired: true,
            inputType: 'email',
            placeholder: 'tu@email.com',
          },
          {
            type: 'rating',
            name: 'nps_score',
            title: '¿Qué tan probable es que nos recomiendes a un amigo o colega?',
            description: '0 = Nada probable, 10 = Muy probable',
            isRequired: true,
            rateMin: 0,
            rateMax: 10,
            minRateDescription: 'Nada probable',
            maxRateDescription: 'Muy probable',
          },

          // ── Detractor (0-6): follow-up específico ──
          {
            type: 'radiogroup',
            name: 'detractor_razon',
            title: 'Lamentamos que tu experiencia no haya sido la mejor. ¿Qué fue lo que más te decepcionó?',
            visibleIf: '{nps_score} notempty and {nps_score} <= 6',
            isRequired: true,
            choices: [
              { value: 'atencion', text: 'Atención al cliente insuficiente' },
              { value: 'calidad', text: 'Calidad del producto/servicio por debajo de lo esperado' },
              { value: 'precio', text: 'Precio demasiado alto para el valor recibido' },
              { value: 'tiempo', text: 'Tiempos de entrega o respuesta muy lentos' },
              { value: 'usabilidad', text: 'Plataforma difícil de usar' },
              { value: 'soporte', text: 'Falta de soporte técnico' },
            ],
          },
          {
            type: 'comment',
            name: 'detractor_detalle',
            title: 'Cuéntanos más sobre tu experiencia. ¿Qué podríamos haber hecho diferente?',
            visibleIf: '{nps_score} notempty and {nps_score} <= 6',
            isRequired: true,
            placeholder: 'Tu feedback honesto nos ayuda a mejorar...',
            rows: 4,
          },
          {
            type: 'radiogroup',
            name: 'detractor_seguimiento',
            title: '¿Te gustaría que un gerente te contactara para resolver tu caso?',
            visibleIf: '{nps_score} notempty and {nps_score} <= 6',
            choices: [
              { value: 'si', text: 'Sí, por favor' },
              { value: 'no', text: 'No, gracias' },
            ],
          },

          // ── Pasivo (7-8): follow-up de mejora ──
          {
            type: 'radiogroup',
            name: 'pasivo_mejora',
            title: 'Gracias por tu puntuación. ¿Qué podríamos mejorar para convertir tu experiencia en excepcional?',
            visibleIf: '{nps_score} notempty and {nps_score} >= 7 and {nps_score} <= 8',
            isRequired: true,
            choices: [
              { value: 'soporte', text: 'Mejor soporte y atención personalizada' },
              { value: 'features', text: 'Más funcionalidades' },
              { value: 'precio', text: 'Precios más competitivos' },
              { value: 'velocidad', text: 'Mayor velocidad de respuesta' },
              { value: 'documentacion', text: 'Mejor documentación y tutoriales' },
            ],
          },
          {
            type: 'comment',
            name: 'pasivo_detalle',
            title: 'Cuéntanos un poco más sobre qué mejorarías',
            visibleIf: '{nps_score} notempty and {nps_score} >= 7 and {nps_score} <= 8',
            placeholder: 'Tus sugerencias son muy valiosas...',
            rows: 3,
          },

          // ── Promotor (9-10): follow-up positivo ──
          {
            type: 'radiogroup',
            name: 'promotor_motivo',
            title: '¡Qué alegría que estés tan satisfecho! ¿Qué es lo que más valoras de nosotros?',
            visibleIf: '{nps_score} notempty and {nps_score} >= 9',
            isRequired: true,
            choices: [
              { value: 'resultados', text: 'Los resultados obtenidos' },
              { value: 'atencion', text: 'La atención y el servicio' },
              { value: 'facilidad', text: 'La facilidad de uso' },
              { value: 'innovacion', text: 'La innovación constante' },
              { value: 'equipo', text: 'El equipo humano' },
              { value: 'precio', text: 'Relación calidad-precio' },
            ],
          },
          {
            type: 'comment',
            name: 'promotor_testimonio',
            title: '¿Nos dejarías un breve testimonio sobre tu experiencia? (Puede ser público)',
            visibleIf: '{nps_score} notempty and {nps_score} >= 9',
            placeholder: 'Comparte tu historia de éxito...',
            rows: 3,
          },
          {
            type: 'checkbox',
            name: 'promotor_permiso',
            title: 'Autorizo usar mi testimonio de forma pública',
            visibleIf: '{nps_score} notempty and {nps_score} >= 9',
            choices: [{ value: 'si', text: 'Sí, pueden usar mi testimonio' }],
          },
        ],
      }],
      showQuestionNumbers: 'off',
      completeText: 'Enviar evaluación',
      completedHtml: '<div style="text-align:center;padding:24px"><h3>🙏 ¡Gracias por tu honestidad!</h3><p>Cada respuesta nos ayuda a construir un mejor servicio para ti y todos nuestros clientes.</p></div>',
    },
  },

  // ─── Wizard Multi-Step (3 páginas) ────────────────────────────
  {
    name: 'Onboarding Wizard',
    config: {
      title: 'Configura tu Cuenta',
      description: 'Completa este breve wizard en 3 pasos para configurar tu cuenta y empezar a usar Volkern.',
      showProgressBar: 'top',
      progressBarType: 'pages',
      pages: [
        // ── Paso 1: Datos personales ──
        {
          name: 'datos_personales',
          title: 'Datos Personales',
          description: 'Cuéntanos quién eres.',
          elements: [
            {
              type: 'text',
              name: 'nombre_completo',
              title: 'Nombre completo',
              isRequired: true,
              placeholder: 'Ej. Ana Martínez López',
            },
            {
              type: 'text',
              name: 'email',
              title: 'Correo electrónico',
              isRequired: true,
              inputType: 'email',
              placeholder: 'ana@empresa.com',
            },
            {
              type: 'text',
              name: 'telefono',
              title: 'Teléfono de contacto',
              inputType: 'tel',
              placeholder: '+52 555 123 4567',
            },
            {
              type: 'dropdown',
              name: 'rol',
              title: '¿Cuál es tu rol principal?',
              isRequired: true,
              choices: [
                { value: 'ceo', text: 'CEO / Director General' },
                { value: 'comercial', text: 'Director Comercial / Ventas' },
                { value: 'marketing', text: 'Director de Marketing' },
                { value: 'operaciones', text: 'Director de Operaciones' },
                { value: 'rrhh', text: 'Director de RRHH' },
                { value: 'otro', text: 'Otro' },
              ],
            },
          ],
        },
        // ── Paso 2: Información del negocio ──
        {
          name: 'info_negocio',
          title: 'Tu Negocio',
          description: 'Ayúdanos a entender tu empresa.',
          elements: [
            {
              type: 'text',
              name: 'empresa',
              title: 'Nombre de la empresa',
              isRequired: true,
              placeholder: 'Tu Empresa S.A. de C.V.',
            },
            {
              type: 'dropdown',
              name: 'sector',
              title: 'Sector / Industria',
              isRequired: true,
              choices: [
                { value: 'tecnologia', text: 'Tecnología / SaaS' },
                { value: 'inmobiliario', text: 'Inmobiliario / Construcción' },
                { value: 'servicios', text: 'Servicios profesionales' },
                { value: 'salud', text: 'Salud / Bienestar' },
                { value: 'educacion', text: 'Educación / Formación' },
                { value: 'retail', text: 'Retail / E-commerce' },
                { value: 'financiero', text: 'Servicios financieros' },
                { value: 'otro', text: 'Otro' },
              ],
            },
            {
              type: 'dropdown',
              name: 'tamano_empresa',
              title: 'Tamaño de la empresa',
              isRequired: true,
              choices: [
                { value: '1-5', text: '1 - 5 empleados (Startup)' },
                { value: '6-20', text: '6 - 20 empleados (Pequeña)' },
                { value: '21-50', text: '21 - 50 empleados (Mediana)' },
                { value: '51-200', text: '51 - 200 empleados' },
                { value: '200+', text: 'Más de 200 empleados (Grande)' },
              ],
            },
            {
              type: 'text',
              name: 'website',
              title: 'Sitio web',
              inputType: 'url',
              placeholder: 'https://www.tuempresa.com',
            },
          ],
        },
        // ── Paso 3: Objetivos y preferencias ──
        {
          name: 'objetivos',
          title: 'Tus Objetivos',
          description: '¿Qué esperas lograr con Volkern?',
          elements: [
            {
              type: 'checkbox',
              name: 'objetivos_principales',
              title: '¿Cuáles son tus principales objetivos? (Selecciona todos los que apliquen)',
              isRequired: true,
              choices: [
                { value: 'gestion_leads', text: 'Gestionar leads y pipeline de ventas' },
                { value: 'automatizar', text: 'Automatizar procesos repetitivos' },
                { value: 'centralizar', text: 'Centralizar la comunicación con clientes' },
                { value: 'reportes', text: 'Obtener reportes y analíticas avanzadas' },
                { value: 'facturacion', text: 'Gestionar facturación y finanzas' },
                { value: 'equipo', text: 'Gestionar mi equipo y recursos humanos' },
              ],
            },
            {
              type: 'radiogroup',
              name: 'urgencia',
              title: '¿Qué tan urgente es tu necesidad?',
              isRequired: true,
              choices: [
                { value: 'inmediata', text: 'Inmediata — necesito solución ya' },
                { value: 'semana', text: 'Esta semana' },
                { value: 'mes', text: 'Este mes' },
                { value: 'explorando', text: 'Solo estoy explorando opciones' },
              ],
            },
            {
              type: 'dropdown',
              name: 'presupuesto_mensual',
              title: 'Presupuesto mensual estimado para software',
              choices: [
                { value: '0-50', text: 'Menos de $50 USD' },
                { value: '50-200', text: '$50 - $200 USD' },
                { value: '200-500', text: '$200 - $500 USD' },
                { value: '500-2000', text: '$500 - $2,000 USD' },
                { value: '2000+', text: 'Más de $2,000 USD' },
              ],
            },
            {
              type: 'comment',
              name: 'notas_adicionales',
              title: '¿Algo más que quieras compartir?',
              placeholder: 'Cualquier detalle adicional que nos ayude a entender tu situación...',
              rows: 3,
            },
          ],
        },
      ],
      showQuestionNumbers: 'off',
      completeText: 'Completar configuración',
      completedHtml: '<div style="text-align:center;padding:24px"><h3>🎉 ¡Configuración completada!</h3><p>Gracias por tomarte el tiempo. Un especialista revisará tus respuestas y te contactará con recomendaciones personalizadas.</p></div>',
    },
  },

  // ─── File Upload ──────────────────────────────────────────────
  {
    name: 'Solicitud con Documentos',
    config: {
      title: 'Envía tu Solicitud',
      description: 'Completa el formulario y adjunta los documentos necesarios para procesar tu solicitud.',
      pages: [{
        name: 'page1',
        elements: [
          {
            type: 'text',
            name: 'nombre',
            title: 'Nombre completo',
            isRequired: true,
            placeholder: 'Ej. Pedro Ramírez',
          },
          {
            type: 'text',
            name: 'email',
            title: 'Correo electrónico',
            isRequired: true,
            inputType: 'email',
            placeholder: 'pedro@email.com',
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
            title: 'Empresa (si aplica)',
            placeholder: 'Nombre de tu empresa',
          },
          {
            type: 'dropdown',
            name: 'tipo_solicitud',
            title: 'Tipo de solicitud',
            isRequired: true,
            choices: [
              { value: 'cotizacion', text: 'Cotización de servicios' },
              { value: 'reclamo', text: 'Reclamo o incidencia' },
              { value: 'devolucion', text: 'Devolución o garantía' },
              { value: 'contratacion', text: 'Contratación de plan' },
              { value: 'soporte', text: 'Soporte técnico avanzado' },
              { value: 'otro', text: 'Otro' },
            ],
          },
          {
            type: 'comment',
            name: 'descripcion',
            title: 'Describe tu solicitud',
            isRequired: true,
            placeholder: 'Proporciona todos los detalles relevantes para procesar tu solicitud...',
            rows: 4,
          },
          {
            type: 'file',
            name: 'documento_adjunto',
            title: 'Adjunta documentos de soporte',
            description: 'Formatos aceptados: PDF, JPG, PNG, DOCX (máx. 10MB por archivo)',
            acceptedTypes: '.pdf,.jpg,.jpeg,.png,.doc,.docx',
            maxSize: 10485760,  // 10MB in bytes
          },
          {
            type: 'file',
            name: 'documento_secundario',
            title: 'Documento adicional (opcional)',
            description: 'Adjunta cualquier otro documento relevante',
            acceptedTypes: '.pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx',
            maxSize: 10485760,
          },
          {
            type: 'checkbox',
            name: 'terminos',
            title: 'Términos y condiciones',
            isRequired: true,
            choices: [
              { value: 'acepto', text: 'Acepto los términos y condiciones y la política de privacidad' },
            ],
          },
        ],
      }],
      showQuestionNumbers: 'off',
      completeText: 'Enviar solicitud',
      completedHtml: '<div style="text-align:center;padding:24px"><h3>📋 ¡Solicitud enviada con éxito!</h3><p>Hemos recibido tu solicitud y documentos. Nuestro equipo la revisará y te contactará en un máximo de 48 horas hábiles.</p></div>',
    },
  },

  // ─── Captación Inmobiliaria ───────────────────────────────────
  {
    name: 'Captación Inmobiliaria',
    config: {
      title: 'Captación de Propiedad',
      description: 'Completa este formulario y uno de nuestros asesores inmobiliarios te contactará para gestionar tu propiedad.',
      pages: [{
        name: 'page1',
        elements: [
          {
            type: 'text',
            name: 'nombre',
            title: 'Nombre completo',
            isRequired: true,
            placeholder: 'Ej. Roberto Méndez',
          },
          {
            type: 'text',
            name: 'email',
            title: 'Correo electrónico',
            isRequired: true,
            inputType: 'email',
            placeholder: 'roberto@email.com',
          },
          {
            type: 'text',
            name: 'telefono',
            title: 'Teléfono de contacto',
            isRequired: true,
            inputType: 'tel',
            placeholder: '+52 555 123 4567',
          },
          {
            type: 'radiogroup',
            name: 'tipo_propiedad',
            title: 'Tipo de propiedad',
            isRequired: true,
            choices: [
              { value: 'departamento', text: 'Departamento' },
              { value: 'casa', text: 'Casa' },
              { value: 'terreno', text: 'Terreno' },
              { value: 'oficina', text: 'Oficina / Local comercial' },
              { value: 'bodega', text: 'Bodega / Nave industrial' },
              { value: 'lujo', text: 'Residencia de lujo' },
              { value: 'otro', text: 'Otro' },
            ],
          },
          {
            type: 'radiogroup',
            name: 'proposito',
            title: '¿Qué deseas hacer con la propiedad?',
            isRequired: true,
            choices: [
              { value: 'vender', text: 'Vender' },
              { value: 'rentar', text: 'Rentar' },
              { value: 'ambos', text: 'Ambos (el que llegue primero)' },
              { value: 'valuar', text: 'Solo quiero una valuación' },
            ],
          },
          {
            type: 'dropdown',
            name: 'presupuesto',
            title: 'Rango de precio estimado',
            isRequired: true,
            choices: [
              { value: '0-500k', text: 'Menos de $500,000 MXN' },
              { value: '500k-1m', text: '$500,000 - $1,000,000 MXN' },
              { value: '1m-2m', text: '$1,000,000 - $2,000,000 MXN' },
              { value: '2m-5m', text: '$2,000,000 - $5,000,000 MXN' },
              { value: '5m-10m', text: '$5,000,000 - $10,000,000 MXN' },
              { value: '10m+', text: 'Más de $10,000,000 MXN' },
            ],
          },
          {
            type: 'text',
            name: 'ubicacion',
            title: 'Ubicación de la propiedad',
            isRequired: true,
            placeholder: 'Ej. Colonia Condesa, CDMX',
          },
          {
            type: 'text',
            name: 'codigo_postal',
            title: 'Código postal',
            inputType: 'text',
            placeholder: 'Ej. 06140',
          },
          {
            type: 'radiogroup',
            name: 'urgencia',
            title: '¿Qué tan urgente es la operación?',
            isRequired: true,
            choices: [
              { value: 'inmediata', text: 'Inmediata — necesito cerrar ya' },
              { value: '30_dias', text: 'En los próximos 30 días' },
              { value: '90_dias', text: 'En los próximos 90 días' },
              { value: '6_meses', text: 'En los próximos 6 meses' },
              { value: 'explorando', text: 'Solo estoy explorando el mercado' },
            ],
          },
          {
            type: 'text',
            name: 'metros_terreno',
            title: 'Metros de terreno (m²)',
            inputType: 'number',
            placeholder: 'Ej. 200',
          },
          {
            type: 'text',
            name: 'metros_construccion',
            title: 'Metros de construcción (m²)',
            inputType: 'number',
            placeholder: 'Ej. 150',
          },
          {
            type: 'text',
            name: 'recamaras',
            title: 'Número de recámaras',
            inputType: 'number',
            placeholder: 'Ej. 3',
          },
          {
            type: 'text',
            name: 'banos',
            title: 'Número de baños',
            inputType: 'number',
            placeholder: 'Ej. 2',
          },
          {
            type: 'checkbox',
            name: 'amenidades',
            title: 'Amenidades y características',
            choices: [
              { value: 'estacionamiento', text: 'Estacionamiento' },
              { value: 'jardin', text: 'Jardín / Patio' },
              { value: 'alberca', text: 'Alberca' },
              { value: 'vigilancia', text: 'Vigilancia 24/7' },
              { value: 'gimnasio', text: 'Gimnasio' },
              { value: 'roof_garden', text: 'Roof Garden / Terraza' },
              { value: 'elevador', text: 'Elevador' },
              { value: 'cuarto_servicio', text: 'Cuarto de servicio' },
            ],
          },
          {
            type: 'comment',
            name: 'descripcion_adicional',
            title: 'Descripción adicional de la propiedad',
            placeholder: 'Cuéntanos más sobre la propiedad: estado de conservación, remodelaciones recientes, vista, orientación, etc.',
            rows: 3,
          },
        ],
      }],
      showQuestionNumbers: 'off',
      completeText: 'Enviar información',
      completedHtml: '<div style="text-align:center;padding:24px"><h3>🏠 ¡Información recibida!</h3><p>Un asesor inmobiliario especializado revisará tu caso y te contactará en menos de 24 horas para dar seguimiento.</p></div>',
    },
  },
];

// ─── Helpers ─────────────────────────────────────────────────────

async function seedFormsForTenant(
  tenantId: string,
  opts?: { prisma?: PrismaClient }
) {
  const db = opts?.prisma || getPrisma();

  const tenant = await db.tenant.findUnique({
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
    const existing = await db.webForm.findFirst({
      where: { tenantId: tenant.id, name: formDef.name },
      select: { id: true },
    });

    if (existing) {
      skipped.push(formDef.name);
      continue;
    }

    await db.webForm.create({
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

// ─── Main (solo se ejecuta cuando el script se corre directamente) ──

async function main() {
  const arg = process.argv[2];

  if (!arg) {
    console.error('❌ Uso: npx tsx scripts/seed-formularios-demo.ts <tenant_slug>');
    console.error('   o: npx tsx scripts/seed-formularios-demo.ts --all');
    process.exit(1);
  }

  if (arg === '--all') {
    console.log('🌱 Sembrando formularios demo para TODOS los tenants...\n');

    const db = getPrisma();

    const tenants = await db.tenant.findMany({
      where: { estado: 'activo' },
      select: { id: true, nombre: true, slug: true },
      orderBy: { fechaCreacion: 'asc' },
    });

    console.log(`   📋 ${tenants.length} tenants activos encontrados\n`);

    let totalCreated = 0;
    let totalSkipped = 0;

    for (const tenant of tenants) {
      const { created, skipped } = await seedFormsForTenant(tenant.id, { prisma: db });
      totalCreated += created.length;
      totalSkipped += skipped.length;

      const icon = created.length > 0 ? '✅' : '⏭️';
      console.log(`   ${icon} ${tenant.nombre} (${tenant.slug}): ${created.length} nuevos, ${skipped.length} ya existentes`);
    }

    console.log(`\n✨ Total: ${totalCreated} formularios creados, ${totalSkipped} omitidos (ya existían)`);
  } else {
    // Single tenant by slug
    const db = getPrisma();
    const tenant = await db.tenant.findUnique({
      where: { slug: arg },
      select: { id: true, nombre: true, slug: true },
    });

    if (!tenant) {
      console.error(`❌ Tenant con slug "${arg}" no encontrado.`);
      process.exit(1);
    }

    console.log(`🌱 Sembrando formularios demo para: ${tenant.nombre} (${tenant.slug})\n`);

    const { created, skipped } = await seedFormsForTenant(tenant.id, { prisma: db });

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

// Only run CLI when executed directly (not when imported)

if (isRunDirectly) {
  main()
    .then(async () => {
      await getPrisma().$disconnect();
    })
    .catch(async (e) => {
      console.error('❌ Error:', e);
      try { await getPrisma().$disconnect(); } catch {}
      process.exit(1);
    });
}

export { seedFormsForTenant, DEMO_FORMS };
