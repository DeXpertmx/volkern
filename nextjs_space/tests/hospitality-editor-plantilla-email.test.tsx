// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Guardias de la superficie del editor visual (plan maestro §21): lo que el
 * hotel toca. Se comprueba que el diseño sugerido se pinta con sus bloques, que
 * la vista previa es el MISMO compilador del envío y que añadir bloques e
 * insertar variables llama a `onChange` con el diseño nuevo.
 */

import { EditorPlantillaEmail } from '../components/hospitality/EditorPlantillaEmail';
import { contextoEjemplo, disenoSugerido } from '../lib/hospitality/comunicaciones-email';

const VARIABLES = [
  { v: '{{nombre}}', d: 'Nombre del huésped' },
  { v: '{{checkIn}}', d: 'Fecha de check-in' },
];

const CONTEXTO = contextoEjemplo({ idioma: 'es', origen: 'https://volkern.app' });

describe('EditorPlantillaEmail', () => {
  it('pinta los bloques del diseño sugerido y una vista previa con las secciones rellenas', () => {
    const diseno = disenoSugerido('confirmacion', 'es')!;
    const { container } = render(
      <EditorPlantillaEmail diseno={diseno} onChange={() => {}} contexto={CONTEXTO} variables={VARIABLES} />
    );

    // Una tarjeta por bloque (cada una con su control de reordenar) y su tipo
    // legible: la sección de datos del correo del canal.
    expect(container.querySelectorAll('button[title="Subir"]')).toHaveLength(diseno.bloques.length);
    expect(screen.getAllByText('Sección de datos').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Párrafo').length).toBeGreaterThan(0);

    // La vista previa la compila el módulo del envío: tabla, cabecera y filas
    // ya resueltas con el contexto de ejemplo.
    const iframe = container.querySelector('iframe');
    const srcDoc = iframe?.getAttribute('srcdoc') || '';
    expect(srcDoc).toContain('<table');
    expect(srcDoc).toContain('Reserva confirmada');
    expect(srcDoc).toContain('María García');
    expect(srcDoc).not.toMatch(/\{\{/);

    // Y el iframe no deja ejecutar nada dentro de la vista previa.
    expect(iframe?.getAttribute('sandbox')).toBe('');
  });

  it('añadir un bloque llama a onChange con el diseño ampliado', async () => {
    const onChange = vi.fn();
    const diseno = disenoSugerido('post_salida', 'es')!;
    render(
      <EditorPlantillaEmail diseno={diseno} onChange={onChange} contexto={CONTEXTO} variables={VARIABLES} />
    );

    await userEvent.click(screen.getByRole('button', { name: /Párrafo/i }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const nuevo = onChange.mock.calls[0][0];
    expect(nuevo.bloques).toHaveLength(diseno.bloques.length + 1);
    expect(nuevo.bloques[nuevo.bloques.length - 1].tipo).toBe('texto');
  });

  it('las variables del panel se insertan en el campo que se tocó', async () => {
    const onChange = vi.fn();
    render(
      <EditorPlantillaEmail diseno={disenoSugerido('resena', 'es')!} onChange={onChange} contexto={CONTEXTO} variables={VARIABLES} />
    );

    // El título es el campo por defecto (lo primero que se edita).
    await userEvent.click(screen.getByRole('button', { name: /^Variables$/i }));
    await userEvent.click(screen.getByRole('button', { name: '{{nombre}}' }));

    expect(onChange.mock.calls[0][0].titulo).toBe('{{propiedad}}{{nombre}}');
  });

  it('sin bloques enseña el aviso en vez de una vista previa vacía', () => {
    render(
      <EditorPlantillaEmail diseno={{ version: 1, bloques: [] }} onChange={() => {}} contexto={CONTEXTO} variables={VARIABLES} />
    );
    expect(screen.getByText(/Añade al menos un bloque/i)).toBeTruthy();
  });
});
