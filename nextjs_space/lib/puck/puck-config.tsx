/**
 * Volkern CMS - Puck Configuration
 * 
 * Configuración completa de componentes para el editor Puck
 */

import React from "react";
import type { Config, Data } from "@measured/puck";
import {
  HeroComponent,
  SectionComponent,
  ColumnsComponent,
  HeadingComponent,
  TextComponent,
  RichTextComponent,
  ImageComponent,
  VideoComponent,
  ButtonComponent,
  LeadFormComponent,
  TestimonialComponent,
  FAQComponent,
  SocialLinksComponent,
  SpacerComponent,
  DividerComponent,
  FeaturesComponent,
  PricingComponent,
  NavbarComponent,
  FooterComponent,
  CardComponent,
  BookingCalendarComponent,
  ServiceCatalogComponent,
  ProductCatalogComponent,
} from "./components";

// ============== PUCK CONFIG ==============

export const puckConfig: Config = {
  root: {
    fields: {
      title: {
        type: "text",
        label: "Título de la página",
      },
      description: {
        type: "textarea",
        label: "Meta descripción",
      },
    },
    defaultProps: {
      title: "Mi Página",
      description: "",
    },
    render: ({ children, title }: any) => (
      <div className="min-h-screen">
        {children}
      </div>
    ),
  },
  categories: {
    layout: {
      title: "📏 Layout",
      components: ["Hero", "Section", "Columns", "Spacer", "Divider"],
    },
    texto: {
      title: "✍️ Texto",
      components: ["Heading", "Text", "RichText"],
    },
    media: {
      title: "🖼️ Media",
      components: ["Image", "Video"],
    },
    interactivos: {
      title: "🔘 Interactivos",
      components: ["Button", "LeadForm", "BookingCalendar"],
    },
    crm: {
      title: "📊 CRM",
      components: ["ServiceCatalog", "ProductCatalog"],
    },
    contenido: {
      title: "📄 Contenido",
      components: ["Card", "Testimonial", "Features", "Pricing", "FAQ"],
    },
    navegacion: {
      title: "📡 Navegación",
      components: ["Navbar", "Footer", "SocialLinks"],
    },
  },
  components: {
    // ========== LAYOUT ==========
    Hero: {
      label: "Hero Banner",
      fields: {
        title: { type: "text", label: "Título" },
        subtitle: { type: "textarea", label: "Subtítulo" },
        backgroundImage: { type: "text", label: "URL de imagen de fondo" },
        backgroundOverlay: { type: "radio", label: "Overlay oscuro", options: [{ label: "Sí", value: true }, { label: "No", value: false }] },
        overlayOpacity: { type: "number", label: "Opacidad del overlay (%)", min: 0, max: 100 },
        alignment: {
          type: "select",
          label: "Alineación",
          options: [
            { label: "Izquierda", value: "left" },
            { label: "Centro", value: "center" },
            { label: "Derecha", value: "right" },
          ],
        },
        ctaText: { type: "text", label: "Texto del botón" },
        ctaLink: { type: "text", label: "Enlace del botón" },
        ctaStyle: {
          type: "select",
          label: "Estilo del botón",
          options: [
            { label: "Primario", value: "primary" },
            { label: "Secundario", value: "secondary" },
            { label: "Outline", value: "outline" },
          ],
        },
        minHeight: { type: "text", label: "Altura mínima (ej: 500px)" },
      },
      defaultProps: {
        title: "Bienvenido a nuestra página",
        subtitle: "Descubre lo que podemos hacer por ti",
        backgroundImage: "https://images.unsplash.com/photo-1557683316-973673baf926?w=1920",
        backgroundOverlay: true,
        overlayOpacity: 50,
        alignment: "center",
        ctaText: "Comenzar",
        ctaLink: "#contacto",
        ctaStyle: "primary",
        minHeight: "500px",
      },
      render: HeroComponent as any,
    },
    Section: {
      label: "Sección",
      fields: {
        backgroundColor: { type: "text", label: "Color de fondo" },
        backgroundImage: { type: "text", label: "Imagen de fondo (URL)" },
        paddingY: { type: "text", label: "Padding vertical (ej: 4rem)" },
        paddingX: { type: "text", label: "Padding horizontal" },
        maxWidth: {
          type: "select",
          label: "Ancho máximo",
          options: [
            { label: "Completo", value: "full" },
            { label: "7xl (80rem)", value: "7xl" },
            { label: "6xl (72rem)", value: "6xl" },
            { label: "5xl (64rem)", value: "5xl" },
            { label: "4xl (56rem)", value: "4xl" },
          ],
        },
      },
      defaultProps: {
        backgroundColor: "#ffffff",
        backgroundImage: "",
        paddingY: "4rem",
        paddingX: "1.5rem",
        maxWidth: "7xl",
      },
      render: SectionComponent as any,
    },
    Columns: {
      label: "Columnas",
      fields: {
        columns: { type: "number", label: "Número de columnas", min: 1, max: 6 },
        gap: { type: "text", label: "Espacio entre columnas" },
        verticalAlign: {
          type: "select",
          label: "Alineación vertical",
          options: [
            { label: "Arriba", value: "top" },
            { label: "Centro", value: "center" },
            { label: "Abajo", value: "bottom" },
          ],
        },
      },
      defaultProps: {
        columns: 2,
        gap: "1.5rem",
        verticalAlign: "top",
      },
      render: ColumnsComponent as any,
    },
    Spacer: {
      label: "Espaciador",
      fields: {
        height: { type: "text", label: "Altura (ej: 2rem, 50px)" },
      },
      defaultProps: {
        height: "2rem",
      },
      render: SpacerComponent as any,
    },
    Divider: {
      label: "Separador",
      fields: {
        style: {
          type: "select",
          label: "Estilo",
          options: [
            { label: "Sólido", value: "solid" },
            { label: "Punteado", value: "dashed" },
            { label: "Puntos", value: "dotted" },
          ],
        },
        color: { type: "text", label: "Color" },
        thickness: { type: "text", label: "Grosor" },
      },
      defaultProps: {
        style: "solid",
        color: "#e5e7eb",
        thickness: "1px",
      },
      render: DividerComponent as any,
    },

    // ========== TEXTO ==========
    Heading: {
      label: "Título",
      fields: {
        text: { type: "text", label: "Texto" },
        level: {
          type: "select",
          label: "Nivel",
          options: [
            { label: "H1 - Principal", value: "h1" },
            { label: "H2 - Sección", value: "h2" },
            { label: "H3 - Subsección", value: "h3" },
            { label: "H4 - Menor", value: "h4" },
          ],
        },
        alignment: {
          type: "select",
          label: "Alineación",
          options: [
            { label: "Izquierda", value: "left" },
            { label: "Centro", value: "center" },
            { label: "Derecha", value: "right" },
          ],
        },
        color: { type: "text", label: "Color" },
      },
      defaultProps: {
        text: "Título de ejemplo",
        level: "h2",
        alignment: "left",
        color: "",
      },
      render: HeadingComponent as any,
    },
    Text: {
      label: "Texto",
      fields: {
        content: { type: "textarea", label: "Contenido" },
        alignment: {
          type: "select",
          label: "Alineación",
          options: [
            { label: "Izquierda", value: "left" },
            { label: "Centro", value: "center" },
            { label: "Derecha", value: "right" },
            { label: "Justificado", value: "justify" },
          ],
        },
        color: { type: "text", label: "Color" },
        fontSize: {
          type: "select",
          label: "Tamaño",
          options: [
            { label: "Pequeño", value: "sm" },
            { label: "Normal", value: "base" },
            { label: "Grande", value: "lg" },
            { label: "Extra grande", value: "xl" },
          ],
        },
      },
      defaultProps: {
        content: "Este es un párrafo de ejemplo. Puedes editarlo para agregar tu propio contenido.",
        alignment: "left",
        color: "",
        fontSize: "base",
      },
      render: TextComponent as any,
    },
    RichText: {
      label: "Texto Enriquecido",
      fields: {
        html: { type: "textarea", label: "HTML" },
      },
      defaultProps: {
        html: "<p>Contenido con <strong>formato</strong> enriquecido.</p>",
      },
      render: RichTextComponent as any,
    },

    // ========== MEDIA ==========
    Image: {
      label: "Imagen",
      fields: {
        src: { type: "text", label: "URL de la imagen" },
        alt: { type: "text", label: "Texto alternativo" },
        width: { type: "text", label: "Ancho (ej: 100%, 500px)" },
        height: { type: "text", label: "Alto (ej: auto, 300px)" },
        objectFit: {
          type: "select",
          label: "Ajuste",
          options: [
            { label: "Cubrir", value: "cover" },
            { label: "Contener", value: "contain" },
            { label: "Llenar", value: "fill" },
          ],
        },
        rounded: {
          type: "select",
          label: "Bordes redondeados",
          options: [
            { label: "Ninguno", value: "none" },
            { label: "Pequeño", value: "sm" },
            { label: "Medio", value: "md" },
            { label: "Grande", value: "lg" },
            { label: "Extra grande", value: "xl" },
            { label: "Círculo", value: "full" },
          ],
        },
        shadow: {
          type: "select",
          label: "Sombra",
          options: [
            { label: "Ninguna", value: "none" },
            { label: "Pequeña", value: "sm" },
            { label: "Media", value: "md" },
            { label: "Grande", value: "lg" },
            { label: "Extra grande", value: "xl" },
          ],
        },
      },
      defaultProps: {
        src: "https://upload.wikimedia.org/wikipedia/commons/6/65/No-Image-Placeholder.svg",
        alt: "Imagen",
        width: "100%",
        height: "auto",
        objectFit: "cover",
        rounded: "md",
        shadow: "none",
      },
      render: ImageComponent as any,
    },
    Video: {
      label: "Video",
      fields: {
        url: { type: "text", label: "URL del video (YouTube, Vimeo o directo)" },
        autoplay: { type: "radio", label: "Autoplay", options: [{ label: "Sí", value: true }, { label: "No", value: false }] },
        controls: { type: "radio", label: "Mostrar controles", options: [{ label: "Sí", value: true }, { label: "No", value: false }] },
        loop: { type: "radio", label: "Repetir", options: [{ label: "Sí", value: true }, { label: "No", value: false }] },
        muted: { type: "radio", label: "Silenciado", options: [{ label: "Sí", value: true }, { label: "No", value: false }] },
      },
      defaultProps: {
        url: "",
        autoplay: false,
        controls: true,
        loop: false,
        muted: false,
      },
      render: VideoComponent as any,
    },

    // ========== INTERACTIVOS ==========
    Button: {
      label: "Botón",
      fields: {
        text: { type: "text", label: "Texto" },
        link: { type: "text", label: "Enlace" },
        style: {
          type: "select",
          label: "Estilo",
          options: [
            { label: "Primario", value: "primary" },
            { label: "Secundario", value: "secondary" },
            { label: "Outline", value: "outline" },
            { label: "Ghost", value: "ghost" },
          ],
        },
        size: {
          type: "select",
          label: "Tamaño",
          options: [
            { label: "Pequeño", value: "sm" },
            { label: "Mediano", value: "md" },
            { label: "Grande", value: "lg" },
          ],
        },
        fullWidth: { type: "radio", label: "Ancho completo", options: [{ label: "Sí", value: true }, { label: "No", value: false }] },
        openInNewTab: { type: "radio", label: "Abrir en nueva pestaña", options: [{ label: "Sí", value: true }, { label: "No", value: false }] },
      },
      defaultProps: {
        text: "Click aquí",
        link: "#",
        style: "primary",
        size: "md",
        fullWidth: false,
        openInNewTab: false,
      },
      render: ButtonComponent as any,
    },
    LeadForm: {
      label: "Formulario de Leads",
      fields: {
        title: { type: "text", label: "Título" },
        description: { type: "textarea", label: "Descripción" },
        selectedFields: {
          type: "array",
          label: "Campos del Lead (CRM)",
          arrayFields: {
            value: {
              type: "select",
              label: "Campo",
              options: [
                { label: "Nombre", value: "nombre" },
                { label: "Email", value: "email" },
                { label: "Teléfono", value: "telefono" },
                { label: "Empresa", value: "empresa" },
                { label: "Cargo", value: "cargo" },
                { label: "Ubicación", value: "ubicacion" },
                { label: "Notas / Mensaje", value: "notas" },
                { label: "Contexto del Proyecto", value: "contextoProyecto" },
              ],
            },
          },
          defaultItemProps: { value: "nombre" },
          getItemSummary: (item: any) => {
            const labels: Record<string, string> = {
              nombre: "Nombre", email: "Email", telefono: "Teléfono",
              empresa: "Empresa", cargo: "Cargo", ubicacion: "Ubicación",
              notas: "Notas / Mensaje", contextoProyecto: "Contexto",
            };
            return labels[item?.value] || item?.value || "Campo";
          },
        },
        submitText: { type: "text", label: "Texto del botón" },
        successMessage: { type: "text", label: "Mensaje de éxito" },
        fuente: { type: "text", label: "Fuente del lead (ej: landing-web)" },
        contextoProyecto: { type: "textarea", label: "Contexto automático (se agrega al crear)" },
      },
      defaultProps: {
        title: "Contáctanos",
        description: "Completa el formulario y te responderemos pronto.",
        selectedFields: [
          { value: "nombre" },
          { value: "email" },
          { value: "notas" },
        ],
        submitText: "Enviar",
        successMessage: "¡Gracias! Te contactaremos pronto.",
        fuente: "pagina-cms",
        contextoProyecto: "",
      },
      render: (({ selectedFields, ...rest }: any) => {
        const flatFields = (selectedFields || []).map((f: any) => typeof f === 'string' ? f : f.value);
        return <LeadFormComponent {...rest} selectedFields={flatFields} />;
      }) as any,
    },
    BookingCalendar: {
      label: "Calendario de Reservas",
      fields: {
        servicioNombre: {
          type: "custom",
          label: "Servicio (del CRM)",
          render: ({ value, onChange }: any) => {
            const [opts, setOpts] = React.useState<any[]>([]);
            React.useEffect(() => {
              fetch("/api/cms/crm-data?type=servicios")
                .then(r => r.ok ? r.json() : { items: [] })
                .then(d => setOpts(d.items || []))
                .catch(() => {});
            }, []);
            return (
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={value || ""}
                onChange={(e) => onChange(e.target.value)}
              >
                <option value="">-- Seleccionar servicio --</option>
                {opts.map((s: any) => (
                  <option key={s.id} value={s.nombre}>{s.nombre} ({s.duracionMinutos}min - {s.precio} {s.moneda})</option>
                ))}
              </select>
            );
          },
        },
        title: { type: "text", label: "Título" },
        description: { type: "textarea", label: "Descripción" },
        showPrice: { type: "radio", label: "Mostrar precio", options: [{ label: "Sí", value: true }, { label: "No", value: false }] },
      },
      defaultProps: {
        servicioNombre: "",
        title: "Agenda tu cita",
        description: "Selecciona fecha y hora disponible.",
        showPrice: true,
      },
      render: BookingCalendarComponent as any,
    },

    // ========== CRM: CATÁLOGO DE SERVICIOS ==========
    ServiceCatalog: {
      label: "Catálogo de Servicios (CRM)",
      fields: {
        titulo: { type: "text", label: "Título de la sección" },
        layout: {
          type: "select",
          label: "Diseño",
          options: [
            { label: "Cuadrícula", value: "grid" },
            { label: "Lista", value: "list" },
          ],
        },
        showPrices: { type: "radio", label: "Mostrar precios", options: [{ label: "Sí", value: true }, { label: "No", value: false }] },
        showDuration: { type: "radio", label: "Mostrar duración", options: [{ label: "Sí", value: true }, { label: "No", value: false }] },
        showBookButton: { type: "radio", label: "Botón de reserva", options: [{ label: "Sí", value: true }, { label: "No", value: false }] },
        categoriaFiltro: { type: "text", label: "Filtrar por categoría (opcional)" },
      },
      defaultProps: {
        titulo: "Nuestros Servicios",
        layout: "grid",
        showPrices: true,
        showDuration: true,
        showBookButton: true,
        categoriaFiltro: "",
      },
      render: ServiceCatalogComponent as any,
    },

    // ========== CRM: CATÁLOGO DE PRODUCTOS ==========
    ProductCatalog: {
      label: "Catálogo de Productos (CRM)",
      fields: {
        titulo: { type: "text", label: "Título de la sección" },
        tipoFiltro: {
          type: "select",
          label: "Tipo de producto",
          options: [
            { label: "Todos", value: "" },
            { label: "Servicio", value: "servicio" },
            { label: "Producto", value: "producto" },
            { label: "Digital", value: "digital" },
          ],
        },
        layout: {
          type: "select",
          label: "Diseño",
          options: [
            { label: "Cuadrícula", value: "grid" },
            { label: "Lista", value: "list" },
          ],
        },
        showPrices: { type: "radio", label: "Mostrar precios", options: [{ label: "Sí", value: true }, { label: "No", value: false }] },
        showCategories: { type: "radio", label: "Mostrar categorías", options: [{ label: "Sí", value: true }, { label: "No", value: false }] },
        showCustomFields: { type: "radio", label: "Mostrar campos personalizados", options: [{ label: "Sí", value: true }, { label: "No", value: false }] },
      },
      defaultProps: {
        titulo: "Nuestros Productos",
        tipoFiltro: "",
        layout: "grid",
        showPrices: true,
        showCategories: true,
        showCustomFields: true,
      },
      render: ProductCatalogComponent as any,
    },

    // ========== CONTENIDO ==========
    Card: {
      label: "Tarjeta",
      fields: {
        title: { type: "text", label: "Título" },
        description: { type: "textarea", label: "Descripción" },
        image: { type: "text", label: "URL de imagen" },
        ctaText: { type: "text", label: "Texto del botón" },
        ctaLink: { type: "text", label: "Enlace del botón" },
      },
      defaultProps: {
        title: "Título de la tarjeta",
        description: "Descripción de la tarjeta",
        image: "",
        ctaText: "Ver más",
        ctaLink: "#",
      },
      render: CardComponent as any,
    },
    Testimonial: {
      label: "Testimonio",
      fields: {
        quote: { type: "textarea", label: "Cita" },
        author: { type: "text", label: "Autor" },
        role: { type: "text", label: "Cargo/Empresa" },
        avatar: { type: "text", label: "URL del avatar" },
        rating: { type: "number", label: "Calificación (0-5)", min: 0, max: 5 },
      },
      defaultProps: {
        quote: "Excelente servicio, muy recomendado.",
        author: "Cliente Satisfecho",
        role: "CEO, Empresa",
        avatar: "https://cdn.pixabay.com/photo/2017/03/31/17/39/avatar-2191918_960_720.png",
        rating: 5,
      },
      render: TestimonialComponent as any,
    },
    Features: {
      label: "Características",
      fields: {
        title: { type: "text", label: "Título" },
        subtitle: { type: "textarea", label: "Subtítulo" },
        features: {
          type: "array",
          label: "Características",
          arrayFields: {
            icon: { type: "text", label: "Icono (emoji)" },
            title: { type: "text", label: "Título" },
            description: { type: "textarea", label: "Descripción" },
          },
          defaultItemProps: {
            icon: "⭐",
            title: "Característica",
            description: "Descripción de la característica.",
          },
        },
        columns: { type: "number", label: "Columnas", min: 1, max: 4 },
      },
      defaultProps: {
        title: "Nuestras Características",
        subtitle: "Descubre lo que nos hace diferentes",
        features: [
          { icon: "⭐", title: "Calidad", description: "Productos de la más alta calidad." },
          { icon: "🚀", title: "Rapidez", description: "Entrega rápida y eficiente." },
          { icon: "💡", title: "Innovación", description: "Siempre a la vanguardia." },
        ],
        columns: 3,
      },
      render: FeaturesComponent as any,
    },
    Pricing: {
      label: "Precios",
      fields: {
        title: { type: "text", label: "Título" },
        subtitle: { type: "textarea", label: "Subtítulo" },
        plans: {
          type: "array",
          label: "Planes",
          arrayFields: {
            name: { type: "text", label: "Nombre" },
            price: { type: "text", label: "Precio" },
            period: { type: "text", label: "Período" },
            features: { type: "textarea", label: "Características (una por línea)" },
            ctaText: { type: "text", label: "Texto del botón" },
            ctaLink: { type: "text", label: "Enlace" },
            highlighted: { type: "radio", label: "Destacado", options: [{ label: "Sí", value: true }, { label: "No", value: false }] },
          },
          defaultItemProps: {
            name: "Plan",
            price: "$99",
            period: "/mes",
            features: "Característica 1\nCaracterística 2",
            ctaText: "Comenzar",
            ctaLink: "#",
            highlighted: false,
          },
        },
      },
      defaultProps: {
        title: "Nuestros Planes",
        subtitle: "Elige el plan que mejor se adapte a tus necesidades",
        plans: [
          {
            name: "Básico",
            price: "$99",
            period: "/mes",
            features: ["Característica 1", "Característica 2"],
            ctaText: "Empezar",
            ctaLink: "#",
            highlighted: false,
          },
          {
            name: "Pro",
            price: "$199",
            period: "/mes",
            features: ["Todo en Básico", "Característica 3", "Característica 4"],
            ctaText: "Empezar",
            ctaLink: "#",
            highlighted: true,
          },
        ],
      },
      render: PricingComponent as any,
    },
    FAQ: {
      label: "Preguntas Frecuentes",
      fields: {
        title: { type: "text", label: "Título" },
        items: {
          type: "array",
          label: "Preguntas",
          arrayFields: {
            question: { type: "text", label: "Pregunta" },
            answer: { type: "textarea", label: "Respuesta" },
          },
          defaultItemProps: {
            question: "¿Cuál es tu pregunta?",
            answer: "Esta es la respuesta.",
          },
        },
      },
      defaultProps: {
        title: "Preguntas Frecuentes",
        items: [
          { question: "¿Cómo puedo contactarlos?", answer: "Puedes contactarnos por email o teléfono." },
          { question: "¿Cuáles son sus horarios?", answer: "Lunes a Viernes de 9am a 6pm." },
        ],
      },
      render: FAQComponent as any,
    },

    // ========== NAVEGACIÓN ==========
    Navbar: {
      label: "Barra de Navegación",
      fields: {
        logo: { type: "text", label: "URL del logo" },
        logoText: { type: "text", label: "Texto del logo" },
        links: {
          type: "array",
          label: "Enlaces",
          arrayFields: {
            label: { type: "text", label: "Texto" },
            url: { type: "text", label: "URL" },
          },
          defaultItemProps: {
            label: "Enlace",
            url: "#",
          },
        },
        ctaText: { type: "text", label: "Texto del botón CTA" },
        ctaLink: { type: "text", label: "Enlace del CTA" },
        sticky: { type: "radio", label: "Fijo al hacer scroll", options: [{ label: "Sí", value: true }, { label: "No", value: false }] },
        transparent: { type: "radio", label: "Fondo transparente", options: [{ label: "Sí", value: true }, { label: "No", value: false }] },
      },
      defaultProps: {
        logo: "",
        logoText: "Mi Sitio",
        links: [
          { label: "Inicio", url: "#" },
          { label: "Servicios", url: "#servicios" },
          { label: "Contacto", url: "#contacto" },
        ],
        ctaText: "Comenzar",
        ctaLink: "#",
        sticky: true,
        transparent: false,
      },
      render: NavbarComponent as any,
    },
    Footer: {
      label: "Pie de Página",
      fields: {
        logo: { type: "text", label: "URL del logo" },
        description: { type: "textarea", label: "Descripción" },
        columns: {
          type: "array",
          label: "Columnas de enlaces",
          arrayFields: {
            title: { type: "text", label: "Título" },
            links: {
              type: "array",
              label: "Enlaces",
              arrayFields: {
                label: { type: "text", label: "Texto" },
                url: { type: "text", label: "URL" },
              },
              defaultItemProps: {
                label: "Enlace",
                url: "#",
              },
            },
          },
          defaultItemProps: {
            title: "Columna",
            links: [],
          },
        },
        copyright: { type: "text", label: "Texto de copyright" },
        socialLinks: {
          type: "array",
          label: "Redes sociales",
          arrayFields: {
            platform: { type: "text", label: "Plataforma" },
            url: { type: "text", label: "URL" },
          },
          defaultItemProps: {
            platform: "facebook",
            url: "#",
          },
        },
      },
      defaultProps: {
        logo: "",
        description: "Tu empresa de confianza.",
        columns: [
          {
            title: "Empresa",
            links: [
              { label: "Nosotros", url: "#" },
              { label: "Contacto", url: "#" },
            ],
          },
        ],
        copyright: "",
        socialLinks: [],
      },
      render: FooterComponent as any,
    },
    SocialLinks: {
      label: "Redes Sociales",
      fields: {
        links: {
          type: "array",
          label: "Redes",
          arrayFields: {
            platform: {
              type: "select",
              label: "Plataforma",
              options: [
                { label: "Facebook", value: "facebook" },
                { label: "Instagram", value: "instagram" },
                { label: "Twitter", value: "twitter" },
                { label: "LinkedIn", value: "linkedin" },
                { label: "YouTube", value: "youtube" },
                { label: "TikTok", value: "tiktok" },
                { label: "WhatsApp", value: "whatsapp" },
              ],
            },
            url: { type: "text", label: "URL" },
          },
          defaultItemProps: {
            platform: "facebook",
            url: "#",
          },
        },
        style: {
          type: "select",
          label: "Estilo",
          options: [
            { label: "Iconos", value: "icons" },
            { label: "Botones", value: "buttons" },
          ],
        },
        size: {
          type: "select",
          label: "Tamaño",
          options: [
            { label: "Pequeño", value: "sm" },
            { label: "Mediano", value: "md" },
            { label: "Grande", value: "lg" },
          ],
        },
      },
      defaultProps: {
        links: [
          { platform: "facebook", url: "#" },
          { platform: "instagram", url: "#" },
        ],
        style: "icons",
        size: "md",
      },
      render: SocialLinksComponent as any,
    },
  },
};

// Tipo de datos Puck
export type PuckData = Data;

export default puckConfig;
