
import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config({ path: ['.env.local', '.env'] });

const prisma = new PrismaClient();

// Mock component types for seeding
const COMPONENT_TYPES = {
  // Layout
  CONTAINER: "container",
  SECTION: "section",
  ROW: "row",
  COLUMN: "column",
  SPACER: "spacer",
  DIVIDER: "divider",
  
  // Content
  TEXT: "text",
  HEADING: "heading",
  PARAGRAPH: "paragraph",
  IMAGE: "image",
  VIDEO: "video",
  BUTTON: "button",
  ICON: "icon",
  
  // Forms
  FORM: "form",
  INPUT: "input",
  TEXTAREA: "textarea",
  SELECT: "select",
  CHECKBOX: "checkbox",
  
  // CRM Integration
  LEAD_FORM: "lead_form",
  BOOKING_CALENDAR: "booking_calendar",
  PAYMENT_BUTTON: "payment_button",
  COURSE_ACCESS: "course_access",
  
  // Advanced
  HERO: "hero",
  FEATURES: "features",
  TESTIMONIALS: "testimonials",
  PRICING: "pricing",
  FAQ: "faq",
  CONTACT: "contact",
  FOOTER: "footer",
};

// Mock generateComponentId function for seeding
const generateComponentId = () => `comp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

async function main() {
  console.log("🌱 Seeding page templates...");

  // Landing Page Template
  const landingPageTemplate = await prisma.pageTemplate.upsert({
    where: { id: "template_landing_001" },
    update: {},
    create: {
      id: "template_landing_001",
      nombre: "Landing Page - Captura de Leads",
      descripcion:
        "Página de aterrizaje profesional con sección hero, características, testimonios y formulario de contacto",
      categoria: "landing",
      esPublica: true,
      ordenamiento: 1,
      etiquetas: ["landing", "leads", "conversion", "profesional"],
      contenido: {
        components: [
          {
            id: generateComponentId(),
            type: COMPONENT_TYPES.HERO,
            props: {
              titulo: "Transforma Tu Negocio con Nuestra Solución",
              subtitulo: "La plataforma todo-en-uno para impulsar tu crecimiento",
              descripcion:
                "Descubre cómo miles de empresas están automatizando sus procesos y multiplicando sus resultados con nuestra plataforma innovadora.",
              imagenFondo: "",
              textoBoton: "Comenzar Gratis",
              linkBoton: "#contacto",
            },
          },
          {
            id: generateComponentId(),
            type: COMPONENT_TYPES.FEATURES,
            props: {
              titulo: "¿Por Qué Elegirnos?",
              items: [
                {
                  icono: "star",
                  titulo: "Fácil de Usar",
                  descripcion:
                    "Interfaz intuitiva que no requiere conocimientos técnicos",
                },
                {
                  icono: "check",
                  titulo: "Automatización Completa",
                  descripcion:
                    "Ahorra tiempo automatizando tareas repetitivas",
                },
                {
                  icono: "heart",
                  titulo: "Soporte 24/7",
                  descripcion:
                    "Nuestro equipo está siempre disponible para ayudarte",
                },
              ],
            },
          },
          {
            id: generateComponentId(),
            type: COMPONENT_TYPES.TESTIMONIALS,
            props: {
              titulo: "Lo Que Dicen Nuestros Clientes",
              testimonios: [
                {
                  nombre: "María González",
                  cargo: "CEO, Tech Solutions",
                  foto: "",
                  testimonio:
                    "Esta plataforma ha transformado completamente la forma en que gestionamos nuestro negocio. ¡Altamente recomendada!",
                  calificacion: 5,
                },
                {
                  nombre: "Carlos Rodríguez",
                  cargo: "Director de Marketing, Digital Corp",
                  foto: "",
                  testimonio:
                    "Los resultados fueron inmediatos. En solo 3 meses duplicamos nuestra conversión de leads.",
                  calificacion: 5,
                },
              ],
            },
          },
          {
            id: generateComponentId(),
            type: COMPONENT_TYPES.LEAD_FORM,
            props: {
              titulo: "¿Listo para Comenzar?",
              descripcion:
                "Déjanos tus datos y te contactaremos para una demostración personalizada.",
              campos: ["nombre", "email", "telefono", "empresa"],
              textoBoton: "Solicitar Demo Gratis",
              colorBoton: "#10b981",
              mensajeExito:
                "¡Gracias! Te contactaremos pronto para agendar tu demo.",
            },
          },
        ],
      },
    },
  });

  // Service Page Template
  const servicePageTemplate = await prisma.pageTemplate.upsert({
    where: { id: "template_service_001" },
    update: {},
    create: {
      id: "template_service_001",
      nombre: "Página de Servicios",
      descripcion:
        "Página profesional para mostrar tus servicios con precios y calendario de reservas",
      categoria: "service",
      esPublica: true,
      ordenamiento: 2,
      etiquetas: ["servicios", "precios", "reservas", "profesional"],
      contenido: {
        components: [
          {
            id: generateComponentId(),
            type: COMPONENT_TYPES.SECTION,
            props: {
              padding: "80px 20px",
              backgroundColor: "#f9fafb",
            },
            children: [
              {
                id: generateComponentId(),
                type: COMPONENT_TYPES.HEADING,
                props: {
                  content: "Nuestros Servicios",
                  level: "h1",
                  fontSize: "48px",
                  fontWeight: "700",
                  textAlign: "center",
                  margin: "0 0 20px 0",
                },
              },
              {
                id: generateComponentId(),
                type: COMPONENT_TYPES.PARAGRAPH,
                props: {
                  content:
                    "Ofrecemos soluciones personalizadas para impulsar tu negocio",
                  fontSize: "20px",
                  textAlign: "center",
                  color: "#6b7280",
                },
              },
            ],
          },
          {
            id: generateComponentId(),
            type: COMPONENT_TYPES.PRICING,
            props: {
              titulo: "Planes y Precios",
              planes: [
                {
                  nombre: "Básico",
                  precio: 99,
                  moneda: "USD",
                  periodo: "mes",
                  caracteristicas: [
                    "Consultoría inicial",
                    "1 sesión mensual",
                    "Soporte por email",
                    "Acceso a recursos básicos",
                  ],
                  destacado: false,
                },
                {
                  nombre: "Profesional",
                  precio: 249,
                  moneda: "USD",
                  periodo: "mes",
                  caracteristicas: [
                    "Todo en Básico",
                    "4 sesiones mensuales",
                    "Soporte prioritario 24/7",
                    "Acceso a todos los recursos",
                    "Análisis personalizado",
                  ],
                  destacado: true,
                },
                {
                  nombre: "Empresarial",
                  precio: 499,
                  moneda: "USD",
                  periodo: "mes",
                  caracteristicas: [
                    "Todo en Profesional",
                    "Sesiones ilimitadas",
                    "Gerente dedicado",
                    "Implementación personalizada",
                    "Capacitación del equipo",
                  ],
                  destacado: false,
                },
              ],
            },
          },
          {
            id: generateComponentId(),
            type: COMPONENT_TYPES.BOOKING_CALENDAR,
            props: {
              titulo: "Agenda Tu Consultoría",
              descripcion:
                "Selecciona la fecha y hora que mejor te convenga para una sesión personalizada.",
              servicioId: null,
            },
          },
        ],
      },
    },
  });

  // Membership Page Template
  const membershipPageTemplate = await prisma.pageTemplate.upsert({
    where: { id: "template_membership_001" },
    update: {},
    create: {
      id: "template_membership_001",
      nombre: "Página de Membresía",
      descripcion:
        "Página atractiva para promover y vender membresías o suscripciones",
      categoria: "membership",
      esPublica: true,
      ordenamiento: 3,
      etiquetas: ["membresía", "suscripción", "comunidad", "acceso"],
      contenido: {
        components: [
          {
            id: generateComponentId(),
            type: COMPONENT_TYPES.HERO,
            props: {
              titulo: "Únete a Nuestra Comunidad Exclusiva",
              subtitulo: "Acceso ilimitado a recursos premium",
              descripcion:
                "Obtén acceso a cursos, masterclasses, comunidad privada y mucho más. Invierte en tu crecimiento profesional hoy.",
              imagenFondo: "",
              textoBoton: "Ver Planes",
              linkBoton: "#planes",
            },
          },
          {
            id: generateComponentId(),
            type: COMPONENT_TYPES.SECTION,
            props: {
              padding: "60px 20px",
              backgroundColor: "#ffffff",
            },
            children: [
              {
                id: generateComponentId(),
                type: COMPONENT_TYPES.HEADING,
                props: {
                  content: "¿Qué Incluye la Membresía?",
                  level: "h2",
                  fontSize: "36px",
                  fontWeight: "700",
                  textAlign: "center",
                  margin: "0 0 40px 0",
                },
              },
              {
                id: generateComponentId(),
                type: COMPONENT_TYPES.FEATURES,
                props: {
                  titulo: "",
                  items: [
                    {
                      icono: "star",
                      titulo: "Cursos Premium",
                      descripcion: "Acceso a todos nuestros cursos y materiales",
                    },
                    {
                      icono: "check",
                      titulo: "Comunidad Privada",
                      descripcion: "Networking con otros miembros exitosos",
                    },
                    {
                      icono: "heart",
                      titulo: "Eventos Exclusivos",
                      descripcion: "Masterclasses y webinars cada mes",
                    },
                  ],
                },
              },
            ],
          },
          {
            id: generateComponentId(),
            type: COMPONENT_TYPES.PRICING,
            props: {
              titulo: "Elige Tu Plan",
              planes: [
                {
                  nombre: "Mensual",
                  precio: 47,
                  moneda: "USD",
                  periodo: "mes",
                  caracteristicas: [
                    "Acceso a todos los cursos",
                    "Comunidad privada",
                    "Eventos mensuales",
                    "Cancela cuando quieras",
                  ],
                  destacado: false,
                },
                {
                  nombre: "Anual",
                  precio: 397,
                  moneda: "USD",
                  periodo: "año",
                  caracteristicas: [
                    "Todo en Mensual",
                    "Ahorra 30%",
                    "2 meses gratis",
                    "Sesiones 1-on-1 trimestrales",
                    "Certificados premium",
                  ],
                  destacado: true,
                },
              ],
            },
          },
          {
            id: generateComponentId(),
            type: COMPONENT_TYPES.TESTIMONIALS,
            props: {
              titulo: "Historias de Éxito",
              testimonios: [
                {
                  nombre: "Laura Martínez",
                  cargo: "Emprendedora Digital",
                  foto: "",
                  testimonio:
                    "Gracias a esta membresía, pude lanzar mi negocio en línea en solo 3 meses. ¡Valió cada centavo!",
                  calificacion: 5,
                },
                {
                  nombre: "Jorge Silva",
                  cargo: "Consultor",
                  foto: "",
                  testimonio:
                    "La comunidad es increíble. He hecho conexiones que han transformado mi carrera.",
                  calificacion: 5,
                },
              ],
            },
          },
        ],
      },
    },
  });

  // Course Page Template
  const coursePageTemplate = await prisma.pageTemplate.upsert({
    where: { id: "template_course_001" },
    update: {},
    create: {
      id: "template_course_001",
      nombre: "Página de Curso",
      descripcion:
        "Página de ventas para cursos en línea con vista previa y beneficios",
      categoria: "course",
      esPublica: true,
      ordenamiento: 4,
      etiquetas: ["curso", "educación", "online", "aprendizaje"],
      contenido: {
        components: [
          {
            id: generateComponentId(),
            type: COMPONENT_TYPES.HERO,
            props: {
              titulo: "Domina [Tu Habilidad] en 30 Días",
              subtitulo: "Curso completo con certificación",
              descripcion:
                "Aprende de los expertos y obtén las habilidades que necesitas para destacar en tu industria.",
              imagenFondo: "",
              textoBoton: "Inscríbete Ahora",
              linkBoton: "#inscripcion",
            },
          },
          {
            id: generateComponentId(),
            type: COMPONENT_TYPES.SECTION,
            props: {
              padding: "60px 20px",
              backgroundColor: "#f9fafb",
            },
            children: [
              {
                id: generateComponentId(),
                type: COMPONENT_TYPES.HEADING,
                props: {
                  content: "Lo Que Aprenderás",
                  level: "h2",
                  fontSize: "36px",
                  fontWeight: "700",
                  textAlign: "center",
                  margin: "0 0 40px 0",
                },
              },
              {
                id: generateComponentId(),
                type: COMPONENT_TYPES.FEATURES,
                props: {
                  titulo: "",
                  items: [
                    {
                      icono: "star",
                      titulo: "Módulo 1: Fundamentos",
                      descripcion: "Conceptos básicos y preparación",
                    },
                    {
                      icono: "check",
                      titulo: "Módulo 2: Práctica",
                      descripcion: "Ejercicios y proyectos reales",
                    },
                    {
                      icono: "heart",
                      titulo: "Módulo 3: Avanzado",
                      descripcion: "Técnicas profesionales y certificación",
                    },
                  ],
                },
              },
            ],
          },
          {
            id: generateComponentId(),
            type: COMPONENT_TYPES.VIDEO,
            props: {
              src: "",
              width: "100%",
              height: "auto",
              controls: true,
              autoplay: false,
            },
          },
          {
            id: generateComponentId(),
            type: COMPONENT_TYPES.SECTION,
            props: {
              padding: "60px 20px",
              backgroundColor: "#ffffff",
            },
            children: [
              {
                id: generateComponentId(),
                type: COMPONENT_TYPES.HEADING,
                props: {
                  content: "Inversión en Tu Futuro",
                  level: "h2",
                  fontSize: "36px",
                  fontWeight: "700",
                  textAlign: "center",
                  margin: "0 0 40px 0",
                },
              },
              {
                id: generateComponentId(),
                type: COMPONENT_TYPES.PAYMENT_BUTTON,
                props: {
                  texto: "Inscríbete Ahora - $297 USD",
                  servicioId: null,
                  precio: 297,
                  moneda: "USD",
                  backgroundColor: "#10b981",
                  color: "#ffffff",
                },
              },
            ],
          },
          {
            id: generateComponentId(),
            type: COMPONENT_TYPES.SECTION,
            props: {
              padding: "40px 20px",
              backgroundColor: "#f9fafb",
            },
            children: [
              {
                id: generateComponentId(),
                type: COMPONENT_TYPES.PARAGRAPH,
                props: {
                  content:
                    "✓ Acceso de por vida ✓ Actualizaciones gratuitas ✓ Certificado de finalización ✓ Garantía de 30 días",
                  fontSize: "18px",
                  textAlign: "center",
                  color: "#059669",
                  fontWeight: "600",
                },
              },
            ],
          },
        ],
      },
    },
  });

  console.log("✅ Templates seeded successfully!");
  console.log("- Landing Page Template");
  console.log("- Service Page Template");
  console.log("- Membership Page Template");
  console.log("- Course Page Template");
}

main()
  .catch((e) => {
    console.error("Error seeding templates:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
