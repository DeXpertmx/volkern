// @vitest-environment node
//
// GUARDIA C4 · La cosecha al Playbook (lib/sales/playbook-cosecha.ts) —
// módulo PROPIO, separado de training-skills. Lo que se congela:
//
//   CLASIFICACIÓN POR CONTENIDO — el tema de la lección se decide con una
//   función PURA sobre el texto de la sesión (últimos 6 turnos + técnica
//   detectada): precio, ROI, cierre, confianza, técnica. Determinista y
//   auditable: ANTES se elegía con Math.random() entre cuatro cadenas y la
//   misma lección podía entrar un día como «Precio» y otro como «Técnica».
//   Si nada encaja, categoría de respaldo — el tema nunca queda vacío.
//
//   POLÍTICA DEL UMBRAL — solo cosecha con score >= 90 (UMBRAL_COSECHA),
//   aplicado DENTRO del servicio además de en el llamador: una sola fuente
//   de verdad. La objeción guardada es la REAL del cliente (último turno
//   customer del diálogo), no una cadena fija; si no hay turno de cliente,
//   texto por defecto. La cosecha nunca rompe el post-mortem: si la BD
//   falla, devuelve null y la sesión ya persistida queda intacta.
//
//   DEDUPLICACIÓN — la huella (tema + objeción NORMALIZADA, sha256) es única
//   por tenant: «El PRECIO me parece caro» y «el precio me parece CARO» son
//   LA MISMA lección; bajo dos temas distintos, NO. La sonda previa devuelve
//   la entrada existente sin crear fila; si la sonda cae, se intenta crear
//   igual y el constraint único de la BD arbitra. El unique vive en
//   schema.prisma y está congelado aquí.
//
//   ÚNICA ESCRITURA — todo SalesPlaybookEntry nace por cosecharMejorPractica
//   y el cadáver del random en training-skills no puede volver.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

const mocks = vi.hoisted(() => ({
  playbookCreate: vi.fn(),
  playbookFindFirst: vi.fn(), // sonda de deduplicación
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    salesPlaybookEntry: { create: mocks.playbookCreate, findFirst: mocks.playbookFindFirst },
  },
}));

import {
  clasificarTema,
  cosecharMejorPractica,
  huellaLeccion,
  normalizarObjecion,
  UMBRAL_COSECHA,
  TEMA_SIN_CLASIFICAR,
} from '@/lib/sales/playbook-cosecha';
import type { RoleplayMessage } from '@/lib/skills/training-skills';

// Técnica NEUTRA por defecto: la técnica detectada FORMA PARTE del texto
// clasificado (decisión congelada abajo), así que un helper con «Cierre
// presuntivo» envenenaría cualquier caso que no la esté probando.
const pm = (tecnica = 'Escucha activa') => ({
  puntuacion_cierre: UMBRAL_COSECHA,
  argumento_mas_fuerte: 'Cuantificó el ahorro de 10 horas semanales',
  punto_de_mejora: 'Pedir el compromiso antes de la demo',
  tecnica_detectada: tecnica,
});

const sesion = (turnos: Array<[RoleplayMessage['role'], string]>): RoleplayMessage[] =>
  turnos.map(([role, content]) => ({ role, content }));

const agente = (content: string): [RoleplayMessage['role'], string] => ['agent', content];
const cliente = (content: string): [RoleplayMessage['role'], string] => ['customer', content];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.playbookCreate.mockResolvedValue({ id: 'entry-1' });
  mocks.playbookFindFirst.mockResolvedValue(null); // sin duplicado por defecto
});

describe('C4 · Clasificación por contenido (pura, determinista)', () => {
  it.each([
    ['precio', sesion([agente('Ofrecemos el plan pro'), cliente('El precio me parece caro para lo que aporta')]), 'Manejo de objeción de precio'],
    ['ROI', sesion([cliente('Necesito justificar el retorno de la inversión ante mi junta')]), 'Justificación de ROI'],
    ['cierre', sesion([cliente('¿Qué te parece si firmamos el contrato esta semana?')]), 'Cierre bajo presión'],
    ['confianza', sesion([cliente('Necesito referencias de clientes parecidos para ganar confianza')]), 'Construcción de confianza'],
    ['técnica', sesion([cliente('¿Cómo maneja la integración con nuestra API y la migración de datos?')]), 'Explicación técnica'],
    ['asunto de email', sesion([cliente('RE: Presupuesto 2026 — revisad la propuesta')]), 'Manejo de objeción de precio'],
  ])('%s → tema correcto', (_nombre, history, esperado) => {
    expect(clasificarTema(history, pm())).toBe(esperado);
  });

  it('mayúsculas y tildes no la despistan («¿CUÁNTO CUESTA? me parece CARO» → precio)', () => {
    const history = sesion([cliente('¿CUÁNTO CUESTA? Me parece CARO')]);
    expect(clasificarTema(history, pm())).toBe('Manejo de objeción de precio');
  });

  it('la técnica detectada del post-mortem también clasifica', () => {
    const history = sesion([cliente('Bueno, lo pensaré y ya te digo')]);
    expect(clasificarTema(history, pm('Manejo de objeción técnica'))).toBe('Explicación técnica');
  });

  it('precedencia congelada: la técnica detectada PESA más que el contenido posterior — cierre nombrado gana a charla técnica', () => {
    // decisión visible, no accidente: la prioridad del clasificador es de
    // arriba abajo y la técnica detectada viaja con el texto de la sesión.
    const history = sesion([cliente('¿Cómo maneja la integración con nuestra API?')]);
    expect(clasificarTema(history, pm('Cierre presuntivo'))).toBe('Cierre bajo presión');
  });

  it('la ventana son los ÚLTIMOS 6 turnos: una objeción de precio lejana ya no clasifica', () => {
    const history = sesion([
      cliente('El precio me parece caro, la verdad'), // fuera de la ventana (7.º desde el final)
      agente('Entiendo, déjame enseñarte el ahorro'),
      agente('Le preparo una simulación'),
      agente('El equipo de implantación lo hace en dos semanas'),
      agente('Además incluimos soporte prioritario'),
      agente('Y formación para su equipo'),
      agente('¿Le parece bien el jueves para la demo?'),
      cliente('Sí, el jueves me va bien'),
    ]);
    expect(clasificarTema(history, pm())).toBe(TEMA_SIN_CLASIFICAR);
  });

  it('determinista: dos sesiones idénticas producen el MISMO tema — nunca al azar', () => {
    const history = sesion([cliente('El precio me parece caro')]);
    const a = clasificarTema(history, pm());
    const b = clasificarTema(history, pm());
    expect(a).toBe(b);
  });

  it('si nada encaja, categoría de respaldo — el tema nunca queda vacío', () => {
    const history = sesion([cliente('Mañana me llamo a mí mismo para pensarlo')]);
    expect(clasificarTema(history, pm())).toBe(TEMA_SIN_CLASIFICAR);
  });

  it('la categoría de respaldo está congelada con su nombre legible', () => {
    expect(TEMA_SIN_CLASIFICAR).toBe('Argumento general de ventas');
  });

  it('el umbral de cosecha está congelado: UMBRAL_COSECHA === 90', () => {
    expect(UMBRAL_COSECHA).toBe(90);
  });
});

describe('C4 · cosecharMejorPractica (política del umbral y escritura)', () => {
  it('por debajo del umbral NO escribe: 89 devuelve null y la BD no se toca', async () => {
    const res = await cosecharMejorPractica({
      tenantId: 'tenant-1',
      agentId: 'user-1',
      history: sesion([cliente('El precio me parece caro')]),
      postMortem: pm(),
      score: UMBRAL_COSECHA - 1,
    });

    expect(res).toBeNull();
    expect(mocks.playbookCreate).not.toHaveBeenCalled();
  });

  it('frontera exacta: con el umbral justo (90) SÍ cosecha', async () => {
    const res = await cosecharMejorPractica({
      tenantId: 'tenant-1',
      agentId: 'user-1',
      history: sesion([cliente('El precio me parece caro')]),
      postMortem: pm(),
      score: UMBRAL_COSECHA,
    });

    expect(res).toEqual({ entrada: { id: 'entry-1' }, duplicado: false });
    expect(mocks.playbookCreate).toHaveBeenCalledTimes(1);
  });

  it('guarda el tema CLASIFICADO por contenido y los datos de la lección', async () => {
    await cosecharMejorPractica({
      tenantId: 'tenant-1',
      agentId: 'user-1',
      history: sesion([
        agente('Nuestro plan automatiza el seguimiento'),
        cliente('El precio me parece caro para el tamaño de mi equipo'),
      ]),
      postMortem: pm(),
      score: 94,
    });

    expect(mocks.playbookCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          agentId: 'user-1',
          topic: 'Manejo de objeción de precio',
          bestResponse: 'Cuantificó el ahorro de 10 horas semanales',
          technique: 'Escucha activa',
          score: 94,
          status: 'approved',
        }),
      })
    );
  });

  it('la objeción guardada es la REAL del cliente (último turno customer), no una cadena fija', async () => {
    await cosecharMejorPractica({
      tenantId: 'tenant-1',
      agentId: 'user-1',
      history: sesion([
        cliente('primera objeción: no tengo tiempo ahora mismo'),
        agente('Le enseño cómo ahorra horas en dos semanas'),
        cliente('el presupuesto es caro para este trimestre'),
      ]),
      postMortem: pm(),
      score: 91,
    });

    expect(mocks.playbookCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          objection: 'el presupuesto es caro para este trimestre',
        }),
      })
    );
  });

  it('sin turno de cliente en la sesión → objeción por defecto, nunca undefined', async () => {
    await cosecharMejorPractica({
      tenantId: 'tenant-1',
      agentId: 'user-1',
      history: sesion([agente('He preparado la propuesta')]),
      postMortem: pm(),
      score: 90,
    });

    expect(mocks.playbookCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ objection: 'Resistencia del cliente en la sesión' }),
      })
    );
  });

  it('una objeción larguísima se trunca a 500 + «...» — sin desbordar la fila', async () => {
    await cosecharMejorPractica({
      tenantId: 'tenant-1',
      agentId: 'user-1',
      history: sesion([cliente('x'.repeat(900))]),
      postMortem: pm(),
      score: 90,
    });

    const objection = mocks.playbookCreate.mock.calls[0][0].data.objection as string;
    expect(objection.length).toBe(503);
    expect(objection.endsWith('...')).toBe(true);
  });

  it('si la BD falla, devuelve null y NO lanza: la cosecha no puede romper el post-mortem', async () => {
    mocks.playbookCreate.mockRejectedValueOnce(new Error('connection refused'));

    const res = await cosecharMejorPractica({
      tenantId: 'tenant-1',
      agentId: 'user-1',
      history: sesion([cliente('El precio me parece caro')]),
      postMortem: pm(),
      score: 95,
    });

    expect(res).toBeNull();
  });
});

describe('C4 · Única escritura del Playbook', () => {
  const fuenteCosecha = readFileSync('lib/sales/playbook-cosecha.ts', 'utf8');
  const fuenteTraining = readFileSync('lib/skills/training-skills.ts', 'utf8');

  it('toda SalesPlaybookEntry nace por cosecharMejorPractica (única vía de escritura en el módulo)', () => {
    expect(fuenteCosecha).toContain('prisma.salesPlaybookEntry.create');
    // y no hay segunda creación en el fichero
    expect(fuenteCosecha.match(/salesPlaybookEntry\.create/g)?.length).toBe(1);
  });

  it('el cadáver del Math.random en training-skills no puede volver', () => {
    expect(fuenteTraining).not.toContain('Math.random');
    expect(fuenteTraining).not.toContain('possibleTopics');
    expect(fuenteTraining).not.toContain('harvestBestPractices');
  });
});

describe('C4 · Deduplicación de la cosecha (huella = tema + objeción normalizada)', () => {
  const entradaBase = {
    tenantId: 'tenant-1',
    agentId: 'user-1',
    postMortem: pm(),
  };

  it('normalizarObjecion colapsa signos y espacios («¿Tiene API?;   ¡SÍ!» → «tiene api si»)', () => {
    expect(normalizarObjecion('¿Tiene API?;   ¡SÍ!')).toBe('tiene api si');
  });

  it('la misma objeción en distinta forma produce la MISMA huella (normalizada)', () => {
    expect(huellaLeccion('Manejo de objeción de precio', 'El PRECIO me parece caro')).toBe(
      huellaLeccion('Manejo de objeción de precio', 'el precio me parece CARO')
    );
  });

  it('las tildes no separan: «inversión» e «inversion» son la misma objeción', () => {
    expect(huellaLeccion('Justificación de ROI', 'no veo la inversión clara')).toBe(
      huellaLeccion('Justificación de ROI', 'no veo la inversion clara')
    );
  });

  it('temas distintos separan: la misma objeción bajo dos temas NO es la misma lección', () => {
    const objecion = 'el precio me parece caro';
    expect(huellaLeccion('Manejo de objeción de precio', objecion)).not.toBe(
      huellaLeccion('Cierre bajo presión', objecion)
    );
  });

  it('sesiones distintas producen huellas distintas — el dedupe no fusiona lecciones reales', () => {
    expect(huellaLeccion('Manejo de objeción de precio', 'es caro')).not.toBe(
      huellaLeccion('Manejo de objeción de precio', 'es demasiado caro')
    );
  });

  it('huella sha256: 64 hex y determinista', () => {
    const huella = huellaLeccion('Manejo de objeción de precio', 'es caro');
    expect(huella).toMatch(/^[0-9a-f]{64}$/);
    expect(huellaLeccion('Manejo de objeción de precio', 'es caro')).toBe(huella);
  });

  it('primera vez: crea y devuelve { entrada, duplicado: false } con la huella guardada', async () => {
    const res = await cosecharMejorPractica({
      ...entradaBase,
      history: sesion([cliente('El precio me parece caro')]),
      score: 90,
    });

    expect(res!.duplicado).toBe(false);
    expect(mocks.playbookFindFirst).toHaveBeenCalledTimes(1);
    expect(mocks.playbookFindFirst).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', huellaLeccion: expect.stringMatching(/^[0-9a-f]{64}$/) },
    });
    expect(mocks.playbookCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ huellaLeccion: expect.stringMatching(/^[0-9a-f]{64}$/) }),
      })
    );
  });

  it('segunda vez: la misma objeción en otra forma encuentra la existente y NO crea', async () => {
    const primera = await cosecharMejorPractica({
      ...entradaBase,
      history: sesion([cliente('El precio me parece caro')]),
      score: 90,
    });
    expect(primera!.duplicado).toBe(false);

    // Otra sesión, misma lección en otra forma; la sonda la encuentra.
    // Limpio TAMBIÉN el create: la primera cosecha de este test ya llamó
    // una vez y la aserción de abajo cuenta desde cero.
    mocks.playbookFindFirst.mockClear();
    mocks.playbookCreate.mockClear();
    mocks.playbookFindFirst.mockResolvedValueOnce({ id: 'entry-existente', topic: 'Manejo de objeción de precio' });
    const segunda = await cosecharMejorPractica({
      ...entradaBase,
      history: sesion([cliente('el PRECIO me parece CARO')]),
      score: 92,
    });

    expect(segunda!.duplicado).toBe(true);
    expect(segunda!.entrada).toEqual({ id: 'entry-existente', topic: 'Manejo de objeción de precio' });
    expect(mocks.playbookCreate).not.toHaveBeenCalled();
  });

  it('la sonda consulta por huella exacta: objeción distinta no encuentra y crea lección nueva', async () => {
    await cosecharMejorPractica({
      ...entradaBase,
      history: sesion([cliente('El precio me parece caro')]),
      score: 90,
    });
    const huellaA = mocks.playbookFindFirst.mock.calls[0][0].where.huellaLeccion as string;

    mocks.playbookFindFirst.mockClear();
    await cosecharMejorPractica({
      ...entradaBase,
      history: sesion([cliente('Necesito pensarlo mucho más')]),
      score: 90,
    });
    const huellaB = mocks.playbookFindFirst.mock.calls[0][0].where.huellaLeccion as string;

    expect(huellaB).not.toBe(huellaA);
    // La primera cosecha de ESTE test ya consumió su create (mockClear no
    // borra el historial): la segunda debe AÑADIR exactamente una más.
    expect(mocks.playbookCreate).toHaveBeenCalledTimes(2);
  });

  it('dedupe POR TENANT: el where de la sonda siempre incluye tenantId — el mismo texto en otro tenant es otra lección', async () => {
    mocks.playbookFindFirst.mockResolvedValueOnce({ id: 'entry-t1' });
    const res = await cosecharMejorPractica({
      ...entradaBase,
      history: sesion([cliente('El precio me parece caro')]),
      score: 90,
    });

    expect(mocks.playbookFindFirst.mock.calls[0][0].where.tenantId).toBe('tenant-1');
    expect(res!.duplicado).toBe(true);
  });

  it('si la sonda falla, se intenta crear igual: una caída de la sonda no pierde una lección nueva', async () => {
    mocks.playbookFindFirst.mockRejectedValueOnce(new Error('probe timeout'));

    const res = await cosecharMejorPractica({
      ...entradaBase,
      history: sesion([cliente('El precio me parece caro')]),
      score: 90,
    });

    expect(res!.duplicado).toBe(false);
    expect(mocks.playbookCreate).toHaveBeenCalledTimes(1);
  });

  it('competencia concurrente: si el create rompe por el unique, devuelve null sin lanzar', async () => {
    mocks.playbookFindFirst.mockResolvedValueOnce(null);
    mocks.playbookCreate.mockRejectedValueOnce(new Error('P2002: Unique constraint failed'));

    const res = await cosecharMejorPractica({
      ...entradaBase,
      history: sesion([cliente('El precio me parece caro')]),
      score: 90,
    });

    expect(res).toBeNull();
  });

  it('la entrada guardada lleva SIEMPRE la huella — el dedupe no se puede desactivar sin tocar el módulo', () => {
    const fuente = readFileSync('lib/sales/playbook-cosecha.ts', 'utf8');
    expect(fuente).toContain('huellaLeccion: huella');
    expect(fuente).toContain('salesPlaybookEntry.findFirst');
  });

  it('el esquema respalda la decisión: campo huellaLeccion y unique (tenantId, huellaLeccion)', () => {
    const esquema = readFileSync('prisma/schema.prisma', 'utf8');
    expect(esquema).toMatch(/model SalesPlaybookEntry \{[\s\S]*huellaLeccion\s+String\?/);
    expect(esquema).toMatch(/model SalesPlaybookEntry \{[\s\S]*@@unique\(\[tenantId, huellaLeccion\]\)/);
  });
});
