
// Tipos y utilidades para el constructor de páginas

export interface PageComponent {
  id: string;
  type: string;
  props: Record<string, any>;
  children?: PageComponent[];
  // Spatial properties for Pixel-Perfect positioning
  x?: number;
  y?: number;
  z?: number;
  w?: number | string;
  h?: number | string;
}

export interface PageData {
  components: PageComponent[];
  settings?: {
    backgroundColor?: string;
    maxWidth?: string;
    padding?: string;
  };
}

// Tipos de componentes disponibles
export const COMPONENT_TYPES = {
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
} as const;

// Propiedades por defecto para cada tipo de componente
export const DEFAULT_COMPONENT_PROPS: Record<string, any> = {
  [COMPONENT_TYPES.CONTAINER]: {
    maxWidth: "1200px",
    padding: "20px",
    backgroundColor: "transparent",
    height: "auto",
    minHeight: "100px",
    position: "relative",
  },
  [COMPONENT_TYPES.SECTION]: {
    padding: "60px 20px",
    backgroundColor: "#ffffff",
    minHeight: "300px",
    position: "relative",
  },
  [COMPONENT_TYPES.ROW]: {
    gap: "20px",
    align: "flex-start",
    justify: "flex-start",
  },
  [COMPONENT_TYPES.COLUMN]: {
    width: "100%",
    padding: "0",
  },
  [COMPONENT_TYPES.SPACER]: {
    height: "40px",
  },
  [COMPONENT_TYPES.DIVIDER]: {
    color: "#e5e7eb",
    height: "1px",
    margin: "20px 0",
  },
  [COMPONENT_TYPES.TEXT]: {
    content: "Escribe tu texto aquí",
    fontSize: "16px",
    color: "#1f2937",
    fontWeight: "400",
    textAlign: "left",
    width: "auto",
    height: "auto",
  },
  [COMPONENT_TYPES.HEADING]: {
    content: "Título de la Sección",
    level: "h2",
    fontSize: "36px",
    color: "#1f2937",
    fontWeight: "700",
    textAlign: "center",
  },
  [COMPONENT_TYPES.PARAGRAPH]: {
    content:
      "Este es un párrafo de ejemplo. Puedes editarlo haciendo clic en él.",
    fontSize: "16px",
    color: "#6b7280",
    lineHeight: "1.6",
  },
  [COMPONENT_TYPES.IMAGE]: {
    src: "/placeholder-image.png",
    alt: "Imagen",
    width: "100%",
    height: "auto",
    objectFit: "cover",
    borderRadius: "0px",
  },
  [COMPONENT_TYPES.VIDEO]: {
    src: "",
    width: "100%",
    height: "auto",
    autoplay: false,
    controls: true,
  },
  [COMPONENT_TYPES.BUTTON]: {
    text: "Haz Clic Aquí",
    link: "#",
    backgroundColor: "#3b82f6",
    color: "#ffffff",
    fontSize: "16px",
    padding: "12px 24px",
    borderRadius: "6px",
    fontWeight: "600",
  },
  [COMPONENT_TYPES.LEAD_FORM]: {
    titulo: "¿Interesado? ¡Contáctanos!",
    descripcion: "Déjanos tus datos y te contactaremos pronto.",
    campos: ["nombre", "email", "telefono"],
    textoBoton: "Enviar",
    colorBoton: "#10b981",
    mensajeExito: "¡Gracias! Te contactaremos pronto.",
  },
  [COMPONENT_TYPES.BOOKING_CALENDAR]: {
    titulo: "Agenda una Cita",
    descripcion: "Selecciona el mejor horario para ti.",
    servicioId: null,
  },
  [COMPONENT_TYPES.PAYMENT_BUTTON]: {
    texto: "Comprar Ahora",
    servicioId: null,
    precio: 0,
    moneda: "EUR",
    backgroundColor: "#10b981",
    color: "#ffffff",
  },
  [COMPONENT_TYPES.HERO]: {
    titulo: "Bienvenido a Nuestra Plataforma",
    subtitulo: "La mejor solución para tu negocio",
    descripcion:
      "Descubre cómo podemos ayudarte a alcanzar tus objetivos de manera efectiva.",
    imagenFondo: "/hero-bg.jpg",
    textoBoton: "Comenzar Ahora",
    linkBoton: "#",
  },
  [COMPONENT_TYPES.FEATURES]: {
    titulo: "Características Principales",
    items: [
      {
        icono: "star",
        titulo: "Característica 1",
        descripcion: "Descripción de la característica 1",
      },
      {
        icono: "check",
        titulo: "Característica 2",
        descripcion: "Descripción de la característica 2",
      },
      {
        icono: "heart",
        titulo: "Característica 3",
        descripcion: "Descripción de la característica 3",
      },
    ],
  },
  [COMPONENT_TYPES.TESTIMONIALS]: {
    titulo: "Lo que Dicen Nuestros Clientes",
    testimonios: [
      {
        nombre: "Juan Pérez",
        cargo: "CEO, Empresa X",
        foto: "/avatar-1.jpg",
        testimonio: "Excelente servicio, muy recomendado.",
        calificacion: 5,
      },
    ],
  },
  [COMPONENT_TYPES.PRICING]: {
    titulo: "Planes y Precios",
    planes: [
      {
        nombre: "Básico",
        precio: 29,
        moneda: "EUR",
        periodo: "mes",
        caracteristicas: ["Feature 1", "Feature 2", "Feature 3"],
        destacado: false,
      },
      {
        nombre: "Pro",
        precio: 79,
        moneda: "EUR",
        periodo: "mes",
        caracteristicas: ["Feature 1", "Feature 2", "Feature 3", "Feature 4"],
        destacado: true,
      },
    ],
  },
};

// Utilidad para generar ID único
export function generateComponentId(): string {
  return `comp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Utilidad para clonar componente
export function cloneComponent(component: PageComponent): PageComponent {
  return {
    ...component,
    id: generateComponentId(),
    children: component.children?.map(cloneComponent),
  };
}

// Utilidad para encontrar componente por ID
export function findComponentById(
  components: PageComponent[],
  id: string
): PageComponent | null {
  for (const component of components) {
    if (component.id === id) return component;
    if (component.children) {
      const found = findComponentById(component.children, id);
      if (found) return found;
    }
  }
  return null;
}

// Utilidad para actualizar componente
export function updateComponent(
  components: PageComponent[],
  id: string,
  updates: Partial<PageComponent>
): PageComponent[] {
  return components.map((component) => {
    if (component.id === id) {
      return { ...component, ...updates };
    }
    if (component.children) {
      return {
        ...component,
        children: updateComponent(component.children, id, updates),
      };
    }
    return component;
  });
}

// Utilidad para eliminar componente
export function removeComponent(
  components: PageComponent[],
  id: string
): PageComponent[] {
  return components
    .filter((component) => component.id !== id)
    .map((component) => ({
      ...component,
      children: component.children
        ? removeComponent(component.children, id)
        : undefined,
    }));
}

// Utilidad para agregar componente
export function addComponent(
  components: PageComponent[],
  parentId: string | null,
  newComponent: PageComponent,
  index?: number
): PageComponent[] {
  if (parentId === null) {
    // Agregar al nivel raíz
    if (index !== undefined) {
      const newComponents = [...components];
      newComponents.splice(index, 0, newComponent);
      return newComponents;
    }
    return [...components, newComponent];
  }

  return components.map((component) => {
    if (component.id === parentId) {
      const children = component.children || [];
      if (index !== undefined) {
        const newChildren = [...children];
        newChildren.splice(index, 0, newComponent);
        return { ...component, children: newChildren };
      }
      return { ...component, children: [...children, newComponent] };
    }
    if (component.children) {
      return {
        ...component,
        children: addComponent(component.children, parentId, newComponent, index),
      };
    }
    return component;
  });
}

// Encuentra el ID del padre de un componente dado
export function findParentId(
  components: PageComponent[],
  childId: string,
  currentParentId: string | null = null
): string | null {
  for (const component of components) {
    if (component.id === childId) {
      return currentParentId;
    }
    if (component.children) {
      const found = findParentId(component.children, childId, component.id);
      if (found) return found;
    }
  }
  return null;
}

// Mueve un componente a una nueva posición, posiblemente con un nuevo padre
export function moveComponent(
  components: PageComponent[],
  activeId: string,
  overId: string,
  newParentId: string | null,
  newIndex: number
): PageComponent[] {
  const componentToMove = findComponentById(components, activeId);
  if (!componentToMove) return components;

  // 1. Eliminar el componente de su posición original
  let newTree = removeComponent(components, activeId);

  // 2. Insertarlo en la nueva posición
  newTree = addComponent(newTree, newParentId, componentToMove, newIndex);

  return newTree;
}
