import React from 'react';
import { PublicLayout } from '@/components/public/PublicLayout';
import { VerticalHero } from '@/components/public/VerticalHero';
import { VerticalFeatureGrid } from '@/components/public/VerticalFeatureGrid';
import { VerticalCTA } from '@/components/public/VerticalCTA';

export const metadata = {
  title: 'Volkern para Academias | LMS con CRM Integrado',
  description: 'Crea y vende cursos online, gestiona estudiantes, emite certificaciones y automatiza tu academia con el LMS más completo e integrado con CRM.',
};

export default function AcademyPage() {
  return (
    <PublicLayout>
      <VerticalHero
        badge="Módulo Academia (LMS)"
        title="Tu Academia Online"
        highlight="con potencia empresarial."
        description="Crea cursos con lecciones multimedia, gestiona estudiantes y cohortes, emite certificaciones digitales, y conecta todo con tu CRM y facturación."
        primaryCta={{ text: 'Solicitar Demo', href: '/#demo' }}
        secondaryCta={{ text: 'Ver Características', href: '#features' }}
        accentColor="amber"
        imageSrc="/academia.png"
        imageAlt="Dashboard de Volkern para Academias"
      />

      <VerticalFeatureGrid
        id="features"
        title="Educación que Escala"
        subtitle="Desde un curso hasta una universidad corporativa. Volkern Academy es el LMS más integrado del mercado, conectado con CRM, facturación y automatizaciones."
        accentColor="amber"
        features={[
          {
            icon: 'BookOpen',
            title: 'Creador de Cursos',
            description: 'Lecciones multimedia (video, PDF, audio, texto), quizzes, tareas prácticas, módulos reordenables y progreso automático del estudiante.',
          },
          {
            icon: 'GraduationCap',
            title: 'Certificaciones Digitales',
            description: 'Certificados automáticos al completar cursos, plantillas personalizables, códigos QR de verificación y compartición en redes sociales.',
          },
          {
            icon: 'Users',
            title: 'Gestión de Estudiantes',
            description: 'Perfiles completos, historial de cursos, progreso individual, notas, cohortes y grupos. Consentimiento GDPR y seguimiento de cumplimiento normativo.',
          },
          {
            icon: 'ShoppingCart',
            title: 'Venta de Cursos Integrada',
            description: 'Catálogo público, pasarela de pago Stripe, códigos de descuento, cupones y suscripciones. Facturación automática con Veri*Factu.',
          },
          {
            icon: 'MessageCircle',
            title: 'Comunicación con Estudiantes',
            description: 'Notificaciones push, emails automáticos, WhatsApp para recordatorios y chat en vivo. Segmentación por curso, progreso o cohorte.',
          },
          {
            icon: 'BarChart3',
            title: 'Analíticas de Academia',
            description: 'Tasa de finalización, engagement por lección, progreso por cohorte, ingresos por curso, estudiantes activos y tendencias de inscripción.',
          },
          {
            icon: 'Bot',
            title: 'Tutor IA',
            description: 'Asistente que responde dudas de los estudiantes 24/7, sugiere contenido adicional basado en el progreso y evalúa respuestas abiertas.',
          },
          {
            icon: 'Globe',
            title: 'Portal de Estudiante White Label',
            description: 'Marca propia, dominio personalizado, diseño responsive, app móvil integrada y experiencia de aprendizaje consistente en todos los dispositivos.',
          },
        ]}
      />

      <VerticalCTA
        title="Lanza tu Academia en Días, no Meses"
        description="Desde la creación del curso hasta la certificación, pasando por ventas, facturación y soporte. Todo en una plataforma soberana."
        buttonText="Solicitar Demo"
        buttonHref="/#demo"
        secondaryText="Ver Planes"
        secondaryHref="/precios"
        accentColor="amber"
      />
    </PublicLayout>
  );
}
