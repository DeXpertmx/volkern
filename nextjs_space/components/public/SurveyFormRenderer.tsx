'use client';

import React, { useEffect, useState } from 'react';
import { Model } from 'survey-core';
import { Survey } from 'survey-react-ui';
import 'survey-core/survey-core.min.css';
// Registra el diccionario de español (botones, navegación, textos del sistema)
// para que el formulario no quede a medias (ej. botones "Yes/No" en inglés).
import 'survey-core/i18n/spanish';
import { toast } from 'sonner';

/**
 * Normaliza el JSON del formulario para las vistas externas (preview, embed,
 * página pública):
 *
 * 1. Si un campo tiene la etiqueta (title) vacía, SurveyJS por defecto muestra
 *    el `name` (el key interno) como título. Para que el nombre interno del
 *    campo NUNCA aparezca al cliente, se oculta el título y la numeración de
 *    ese campo — solo se ve el placeholder.
 * 2. Los campos booleanos (Sí/No) usan por defecto "Yes"/"No" en inglés.
 *    Como el sistema es en español, se fija "Sí"/"No" salvo que el autor
 *    haya personalizado los labels (labelTrue/labelFalse) en el JSON.
 */
export const DEFAULT_THANK_YOU = {
  title: '¡Gracias! Hemos recibido tus datos.',
  message: 'Tu información se registró correctamente. Muy pronto recibirás información sobre los siguientes pasos.',
  buttonText: '',
  buttonUrl: '',
  redirectUrl: '',
};

type ThankYouConfig = Partial<typeof DEFAULT_THANK_YOU>;

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function safeThankYouUrl(value: unknown): string {
  const url = String(value ?? '').trim();
  return url.startsWith('https://') || url.startsWith('http://') || url.startsWith('/') || url.startsWith('#')
    ? url
    : '';
}

/** Solo permite redirecciones absolutas HTTP(S) configuradas por el tenant. */
export function getThankYouRedirectUrl(config?: ThankYouConfig): string {
  const value = String(config?.redirectUrl ?? '').trim();
  if (!value) return '';
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? value : '';
  } catch {
    return '';
  }
}

/** Construye la pantalla de agradecimiento que SurveyJS muestra al completar. */
export function buildThankYouHtml(config?: ThankYouConfig): string {
  const values = { ...DEFAULT_THANK_YOU, ...(config || {}) };
  const titleValue = String(values.title ?? '').trim();
  const messageValue = String(values.message ?? '').trim();
  const buttonTextValue = String(values.buttonText ?? '').trim();
  const title = escapeHtml(titleValue || DEFAULT_THANK_YOU.title);
  const message = escapeHtml(messageValue || DEFAULT_THANK_YOU.message).replace(/\n/g, '<br />');
  const buttonText = escapeHtml(buttonTextValue);
  const buttonUrl = safeThankYouUrl(values.buttonUrl);
  const button = buttonText && buttonUrl
    ? `<a href="${escapeHtml(buttonUrl)}" style="display:inline-block;margin-top:24px;padding:11px 20px;border-radius:10px;background:#2563eb;color:#fff;text-decoration:none;font-weight:600">${buttonText}</a>`
    : '';

  return `<div style="max-width:560px;margin:24px auto;padding:40px 24px;text-align:center;border-radius:16px;background:#f0fdf4;color:#166534">
    <div style="font-size:42px;line-height:1;margin-bottom:16px">✓</div>
    <h2 style="margin:0 0 12px;font-size:24px;color:#166534">${title}</h2>
    <p style="margin:0;color:#15803d;line-height:1.6">${message}</p>
    ${button}
  </div>`;
}

export function normalizeSurveyJson(json: Record<string, unknown>): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(json || {}));
  // Si el texto del botón de envío está vacío, se elimina para que el
  // diccionario de español aporte el default ("Completar") en vez de un
  // botón sin texto.
  if (typeof clone.completeText === 'string' && !clone.completeText.trim()) {
    delete clone.completeText;
  }

  // Toda sumisión debe terminar en una pantalla de agradecimiento. Si el
  // formulario no tiene configuración propia, se usa la pantalla general.
  // `completedHtml` se respeta para no romper formularios editados por JSON.
  if (!String(clone.completedHtml || '').trim()) {
    clone.completedHtml = buildThankYouHtml(clone.thankYou as ThankYouConfig | undefined);
  }

  const pages = Array.isArray(clone.pages) ? clone.pages : [clone];
  for (const page of pages) {
    const elements = Array.isArray(page?.elements) ? page.elements : [];
    for (const el of elements) {
      const title = String(el?.title ?? '').trim();
      if (!title) {
        // Ocultar el título para que SurveyJS no muestre el `name` interno
        el.titleLocation = 'hidden';
        el.hideNumber = true;
      }
      // Booleano Sí/No en español (respeta personalización explícita)
      if (el?.type === 'boolean') {
        if (!el.labelTrue) el.labelTrue = 'Sí';
        if (!el.labelFalse) el.labelFalse = 'No';
      }
    }
  }
  return clone;
}

// Alias de compatibilidad (los tests existentes lo importan)
export const hideEmptyTitles = normalizeSurveyJson;

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
  /** Custom button background color (CSS color value) */
  buttonColor?: string;
  /** Custom button text color (CSS color value) */
  buttonTextColor?: string;
  /** Custom background color (CSS color value) */
  backgroundColor?: string;
};

export const SurveyFormRenderer: React.FC<SurveyFormRendererProps> = ({
  surveyJson,
  submitUrl,
  height = 'auto',
  onComplete,
  className = '',
  buttonColor,
  buttonTextColor,
  backgroundColor,
}) => {
  const [model, setModel] = useState<Model | null>(null);

  useEffect(() => {
    const normalized = normalizeSurveyJson(surveyJson);
    const survey = new Model(normalized);

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

        const redirectUrl = getThankYouRedirectUrl(normalized.thankYou as ThankYouConfig | undefined);
        if (redirectUrl) {
          // Espera brevemente para que el usuario vea la confirmación antes de salir.
          window.setTimeout(() => window.location.assign(redirectUrl), 700);
        }
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
        .survey-form-container .sd-body {
          ${backgroundColor ? `background-color: ${backgroundColor} !important;` : ''}
          ${backgroundColor ? `padding: 1.5rem !important;` : ''}
          ${backgroundColor ? `border-radius: 1rem !important;` : ''}
        }
        .survey-form-container .sd-btn {
          background-color: ${buttonColor || 'hsl(var(--primary))'} !important;
          ${buttonTextColor ? `color: ${buttonTextColor} !important;` : ''}
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
