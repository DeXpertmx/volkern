import React from 'react';
import { PublicLayout } from '@/components/public/PublicLayout';
import { VerticalHero } from '@/components/public/VerticalHero';
import { VerticalFeatureGrid } from '@/components/public/VerticalFeatureGrid';
import { VerticalCTA } from '@/components/public/VerticalCTA';

export const metadata = {
  title: 'Volkern para Manufactura e Industria | ERP Industrial con IA',
  description: 'Producción, proyectos, inventario, calidad y contratos. El ERP industrial que unifica tu operación con trazabilidad criptográfica e IA.',
};

export default function IndustriaPage() {
  return (
    <PublicLayout>
      <VerticalHero
        badge="Módulo ERP Industrial"
        title="Operaciones Industriales"
        highlight="Inteligentes y Conectadas."
        description="Producción, proyectos, inventario y calidad en una sola plataforma. Controla tu cadena de suministro, gestiona órdenes de producción, asegura la calidad con trazabilidad criptográfica y mantén tus activos bajo control."
        primaryCta={{ text: 'Solicitar Demo', href: '/#demo' }}
        secondaryCta={{ text: 'Ver Características', href: '#features' }}
        accentColor="orange"
        imageSrc="/industria.png"
        imageAlt="Dashboard de Volkern para Industria y Manufactura"
      />

      <VerticalFeatureGrid
        id="features"
        title="Tu Planta de Producción, Digitalizada"
        subtitle="Desde la orden de producción hasta la entrega, pasando por control de calidad, inventario y activos. Todo con la potencia de Volkern."
        accentColor="orange"
        features={[
          {
            icon: 'Factory',
            title: 'Producción y MRP',
            description: 'Gestiona órdenes de producción, planificación de capacidad, listas de materiales (BoM), ruteo de fabricación y seguimiento de lotes con trazabilidad completa.',
          },
          {
            icon: 'ClipboardCheck',
            title: 'Gestión de Proyectos',
            description: 'Planifica proyectos industriales con hitos, asignación de recursos, cronogramas y seguimiento de costes. Vista Kanban, Gantt y dashboard ejecutivo.',
          },
          {
            icon: 'Package',
            title: 'Inventario y Almacenes',
            description: 'Control de stock multi-almacén, ubicaciones, lotes y series. Alertas de inventario mínimo, valoración FIFO/PMP y picking automatizado.',
          },
          {
            icon: 'ShieldCheck',
            title: 'Calidad y QC Industrial',
            description: 'Puntos de control de calidad, inspecciones, no conformidades y acciones correctivas. Trazabilidad criptográfica con auditoría IA para cumplimiento normativo.',
          },
          {
            icon: 'ScrollText',
            title: 'Contratos Blindados',
            description: 'Gestión de contratos de suministro, servicios y obra. Firma digital, cláusulas configurables, fechas de vigencia y alertas de renovación.',
          },
          {
            icon: 'HardDrive',
            title: 'Gestión de Activos',
            description: 'Registro de activos industriales, mantenimiento preventivo y correctivo, historial de intervenciones, asignaciones y renovaciones programadas.',
          },
          {
            icon: 'Truck',
            title: 'Cadena de Suministro',
            description: 'Gestión de proveedores, órdenes de compra, recepción de mercancía y logística. Integración directa con inventario y producción.',
          },
          {
            icon: 'Bot',
            title: 'IA Operacional',
            description: 'Asistente IA especializado en operaciones: \u0022¿qué órdenes de producción vencen esta semana?\u0022, \u0022alertas de stock crítico\u0022, \u0022estado de calidad por lote\u0022.',
          },
        ]}
      />

      <VerticalCTA
        title="Digitaliza tu Operación Industrial"
        description="Unifica producción, proyectos, calidad e inventario en una plataforma con trazabilidad total, alertas inteligentes e IA operacional."
        buttonText="Solicitar Demo"
        buttonHref="/#demo"
        secondaryText="Ver Planes"
        secondaryHref="/#pricing"
        accentColor="orange"
      />
    </PublicLayout>
  );
}
