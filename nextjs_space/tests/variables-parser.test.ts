import { describe, it, expect } from 'vitest';
import { replaceVariables } from '@/lib/automation/variables-parser';
import type { ExecutionContext } from '@/lib/automation/types';

describe('Variables Parser — replaceVariables', () => {
  describe('Texto vacío o sin variables', () => {
    it('debe devolver string vacío si el texto es vacío', () => {
      expect(replaceVariables('', {} as ExecutionContext)).toBe('');
    });

    it('debe devolver el mismo texto si no hay variables', () => {
      expect(replaceVariables('Hola mundo', {} as ExecutionContext)).toBe('Hola mundo');
    });

    it('debe devolver el mismo texto si no hay contexto que haga match', () => {
      expect(
        replaceVariables('Hola {nombre}', {} as ExecutionContext)
      ).toBe('Hola {nombre}');
    });
  });

  describe('Variables de lead', () => {
    const ctx: ExecutionContext = {
      lead: {
        nombre: 'Juan Pérez',
        email: 'juan@example.com',
        telefono: '+34600000000',
        estado: 'nuevo',
        empresa: 'Acme Corp',
        perfilFiscal: { idFiscal: 'B76364192' },
      },
    };

    it('debe reemplazar {nombre} con el nombre del lead', () => {
      expect(replaceVariables('Hola {nombre}', ctx)).toBe('Hola Juan Pérez');
    });

    it('debe reemplazar {{nombre}} (doble llave) — NOTA: bug conocido, la simple consume primero dejando residuo', () => {
      // El código procesa {nombre} antes que {{nombre}} con split/join,
      // lo que deja una llave residual: {Juan Pérez}
      expect(replaceVariables('Hola {{nombre}}', ctx)).toBe('Hola {Juan Pérez}');
    });

    it('debe reemplazar {lead.nombre}', () => {
      expect(replaceVariables('Cliente: {lead.nombre}', ctx)).toBe('Cliente: Juan Pérez');
    });

    it('debe reemplazar {{lead.nombre}} — NOTA: bug conocido, {lead.nombre} consume primero', () => {
      expect(replaceVariables('Cliente: {{lead.nombre}}', ctx)).toBe('Cliente: {Juan Pérez}');
    });

    it('debe reemplazar {email}', () => {
      expect(replaceVariables('Email: {email}', ctx)).toBe('Email: juan@example.com');
    });

    it('debe reemplazar {telefono}', () => {
      expect(replaceVariables('Tel: {telefono}', ctx)).toBe('Tel: +34600000000');
    });

    it('debe reemplazar {lead.estado}', () => {
      expect(replaceVariables('Estado: {lead.estado}', ctx)).toBe('Estado: nuevo');
    });

    it('debe reemplazar {empresa}', () => {
      expect(replaceVariables('Empresa: {empresa}', ctx)).toBe('Empresa: Acme Corp');
    });

    it('debe reemplazar {id_fiscal}', () => {
      expect(replaceVariables('NIF: {id_fiscal}', ctx)).toBe('NIF: B76364192');
    });

    it('debe reemplazar {fecha_hoy} con la fecha actual', () => {
      const result = replaceVariables('Fecha: {fecha_hoy}', ctx);
      expect(result).not.toBe('Fecha: {fecha_hoy}');
      expect(result).toMatch(/Fecha: \d{1,2} de \w+ de \d{4}/);
    });

    it('debe reemplazar múltiples variables en el mismo texto', () => {
      const result = replaceVariables(
        'Hola {nombre}, tu email es {email} y tu empresa es {empresa}',
        ctx
      );
      expect(result).toBe(
        'Hola Juan Pérez, tu email es juan@example.com y tu empresa es Acme Corp'
      );
    });

    it('debe dejar intactas las variables que no existen en el lead', () => {
      // Las variables no definidas en el mapa de vars quedan sin reemplazar
      expect(replaceVariables('Campo: {no_existe}', ctx)).toBe('Campo: {no_existe}');
    });

    it('debe manejar lead con campos faltantes (undefined)', () => {
      const ctxIncompleto: ExecutionContext = {
        lead: { nombre: 'Ana' },
      };
      expect(replaceVariables('Email: {email}', ctxIncompleto)).toBe('Email: ');
    });
  });

  describe('Variables de estudiante', () => {
    const ctx: ExecutionContext = {
      estudiante: {
        nombre: 'María García',
        email: 'maria@academia.com',
        telefono: '+34611111111',
      },
    };

    it('debe reemplazar {nombre} desde estudiante', () => {
      expect(replaceVariables('Estudiante: {nombre}', ctx)).toBe('Estudiante: María García');
    });

    it('debe reemplazar {estudiante.nombre}', () => {
      expect(replaceVariables('Alumno: {estudiante.nombre}', ctx)).toBe('Alumno: María García');
    });

    it('debe reemplazar {email} desde estudiante', () => {
      expect(replaceVariables('Correo: {email}', ctx)).toBe('Correo: maria@academia.com');
    });

    it('debe reemplazar {estudiante.telefono}', () => {
      expect(replaceVariables('Tel: {estudiante.telefono}', ctx)).toBe('Tel: +34611111111');
    });

    it('lead gana sobre estudiante para {nombre} — el primero en procesar consume el token', () => {
      const ctxAmbos: ExecutionContext = {
        lead: { nombre: 'Lead Nombre' },
        estudiante: { nombre: 'Est Nombre' },
      };
      // Lead se procesa primero y consume {nombre}.
      // Cuando estudiante intenta reemplazar {nombre}, ya no existe el token.
      const result = replaceVariables('Hola {nombre}', ctxAmbos);
      expect(result).toBe('Hola Lead Nombre');
    });
  });

  describe('Variables de curso', () => {
    const ctx: ExecutionContext = {
      curso: {
        titulo: 'React Avanzado',
        descripcion: 'Curso completo de React con TypeScript',
      },
    };

    it('debe reemplazar {curso.titulo}', () => {
      expect(replaceVariables('Curso: {curso.titulo}', ctx)).toBe('Curso: React Avanzado');
    });

    it('debe reemplazar {curso.descripcion}', () => {
      expect(replaceVariables('Desc: {curso.descripcion}', ctx)).toBe(
        'Desc: Curso completo de React con TypeScript'
      );
    });

    it('debe reemplazar {{curso.titulo}} (doble llave) — NOTA: bug conocido, la simple consume primero', () => {
      expect(replaceVariables('Curso: {{curso.titulo}}', ctx)).toBe('Curso: {React Avanzado}');
    });
  });

  describe('Variables de cita', () => {
    const ctx: ExecutionContext = {
      cita: {
        fechaHora: '2024-06-15T14:30:00.000Z',
        servicio: { nombre: 'Consulta Premium' },
      },
    };

    it('debe reemplazar {cita.fechaHora}', () => {
      const result = replaceVariables('Cita: {cita.fechaHora}', ctx);
      expect(result).not.toBe('Cita: {cita.fechaHora}');
      expect(result).toContain('Cita: ');
      // La fecha se formatea con es-MX locale
      expect(result.length).toBeGreaterThan('Cita: '.length);
    });

    it('debe reemplazar {cita.servicio}', () => {
      expect(replaceVariables('Servicio: {cita.servicio}', ctx)).toBe(
        'Servicio: Consulta Premium'
      );
    });

    it('debe manejar cita sin fechaHora', () => {
      const ctxSinFecha: ExecutionContext = {
        cita: { servicio: { nombre: 'Test' } },
      };
      expect(replaceVariables('Fecha: {cita.fechaHora}', ctxSinFecha)).toBe('Fecha: ');
    });

    it('debe manejar cita sin servicio', () => {
      const ctxSinServicio: ExecutionContext = {
        cita: { fechaHora: '2024-01-01T00:00:00.000Z' },
      };
      expect(replaceVariables('Servicio: {cita.servicio}', ctxSinServicio)).toBe('Servicio: ');
    });
  });

  describe('Contexto combinado (múltiples entidades)', () => {
    const ctx: ExecutionContext = {
      lead: { nombre: 'Juan', email: 'juan@test.com' },
      estudiante: { nombre: 'María', email: 'maria@test.com' },
      curso: { titulo: 'TypeScript Pro', descripcion: 'De cero a experto' },
      cita: {
        fechaHora: '2024-07-01T10:00:00.000Z',
        servicio: { nombre: 'Mentoría' },
      },
    };

    it('debe reemplazar variables de todas las entidades', () => {
      const template = 'Lead: {lead.nombre} | Estudiante: {estudiante.nombre} | Curso: {curso.titulo} | Servicio: {cita.servicio}';
      const result = replaceVariables(template, ctx);
      expect(result).toBe(
        'Lead: Juan | Estudiante: María | Curso: TypeScript Pro | Servicio: Mentoría'
      );
    });

    it('{nombre} genérico usa la primera entidad que lo define (lead gana)', () => {
      const result = replaceVariables('Nombre: {nombre}', ctx);
      // Lead se procesa primero y consume {nombre} → 'Juan'.
      // Estudiante no puede reemplazar porque el token ya no existe.
      expect(result).toBe('Nombre: Juan');
    });
  });

  describe('Edge cases', () => {
    it('debe manejar variables con caracteres especiales en el valor', () => {
      const ctx: ExecutionContext = {
        lead: { nombre: 'José María O\'Connor', email: 'jose@test.com' },
      };
      const result = replaceVariables('Hola {nombre}', ctx);
      expect(result).toBe("Hola José María O'Connor");
    });

    it('debe manejar variables repetidas en el texto', () => {
      const ctx: ExecutionContext = {
        lead: { nombre: 'Ana', email: 'ana@test.com' },
      };
      const result = replaceVariables('{nombre} - {nombre} - {nombre}', ctx);
      expect(result).toBe('Ana - Ana - Ana');
    });

    it('debe manejar texto sin variables con contexto poblado', () => {
      const ctx: ExecutionContext = {
        lead: { nombre: 'Test' },
        curso: { titulo: 'Curso' },
      };
      expect(replaceVariables('Texto plano sin placeholders', ctx)).toBe(
        'Texto plano sin placeholders'
      );
    });

    it('no debe reemplazar parcialmente (ej: {nombre} no debe matchear {nombres})', () => {
      const ctx: ExecutionContext = {
        lead: { nombre: 'Juan' },
      };
      // {nombres} no es una variable definida, no debe ser reemplazada
      const result = replaceVariables('Var: {nombres}', ctx);
      expect(result).toBe('Var: {nombres}');
    });

    it('debe manejar contexto completamente vacío', () => {
      const result = replaceVariables('Hola {nombre}', {} as ExecutionContext);
      expect(result).toBe('Hola {nombre}');
    });
  });
});
