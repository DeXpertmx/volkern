import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// ─── Academy ────────────────────────────────────────────────────
import {
  CursoCreateSchema,
  QuizCreateSchema,
  ReviewCreateSchema,
  CuponCreateSchema,
  InscripcionCreateSchema,
  AusenciaCreateSchema,
  EstudianteCreateSchema,
  AcademyLoginSchema,
  CertificadoGenerarSchema,
  DataDeletionRequestSchema,
} from '@/lib/validation/schemas/academy';

// ─── Citas ──────────────────────────────────────────────────────
import {
  CitaCreateSchema,
  CitaReagendarSchema,
  CitaPublicaSchema,
  DisponibilidadQuerySchema,
  CitaActionSchema,
} from '@/lib/validation/schemas/citas';

// ─── Employees ──────────────────────────────────────────────────
import {
  EmployeeCreateSchema,
  VacationRequestSchema,
  ExpenseCreateSchema,
  AttendancePunchSchema,
  EmployeeBenefitSchema,
} from '@/lib/validation/schemas/employees';

// ─── Admin ──────────────────────────────────────────────────────
import {
  TenantCreateSchema,
  TenantOperationSchema,
  PlanCreateSchema,
  AuditAlertResolveSchema,
  ImpersonateActionSchema,
  BackupCreateSchema,
} from '@/lib/validation/schemas/admin';

// ─── Notifications / Integraciones ──────────────────────────────
import {
  IntegracionCreateSchema,
  NotificationMarkReadSchema,
} from '@/lib/validation/schemas/notifications';

// ─── Helpers ────────────────────────────────────────────────────
function check(schema: z.ZodTypeAny, data: unknown) {
  return schema.safeParse(data);
}

function ok(schema: z.ZodTypeAny, data: unknown) {
  const r = check(schema, data);
  if (!r.success) {
    console.error('Expected success but got:', JSON.stringify(r.error.issues, null, 2));
  }
  expect(r.success).toBe(true);
}

function fail(schema: z.ZodTypeAny, data: unknown, pathContains?: string) {
  const r = check(schema, data);
  expect(r.success).toBe(false);
  if (pathContains && !r.success) {
    const paths = r.error.issues.map(i => i.path.join('.'));
    expect(paths.some(p => p.includes(pathContains))).toBe(true);
  }
}

// ═══════════════════════════════════════════════════════════════════
// ACADEMY
// ═══════════════════════════════════════════════════════════════════
describe('Zod — Academy', () => {
  describe('CursoCreateSchema', () => {
    const valid = { titulo: 'Curso de Testing' };

    it('debe aceptar datos mínimos', () => {
      ok(CursoCreateSchema, valid);
    });

    it('debe aplicar defaults: nivel=principiante, moneda=EUR, tipoMonetizacion=one_time, publicado=false', () => {
      const r = check(CursoCreateSchema, valid);
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.nivel).toBe('principiante');
        expect(r.data.moneda).toBe('EUR');
        expect(r.data.tipoMonetizacion).toBe('one_time');
        expect(r.data.publicado).toBe(false);
        expect(r.data.permiteComentarios).toBe(true);
        expect(r.data.certificadoHabilitado).toBe(true);
        expect(r.data.puntuajeMinimoCertificado).toBe(80);
      }
    });

    it('debe aceptar todos los niveles', () => {
      for (const n of ['principiante', 'intermedio', 'avanzado', 'todos']) {
        ok(CursoCreateSchema, { ...valid, nivel: n as 'principiante' });
      }
    });

    it('debe aceptar todos los tipos de monetización', () => {
      for (const m of ['one_time', 'suscripcion', 'gratuito']) {
        ok(CursoCreateSchema, { ...valid, tipoMonetizacion: m as 'one_time' });
      }
    });

    it('debe aceptar todos los tipos de acceso', () => {
      for (const a of ['immediate', 'scheduled', 'membresia']) {
        ok(CursoCreateSchema, { ...valid, tipoAcceso: a as 'immediate' });
      }
    });

    it('debe aceptar con fechaInicio datetime', () => {
      ok(CursoCreateSchema, { ...valid, fechaInicio: '2025-01-15T10:00:00.000Z' });
    });

    it('debe aceptar precio y precioSuscripcion como number', () => {
      ok(CursoCreateSchema, { ...valid, precio: 99.99, precioSuscripcion: 9.99 });
    });

    it('debe coerce string precio a number', () => {
      const r = check(CursoCreateSchema, { ...valid, precio: '150' });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.precio).toBe(150);
    });

    it('debe rechazar titulo vacío', () => {
      fail(CursoCreateSchema, { titulo: '' }, 'titulo');
    });

    it('debe rechazar sin titulo', () => {
      fail(CursoCreateSchema, {}, 'titulo');
    });
  });

  describe('QuizCreateSchema', () => {
    const valid = { titulo: 'Quiz Final' };

    it('debe aceptar datos mínimos', () => {
      ok(QuizCreateSchema, valid);
    });

    it('debe aplicar defaults: tipoQuiz=quiz, puntuajeMinimo=70, intentosPermitidos=-1, mostrarRespuestas=true', () => {
      const r = check(QuizCreateSchema, valid);
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.tipoQuiz).toBe('quiz');
        expect(r.data.puntuajeMinimo).toBe(70);
        expect(r.data.intentosPermitidos).toBe(-1);
        expect(r.data.mostrarRespuestas).toBe(true);
        expect(r.data.barajarPreguntas).toBe(false);
      }
    });

    it('debe aceptar preguntas vacío (default [])', () => {
      const r = check(QuizCreateSchema, { ...valid, preguntas: [] });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.preguntas).toEqual([]);
    });

    it('debe aceptar preguntas con multiple_choice', () => {
      ok(QuizCreateSchema, {
        ...valid,
        preguntas: [
          { pregunta: '¿Qué es Zod?', tipoPregunta: 'multiple_choice', opciones: ['A', 'B'] },
        ],
      });
    });

    it('debe aceptar preguntas con true_false, open_ended, fill_blank', () => {
      for (const tipo of ['true_false', 'open_ended', 'fill_blank']) {
        ok(QuizCreateSchema, {
          ...valid,
          preguntas: [{ pregunta: `Pregunta tipo ${tipo}`, tipoPregunta: tipo as 'multiple_choice' }],
        });
      }
    });

    it('debe aceptar pregunta con puntaje y explicación', () => {
      ok(QuizCreateSchema, {
        ...valid,
        preguntas: [{ pregunta: 'P1', puntaje: 5, explicacion: 'Porque sí' }],
      });
    });

    it('debe aceptar tiempoLimiteMinutos', () => {
      ok(QuizCreateSchema, { ...valid, tiempoLimiteMinutos: 30 });
    });

    it('debe aceptar barajarPreguntas true', () => {
      ok(QuizCreateSchema, { ...valid, barajarPreguntas: true });
    });

    it('debe rechazar pregunta sin texto', () => {
      fail(QuizCreateSchema, { ...valid, preguntas: [{ pregunta: '' }] }, 'preguntas');
    });
  });

  describe('ReviewCreateSchema', () => {
    it('debe aceptar review con calificación 5', () => {
      ok(ReviewCreateSchema, {
        estudianteId: 'cuid12345678901234567890123',
        calificacion: 5,
      });
    });

    it('debe aceptar review con calificación 0', () => {
      ok(ReviewCreateSchema, {
        estudianteId: 'cuid12345678901234567890123',
        calificacion: 0,
      });
    });

    it('debe aceptar con titulo y comentario', () => {
      ok(ReviewCreateSchema, {
        estudianteId: 'cuid12345678901234567890123',
        calificacion: 3,
        titulo: 'Buen curso',
        comentario: 'Muy didáctico',
      });
    });

    it('debe rechazar calificación > 5', () => {
      fail(ReviewCreateSchema, { estudianteId: 'cuid12345678901234567890123', calificacion: 6 }, 'calificacion');
    });

    it('debe rechazar calificación negativa', () => {
      fail(ReviewCreateSchema, { estudianteId: 'cuid12345678901234567890123', calificacion: -1 }, 'calificacion');
    });

    it('debe rechazar sin estudianteId', () => {
      fail(ReviewCreateSchema, { calificacion: 3 }, 'estudianteId');
    });
  });

  describe('CuponCreateSchema', () => {
    const valid = { codigo: 'VERANO2024', valorDescuento: 20 };

    it('debe aceptar datos mínimos', () => {
      ok(CuponCreateSchema, valid);
    });

    it('debe aplicar defaults: tipoDescuento=porcentaje, usosMaximos=-1, activo=true', () => {
      const r = check(CuponCreateSchema, valid);
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.tipoDescuento).toBe('porcentaje');
        expect(r.data.usosMaximos).toBe(-1);
        expect(r.data.activo).toBe(true);
      }
    });

    it('debe aceptar tipoDescuento fijo', () => {
      ok(CuponCreateSchema, { ...valid, tipoDescuento: 'fijo' });
    });

    it('debe aceptar fechaInicio y fechaExpiracion', () => {
      ok(CuponCreateSchema, {
        ...valid,
        fechaInicio: '2024-06-01T00:00:00.000Z',
        fechaExpiracion: '2024-08-31T23:59:59.000Z',
      });
    });

    it('debe coerce valorDescuento string a number', () => {
      const r = check(CuponCreateSchema, { codigo: 'TEST', valorDescuento: '15' });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.valorDescuento).toBe(15);
    });

    it('debe rechazar valorDescuento negativo', () => {
      fail(CuponCreateSchema, { ...valid, valorDescuento: -5 }, 'valorDescuento');
    });

    it('debe rechazar codigo vacío', () => {
      fail(CuponCreateSchema, { ...valid, codigo: '' }, 'codigo');
    });
  });

  describe('InscripcionCreateSchema', () => {
    const valid = {
      estudianteId: 'cuid12345678901234567890123',
      cursoId: 'cuid12345678901234567890123',
    };

    it('debe aceptar datos mínimos', () => {
      ok(InscripcionCreateSchema, valid);
    });

    it('debe aplicar default tipoAcceso=compra', () => {
      const r = check(InscripcionCreateSchema, valid);
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.tipoAcceso).toBe('compra');
    });

    it('debe aceptar todos los tipos de acceso', () => {
      for (const t of ['compra', 'suscripcion', 'gratuito', 'cortesia']) {
        ok(InscripcionCreateSchema, { ...valid, tipoAcceso: t as 'compra' });
      }
    });

    it('debe aceptar con cuponUsado y stripePaymentId', () => {
      ok(InscripcionCreateSchema, {
        ...valid,
        cuponUsado: 'VERANO2024',
        stripePaymentId: 'pi_abc123',
      });
    });

    it('debe rechazar sin estudianteId', () => {
      fail(InscripcionCreateSchema, { cursoId: 'cuid12345678901234567890123' }, 'estudianteId');
    });

    it('debe rechazar sin cursoId', () => {
      fail(InscripcionCreateSchema, { estudianteId: 'cuid12345678901234567890123' }, 'cursoId');
    });
  });

  describe('AusenciaCreateSchema (refine fechas)', () => {
    const valid = {
      titulo: 'Vacaciones',
      fechaInicio: '2024-07-01T00:00:00.000Z',
      fechaFin: '2024-07-15T00:00:00.000Z',
    };

    it('debe aceptar datos válidos', () => {
      ok(AusenciaCreateSchema, valid);
    });

    it('debe aplicar defaults: tipo=vacaciones, color=#ef4444', () => {
      const r = check(AusenciaCreateSchema, valid);
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.tipo).toBe('vacaciones');
        expect(r.data.color).toBe('#ef4444');
      }
    });

    it('debe aceptar fechas iguales (mismo día)', () => {
      ok(AusenciaCreateSchema, {
        titulo: 'Cita médica',
        fechaInicio: '2024-07-01T09:00:00.000Z',
        fechaFin: '2024-07-01T10:00:00.000Z',
      });
    });

    it('debe rechazar fechaFin anterior a fechaInicio (refine)', () => {
      fail(AusenciaCreateSchema, {
        titulo: 'Error',
        fechaInicio: '2024-07-15T00:00:00.000Z',
        fechaFin: '2024-07-01T00:00:00.000Z',
      }, 'fechaFin');
    });

    it('debe rechazar sin titulo', () => {
      fail(AusenciaCreateSchema, { fechaInicio: '2024-07-01T00:00:00.000Z', fechaFin: '2024-07-15T00:00:00.000Z' }, 'titulo');
    });
  });

  describe('EstudianteCreateSchema', () => {
    const valid = { nombre: 'Ana López', email: 'ana@test.com' };

    it('debe aceptar datos mínimos', () => {
      ok(EstudianteCreateSchema, valid);
    });

    it('debe aplicar default tipoAcceso=free', () => {
      const r = check(EstudianteCreateSchema, valid);
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.tipoAcceso).toBe('free');
    });

    it('debe aceptar con nombre desglosado', () => {
      ok(EstudianteCreateSchema, {
        ...valid,
        primerNombre: 'Ana',
        apellidoPaterno: 'López',
        apellidoMaterno: 'García',
      });
    });

    it('debe aceptar con tags y consentimientoGDPR', () => {
      ok(EstudianteCreateSchema, {
        ...valid,
        tags: ['vip', 'empresarial'],
        consentimientoGDPR: true,
      });
    });

    it('debe rechazar email inválido', () => {
      fail(EstudianteCreateSchema, { nombre: 'X', email: 'no-email' }, 'email');
    });

    it('debe rechazar nombre vacío', () => {
      fail(EstudianteCreateSchema, { nombre: '', email: 'a@test.com' }, 'nombre');
    });
  });

  describe('AcademyLoginSchema', () => {
    it('debe aceptar login válido', () => {
      ok(AcademyLoginSchema, { email: 'alumno@academy.com', password: 'secure123' });
    });

    it('debe rechazar email inválido', () => {
      fail(AcademyLoginSchema, { email: 'bad', password: 'x' }, 'email');
    });

    it('debe rechazar password vacío', () => {
      fail(AcademyLoginSchema, { email: 'a@b.com', password: '' }, 'password');
    });
  });

  describe('CertificadoGenerarSchema', () => {
    const validIds = {
      estudianteId: 'cuid12345678901234567890123',
      cursoId: 'cuid98765432109876543210987',
    };

    it('debe aceptar datos válidos', () => {
      ok(CertificadoGenerarSchema, validIds);
    });

    it('debe rechazar sin estudianteId', () => {
      fail(CertificadoGenerarSchema, { cursoId: validIds.cursoId }, 'estudianteId');
    });

    it('debe rechazar sin cursoId', () => {
      fail(CertificadoGenerarSchema, { estudianteId: validIds.estudianteId }, 'cursoId');
    });
  });

  describe('DataDeletionRequestSchema', () => {
    it('debe aceptar solicitud válida', () => {
      ok(DataDeletionRequestSchema, { platform: 'academy', userEmail: 'user@test.com' });
    });

    it('debe aceptar con phone y reason', () => {
      ok(DataDeletionRequestSchema, {
        platform: 'app',
        userEmail: 'user@test.com',
        userPhone: '+34600000000',
        reason: 'Ya no uso la plataforma',
      });
    });

    it('debe rechazar email inválido', () => {
      fail(DataDeletionRequestSchema, { platform: 'x', userEmail: 'bad' }, 'userEmail');
    });

    it('debe rechazar sin platform', () => {
      fail(DataDeletionRequestSchema, { userEmail: 'a@b.com' }, 'platform');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// CITAS
// ═══════════════════════════════════════════════════════════════════
describe('Zod — Citas', () => {
  describe('CitaCreateSchema (refine: leadId || contactId || titulo)', () => {
    const baseCita = {
      descripcion: 'Reunión de seguimiento',
      fechaHora: '2024-07-15T14:00:00.000Z',
    };

    it('debe aceptar con leadId', () => {
      ok(CitaCreateSchema, { ...baseCita, leadId: 'cuid12345678901234567890123' });
    });

    it('debe aceptar con contactId', () => {
      ok(CitaCreateSchema, { ...baseCita, contactId: 'cuid12345678901234567890123' });
    });

    it('debe aceptar con titulo (sin leadId ni contactId)', () => {
      ok(CitaCreateSchema, { ...baseCita, titulo: 'Reunión importante' });
    });

    it('debe rechazar sin leadId, contactId ni titulo (refine)', () => {
      fail(CitaCreateSchema, { ...baseCita }, 'leadId');
    });

    it('debe aplicar defaults: tipo=reunion, duracion=60, estado=pendiente, tipoLinkReunion=ninguno, bufferMinutos=0', () => {
      const r = check(CitaCreateSchema, { ...baseCita, leadId: 'cuid12345678901234567890123' });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.tipo).toBe('reunion');
        expect(r.data.duracion).toBe(60);
        expect(r.data.estado).toBe('pendiente');
        expect(r.data.tipoLinkReunion).toBe('ninguno');
        expect(r.data.bufferMinutos).toBe(0);
        expect(r.data.avisoMinimo).toBe(0);
      }
    });

    it('debe aceptar duración mínima 5', () => {
      ok(CitaCreateSchema, { ...baseCita, leadId: 'cuid12345678901234567890123', duracion: 5 });
    });

    it('debe rechazar duración < 5', () => {
      fail(CitaCreateSchema, { ...baseCita, leadId: 'cuid12345678901234567890123', duracion: 4 }, 'duracion');
    });

    it('debe rechazar duración > 480 (8 horas)', () => {
      fail(CitaCreateSchema, { ...baseCita, leadId: 'cuid12345678901234567890123', duracion: 481 }, 'duracion');
    });

    it('debe aceptar los 4 tipos de cita', () => {
      for (const t of ['reunion', 'llamada', 'presencial', 'otro']) {
        ok(CitaCreateSchema, { ...baseCita, leadId: 'cuid12345678901234567890123', tipo: t as 'reunion' });
      }
    });

    it('debe aceptar linkReunion URL', () => {
      ok(CitaCreateSchema, {
        ...baseCita,
        leadId: 'cuid12345678901234567890123',
        linkReunion: 'https://meet.google.com/abc-def',
      });
    });

    it('debe rechazar linkReunion no URL', () => {
      fail(CitaCreateSchema, {
        ...baseCita,
        leadId: 'cuid12345678901234567890123',
        linkReunion: 'no-es-url',
      }, 'linkReunion');
    });
  });

  describe('CitaReagendarSchema', () => {
    it('debe aceptar reagendamiento válido', () => {
      ok(CitaReagendarSchema, { nuevaFechaHora: '2024-08-01T10:00:00.000Z' });
    });

    it('debe aceptar con nuevaDuracion y razon', () => {
      ok(CitaReagendarSchema, {
        nuevaFechaHora: '2024-08-01T10:00:00.000Z',
        nuevaDuracion: 30,
        razon: 'Conflicto de agenda',
      });
    });

    it('debe rechazar sin nuevaFechaHora', () => {
      fail(CitaReagendarSchema, {}, 'nuevaFechaHora');
    });

    it('debe rechazar nuevaFechaHora no ISO', () => {
      fail(CitaReagendarSchema, { nuevaFechaHora: 'ayer' }, 'nuevaFechaHora');
    });
  });

  describe('CitaPublicaSchema', () => {
    const validCitaPublica = {
      tenantId: 'tenant-001',
      servicioId: 'svc-abc',
      fechaHora: '2024-07-20T15:00:00.000Z',
      nombre: 'Carlos Ruiz',
      email: 'carlos@test.com',
    };

    it('debe aceptar datos válidos', () => {
      ok(CitaPublicaSchema, validCitaPublica);
    });

    it('debe aceptar con telefono y notas', () => {
      ok(CitaPublicaSchema, { ...validCitaPublica, telefono: '+34600000000', notas: 'Prefiere tarde' });
    });

    it('debe rechazar sin tenantId', () => {
      fail(CitaPublicaSchema, { ...validCitaPublica, tenantId: undefined }, 'tenantId');
    });

    it('debe rechazar sin servicioId', () => {
      fail(CitaPublicaSchema, { ...validCitaPublica, servicioId: undefined }, 'servicioId');
    });

    it('debe rechazar email inválido', () => {
      fail(CitaPublicaSchema, { ...validCitaPublica, email: 'no-email' }, 'email');
    });
  });

  describe('DisponibilidadQuerySchema', () => {
    it('debe aceptar query mínima', () => {
      ok(DisponibilidadQuerySchema, { tenantId: 'tenant-001' });
    });

    it('debe aplicar default diasAdelante=30', () => {
      const r = check(DisponibilidadQuerySchema, { tenantId: 't1' });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.diasAdelante).toBe(30);
    });

    it('debe aceptar diasAdelante 1 (mínimo)', () => {
      ok(DisponibilidadQuerySchema, { tenantId: 't1', diasAdelante: 1 });
    });

    it('debe aceptar diasAdelante 90 (máximo)', () => {
      ok(DisponibilidadQuerySchema, { tenantId: 't1', diasAdelante: 90 });
    });

    it('debe rechazar diasAdelante < 1', () => {
      fail(DisponibilidadQuerySchema, { tenantId: 't1', diasAdelante: 0 }, 'diasAdelante');
    });

    it('debe rechazar diasAdelante > 90', () => {
      fail(DisponibilidadQuerySchema, { tenantId: 't1', diasAdelante: 91 }, 'diasAdelante');
    });

    it('debe aceptar con fechaInicio y fechaFin', () => {
      ok(DisponibilidadQuerySchema, {
        tenantId: 't1',
        fechaInicio: '2024-07-01T00:00:00.000Z',
        fechaFin: '2024-07-31T00:00:00.000Z',
      });
    });
  });

  describe('CitaActionSchema', () => {
    it('debe aceptar con token', () => {
      ok(CitaActionSchema, { token: 'abc123xyz' });
    });

    it('debe rechazar sin token', () => {
      fail(CitaActionSchema, {}, 'token');
    });

    it('debe rechazar token vacío', () => {
      fail(CitaActionSchema, { token: '' }, 'token');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// EMPLOYEES
// ═══════════════════════════════════════════════════════════════════
describe('Zod — Employees', () => {
  describe('EmployeeCreateSchema', () => {
    const valid = {
      nombre: 'María García',
      email: 'maria@empresa.com',
    };

    it('debe aceptar datos mínimos', () => {
      ok(EmployeeCreateSchema, valid);
    });

    it('debe aplicar defaults: tipoContrato=indefinido, jornada=completa, moneda=EUR', () => {
      const r = check(EmployeeCreateSchema, valid);
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.tipoContrato).toBe('indefinido');
        expect(r.data.jornada).toBe('completa');
        expect(r.data.moneda).toBe('EUR');
      }
    });

    it('debe aceptar todos los tipos de contrato', () => {
      for (const t of ['indefinido', 'temporal', 'practicas', 'freelance']) {
        ok(EmployeeCreateSchema, { ...valid, tipoContrato: t as 'indefinido' });
      }
    });

    it('debe aceptar todas las jornadas', () => {
      for (const j of ['completa', 'parcial', 'flexible']) {
        ok(EmployeeCreateSchema, { ...valid, jornada: j as 'completa' });
      }
    });

    it('debe aceptar con supervisorId (cuid)', () => {
      ok(EmployeeCreateSchema, { ...valid, supervisorId: 'cuid12345678901234567890123' });
    });

    it('debe aceptar con fechaContratacion y salarioBase', () => {
      ok(EmployeeCreateSchema, {
        ...valid,
        fechaContratacion: '2023-01-15T00:00:00.000Z',
        salarioBase: 35000,
      });
    });

    it('debe rechazar nombre vacío', () => {
      fail(EmployeeCreateSchema, { ...valid, nombre: '' }, 'nombre');
    });

    it('debe rechazar email inválido', () => {
      fail(EmployeeCreateSchema, { ...valid, email: 'bad' }, 'email');
    });
  });

  describe('VacationRequestSchema (refine fechas)', () => {
    const valid = {
      employeeId: 'cuid12345678901234567890123',
      fechaInicio: '2024-08-01T00:00:00.000Z',
      fechaFin: '2024-08-15T00:00:00.000Z',
    };

    it('debe aceptar solicitud válida', () => {
      ok(VacationRequestSchema, valid);
    });

    it('debe aplicar default tipo=vacaciones', () => {
      const r = check(VacationRequestSchema, valid);
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.tipo).toBe('vacaciones');
    });

    it('debe aceptar todos los tipos', () => {
      for (const t of ['vacaciones', 'enfermedad', 'personal', 'otro']) {
        ok(VacationRequestSchema, { ...valid, tipo: t as 'vacaciones' });
      }
    });

    it('debe aceptar fechas iguales (1 día)', () => {
      ok(VacationRequestSchema, {
        employeeId: 'cuid12345678901234567890123',
        fechaInicio: '2024-08-01T00:00:00.000Z',
        fechaFin: '2024-08-01T00:00:00.000Z',
      });
    });

    it('debe rechazar fechaFin anterior a fechaInicio (refine)', () => {
      fail(VacationRequestSchema, {
        employeeId: 'cuid12345678901234567890123',
        fechaInicio: '2024-08-15T00:00:00.000Z',
        fechaFin: '2024-08-01T00:00:00.000Z',
      }, 'fechaFin');
    });

    it('debe rechazar sin employeeId', () => {
      fail(VacationRequestSchema, {
        fechaInicio: '2024-08-01T00:00:00.000Z',
        fechaFin: '2024-08-15T00:00:00.000Z',
      }, 'employeeId');
    });
  });

  describe('ExpenseCreateSchema', () => {
    const valid = {
      empleadoId: 'cuid12345678901234567890123',
      tipo: 'viaje',
      concepto: 'Vuelo Madrid-Barcelona',
      monto: 250.50,
      moneda: 'EUR',
      fecha: '2024-06-15T00:00:00.000Z',
    };

    it('debe aceptar gasto válido', () => {
      ok(ExpenseCreateSchema, valid);
    });

    it('debe aceptar con comprobanteUrl y notas', () => {
      ok(ExpenseCreateSchema, { ...valid, comprobanteUrl: 'https://files.com/ticket.pdf', notas: 'Cliente X' });
    });

    it('debe rechazar monto negativo', () => {
      fail(ExpenseCreateSchema, { ...valid, monto: -50 }, 'monto');
    });

    it('debe rechazar sin concepto', () => {
      fail(ExpenseCreateSchema, { ...valid, concepto: '' }, 'concepto');
    });
  });

  describe('AttendancePunchSchema (GPS bounds)', () => {
    const valid = {
      employeeId: 'cuid12345678901234567890123',
      tipo: 'entrada' as const,
    };

    it('debe aceptar punch mínimo', () => {
      ok(AttendancePunchSchema, valid);
    });

    it('debe aceptar todos los tipos de punch', () => {
      for (const t of ['entrada', 'salida', 'pausa_inicio', 'pausa_fin']) {
        ok(AttendancePunchSchema, { ...valid, tipo: t as 'entrada' });
      }
    });

    it('debe aceptar ubicación GPS válida', () => {
      ok(AttendancePunchSchema, {
        ...valid,
        ubicacion: { latitud: 40.4168, longitud: -3.7038 },
      });
    });

    it('debe aceptar latitud límite -90 y 90', () => {
      ok(AttendancePunchSchema, { ...valid, ubicacion: { latitud: -90, longitud: 0 } });
      ok(AttendancePunchSchema, { ...valid, ubicacion: { latitud: 90, longitud: 0 } });
    });

    it('debe aceptar longitud límite -180 y 180', () => {
      ok(AttendancePunchSchema, { ...valid, ubicacion: { latitud: 0, longitud: -180 } });
      ok(AttendancePunchSchema, { ...valid, ubicacion: { latitud: 0, longitud: 180 } });
    });

    it('debe rechazar latitud > 90', () => {
      fail(AttendancePunchSchema, {
        ...valid,
        ubicacion: { latitud: 91, longitud: 0 },
      }, 'ubicacion');
    });

    it('debe rechazar latitud < -90', () => {
      fail(AttendancePunchSchema, {
        ...valid,
        ubicacion: { latitud: -91, longitud: 0 },
      }, 'ubicacion');
    });

    it('debe rechazar longitud > 180', () => {
      fail(AttendancePunchSchema, {
        ...valid,
        ubicacion: { latitud: 0, longitud: 181 },
      }, 'ubicacion');
    });

    it('debe rechazar longitud < -180', () => {
      fail(AttendancePunchSchema, {
        ...valid,
        ubicacion: { latitud: 0, longitud: -181 },
      }, 'ubicacion');
    });

    it('NO acepta selfieBase64 (RGPD: campo retirado en Julio 2026)', () => {
      // selfieBase64 fue eliminado de AttendancePunchSchema por RGPD Art. 9.
      // Zod ignora campos extra silenciosamente por defecto (no es strict()),
      // pero queremos asegurar que el SCHEMA en sí NO declara la clave.
      const declaredKeys = Object.keys(
        (AttendancePunchSchema as any).shape ?? {},
      );
      expect(declaredKeys).not.toContain('selfieBase64');
      // Y que sigue aceptando un marcaje GPS válido SIN selfieBase64.
      ok(AttendancePunchSchema, {
        ...valid,
        timestamp: '2024-06-15T09:00:00.000Z',
      });
    });

    it('rechaza coordenadas fuera de bounds RGPD/Earth (lat>90)', () => {
      fail(AttendancePunchSchema, {
        ...valid,
        ubicacion: { latitud: 91, longitud: 0 },
      }, 'ubicacion');
    });
  });

  describe('EmployeeBenefitSchema', () => {
    const valid = {
      employeeId: 'cuid12345678901234567890123',
      tipo: 'seguro_medico' as const,
    };

    it('debe aceptar beneficio mínimo', () => {
      ok(EmployeeBenefitSchema, valid);
    });

    it('debe aplicar default activo=true', () => {
      const r = check(EmployeeBenefitSchema, valid);
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.activo).toBe(true);
    });

    it('debe aceptar todos los tipos de beneficio', () => {
      const tipos = ['seguro_medico', 'vales_despensa', 'fondo_ahorro', 'auto_empresa', 'telefono', 'laptop', 'otro'];
      for (const t of tipos) {
        ok(EmployeeBenefitSchema, { ...valid, tipo: t as 'seguro_medico' });
      }
    });

    it('debe aceptar con valorMensual y fechas', () => {
      ok(EmployeeBenefitSchema, {
        ...valid,
        valorMensual: 500,
        fechaInicio: '2024-01-01T00:00:00.000Z',
        fechaFin: '2025-01-01T00:00:00.000Z',
      });
    });

    it('debe rechazar tipo inválido', () => {
      fail(EmployeeBenefitSchema, { ...valid, tipo: 'bono_anual' }, 'tipo');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// ADMIN
// ═══════════════════════════════════════════════════════════════════
describe('Zod — Admin', () => {
  describe('TenantCreateSchema', () => {
    const valid = { nombre: 'Mi Empresa', slug: 'mi-empresa' };

    it('debe aceptar datos mínimos', () => {
      ok(TenantCreateSchema, valid);
    });

    it('debe aplicar defaults: plan=trial, moneda=EUR, estado=activo, autoProvision=true', () => {
      const r = check(TenantCreateSchema, valid);
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.plan).toBe('trial');
        expect(r.data.moneda).toBe('EUR');
        expect(r.data.estado).toBe('activo');
        expect(r.data.autoProvision).toBe(true);
      }
    });

    it('debe aceptar slug con números y guiones', () => {
      ok(TenantCreateSchema, { nombre: 'Test', slug: 'test-123' });
    });

    it('debe rechazar slug con mayúsculas', () => {
      fail(TenantCreateSchema, { nombre: 'X', slug: 'Mi-Empresa' }, 'slug');
    });

    it('debe rechazar slug con caracteres especiales', () => {
      fail(TenantCreateSchema, { nombre: 'X', slug: 'mi_empresa!' }, 'slug');
    });

    it('debe aceptar billingEmail válido', () => {
      ok(TenantCreateSchema, { ...valid, billingEmail: 'facturas@empresa.com' });
    });

    it('debe rechazar billingEmail inválido', () => {
      fail(TenantCreateSchema, { ...valid, billingEmail: 'no-email' }, 'billingEmail');
    });

    it('debe aceptar billingEmail vacío', () => {
      ok(TenantCreateSchema, { ...valid, billingEmail: '' });
    });

    it('debe aceptar todos los estados', () => {
      for (const e of ['activo', 'inactivo', 'suspendido', 'trial']) {
        ok(TenantCreateSchema, { ...valid, estado: e as 'activo' });
      }
    });

    it('debe aceptar trialDays', () => {
      ok(TenantCreateSchema, { ...valid, trialDays: 14 });
    });

    it('debe rechazar trialDays < 1', () => {
      fail(TenantCreateSchema, { ...valid, trialDays: 0 }, 'trialDays');
    });
  });

  describe('TenantOperationSchema (refine: operation || type)', () => {
    it('debe aceptar con operation', () => {
      ok(TenantOperationSchema, { operation: 'extend_trial' });
    });

    it('debe aceptar con type', () => {
      ok(TenantOperationSchema, { type: 'provision_db' });
    });

    it('debe aceptar todos los tipos de operación', () => {
      const ops = ['provision_db', 'extend_trial', 'suspend', 'reactivate', 'toggle_industrial_license', 'toggle_feature', 'assign_plan'];
      for (const o of ops) {
        ok(TenantOperationSchema, { operation: o as 'provision_db' });
      }
    });

    it('debe rechazar sin operation ni type (refine)', () => {
      const r = check(TenantOperationSchema, {});
      expect(r.success).toBe(false);
    });

    it('debe aceptar con params', () => {
      ok(TenantOperationSchema, { operation: 'extend_trial', params: { days: 30 } });
    });
  });

  describe('PlanCreateSchema', () => {
    const valid = { nombre: 'Plan Pro', precio: 49.99 };

    it('debe aceptar datos mínimos', () => {
      ok(PlanCreateSchema, valid);
    });

    it('debe aplicar defaults: moneda=MXN, intervalo=mensual, esPopular=false', () => {
      const r = check(PlanCreateSchema, valid);
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.moneda).toBe('MXN');
        expect(r.data.intervalo).toBe('mensual');
        expect(r.data.esPopular).toBe(false);
      }
    });

    it('debe aplicar defaults en 0 para límites', () => {
      const r = check(PlanCreateSchema, valid);
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.limiteUsuarios).toBe(0);
        expect(r.data.limiteLeads).toBe(0);
        expect(r.data.limiteStorage).toBe(0);
      }
    });

    it('debe acepar con stripePriceId y módulos', () => {
      ok(PlanCreateSchema, {
        ...valid,
        stripePriceId: 'price_abc123',
        modules: ['crm', 'erp', 'academy'],
      });
    });

    it('debe coerce precio string a number', () => {
      const r = check(PlanCreateSchema, { nombre: 'Plan', precio: '99' });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.precio).toBe(99);
    });

    it('debe rechazar sin nombre', () => {
      fail(PlanCreateSchema, { precio: 10 }, 'nombre');
    });
  });

  describe('AuditAlertResolveSchema', () => {
    const valid = {
      alertId: 'alert-001',
      note: 'Justificación suficiente con más de 20 caracteres',
    };

    it('debe aceptar resolución válida', () => {
      ok(AuditAlertResolveSchema, valid);
    });

    it('debe aceptar con auditId y reactivateModule', () => {
      ok(AuditAlertResolveSchema, { ...valid, auditId: 'audit-001', reactivateModule: true });
    });

    it('debe rechazar note con menos de 20 caracteres', () => {
      fail(AuditAlertResolveSchema, { alertId: 'a1', note: 'Muy corto' }, 'note');
    });

    it('debe rechazar note vacía', () => {
      fail(AuditAlertResolveSchema, { alertId: 'a1', note: '' }, 'note');
    });
  });

  describe('ImpersonateActionSchema', () => {
    it('debe aceptar action start', () => {
      ok(ImpersonateActionSchema, { action: 'start' });
    });

    it('debe aceptar action stop con tenantId', () => {
      ok(ImpersonateActionSchema, { action: 'stop', tenantId: 'tenant-001' });
    });

    it('debe rechazar action inválido', () => {
      fail(ImpersonateActionSchema, { action: 'pause' }, 'action');
    });

    it('debe rechazar sin action', () => {
      fail(ImpersonateActionSchema, {}, 'action');
    });
  });

  describe('BackupCreateSchema', () => {
    it('debe aceptar backup mínimo', () => {
      ok(BackupCreateSchema, { status: 'completed' });
    });

    it('debe aplicar default storageProvider=S3', () => {
      const r = check(BackupCreateSchema, { status: 'completed' });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.storageProvider).toBe('S3');
    });

    it('debe aceptar con fileName, fileSize y checksum', () => {
      ok(BackupCreateSchema, {
        status: 'completed',
        fileName: 'backup-2024-07-01.sql.gz',
        fileSize: '1048576',
        checksum: 'sha256:abc123',
      });
    });

    it('debe aceptar con errorMessage', () => {
      ok(BackupCreateSchema, { status: 'failed', errorMessage: 'S3 access denied' });
    });

    it('debe rechazar sin status', () => {
      fail(BackupCreateSchema, {}, 'status');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// NOTIFICATIONS / INTEGRACIONES
// ═══════════════════════════════════════════════════════════════════
describe('Zod — Notifications / Integraciones', () => {
  describe('NotificationMarkReadSchema (refine: id || all)', () => {
    it('debe aceptar con id', () => {
      ok(NotificationMarkReadSchema, { id: 'notif-001' });
    });

    it('debe aceptar con all=true', () => {
      ok(NotificationMarkReadSchema, { all: true });
    });

    it('debe rechazar sin id ni all (refine)', () => {
      const r = check(NotificationMarkReadSchema, {});
      expect(r.success).toBe(false);
    });

    it('debe aceptar con ambos (id + all)', () => {
      ok(NotificationMarkReadSchema, { id: 'notif-001', all: false });
    });
  });

  describe('IntegracionCreateSchema (superRefine por tipo)', () => {
    const validBase = {
      tipo: 'twilio' as const,
      nombre: 'Twilio Prod',
    };

    // ── Tipos sin credenciales requeridas ──
    it('debe aceptar sin credenciales (opcional)', () => {
      ok(IntegracionCreateSchema, validBase);
    });

    it('debe aceptar stripe_invoicing sin credenciales (no tiene schema)', () => {
      ok(IntegracionCreateSchema, { tipo: 'stripe_invoicing', nombre: 'Stripe Inv' });
    });

    // ── Twilio ──
    it('debe aceptar credenciales Twilio válidas', () => {
      ok(IntegracionCreateSchema, {
        ...validBase,
        credenciales: { accountSid: 'AC123', authToken: 'token123' },
      });
    });

    it('debe rechazar Twilio sin accountSid', () => {
      fail(IntegracionCreateSchema, {
        ...validBase,
        credenciales: { authToken: 'token123' },
      }, 'credenciales');
    });

    it('debe rechazar Twilio sin authToken', () => {
      fail(IntegracionCreateSchema, {
        ...validBase,
        credenciales: { accountSid: 'AC123' },
      }, 'credenciales');
    });

    // ── Stripe ──
    it('debe aceptar credenciales Stripe válidas', () => {
      ok(IntegracionCreateSchema, {
        tipo: 'stripe',
        nombre: 'Stripe Prod',
        credenciales: { secretKey: 'sk_test_abc' },
      });
    });

    it('debe rechazar Stripe sin secretKey', () => {
      fail(IntegracionCreateSchema, {
        tipo: 'stripe', nombre: 'X',
        credenciales: {} as Record<string, unknown>,
      }, 'credenciales');
    });

    // ── Google Calendar ──
    it('debe aceptar credenciales Google Calendar válidas', () => {
      ok(IntegracionCreateSchema, {
        tipo: 'google_calendar',
        nombre: 'GCal Prod',
        credenciales: { clientId: 'cid', clientSecret: 'csecret' },
      });
    });

    it('debe rechazar Google Calendar sin clientId', () => {
      fail(IntegracionCreateSchema, {
        tipo: 'google_calendar', nombre: 'X',
        credenciales: { clientSecret: 'cs' },
      }, 'credenciales');
    });

    // ── Meta (WhatsApp/Facebook) ──
    it('debe aceptar credenciales Meta válidas', () => {
      ok(IntegracionCreateSchema, {
        tipo: 'meta',
        nombre: 'Meta Prod',
        credenciales: { page_access_token: 'pat', page_id: 'pid' },
      });
    });

    it('debe rechazar Meta sin page_id', () => {
      fail(IntegracionCreateSchema, {
        tipo: 'meta', nombre: 'X',
        credenciales: { page_access_token: 'pat' },
      }, 'credenciales');
    });

    // ── Square ──
    it('debe aceptar credenciales Square válidas', () => {
      ok(IntegracionCreateSchema, {
        tipo: 'square',
        nombre: 'Square Prod',
        credenciales: { accessToken: 'at', locationId: 'loc' },
      });
    });

    it('debe rechazar Square sin locationId', () => {
      fail(IntegracionCreateSchema, {
        tipo: 'square', nombre: 'X',
        credenciales: { accessToken: 'at' },
      }, 'credenciales');
    });

    // ── GoCardless ──
    it('debe aceptar credenciales GoCardless válidas', () => {
      ok(IntegracionCreateSchema, {
        tipo: 'gocardless',
        nombre: 'GC Prod',
        credenciales: { accessToken: 'at' },
      });
    });

    it('debe rechazar GoCardless sin accessToken', () => {
      fail(IntegracionCreateSchema, {
        tipo: 'gocardless', nombre: 'X',
        credenciales: {} as Record<string, unknown>,
      }, 'credenciales');
    });

    // ── Tipos simples ──
    it('debe aceptar Meta Pixel', () => {
      ok(IntegracionCreateSchema, {
        tipo: 'meta_pixel', nombre: 'Pixel',
        credenciales: { pixelId: 'pixel_123' },
      });
    });

    it('debe aceptar Mailchimp', () => {
      ok(IntegracionCreateSchema, {
        tipo: 'mailchimp', nombre: 'MC',
        credenciales: { apiKey: 'key-mc' },
      });
    });

    it('debe aceptar Brevo', () => {
      ok(IntegracionCreateSchema, {
        tipo: 'brevo', nombre: 'Brevo',
        credenciales: { apiKey: 'key-br' },
      });
    });

    it('debe aceptar Telegram', () => {
      ok(IntegracionCreateSchema, {
        tipo: 'telegram', nombre: 'TG',
        credenciales: { bot_token: 'bot123' },
      });
    });

    it('debe aceptar GA4', () => {
      ok(IntegracionCreateSchema, {
        tipo: 'ga4', nombre: 'GA4',
        credenciales: { measurementId: 'G-ABC123' },
      });
    });

    // ── Validaciones del base schema ──
    it('debe rechazar tipo inválido', () => {
      fail(IntegracionCreateSchema, { tipo: 'salesforce', nombre: 'X' }, 'tipo');
    });

    it('debe rechazar nombre vacío', () => {
      fail(IntegracionCreateSchema, { tipo: 'twilio', nombre: '' }, 'nombre');
    });

    it('debe aceptar con configuracion y activo', () => {
      ok(IntegracionCreateSchema, {
        tipo: 'twilio',
        nombre: 'Twilio',
        configuracion: { webhookUrl: 'https://example.com' },
        activo: false,
      });
    });
  });
});
