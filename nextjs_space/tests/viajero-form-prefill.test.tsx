// @vitest-environment jsdom

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';

import ViajeroForm from '@/app/viajeros/[token]/ViajeroForm';

const INICIAL = {
  nombre: 'Lucía',
  apellido1: 'Mendoza',
  apellido2: '',
  tipoDocumento: '',
  numeroDocumento: '',
  soporteDocumento: '',
  fechaNacimiento: '',
  nacionalidad: '',
};

function montar(props: Partial<Parameters<typeof ViajeroForm>[0]> = {}) {
  return render(
    <ViajeroForm
      token="token-de-prueba"
      contexto="Alojamiento: Loft Marina · Referencia: DEMO-GRUPO-001"
      nombreCompleto="Lucía Mendoza"
      nombrePrellenado
      inicial={INICIAL}
      tiposConSoporte={['DNI', 'NIE']}
      {...props}
    />
  );
}

afterEach(() => cleanup());

describe('el formulario público del viajero con nombre prellenado', () => {
  it('muestra de quién es el formulario y bloquea el nombre guardado', () => {
    montar();

    expect(screen.getByText('Formulario de Lucía Mendoza')).toBeDefined();
    expect(screen.getByText(/solo tienes que completar documento y fecha de nacimiento/i)).toBeDefined();

    const nombre = screen.getByDisplayValue('Lucía') as HTMLInputElement;
    const apellido1 = screen.getByDisplayValue('Mendoza') as HTMLInputElement;
    expect(nombre.readOnly).toBe(true);
    expect(apellido1.readOnly).toBe(true);
  });

  it('sin nombre guardado no hay banner y los campos siguen editables', () => {
    montar({ nombreCompleto: null, nombrePrellenado: false });

    expect(screen.queryByText(/Formulario de/)).toBeNull();

    const nombre = screen.getByDisplayValue('Lucía') as HTMLInputElement;
    expect(nombre.readOnly).toBe(false);
  });

  it('el segundo apellido sigue editable aunque el nombre venga prellenado', () => {
    montar();

    // El campo "Segundo apellido" es el único del bloque de identidad sin valor.
    const segundos = screen.getAllByRole('textbox') as HTMLInputElement[];
    const apellido2 = segundos.find((i) => i.value === '' && i.type === 'text');
    expect(apellido2).toBeDefined();
    expect(apellido2!.readOnly).toBe(false);
  });
});
