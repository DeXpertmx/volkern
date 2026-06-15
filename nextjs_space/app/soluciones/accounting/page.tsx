import React from 'react';
import { PublicLayout } from '@/components/public/PublicLayout';
import { VerticalHero } from '@/components/public/VerticalHero';
import { VerticalFeatureGrid } from '@/components/public/VerticalFeatureGrid';
import { VerticalCTA } from '@/components/public/VerticalCTA';

export const metadata = {
  title: 'Volkern para Asesorías Fiscales | Digitaliza y Escala tu Gestoría',
  description: 'La plataforma tecnológica para que asesorías fiscales y gestorías españolas digitalicen su operación y atiendan clientes en toda España sin abrir oficinas.',
};

export default function AccountingPage() {
  return (
    <PublicLayout>
      <VerticalHero
        badge="Para Asesorías Fiscales y Gestorías"
        title="Digitaliza tu Despacho,"
        highlight="Escala a Todo el País."
        description="Gestiona clientes, expedientes y modelos fiscales desde una sola plataforma. Automatiza el IVA, IRPF, Sociedades y plazos AEAT. Ofrece servicio en línea a nivel nacional sin abrir oficinas en cada provincia."
        primaryCta={{ text: 'Solicitar Demo', href: '/#demo' }}
        secondaryCta={{ text: 'Ver Características', href: '#features' }}
        accentColor="blue"
        imageSrc="/contable.png"
        imageAlt="Dashboard de Volkern para Asesorías Fiscales"
      />

      <VerticalFeatureGrid
        id="features"
        title="Todo lo que necesitas para escalar tu Asesoría"
        subtitle="Tú pones el expertise fiscal. Nosotros la tecnología para que puedas atender clientes de toda España desde un solo lugar."
        accentColor="blue"
        features={[
          {
            icon: 'Users',
            title: 'CRM Fiscal Multi-Cliente',
            description: 'Gestiona todos tus clientes, expedientes y declaraciones desde un solo panel. Acceso granular por cliente, historial completo y dashboard consolidado de tu despacho.',
          },
          {
            icon: 'FileCheck',
            title: 'Modelos Fiscales Automáticos',
            description: 'IVA (303), Retenciones (111), Pago Fraccionado (130), IVA Anual (390), Intracomunitario (349), Terceros (347) y Sociedades (200). Cálculo automático y control de presentación.',
          },
          {
            icon: 'Globe',
            title: 'Portal del Cliente 24/7',
            description: 'Cada cliente accede a su situación fiscal en cualquier momento. Descarga borradores, recibos y actas. Recibe alertas de vencimientos y notificaciones sin necesidad de llamarte.',
          },
          {
            icon: 'Calendar',
            title: 'Calendario de Plazos AEAT',
            description: 'Alertas automáticas de vencimientos para todos los modelos. Vista mensual y anual. Estado de cada declaración: pendiente, presentada, pagada. Evita sanciones por olvido.',
          },
          {
            icon: 'Calculator',
            title: 'Automatización de Cálculos',
            description: 'Cálculo automático de IVA soportado y repercutido, retenciones de IRPF, pagos fraccionados, nóminas e impuesto de sociedades. Minimiza errores manuales y ahorra horas de trabajo.',
          },
          {
            icon: 'Receipt',
            title: 'Gestión de Gastos y Facturas',
            description: 'Captura de facturas con OCR, categorización automática, detección de gastos deducibles e integración directa con los modelos fiscales correspondientes.',
          },
          {
            icon: 'Bot',
            title: 'Asistente IA para tu Despacho',
            description: 'Resuelve dudas de clientes al instante: \u0022¿cuándo presento el 303?\u0022, \u0022¿cuánto IVA soportado tengo este trimestre?\u0022. Skills especializados en fiscalidad española.',
          },
          {
            icon: 'Building2',
            title: 'Modelo de Franquicia Digital',
            description: 'Escala tu despacho sin abrir oficinas físicas. Tú mantienes el expertise fiscal y la relación con clientes. Nosotros te damos la plataforma, el portal del cliente y la automatización.',
          },
        ]}
      />

      <VerticalCTA
        title="¿Listo para digitalizar tu Asesoría?"
        description="Automatiza procesos, elimina fronteras geográficas y escala tu despacho a todo el país. Tú pones el conocimiento fiscal, nosotros la tecnología."
        buttonText="Solicitar Demo"
        buttonHref="/#demo"
        secondaryText="Ver Planes"
        secondaryHref="/precios"
        accentColor="blue"
      />
    </PublicLayout>
  );
}
