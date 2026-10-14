// @vitest-environment jsdom
//
// Las cuatro plantillas del Booking Engine, renderizadas de verdad.
//
// La promesa del catálogo («Clásica: la galería de la propiedad arriba»,
// «Minimal: sin imágenes») se rompe por descuido, y el síntoma que ve el hotel
// es el suyo: sus fotos no aparecen en la página de reservas. Aquí se renderiza
// el marco con las fotos ya publicadas por el servidor y se mira qué se pinta.

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

import {
  PlantillaBookingPage,
  type DatosPlantilla,
} from '@/components/hospitality/booking/PlantillaBookingPage';

const FOTOS = ['https://cdn/fachada.jpg', 'https://cdn/salon.jpg', 'https://cdn/piscina.jpg'];

function datos(over: Partial<DatosPlantilla> = {}): DatosPlantilla {
  return {
    plantilla: 'clasica',
    personalizacion: {
      colorPrimario: '#0f766e',
      colorFondo: '#ffffff',
      colorTexto: '#0f172a',
      radioTarjeta: '0.75rem',
    },
    idioma: 'es',
    logo: null,
    titulo: 'Ciudad Patio Cuarenta',
    descripcion: null,
    ciudad: 'Madrid',
    fotos: FOTOS,
    fotoPortada: FOTOS[0],
    tarifaDesde: null,
    tarifaDesdeTexto: null,
    capacidadMaxima: 4,
    ...over,
  };
}

const WIZARD = <div>asistente de reserva</div>;

afterEach(cleanup);

describe('PlantillaBookingPage — las fotos del alojamiento', () => {
  it('la clásica abre con la galería y la portada publicada (fotos[0])', () => {
    render(<PlantillaBookingPage plantilla="clasica" datos={datos()} wizard={WIZARD} />);

    const portada = screen.getByAltText('Ciudad Patio Cuarenta');
    expect(portada.getAttribute('src')).toBe('https://cdn/fachada.jpg');
    // La galería trae las fotos de apoyo y el asistente sigue montado.
    expect(screen.getByAltText('Ciudad Patio Cuarenta · 2').getAttribute('src')).toBe(
      'https://cdn/salon.jpg'
    );
    expect(screen.getByText('asistente de reserva')).toBeTruthy();
  });

  it('la clásica sin fotos publicadas no pinta galería (y no rompe)', () => {
    render(
      <PlantillaBookingPage
        plantilla="clasica"
        datos={datos({ fotos: [], fotoPortada: null })}
        wizard={WIZARD}
      />
    );

    expect(screen.queryAllByRole('img')).toHaveLength(0);
    expect(screen.getByText('Ciudad Patio Cuarenta')).toBeTruthy();
    expect(screen.getByText('asistente de reserva')).toBeTruthy();
  });

  it('la moderna usa la portada como cabecera', () => {
    render(<PlantillaBookingPage plantilla="moderna" datos={datos({ plantilla: 'moderna' })} wizard={WIZARD} />);

    expect(screen.getByAltText('Ciudad Patio Cuarenta').getAttribute('src')).toBe(
      'https://cdn/fachada.jpg'
    );
  });

  it('la minimal no pinta ninguna imagen, aunque haya fotos', () => {
    render(<PlantillaBookingPage plantilla="minimal" datos={datos({ plantilla: 'minimal' })} wizard={WIZARD} />);

    expect(screen.queryAllByRole('img')).toHaveLength(0);
    expect(screen.getByText('asistente de reserva')).toBeTruthy();
  });
});
