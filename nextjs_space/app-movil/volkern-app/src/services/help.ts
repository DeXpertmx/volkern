// ─── Help Center Service ──────────────────────────────────────────────────────
// FAQ, tutoriales, guías y contacto de soporte

export interface FAQItem {
  id: string;
  category: FAQCategory;
  question: string;
  answer: string;
}

export interface FAQCategory {
  id: string;
  icon: string;
  color: string;
}

export interface TutorialGuide {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  steps: string[];
  route?: string;
}

export interface SupportContact {
  email: string;
  phone?: string;
  hours: string;
  responseTime: string;
}

export const FAQ_CATEGORIES: FAQCategory[] = [
  { id: 'getting-started', icon: 'rocket', color: '#2563EB' },
  { id: 'account', icon: 'person', color: '#8B5CF6' },
  { id: 'modules', icon: 'grid', color: '#10B981' },
  { id: 'tasks', icon: 'checkbox', color: '#F59E0B' },
  { id: 'calendar', icon: 'calendar', color: '#EC4899' },
  { id: 'billing', icon: 'card', color: '#06B6D4' },
  { id: 'support', icon: 'chatbubbles', color: '#F97316' },
];

export const SUPPORT_CONTACT: SupportContact = {
  email: 'soporte@volkern.com',
  hours: 'Lun–Vie 9:00–18:00',
  responseTime: '≤ 24h',
};

export const FAQ_ITEMS: FAQItem[] = [
  {
    id: 'faq-1',
    category: { id: 'getting-started', icon: 'rocket', color: '#2563EB' },
    question: '¿Cómo empiezo a usar Volkern?',
    answer: 'Regístrate con tu correo, completa tu perfil y explora los módulos disponibles. Gemma, tu asistente IA, te guiará en los primeros pasos. Puedes empezar agregando tus primeros leads o creando una tarea.',
  },
  {
    id: 'faq-2',
    category: { id: 'getting-started', icon: 'rocket', color: '#2563EB' },
    question: '¿Qué puedo hacer con Gemma?',
    answer: 'Gemma es tu asistente de IA que puede responder preguntas sobre tus datos, ayudarte a agendar citas, generar reportes, y darte recomendaciones de ventas y marketing.',
  },
  {
    id: 'faq-3',
    category: { id: 'account', icon: 'person', color: '#8B5CF6' },
    question: '¿Cómo cambio mi contraseña?',
    answer: 'Ve a Perfil → Cambiar Contraseña. Ingresa tu contraseña actual y la nueva. Debe tener al menos 8 caracteres.',
  },
  {
    id: 'faq-4',
    category: { id: 'account', icon: 'person', color: '#8B5CF6' },
    question: '¿Puedo usar huella dactilar para acceder?',
    answer: 'Sí, ve a Perfil → Seguridad → Acceso Biométrico y actívalo. Podrás iniciar sesión con tu huella o Face ID.',
  },
  {
    id: 'faq-5',
    category: { id: 'account', icon: 'person', color: '#8B5CF6' },
    question: '¿Cómo configuro la autenticación en 2 pasos?',
    answer: 'En Perfil → Seguridad, activa el switch de Autenticación en 2 pasos. Recibirás un código adicional al iniciar sesión.',
  },
  {
    id: 'faq-6',
    category: { id: 'modules', icon: 'grid', color: '#10B981' },
    question: '¿Qué módulos están disponibles?',
    answer: 'Volkern incluye módulos de Ventas, Marketing, Comunicación, CRM, Academia, ERP, Administración, Estrategia e Integraciones. Explora todos desde la pestaña Módulos.',
  },
  {
    id: 'faq-7',
    category: { id: 'modules', icon: 'grid', color: '#10B981' },
    question: '¿Puedo personalizar los módulos?',
    answer: 'Sí, puedes marcar módulos y tareas como favoritos para acceder rápido desde tu perfil. También puedes reorganizar tu experiencia desde Configuración.',
  },
  {
    id: 'faq-8',
    category: { id: 'tasks', icon: 'checkbox', color: '#F59E0B' },
    question: '¿Cómo creo una tarea?',
    answer: 'Ve a la pestaña Tareas y presiona el botón +. Asigna un título, descripción, prioridad, categoría y fecha de vencimiento.',
  },
  {
    id: 'faq-9',
    category: { id: 'tasks', icon: 'checkbox', color: '#F59E0B' },
    question: '¿Puedo ordenar mis tareas?',
    answer: 'Sí, puedes ordenar por fecha (más recientes o más antiguas) y por prioridad. Usa el botón de ordenar en la pantalla de Tareas.',
  },
  {
    id: 'faq-10',
    category: { id: 'calendar', icon: 'calendar', color: '#EC4899' },
    question: '¿Cómo agendo un evento?',
    answer: 'En la pestaña Calendario, selecciona un día y presiona el botón +. Completa el título, tipo, fecha, hora y ubicación del evento.',
  },
  {
    id: 'faq-11',
    category: { id: 'billing', icon: 'card', color: '#06B6D4' },
    question: '¿Cómo veo mi plan actual?',
    answer: 'Ve a Perfil y revisa la sección de Uso del Plan. Allí verás tu plan actual, límites y opción para mejorar.',
  },
  {
    id: 'faq-12',
    category: { id: 'billing', icon: 'card', color: '#06B6D4' },
    question: '¿Cómo actualizo mi plan?',
    answer: 'Desde Perfil, en la sección de Uso del Plan, presiona "Mejorar plan" para ver las opciones disponibles.',
  },
  {
    id: 'faq-13',
    category: { id: 'support', icon: 'chatbubbles', color: '#F97316' },
    question: '¿Cómo contacto a soporte?',
    answer: 'Puedes escribirnos a soporte@volkern.com. Respondemos en máximo 24 horas en días hábiles.',
  },
  {
    id: 'faq-14',
    category: { id: 'support', icon: 'chatbubbles', color: '#F97316' },
    question: '¿Dónde puedo ver tutoriales?',
    answer: 'En esta misma sección encontrarás guías paso a paso sobre las funcionalidades principales de Volkern.',
  },
];

export const TUTORIALS: TutorialGuide[] = [
  {
    id: 'tut-1',
    title: 'Primeros pasos',
    description: 'Configura tu cuenta y conoce la plataforma',
    icon: 'rocket',
    color: '#2563EB',
    steps: [
      'Completa tu perfil con nombre y teléfono',
      'Explora los módulos disponibles en la pestaña Módulos',
      'Crea tu primer lead desde el Dashboard',
      'Agenda una cita de prueba',
      'Pregunta a Gemma para conocer más funciones',
    ],
  },
  {
    id: 'tut-2',
    title: 'Gestión de tareas',
    description: 'Organiza tu trabajo diario',
    icon: 'checkbox',
    color: '#F59E0B',
    steps: [
      'Ve a la pestaña Tareas',
      'Presiona + para crear una nueva tarea',
      'Asigna prioridad y fecha de vencimiento',
      'Marca tareas como completadas',
      'Usa los filtros para ver tareas activas o vencidas',
    ],
  },
  {
    id: 'tut-3',
    title: 'Metas y OKRs',
    description: 'Define y da seguimiento a tus objetivos',
    icon: 'stats-chart',
    color: '#10B981',
    steps: [
      'Ve a Perfil → Gestión de Metas',
      'Presiona + para crear una nueva meta',
      'Elige tipo: numérica, porcentaje o sí/no',
      'Define el valor objetivo y fecha límite',
      'Da seguimiento actualizando tu progreso',
    ],
  },
  {
    id: 'tut-4',
    title: 'Contactos CRM',
    description: 'Administra tu cartera de contactos',
    icon: 'people',
    color: '#8B5CF6',
    steps: [
      'Ve a Perfil → Gestión de Contactos',
      'Presiona + para agregar un nuevo contacto',
      'Registra nombre, teléfono, email y empresa',
      'Añade etiquetas para organizar tus contactos',
      'Registra interacciones para dar seguimiento',
    ],
  },
];

export function getFAQsByCategory(categoryId: string): FAQItem[] {
  return FAQ_ITEMS.filter((faq) => faq.category.id === categoryId);
}

export function searchFAQs(query: string): FAQItem[] {
  const q = query.toLowerCase();
  return FAQ_ITEMS.filter(
    (faq) =>
      faq.question.toLowerCase().includes(q) || faq.answer.toLowerCase().includes(q),
  );
}

export function getCategoryById(id: string): FAQCategory | undefined {
  return FAQ_CATEGORIES.find((c) => c.id === id);
}

export const helpService = {
  getFAQsByCategory,
  searchFAQs,
  getCategoryById,
  FAQ_CATEGORIES,
  FAQ_ITEMS,
  TUTORIALS,
  SUPPORT_CONTACT,
};
