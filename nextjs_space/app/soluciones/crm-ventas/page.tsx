import React from 'react';
import { PublicLayout } from '@/components/public/PublicLayout';
import { VerticalHero } from '@/components/public/VerticalHero';
import { VerticalFeatureGrid } from '@/components/public/VerticalFeatureGrid';
import { VerticalCTA } from '@/components/public/VerticalCTA';

export const metadata = {
  title: 'Volkern CRM Ventas | CRM Completo con Pipeline, Leads y Tarjeta Digital',
  description: 'Pipeline Kanban, gestión de leads y contactos, cotizaciones profesionales, booking de citas, tarjeta digital con QR y pronósticos de ventas con IA.',
};

export default function CrmVentasPage() {
  return (
    <PublicLayout>
      <VerticalHero
        badge="CRM Ventas · Ya incluido"
        title="Tu Centro de Ventas"
        highlight="completo e integrado."
        description="Pipeline Kanban visual, leads con scoring inteligente, cotizaciones profesionales con firma digital, tarjeta de presentación con QR, booking de citas y automatizaciones omnicanal. El CRM que unifica todo tu ciclo comercial."
        primaryCta={{ text: 'Solicitar Demo', href: '/#demo' }}
        secondaryCta={{ text: 'Ver Características', href: '#features' }}
        accentColor="cyan"
        imageSrc=""
        imageAlt="Dashboard CRM Ventas de Volkern"
      />

      <VerticalFeatureGrid
        id="features"
        title="Tu Ciclo Comercial Completo en un Solo Lugar"
        subtitle="Desde la captación del lead hasta el cierre del deal, pasando por cotizaciones, contratos, citas y cobro. Todo integrado con WhatsApp, email y tarjeta digital."
        accentColor="cyan"
        features={[
          {
            icon: 'TrendingUp',
            title: 'Pipeline Kanban',
            description: 'Pipeline visual con drag & drop. Personaliza etapas, asigna responsables, define montos y probabilidades. Vista kanban con métricas por etapa y pronóstico de cierre integrado.',
          },
          {
            icon: 'Users',
            title: 'Leads con Scoring IA',
            description: 'Captura leads desde formularios embebibles, WhatsApp, chat web y tarjeta digital. Scoring automático por comportamiento, asignación inteligente a ejecutivos y campos personalizables.',
          },
          {
            icon: 'UserCheck',
            title: 'Contactos 360°',
            description: 'Vista completa de cada contacto con historial de interacciones, deals asociados, timeline de actividades, documentos, notas y tareas. Empresas vinculadas con directorio corporativo.',
          },
          {
            icon: 'FileText',
            title: 'Cotizaciones y Contratos',
            description: 'Cotizaciones profesionales con productos, servicios, descuentos e impuestos. Envío al cliente con link público, vista y firma digital. Conversión a contratos y órdenes de venta.',
          },
          {
            icon: 'Calendar',
            title: 'Booking de Citas',
            description: 'Link de agendamiento personalizado para que tus clientes reserven directamente. Sincronización con Google Calendar, recordatorios automáticos por WhatsApp/email y gestión de disponibilidad.',
          },
          {
            icon: 'CreditCard',
            title: 'Tarjeta Digital con QR',
            description: 'Tarjeta de presentación digital personalizable con datos de contacto, redes sociales y QR único para compartir. Escaneo de tarjetas físicas por IA con creación automática de leads.',
          },
          {
            icon: 'MessageCircle',
            title: 'Omnicanal Nativo',
            description: 'WhatsApp Business, email, llamadas VoIP y chat web unificados en el CRM. Automatizaciones con disparadores visuales, chatbot IA y plantillas de mensajes aprobadas.',
          },
          {
            icon: 'Bot',
            title: 'IA Comercial',
            description: 'Coach de ventas con análisis de deals, rutas de éxito, detección de objeciones y próximos pasos sugeridos. Pronósticos de ingresos basados en pipeline y alertas proactivas de oportunidades.',
          },
        ]}
      />

      <VerticalCTA
        title="El CRM que ya está en Volkern"
        description="No necesitas contratar nada extra. Leads, pipeline, cotizaciones, tarjeta digital, booking de citas y omnicanal ya funcionan hoy en tu plataforma."
        buttonText="Solicitar Demo"
        buttonHref="/#demo"
        secondaryText="Ver Planes"
        secondaryHref="/#pricing"
        accentColor="cyan"
      />
    </PublicLayout>
  );
}
