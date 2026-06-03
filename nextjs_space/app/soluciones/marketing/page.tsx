import React from 'react';
import { PublicLayout } from '@/components/public/PublicLayout';
import { VerticalHero } from '@/components/public/VerticalHero';
import { VerticalFeatureGrid } from '@/components/public/VerticalFeatureGrid';
import { VerticalCTA } from '@/components/public/VerticalCTA';

export const metadata = {
  title: 'Volkern para Agencias de Marketing | CRM con Automatización',
  description: 'Gestiona campañas, leads, clientes y automatizaciones desde una plataforma todo-en-uno. Landing pages, email marketing, WhatsApp nativo y más.',
};

export default function MarketingPage() {
  return (
    <PublicLayout>
      <VerticalHero
        badge="Módulo de Marketing y Ventas"
        title="Tu Agencia de Marketing"
        highlight="potenciada con IA."
        description="Landing pages drag-and-drop, automatización de campañas multicanal, CRM con pipeline visual, WhatsApp Business nativo y analíticas en tiempo real."
        primaryCta={{ text: 'Solicitar Demo', href: '/#demo' }}
        secondaryCta={{ text: 'Ver Características', href: '#features' }}
        accentColor="purple"
        imageSrc="/marketing.png"
        imageAlt="Dashboard de Volkern para Agencias de Marketing"
      />

      <VerticalFeatureGrid
        id="features"
        title="Marketing Automation sin Límites"
        subtitle="Captura, nutre y convierte leads con automatizaciones inteligentes. Omnicanal nativo: web, email, WhatsApp, Telegram y redes sociales."
        accentColor="purple"
        features={[
          {
            icon: 'PenTool',
            title: 'Creador de Landing Pages',
            description: 'Editor visual drag-and-drop con componentes inteligentes. Plantillas profesionales, SEO optimizado y conversión maximizada. Sin necesidad de código.',
          },
          {
            icon: 'MessageCircle',
            title: 'WhatsApp Business Nativo',
            description: 'Chat embebido, campañas broadcast, plantillas aprobadas, respuestas automáticas con IA y analíticas de conversación. Sin depender de Meta API directamente.',
          },
          {
            icon: 'Workflow',
            title: 'Automatización de Campañas',
            description: 'Disparadores multi-evento, secuencias condicionales, scoring de leads, email marketing transaccional y campañas multicanal automatizadas.',
          },
          {
            icon: 'Users',
            title: 'CRM con Pipeline Visual',
            description: 'Gestión de leads en kanban, seguimiento de oportunidades, historial completo de interacciones, notas y tareas. Vista 360° del cliente.',
          },
          {
            icon: 'BarChart3',
            title: 'Analíticas en Tiempo Real',
            description: 'Dashboard con KPIs: tráfico, conversiones, ROI por campaña, coste por lead, tasa de apertura y mapas de calor. Datos actualizados al segundo.',
          },
          {
            icon: 'Mail',
            title: 'Email Marketing Transaccional',
            description: 'Campañas segmentadas, plantillas responsive, A/B testing, entregabilidad optimizada (AWS SES), estadísticas de apertura y click-through.',
          },
          {
            icon: 'Bot',
            title: 'Chatbot con IA Propia',
            description: 'Asistente virtual que responde dudas, califica leads y agenda citas. Entrenado con tu base de conocimiento. Sin límites de mensajes.',
          },
          {
            icon: 'GitBranch',
            title: 'Embudos de Conversión',
            description: 'Diseña embudos multi-paso con ramificaciones condicionales. Lead magnets, secuencias de nutrición, triggers por comportamiento y re-engagement.',
          },
        ]}
      />

      <VerticalCTA
        title="Escala tu Agencia con Automatización"
        description="Deja de perder leads y clientes por falta de seguimiento. Volkern automatiza cada punto de contacto para que tú te enfoques en crecer."
        buttonText="Solicitar Demo"
        buttonHref="/#demo"
        secondaryText="Ver Planes"
        secondaryHref="/#pricing"
        accentColor="purple"
      />
    </PublicLayout>
  );
}
