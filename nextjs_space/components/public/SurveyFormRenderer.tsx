'use client';

import React, { useEffect, useState } from 'react';
import { Model } from 'survey-core';
import { Survey } from 'survey-react-ui';
import 'survey-core/survey-core.min.css';
import { toast } from 'sonner';

type SurveyFormRendererProps = {
  /** SurveyJS JSON model definition */
  surveyJson: Record<string, unknown>;
  /** API endpoint to submit the form to */
  submitUrl: string;
  /** Height of the form container */
  height?: string;
  /** Called after successful submission */
  onComplete?: () => void;
  /** CSS class name for the container */
  className?: string;
};

export const SurveyFormRenderer: React.FC<SurveyFormRendererProps> = ({
  surveyJson,
  submitUrl,
  height = 'auto',
  onComplete,
  className = '',
}) => {
  const [model, setModel] = useState<Model | null>(null);

  useEffect(() => {
    const survey = new Model(surveyJson);

    // Locale
    survey.locale = 'es';

    // Submit handler
    survey.onComplete.add(async (sender) => {
      try {
        const response = await fetch(submitUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            payload: sender.data,
          }),
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: 'Error desconocido' }));
          throw new Error(err.error || 'Error al enviar el formulario');
        }

        toast.success('¡Formulario enviado con éxito!');
        onComplete?.();
      } catch (error: any) {
        console.error('[SurveyFormRenderer] Submit error:', error);
        toast.error(error.message || 'Hubo un error al enviar el formulario. Intenta de nuevo.');
      }
    });

    setModel(survey);

    return () => {
      survey.dispose();
    };
  }, [surveyJson, submitUrl, onComplete]);

  if (!model) {
    return (
      <div
        style={{ height }}
        className={`flex items-center justify-center bg-muted/50 rounded-xl border ${className}`}
      >
        <div className="animate-pulse text-muted-foreground">Cargando formulario...</div>
      </div>
    );
  }

  return (
    <div
      style={{ height }}
      className={`survey-form-container ${className}`}
    >
      <style jsx global>{`
        .survey-form-container .sd-root-modern {
          background: transparent !important;
          font-family: inherit !important;
        }
        .survey-form-container .sd-btn {
          background-color: hsl(var(--primary)) !important;
          border-radius: 0.75rem !important;
          padding: 0.75rem 2rem !important;
          font-weight: 600 !important;
        }
        .survey-form-container .sd-btn:hover {
          opacity: 0.9 !important;
        }
        .survey-form-container .sd-input {
          background-color: hsl(var(--background)) !important;
          border-color: hsl(var(--border)) !important;
          color: hsl(var(--foreground)) !important;
          border-radius: 0.75rem !important;
        }
        .survey-form-container .sd-input:focus {
          border-color: hsl(var(--primary)) !important;
          box-shadow: 0 0 0 2px hsl(var(--primary) / 0.2) !important;
        }
        .survey-form-container .sd-question__title {
          color: hsl(var(--foreground)) !important;
          font-weight: 500 !important;
        }
        .survey-form-container .sd-selectbase__item {
          color: hsl(var(--foreground)) !important;
        }
        .survey-form-container .sd-completedpage {
          color: hsl(var(--foreground)) !important;
        }
      `}</style>
      <Survey model={model} />
    </div>
  );
};
