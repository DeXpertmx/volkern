import React from 'react';
import { PublicLayout } from '@/components/public/PublicLayout';
import { VerticalHero } from '@/components/public/VerticalHero';
import { VerticalFeatureGrid } from '@/components/public/VerticalFeatureGrid';
import { VerticalCTA } from '@/components/public/VerticalCTA';
import { PortalLogosSection } from '@/components/public/PortalLogosSection';

export const metadata = {
  title: 'Volkern para Inmobiliarias | ERP Inmobiliario con IA',
  description: 'Gestiona propiedades, franquicias, comisiones y captación con el ERP inmobiliario más completo. Portal público embebible, IA consultora y CRM integrado.',
};

export default function RealEstatePage() {
  return (
    <PublicLayout>
      <VerticalHero
        badge="Módulo Inmobiliario"
        title="Gestiona tu Imperio Inmobiliario"
        highlight="desde un solo lugar."
        description="Catálogo extensible, portal público con filtros inteligentes, franquicias multi-agencia, exportación a +80 portales vía XML, JSON y CSV, cálculo automático de comisiones y un asistente IA que entiende tu negocio."
        primaryCta={{ text: 'Solicitar Demo', href: '/#demo' }}
        secondaryCta={{ text: 'Ver Características', href: '#features' }}
        accentColor="emerald"
        imageSrc="/real-estate.png"
        imageAlt="Dashboard de Volkern para Inmobiliarias"
      />

      <VerticalFeatureGrid
        id="features"
        title="Todo lo que necesitas para tu Inmobiliaria"
        subtitle="Desde la captación hasta el cierre, pasando por comisiones, franquicias y un portal público que vende por ti."
        accentColor="emerald"
        features={[
          {
            icon: 'Building2',
            title: 'Catálogo de Propiedades',
            description: 'Campos personalizables por tipo de inmueble (venta, renta, traspaso). Fotos, planos, visitas virtuales y vídeos. Clasificación por estado, zona y características.',
          },
          {
            icon: 'Globe',
            title: 'Portal Público Embebible',
            description: 'Listado y detalle de propiedades con filtros por precio, zona, tipo y más. SEO optimizado, responsive y configurable con tu marca.',
          },
          {
            icon: 'Network',
            title: 'Franquicias Multi-Agencia',
            description: 'Jerarquía de agencias con control granular. Cada agencia gestiona sus propiedades, clientes y agentes bajo la misma plataforma.',
          },
          {
            icon: 'Calculator',
            title: 'Comisiones Automáticas',
            description: 'Cálculo de splits agente/agencia/franquicia. Reglas configurables, reportes en tiempo real y exportación contable.',
          },
          {
            icon: 'Bot',
            title: 'IA Consultora Inmobiliaria',
            description: 'Asistente nativo que entiende consultas en lenguaje natural: "casas de 3 habitaciones en el norte por menos de 200K". Búsqueda semántica con fallback inteligente.',
          },
          {
            icon: 'BarChart3',
            title: 'Dashboard Analítico',
            description: 'KPIs de ventas, comparativas por agente/agencia, rotación de inventario, tasa de conversión y gráficos interactivos.',
          },
          {
            icon: 'FileSpreadsheet',
            title: 'Exportación Multi-Portal · +80 Portales',
            description: 'Exporta tu catálogo a Idealista, Fotocasa, Habitaclia, Pisos.com, Yaencontre y +80 portales más en formatos XML, JSON y CSV. Sincronización directa desde Volkern con delta automático. Sin intermediarios.',
          },
          {
            icon: 'ShieldCheck',
            title: 'Contratos de Captación',
            description: 'Gestión de exclusividad con blindaje legal. Firma digital, fechas de vigencia, cláusulas configurables y alertas de vencimiento.',
          },
        ]}
      />

      <PortalLogosSection />

      <VerticalCTA
        title="¿Listo para digitalizar tu Inmobiliaria?"
        description="Únete a las agencias que ya gestionan miles de propiedades con Volkern. Sincroniza con +80 portales, automatiza comisiones y escala tu negocio inmobiliario."
        buttonText="Solicitar Demo"
        buttonHref="/#demo"
        secondaryText="Ver Planes"
        secondaryHref="/precios"
        accentColor="emerald"
      />
    </PublicLayout>
  );
}
