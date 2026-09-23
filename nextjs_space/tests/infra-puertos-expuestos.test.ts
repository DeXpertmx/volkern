// @vitest-environment node
//
// Guardia de superficie expuesta por Docker:
// - Ningún compose del repo publica un puerto de base de datos fuera de
//   loopback. Publicar una BD al exterior fue justo el defecto que dejó el
//   5432 del stack heredado abierto a Internet en el VPS (ver
//   docs/VPS-SEGURIDAD-PUERTOS.md).
// - Y en modo Swarm no existe la atadura a loopback: `127.0.0.1` se ignora en
//   silencio y el puerto acaba en 0.0.0.0. Por eso un compose con `deploy:` no
//   puede publicar la BD ni siquiera "protegido" con el prefijo.
//
// El archivo no se interpreta como YAML a propósito: un regex sobre las líneas
// señala el renglón exacto del fallo, que es lo que se necesita para arreglarlo.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(__dirname, '..');

// Puertos cuyo servicio escucha detrás de credenciales que nadie debe poder
// intentar adivinar desde Internet: PostgreSQL, MySQL/MariaDB, Redis,
// MongoDB, SQL Server y Elasticsearch.
const PUERTOS_DE_BD = ['5432', '3306', '6379', '27017', '1433', '9200'];

interface Hallazgo {
  archivo: string;
  linea: number;
  texto: string;
  motivo: string;
}

function composesDelRepo(): string[] {
  return fs
    .readdirSync(RAIZ)
    .filter((n) => /^docker-compose.*\.ya?ml$/.test(n) || /\.stack\.ya?ml$/.test(n))
    .sort();
}

function leer(relativo: string): string {
  const contenido = fs.readFileSync(path.join(RAIZ, relativo), 'utf8');
  expect(contenido.length, `El archivo ${relativo} está vacío`).toBeGreaterThan(0);
  return contenido;
}

function hallazgos(archivo: string, contenido: string): Hallazgo[] {
  const lineas = contenido.split('\n');
  const encontrados: Hallazgo[] = [];
  const esSwarm = /^deploy:/m.test(contenido);

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i];

    // Sintaxis corta: "5432:5432", "0.0.0.0:5432:5432", "127.0.0.1:5432:5432/tcp"
    const corta = linea.match(
      /^\s*-\s*["']?((?:(?:\d{1,3}\.){3}\d{1,3}|\[[0-9a-fA-F:]+\]):)?(\d+):(\d+)(?:\/\w+)?["']?\s*$/,
    );
    if (corta) {
      const ip = corta[1] ? corta[1].replace(/:$/, '') : null;
      const destino = corta[3];
      if (!PUERTOS_DE_BD.includes(destino)) continue;
      if (ip !== '127.0.0.1') {
        encontrados.push({
          archivo,
          linea: i + 1,
          texto: linea.trim(),
          motivo: ip
            ? `un puerto de BD publicado en ${ip} (solo se admite 127.0.0.1)`
            : 'un puerto de BD publicado sin atar a 127.0.0.1 (queda en 0.0.0.0)',
        });
      } else if (esSwarm) {
        encontrados.push({
          archivo,
          linea: i + 1,
          texto: linea.trim(),
          motivo:
            'un puerto de BD en un compose con `deploy:` (Swarm ignora host_ip: seguiría escuchando en 0.0.0.0)',
        });
      }
      continue;
    }

    // Sintaxis larga en mapa: "- target: 5432" con "host_ip: 127.0.0.1" al lado.
    const target = linea.match(/^\s*-\s*target:\s*["']?(\d+)/);
    if (target && PUERTOS_DE_BD.includes(target[1])) {
      const bloque = lineas.slice(i, i + 8).join('\n');
      const atadoALoopback = /host_ip:\s*["']?127\.0\.0\.1/.test(bloque);
      if (!atadoALoopback || esSwarm) {
        encontrados.push({
          archivo,
          linea: i + 1,
          texto: linea.trim(),
          motivo: esSwarm
            ? 'puerto de BD en un compose con `deploy:` (Swarm ignora host_ip)'
            : 'puerto de BD en sintaxis larga sin `host_ip: 127.0.0.1`',
        });
      }
    }
  }

  return encontrados;
}

describe('superficie expuesta por Docker Compose', () => {
  const archivos = composesDelRepo();

  it('encuentra los compose del repo (si no, la guardia no vigila nada)', () => {
    expect(archivos.length).toBeGreaterThan(0);
  });

  it('ningún compose publica una base de datos fuera de loopback', () => {
    const problemas = archivos.flatMap((a) => hallazgos(a, leer(a)));
    const reporte = problemas
      .map((p) => `${p.archivo}:${p.linea} → ${p.texto} (${p.motivo})`)
      .join('\n');
    expect(problemas, reporte).toEqual([]);
  });

  it('el compose de desarrollo del ERP ata Postgres a loopback', () => {
    const fuente = leer('docker-compose.yml');
    expect(fuente).toContain('"127.0.0.1:5432:5432"');
  });

  it('el documento del hallazgo existe y explica la trampa de Swarm', () => {
    const doc = leer('docs/VPS-SEGURIDAD-PUERTOS.md');
    expect(doc).toContain('5432');
    expect(doc).toMatch(/host_ip/);
    expect(doc).toMatch(/127\.0\.0\.1/);
  });
});
