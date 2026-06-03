import React from 'react';
import { PublicLayout } from '@/components/public/PublicLayout';
import { VerticalHero } from '@/components/public/VerticalHero';
import { VerticalFeatureGrid } from '@/components/public/VerticalFeatureGrid';
import { VerticalCTA } from '@/components/public/VerticalCTA';

export const metadata = {
  title: 'Volkern para RRHH | Gestión de Personal y Nóminas con IA',
  description: 'Gestiona personal, nóminas, asistencia, expedientes y reclutamiento desde una plataforma. Portal del empleado, payroll sealing y automatización de RRHH con IA.',
};

export default function RRHHPage() {
  return (
    <PublicLayout>
      <VerticalHero
        badge="Módulo de Recursos Humanos"
        title="Gestiona tu Capital Humano"
        highlight="con inteligencia."
        description="Expedientes digitales, nóminas, control de asistencia, reclutamiento y evaluación de desempeño en una sola plataforma. Portal del empleado 24/7 y automatización de procesos de RRHH con IA."
        primaryCta={{ text: 'Solicitar Demo', href: '/#demo' }}
        secondaryCta={{ text: 'Ver Características', href: '#features' }}
        accentColor="rose"
        imageSrc=""
        imageAlt="Dashboard de Volkern para Recursos Humanos"
      />

      <VerticalFeatureGrid
        id="features"
        title="Todo lo que necesitas para tu Departamento de RRHH"
        subtitle="Desde la contratación hasta la nómina, pasando por evaluación de desempeño, control de asistencia y desarrollo del talento."
        accentColor="rose"
        features={[
          {
            icon: 'Users',
            title: 'Gestión de Personal',
            description: 'Fichas completas de empleados con historial laboral, documentos, formación, certificados y toda la información centralizada. Búsqueda y segmentación avanzada.',
          },
          {
            icon: 'Calculator',
            title: 'Nóminas y Payroll',
            description: 'Cálculo automatizado de nóminas, seguros sociales, IRPF y conceptos variables. Payroll sealing con trazabilidad criptográfica para cumplimiento normativo.',
          },
          {
            icon: 'Clock',
            title: 'Control de Asistencia',
            description: 'Registro de entrada/salida, incidencias, vacaciones, permisos y ausencias. Integración con reloj checador y geolocalización para equipos remotos.',
          },
          {
            icon: 'FileCheck',
            title: 'Expedientes Digitales',
            description: 'Expediente digital completo por empleado: contrato, nóminas, formación, evaluaciones y documentos legales. Firma digital y cumplimiento GDPR.',
          },
          {
            icon: 'UserPlus',
            title: 'Reclutamiento y Onboarding',
            description: 'Portal de empleo, gestión de candidatos, filtros automáticos por competencias, entrevistas programadas y onboarding digital con checklist automatizado.',
          },
          {
            icon: 'Award',
            title: 'Evaluación de Desempeño',
            description: 'Evaluaciones 360°, objetivos por empleado, OKRs, revisiones periódicas, planes de desarrollo y detección de talento con analíticas predictivas.',
          },
          {
            icon: 'Globe',
            title: 'Portal del Empleado 24/7',
            description: 'Cada empleado accede a su información: nóminas, vacaciones, permisos, formación y comunicados. Solicitudes y aprobaciones en flujo digital.',
          },
          {
            icon: 'Bot',
            title: 'IA en RRHH',
            description: 'Asistente IA para RRHH: "¿quién cumple años este mes?", "empleados sin formación este trimestre", "alertas de contratos por vencer", "recomendaciones de promoción".',
          },
        ]}
      />

      <VerticalCTA
        title="Digitaliza tu Gestión de Personas"
        description="Automatiza procesos de RRHH, elimina papeleo y ofrece una experiencia empleado excepcional. Todo con soberanía de datos y cumplimiento normativo."
        buttonText="Solicitar Demo"
        buttonHref="/#demo"
        secondaryText="Ver Planes"
        secondaryHref="/#pricing"
        accentColor="rose"
      />
    </PublicLayout>
  );
}
