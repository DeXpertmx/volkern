// Guardia del formulario de reservas: el «Sin asignar» del Select de unidad
// usa un valor centinela, nunca la cadena vacía.
//
// Radix lanza «A <Select.Item /> must have a value prop that is not an empty
// string» si un SelectItem trae value="": la cadena vacía es internamente
// «limpiar selección». Con value="" el diálogo de edición (icono lápiz de
// Reservas) crasheaba al abrir. La vuelta atrás es un git revert, pero el
// patrón se replica con cualquier «opción vacía»: esta guardia lo bloquea.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(__dirname, '..');
const FUENTE = path.join(RAIZ, 'app/dashboard/hospitality/reservas/page.tsx');

describe('Formulario de reservas: Select de unidad sin value=""', () => {
  const fuente = fs.readFileSync(FUENTE, 'utf8');

  it('ningún SelectItem del formulario usa la cadena vacía como valor', () => {
    expect(fuente).not.toMatch(/SelectItem\s+value=""/);
  });

  it('el «Sin asignar» viaja con el centinela y se mapea a null al guardar', () => {
    // El centinela existe con su porqué documentado.
    expect(fuente).toContain("const UNIDAD_SIN_ASIGNAR = '__sin_asignar__'");
    // La opción del Select lo usa (no un literal suelto).
    expect(fuente).toContain('<SelectItem value={UNIDAD_SIN_ASIGNAR}>Sin asignar</SelectItem>');
    // El envío a la API nunca manda el centinela: unitId null.
    expect(fuente).toContain('form.unitId !== UNIDAD_SIN_ASIGNAR ? form.unitId : null');
  });
});
