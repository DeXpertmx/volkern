// @vitest-environment node
//
// Guardia del PACK COMERCIAL de Hospitality (docs/COMMERCIAL-HOSPITALITY.md).
//
// El pack se copia del esqueleto de Real Estate y vive fuera del código, así que
// envejece solo: se le cambia un enlace, se le publican las bandas de precio como
// si fueran tarifa, o se queda huérfano sin que nadie lo note. Estos tests son la
// valla, con el criterio del proyecto: el precio es una **hipótesis del piloto**
// hasta que haya evidencia, y las promesas tienen que estar acotadas.
//
// Técnica de fuente (la misma que las demás guardias de docs del módulo): la
// página/markdown no exporta nada que se pueda importar.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(__dirname, '..');
const PACK = 'docs/COMMERCIAL-HOSPITALITY.md';

function leer(relativo: string): string {
  const contenido = fs.readFileSync(path.join(RAIZ, relativo), 'utf8');
  expect(contenido.length, `El archivo ${relativo} está vacío`).toBeGreaterThan(0);
  return contenido;
}

describe('Pack comercial de Hospitality — esqueleto de Real Estate', () => {
  const pack = leer(PACK);

  it('tiene las secciones del esqueleto (ICPs, competencia, argumentario, FAQ, pricing, roadmap)', () => {
    for (const titulo of [
      '## Propuesta de Valor',
      '## Perfiles de Cliente Ideal',
      '## Funcionalidades por Plan',
      '## Ventajas Competitivas',
      '## Casos de Uso',
      '## Estrategia de Pricing',
      '## Argumentos de Venta por Canal',
      '## FAQ Comercial',
      '## Materiales de Marketing',
      '## Roadmap de Producto',
      '## KPIs de Éxito para el Cliente',
    ]) {
      expect(pack, `Falta la sección ${titulo}`).toContain(titulo);
    }
  });

  it('todos los enlaces internos del pack apuntan a documentos que existen', () => {
    // Un pack comercial que manda a un documento borrado es un pack roto, y nadie
    // lo mira hasta que lo manda un comercial a un cliente.
    const enlaces = [...pack.matchAll(/\]\(\.\/([^)#]+\.md)\)/g)].map((m) => m[1]);
    expect(enlaces.length, 'El pack no enlaza ningún documento').toBeGreaterThan(5);
    const inexistentes = enlaces.filter((f) => !fs.existsSync(path.join(RAIZ, 'docs', f)));
    expect(inexistentes, `Enlaces rotos en ${PACK}: ${inexistentes.join(', ')}`).toEqual([]);
  });

  it('los cuatro ICPs están y el perfil del piloto está señalado', () => {
    expect(pack).toContain('### 1. Hotel boutique independiente');
    expect(pack).toContain('### 2. Casa rural');
    expect(pack).toContain('### 3. Apartamentos turísticos');
    expect(pack).toContain('### 4. Cadena regional');
    expect(pack).toMatch(/el perfil del piloto/);
    // Negar un perfil también es parte del pack: sin esto, el ciclo de venta se gasta en prospectos
    // que piden POS, revenue management o CFDI.
    expect(pack).toContain('Quién **no** es cliente hoy');
  });

  it('la competencia se compara sin dar por verificados los precios ajenos', () => {
    expect(pack).toMatch(/SiteMinder|Cloudbeds|Amenitiz|Little Hotelier/);
    expect(pack).toMatch(/Mews|Opera|Hotelogix/);
    expect(pack).toMatch(/Booking.*Expedia.*Airbnb/);
    expect(pack).toContain('Excel + WhatsApp');
    // Los rangos de la competencia son referencia, no tarifa comprobada.
    expect(pack).toMatch(/reconfirmar antes de usar cualquier cifra/i);
  });
});

describe('Pack comercial de Hospitality — el precio es una hipótesis', () => {
  const pack = leer(PACK);

  it('lo declara en la cabecera, no en una nota al pie', () => {
    const cabecera = pack.split('\n').slice(0, 12).join('\n');
    expect(cabecera).toMatch(/hipótesis a validar en el piloto/i);
  });

  it('las tres bandas están, y ninguna se publica como tarifa', () => {
    expect(pack).toContain('49–79 €/mes');
    expect(pack).toContain('149–299 €/mes');
    expect(pack).toContain('499–999 €/mes');
    expect(pack).toMatch(/no tarifa pública/i);
    expect(pack).toMatch(/no se ofrece la banda de 499–999/i);
  });

  it('cada hipótesis trae cómo se valida y qué la falsaría', () => {
    const seccion = pack.split('## Cómo se valida el precio en el piloto')[1]?.split('\n## ')[0] || '';
    expect(seccion).toBeTruthy();
    expect(seccion).toContain('Cómo se valida');
    expect(seccion).toContain('Señal de que es falsa');
    // Las hipótesis que importan: la banda del piloto, la unidad de medida y el 0 %.
    expect(seccion).toMatch(/149–299/);
    expect(seccion).toMatch(/unidades y canales/);
    expect(seccion).toMatch(/0 % de comisión/);
  });

  it('resuelve la decisión estructural del plan (la escalera termina en 299 €/mes)', () => {
    // El hallazgo que impide vender la banda alta sin decidir antes cómo se cobra:
    // hoy no hay plan por encima de Infinity. Si esto desaparece del pack, se
    // prometerá un plan que no existe.
    expect(pack).toContain('Infinity');
    expect(pack).toMatch(/Decisión pendiente antes de vender la banda alta/);
    expect(pack).toMatch(/plan Hospitality Enterprise/);
  });

  it('deja escrito que el 0 % es una decisión comercial, no un límite técnico', () => {
    // El mecanismo de Stripe Connect permite cobrar una tarifa de plataforma; si el
    // pack dijera "es imposible cobrarla", cerraría una puerta de negocio a futuro.
    expect(pack).toMatch(/tarifa de plataforma/);
    expect(pack).toMatch(/no como límite del sistema/i);
    // Y la pasarela cobra lo suyo: no se promete "0 % de coste de cobro".
    expect(pack).toMatch(/tarifa de procesamiento/);
  });
});

describe('Pack comercial de Hospitality — las promesas están acotadas', () => {
  const pack = leer(PACK);

  it('lista lo que no se debe prometer, con los límites reales del producto', () => {
    // La sección del pack (no las menciones cruzadas que la citan por su nombre).
    const seccion = pack.split('### ⚠️ Lo que NO se debe prometer todavía')[1] || '';
    expect(seccion).toBeTruthy();
    expect(seccion).toContain('Factura fiscal del huésped');
    const enMinusculas = seccion.toLowerCase();
    for (const limite of [
      'CFDI',
      'Cobro automático de reservas de OTA',
      'Migración automática',
      'revenue management',
      'Multi-idioma',
      'Liquidación al propietario',
    ]) {
      expect(enMinusculas, `Falta el límite: ${limite}`).toContain(limite.toLowerCase());
    }
  });

  it('no promete la factura fiscal del huésped desde la reserva', () => {
    // Es el límite que más daño hace si se promete: en México no hay timbrado.
    expect(pack).toMatch(/no desde la reserva/i);
    expect(pack).toMatch(/no hay timbrado CFDI/i);
  });

  it('los beneficios se declaran verificables, sin porcentajes inventados', () => {
    expect(pack).toMatch(/afirmaciones \*\*verificables\*\*/);
    expect(pack).toMatch(/No publicamos porcentajes que no hayamos visto/);
    // Nada de "+30 % de conversión": los beneficios llevan su métrica, no una cifra de marketing.
    expect(pack).not.toMatch(/\+\d+\s?% de conversión/);
  });

  it('el checklist del piloto nombra los pendientes de producto detectados', () => {
    // Encontrados al escribir el pack y RESUELTOS después: la vertical está en
    // VERTICAL_DEFINITIONS y la página pública tiene ES/EN. La guardia exige el
    // estado nuevo, no el viejo: si alguien revierte el código, el pack miente.
    expect(pack).toContain('VERTICAL_DEFINITIONS');
    expect(pack).toContain('**Resuelto:** hospitality está en `VERTICAL_DEFINITIONS`');
    expect(pack).toContain('**Resuelto:** la página pública de reserva está en **español e inglés**');
    expect(pack).toContain('enlace público en inglés');
  });

  it('precisa la situación fiscal por país (ES Verifactu, MX sin CFDI, EE. UU. sin e-factura)', () => {
    expect(pack).toMatch(/España: sí, con Veri\*Factu/);
    expect(pack).toMatch(/México: sin CFDI/);
    expect(pack).toMatch(/no hay timbrado CFDI/i);
    expect(pack).toMatch(/EE\. UU\. y mercados sin factura electrónica obligatoria/i);
    // La regla que protege la venta: España cubierto de principio a fin;
    // el hueco real es el CFDI del huésped en México.
    expect(pack).toMatch(/el hueco real es el CFDI en México/i);
  });
});

describe('Pack comercial de Hospitality — no se queda huérfano', () => {
  const pack = leer(PACK);

  it('está enlazado desde la estrategia de verticales y desde el README', () => {
    expect(leer('docs/COMMERCIAL-VERTICALS.md')).toContain('COMMERCIAL-HOSPITALITY.md');
    expect(leer('README.md')).toContain('COMMERCIAL-HOSPITALITY.md');
    expect(leer('docs/hospitality-resumen-ejecutivo.md')).toContain('COMMERCIAL-HOSPITALITY.md');
  });

  it('la estrategia de verticales ya no dice que el pack esté pendiente', () => {
    const verticales = leer('docs/COMMERCIAL-VERTICALS.md');
    expect(verticales).not.toMatch(/falta el pack completo/i);
    expect(verticales).toMatch(/bandas hipotéticas/);
  });

  it('el pack cita los ensayos y el estado verificado (no promete lo no probado)', () => {
    expect(pack).toContain('hospitality-resumen-ejecutivo.md');
    expect(pack).toContain('hospitality-go-live-pms-guia.md');
    expect(pack).toMatch(/60 comprobaciones/);
    expect(pack).toMatch(/76 del ciclo de no-show/);
  });
});

describe('Pack comercial de Hospitality — el costo de conectar y los 5 huecos', () => {
  const pack = leer(PACK);

  it('documenta el costo de la conectividad con su fuente, su fecha y su aviso', () => {
    // Dato del cliente (tarifa del proveedor, 18 sep 2026). Sin su fuente, su fecha
    // y qué mide cada tramo, en un mes es un número suelto que nadie puede reconfirmar.
    expect(pack).toContain('Basic PMS');
    expect(pack).toMatch(/30 \/ 40 \/ 50 \/ 60 USD/);
    expect(pack).toMatch(/Reconfirmar la cifra y el corte de\s+>?\s*cada\s+>?\s*tramo/i);
    expect(pack).toMatch(/costo variable por conexión/);
    // El driver del costo (habitaciones) y su corte exacto quedan explícitos: es lo
    // que hace que el add-on tenga que escalar con el tamaño de la propiedad.
    expect(pack).toMatch(/30 \/ 40 \/ 50 \/ 60 USD por mes/);
    expect(pack).toMatch(/0–10 \/ 11–30 \/ 31–50 \/ 50\+ unidades vendibles/);
    // Y que el análisis excluye los costos operativos a propósito.
    expect(pack).toMatch(/solo la conectividad/i);
  });

  it('la conectividad se cobra como add-on al costo + margen, nunca incluida a pérdida', () => {
    expect(pack).toMatch(/se contrata aparte, como add-on al costo \+ margen/i);
    expect(pack).toMatch(/Nunca se vende por\s+debajo del tramo de coste/);
    expect(pack).toMatch(/no cubre el costo de conectividad/);
    expect(pack).toMatch(/crezcan con la misma variable/);
    // La tabla de add-on con sus cuatro tramos y el margen de cada uno.
    for (const precio of ['35 €/mes', '45 €/mes', '59 €/mes', '69 €/mes']) {
      expect(pack, `Falta el add-on de ${precio}`).toContain(precio);
    }
    // La unidad de medida del coste NO son los dormitorios: un apartamento
    // alquilado entero es UNA unidad vendible, y el add-on escala por tramo de
    // unidades, no multiplicando por propiedad. (Corrección del cliente.)
    expect(pack).toMatch(/apartamento que se alquila completo, el apartamento/i);
    expect(pack).toMatch(/dormitorios\s*>?\s*\*\*no cuentan\*\*/);
    expect(pack).toMatch(/son 8 unidades\*\*, no 32/i);
    expect(pack).toMatch(/no puede prometer conectividad ilimitada/i);
    // Y la pregunta abierta que mueve el número hasta 8× queda escrita.
    expect(pack).toMatch(/por cada propiedad conectada/);
    expect(pack).toMatch(/240 USD/);
  });

  it('los cinco huecos tienen su coste, su beneficio y un veredicto', () => {
    const seccion = pack.split('## Roadmap de los 5 huecos frente a Lodgify')[1]?.split('\n## ')[0] || '';
    expect(seccion).toBeTruthy();
    expect(seccion).toContain('Reseñas de huésped en la web');
    expect(seccion).toContain('Promociones y extras en la reserva');
    expect(seccion).toContain('Protección de daños');
    expect(seccion).toContain('Inbox unificado');
    expect(seccion).toContain('App móvil del huésped');
    // Veredictos explícitos: sin ellos la tabla es una lista de deseos.
    expect(seccion).toMatch(/Entra · Fase 2/);
    expect(seccion).toMatch(/Socio antes que build/);
    expect(seccion).toMatch(/SMS no de entrada/);
    expect(seccion).toMatch(/No ahora/);
    // Y lo que no se promete: la tabla ordena decisiones, no anuncia entregas.
    expect(seccion).toMatch(/no anuncia entregas/);
  });

  it('la conectividad no se presenta como promesa «incluida» sin coste', () => {
    // Con un variable por propiedad, prometer conectividad ilimitada «incluida»
    // en la banda baja es regalar el margen: la guardia exige la frase que lo impide.
    expect(pack).toMatch(/no puede\s+depender del volumen de reservas/);
  });
});
