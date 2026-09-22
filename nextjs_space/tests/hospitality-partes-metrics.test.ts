// @vitest-environment node
//
// Métricas de partes de viajeros sin reintentar — el abandono que ve el HOTEL
// (panel del registro de viajeros y Reportes), no solo el operador de
// plataforma. Lo que fijan estos tests:
//  - Un parte abandonado es un RECHAZADO que agotó sus intentos. Un
//    `datos_incompletos` NO lo es, por muchos intentos que arrastre: no gasta
//    intentos y el barrido lo sigue mirando (el hotel solo está esperando el
//    documento), así que no puede entrar en la tasa.
//  - La tasa es la del ciclo del parte: aceptados frente a los que el producto
//    dejó fuera, no «rechazadas frente a todo».
//  - La cifra del panel (conteo agregado) y la de Reportes (filas de la
//    ventana) salen del mismo núcleo: no pueden dar dos tasas distintas.

import { describe, it, expect } from 'vitest';
import {
  ESTADO_DATOS_INCOMPLETOS,
  MAX_INTENTOS_DEL_PARTE,
  PARTES_SIN_REINTENTAR_MINIMO_PARA_ALERTA,
  PARTES_SIN_REINTENTAR_UMBRAL_ALERTA,
  alertaPartesSinReintentar,
  desenlaceDeParte,
  lecturaPartesSinReintentar,
  metricasPartesViajeros,
  resumirPartes,
} from '@/lib/hospitality/partes-metrics';
import {
  ESTADO_ACEPTADO,
  ESTADO_RECHAZADO,
  ESTADO_SIN_ENTREGAR,
  MAX_INTENTOS_PARTE,
} from '@/lib/hospitality/parte-rechazo';
import { ESTADO_REGISTRO } from '@/lib/hospitality/registro-viajeros-service';

const fila = (estado: string, intentos = 0) => ({ estado, intentos });

describe('Clasificación de un parte en su ciclo', () => {
  it('un aceptado está aceptado, no «otras»', () => {
    expect(desenlaceDeParte(fila(ESTADO_ACEPTADO, 3))).toBe('aceptadas');
  });

  it('un rechazado con los intentos agotados es un abandono', () => {
    expect(desenlaceDeParte(fila(ESTADO_RECHAZADO, MAX_INTENTOS_PARTE))).toBe(
      'sinReintentarRechazados',
    );
  });

  it('un envío que el servicio no recibió y agotó sus intentos también es un abandono', () => {
    // El caso que antes se quedaba fuera: una caída del servicio no es un
    // rechazo, pero deja la estancia igual de sin comunicar.
    expect(desenlaceDeParte(fila(ESTADO_SIN_ENTREGAR, MAX_INTENTOS_PARTE))).toBe(
      'sinReintentarSinEntregar',
    );
    expect(desenlaceDeParte(fila(ESTADO_SIN_ENTREGAR, 2))).toBe('sinEntregarEnCurso');
  });

  it('con un intento menos todavía se está reintentando', () => {
    expect(desenlaceDeParte(fila(ESTADO_RECHAZADO, MAX_INTENTOS_PARTE - 1))).toBe(
      'rechazadasEnCurso',
    );
  });

  it('un parte incompleto NUNCA es un abandono, aunque arrastre intentos', () => {
    // La invariante del módulo: `datos_incompletos` no gasta intentos (con un
    // parte incompleto no se llama al Ministerio) y el barrido lo sigue
    // revisando cada hora. Marcarlo como abandonado diría que el hotel ha
    // perdido un parte que solo está esperando un documento.
    expect(desenlaceDeParte(fila(ESTADO_DATOS_INCOMPLETOS, MAX_INTENTOS_PARTE))).toBe(
      'esperandoAlHuesped',
    );
    expect(desenlaceDeParte(fila(ESTADO_DATOS_INCOMPLETOS, 99))).toBe('esperandoAlHuesped');
  });

  it('lo que no es ni aceptado ni rechazado ni incompleto cae en «otras»', () => {
    for (const estado of ['pendiente', 'enviada', 'anulada', 'pendiente_xsd']) {
      expect(desenlaceDeParte(fila(estado, 2))).toBe('otras');
    }
  });

  it('un rechazado sin intentos contados no se da por abandonado', () => {
    expect(desenlaceDeParte({ estado: ESTADO_RECHAZADO })).toBe('rechazadasEnCurso');
    expect(desenlaceDeParte(fila(ESTADO_RECHAZADO, 0))).toBe('rechazadasEnCurso');
  });
});

describe('Métricas del ciclo del parte', () => {
  it('la tasa es sobre los partes cerrados: aceptados frente a sin reintentar', () => {
    const metricas = metricasPartesViajeros([
      fila(ESTADO_ACEPTADO),
      fila(ESTADO_ACEPTADO),
      fila(ESTADO_ACEPTADO),
      fila(ESTADO_RECHAZADO, MAX_INTENTOS_PARTE),
    ]);

    expect(metricas).toMatchObject({
      aceptadas: 3,
      sinReintentar: 1,
      cerradas: 4,
      total: 4,
      tasaSinReintentar: 0.25,
    });
  });

  it('los que siguen en curso no entran en la tasa (ni inflan ni diluyen)', () => {
    const metricas = metricasPartesViajeros([
      fila(ESTADO_ACEPTADO),
      fila(ESTADO_RECHAZADO, 1),
      fila(ESTADO_RECHAZADO, 2),
      fila(ESTADO_DATOS_INCOMPLETOS),
      fila('enviada'),
    ]);

    expect(metricas.cerradas).toBe(1);
    expect(metricas.tasaSinReintentar).toBe(0);
    expect(metricas).toMatchObject({
      rechazadasEnCurso: 2,
      esperandoAlHuesped: 1,
      otras: 1,
      total: 5,
    });
  });

  it('sin partes cerrados no se inventa un 0%: la tasa es null', () => {
    const metricas = metricasPartesViajeros([fila(ESTADO_DATOS_INCOMPLETOS), fila('pendiente')]);

    expect(metricas.cerradas).toBe(0);
    expect(metricas.tasaSinReintentar).toBeNull();
  });

  it('separa las dos causas del abandono: rechazados y sin entregar', () => {
    // No es un detalle cosmético: un rechazo pide corregir el dato del huésped
    // y una no-entrega no tiene nada que corregir — solo reintentar. Si la
    // métrica las juntara, el hotel no sabría a cuál de las dos está mirando.
    const metricas = metricasPartesViajeros([
      fila(ESTADO_RECHAZADO, MAX_INTENTOS_PARTE),
      fila(ESTADO_SIN_ENTREGAR, MAX_INTENTOS_PARTE),
      fila(ESTADO_RECHAZADO, 1),
      fila(ESTADO_SIN_ENTREGAR, 1),
    ]);

    expect(metricas).toMatchObject({
      sinReintentarRechazados: 1,
      sinReintentarSinEntregar: 1,
      sinReintentar: 2,
      rechazadasEnCurso: 1,
      sinEntregarEnCurso: 1,
    });
  });

  it('el conteo agregado del panel y las filas de Reportes dan lo mismo', () => {
    // Es la coherencia que importa: el registro de viajeros cuenta con `groupBy`
    // (+ el recuento de abandonados) y Reportes trae las filas de la ventana.
    // Si los dos caminos divergieran, el hotel leería dos abandonos distintos.
    const filas = [
      fila(ESTADO_ACEPTADO),
      fila(ESTADO_ACEPTADO),
      fila(ESTADO_RECHAZADO, MAX_INTENTOS_PARTE),
      fila(ESTADO_SIN_ENTREGAR, MAX_INTENTOS_PARTE),
      fila(ESTADO_RECHAZADO, 2),
      fila(ESTADO_DATOS_INCOMPLETOS),
      fila('anulada'),
    ];
    const deFilas = metricasPartesViajeros(filas);
    const deConteo = resumirPartes({
      aceptadas: 2,
      sinReintentarRechazados: 1,
      sinReintentarSinEntregar: 1,
      rechazadasEnCurso: 1,
      esperandoAlHuesped: 1,
      otras: 1,
    });

    expect(deConteo).toEqual(deFilas);
  });

  it('valores sucios (negativos, NaN) no rompen la tasa', () => {
    const metricas = resumirPartes({
      aceptadas: -3,
      sinReintentarRechazados: Number.NaN,
      rechazadasEnCurso: -1,
    });

    expect(metricas).toMatchObject({ aceptadas: 0, sinReintentar: 0, total: 0, cerradas: 0 });
    expect(metricas.tasaSinReintentar).toBeNull();
  });

  it('el tope de intentos es el mismo que el del barrido', () => {
    expect(MAX_INTENTOS_DEL_PARTE).toBe(MAX_INTENTOS_PARTE);
  });

  it('el abandono cubre los dos desenlaces fallidos, con el mismo tope', () => {
    // Rechazado y sin entregar se comparan igual: los dos son "el producto lo
    // intentó y no lo consiguió". Si solo uno contara, una caída del servicio
    // dejaría partes reintentándose para siempre.
    for (const estado of [ESTADO_RECHAZADO, ESTADO_SIN_ENTREGAR]) {
      expect(desenlaceDeParte(fila(estado, MAX_INTENTOS_PARTE))).toMatch(/^sinReintentar/);
      expect(desenlaceDeParte(fila(estado, MAX_INTENTOS_PARTE - 1))).not.toMatch(
        /^sinReintentar/,
      );
    }
  });
});

describe('Los estados que cuenta el panel son los del servicio', () => {
  it('no pueden divergir de ESTADO_REGISTRO', () => {
    expect(ESTADO_ACEPTADO).toBe(ESTADO_REGISTRO.aceptada);
    expect(ESTADO_DATOS_INCOMPLETOS).toBe(ESTADO_REGISTRO.datosIncompletos);
  });
});

describe('Aviso y lectura del abandono de partes', () => {
  const conAbandono = (aceptadas: number, sinReintentar: number, sinEntregar = 0) =>
    resumirPartes({
      aceptadas,
      sinReintentarRechazados: sinReintentar - sinEntregar,
      sinReintentarSinEntregar: sinEntregar,
    });

  it('con poco volumen no avisa: la tasa sería ruido', () => {
    expect(alertaPartesSinReintentar(conAbandono(1, 1))).toBeNull();
  });

  it('avisa cuando hay volumen y la tasa pasa el umbral, y dice dónde se arregla', () => {
    const aviso = alertaPartesSinReintentar(conAbandono(2, 2));

    expect(aviso).toContain('2 de 4');
    expect(aviso).toContain('rechazado(s) por el Ministerio');
    expect(aviso).toContain('Registro de viajeros');
    expect(alertaPartesSinReintentar(conAbandono(2, 2), { umbral: 0.9 })).toBeNull();
  });

  it('el aviso distingue una caída del servicio de un rechazo del Ministerio', () => {
    // Son dos incidencias distintas y el operador de plataforma necesita saber
    // cuál tiene delante: si las dos se leyeran como «el Ministerio no los
    // acepta», una caída se buscaría en los datos del huésped.
    const caida = alertaPartesSinReintentar(conAbandono(0, 3, 3));
    expect(caida).toContain('no llegó a recibir');
    expect(caida).not.toContain('rechazado(s) por el Ministerio');

    const rechazos = alertaPartesSinReintentar(conAbandono(0, 3));
    expect(rechazos).toContain('rechazado(s) por el Ministerio');
    expect(rechazos).not.toContain('no llegó a recibir');
  });

  it('con volumen suficiente y ningún abandonado no hay nada que avisar', () => {
    expect(alertaPartesSinReintentar(conAbandono(10, 0))).toBeNull();
  });

  it('sin comunicaciones lo dice, en vez de dejar el hueco mudo', () => {
    expect(lecturaPartesSinReintentar(resumirPartes({}))).toContain('Sin comunicaciones');
  });

  it('sin abandonos confirma que ningún parte se quedó fuera', () => {
    expect(lecturaPartesSinReintentar(conAbandono(5, 0))).toContain('Ningún parte');
  });

  it('con abandonos da el par completo y qué hacer', () => {
    const lectura = lecturaPartesSinReintentar(conAbandono(2, 3));

    expect(lectura).toContain('3 de 5');
    expect(lectura).toContain('2 aceptados');
    expect(lectura).toContain('Registro de viajeros');
    expect(lectura).toContain('rechazado(s) por el Ministerio');
  });

  it('nombra la no-entrega en curso antes de que se convierta en abandono', () => {
    // La señal temprana: el servicio no responde, los intentos todavía no se han
    // agotado y el parte aún se salva solo. Verlo aquí es lo que permite actuar
    // antes de tener una estancia sin comunicar.
    const metricas = resumirPartes({ aceptadas: 1, sinEntregarEnCurso: 2 });
    const lectura = lecturaPartesSinReintentar(metricas);

    expect(lectura).toContain('2 envío(s) no llegaron al servicio');
    expect(metricas.sinReintentar).toBe(0);
    // Y sin abandonos no se anuncia ninguna tasa.
    expect(alertaPartesSinReintentar(metricas)).toBeNull();
  });

  it('con poco volumen lo declara ruido antes de sacar conclusiones', () => {
    const lectura = lecturaPartesSinReintentar(conAbandono(1, 1));

    expect(lectura).toContain('ruido');
    expect(PARTES_SIN_REINTENTAR_MINIMO_PARA_ALERTA).toBeGreaterThan(2);
    expect(PARTES_SIN_REINTENTAR_UMBRAL_ALERTA).toBeGreaterThan(0);
  });
});
