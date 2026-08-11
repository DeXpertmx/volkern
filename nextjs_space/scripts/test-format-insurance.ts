/**
 * Verifica los formatters de resultados de insurance en ExecutionEngine.
 */
import { ExecutionEngine } from '../lib/agents/execution-engine';

async function main() {
  const tests = [
    { skill: 'list_polizas', data: { polizas: [{ numeroPoliza: 'POL-001', cliente: { nombre: 'Juan Pérez' }, aseguradora: { nombre: 'AXA' }, fechaVencimiento: '2026-12-31T00:00:00.000Z' }], total: 1 } },
    { skill: 'polizas_por_vencer', data: { polizas: [{ numeroPoliza: 'POL-002', cliente: { nombre: 'Ana' }, fechaVencimiento: '2026-08-15T00:00:00.000Z' }], dias: 30, total: 1 } },
    { skill: 'renovaciones_pendientes', data: { renovaciones: [{ poliza: { numeroPoliza: 'POL-003', cliente: { nombre: 'Luis' } }, estado: 'PENDIENTE' }], total: 1 } },
    { skill: 'clientes_sin_contacto', data: { clientes: [{ nombre: 'Juan Pérez', polizasSeguro: [{ id: 'x' }] }], dias: 180, total: 1 } },
    { skill: 'list_polizas', data: { polizas: [], total: 0 } },
  ];
  for (const t of tests) {
    console.log('=== ' + t.skill + ' ===');
    console.log(ExecutionEngine.formatSkillResult(t.skill, t.data));
  }
}

main();
