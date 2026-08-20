import { describe, expect, it } from 'vitest';
import { buildSurveyFormOptions, getSurveyFormDesign } from '@/components/webcreator/blocks/components/SurveyFormBlock';

describe('getSurveyFormDesign', () => {
  it('aplica los colores guardados en la configuración del formulario', () => {
    expect(getSurveyFormDesign({ _buttonColor: '#0077b8', _buttonTextColor: '#ffffff' })).toEqual({
      buttonColor: '#0077b8',
      buttonTextColor: '#ffffff',
    });
  });

  it('usa colores seguros por defecto si la configuración no tiene colores válidos', () => {
    expect(getSurveyFormDesign({ _buttonColor: 'red; color: black', _buttonTextColor: '' })).toEqual({
      buttonColor: '#6366f1',
      buttonTextColor: '#ffffff',
    });
  });
});

describe('buildSurveyFormOptions', () => {
  it('crea opciones con el nombre de cada formulario y una opción vacía', () => {
    expect(buildSurveyFormOptions([
      { id: 'form-1', name: 'Pre-registro' },
      { id: 'form-2', name: 'Contacto' },
    ])).toEqual([
      { id: '', name: 'Selecciona un formulario' },
      { id: 'form-1', name: 'Pre-registro' },
      { id: 'form-2', name: 'Contacto' },
    ]);
  });

  it('usa un nombre de respaldo y conserva un formulario ya seleccionado', () => {
    expect(buildSurveyFormOptions([
      { id: 'form-1', name: '  ' },
    ], 'form-old')).toEqual([
      { id: '', name: 'Selecciona un formulario' },
      { id: 'form-1', name: 'Formulario form-1' },
      { id: 'form-old', name: 'Formulario seleccionado (form-old)' },
    ]);
  });

  it('descarta registros sin ID', () => {
    expect(buildSurveyFormOptions([
      { id: '', name: 'Inválido' },
      { id: 'form-1', name: null },
    ])).toEqual([
      { id: '', name: 'Selecciona un formulario' },
      { id: 'form-1', name: 'Formulario form-1' },
    ]);
  });
});
