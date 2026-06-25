/**
 * Generates 11 Open Graph images (1200×630px PNG) for vertical landing pages.
 *
 * Usage:  npx tsx scripts/generate-og-images.ts
 * Output: public/og-*.png
 */

import sharp from 'sharp'
import fs from 'fs/promises'
import path from 'path'

// ─── Vertical definitions ───────────────────────────────────────────────────

interface OgDef {
  slug: string        // filename: og-{slug}.png
  vertical: string    // big title
  tagline: string     // subtitle
  color: string       // hex accent color
}

const OG_DEFS: OgDef[] = [
  {
    slug: 'home',
    vertical: 'Volkern',
    tagline: 'El sistema operativo de tu negocio — CRM, marketing, automatización e IA en una sola plataforma.',
    color: '#6366F1',
  },
  {
    slug: 'soluciones',
    vertical: 'Soluciones Verticales',
    tagline: 'CRM, Marketing, Inmobiliario, Contabilidad, RRHH, Industria, Academy, Logística y Facturación.',
    color: '#8B5CF6',
  },
  {
    slug: 'crm-ventas',
    vertical: 'CRM & Ventas',
    tagline: 'Gestiona leads, pipeline y cierra más ventas. Desde €49/mes.',
    color: '#3B82F6',
  },
  {
    slug: 'marketing',
    vertical: 'Agencia de Marketing',
    tagline: 'Lanza, automatiza y convierte desde un solo sistema. Desde €49/mes.',
    color: '#A855F7',
  },
  {
    slug: 'academy',
    vertical: 'Academia & LMS',
    tagline: 'Crea cursos, vende y automatiza tu academia online. Desde €49/mes.',
    color: '#EAB308',
  },
  {
    slug: 'contable',
    vertical: 'Asesoría Contable',
    tagline: 'Controla clientes, documentos, pagos y procesos. Desde €59/mes.',
    color: '#F59E0B',
  },
  {
    slug: 'rrhh',
    vertical: 'Recursos Humanos',
    tagline: 'Gestiona tu equipo sin caos — empleados, procesos y documentos. Desde €39/mes.',
    color: '#F43F5E',
  },
  {
    slug: 'real-estate',
    vertical: 'Inmobiliaria',
    tagline: 'Centraliza leads, propiedades y comunicación. Desde €59/mes.',
    color: '#10B981',
  },
  {
    slug: 'industria',
    vertical: 'Industria & Manufactura',
    tagline: 'Controla tu operación industrial con procesos claros. Desde €59/mes.',
    color: '#64748B',
  },
  {
    slug: 'facturacion',
    vertical: 'Facturación',
    tagline: 'Factura electrónica y control de cobros para autónomos y pymes. Desde €19/mes.',
    color: '#22C55E',
  },
  {
    slug: 'logistica',
    vertical: 'Logística & Transporte',
    tagline: 'Controla rutas, vehículos y entregas en tiempo real. Desde €59/mes.',
    color: '#14B8A6',
  },
]

// ─── SVG template ───────────────────────────────────────────────────────────

function buildSvg(def: OgDef): string {
  const titleLines = [def.vertical]

  const taglineWrapped = wrapText(def.tagline, 60)

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0B1121"/>
      <stop offset="50%" stop-color="#0F1829"/>
      <stop offset="100%" stop-color="#0B1121"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${def.color}" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="${def.color}" stop-opacity="0.04"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stop-color="${def.color}" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="${def.color}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>

  <!-- Subtle grid pattern -->
  <g opacity="0.03" stroke="#FFFFFF" stroke-width="1">
    ${Array.from({ length: 21 }, (_, i) =>
      `<line x1="${i * 60}" y1="0" x2="${i * 60}" y2="630"/>`
    ).join('\n    ')}
    ${Array.from({ length: 11 }, (_, i) =>
      `<line x1="0" y1="${i * 60}" x2="1200" y2="${i * 60}"/>`
    ).join('\n    ')}
  </g>

  <!-- Top bar -->
  <rect width="1200" height="4" fill="${def.color}" opacity="0.8"/>

  <!-- Volkern logo/brand (top left) -->
  <text x="80" y="80" font-family="'Inter','Segoe UI',sans-serif" font-weight="700" font-size="24" fill="#93A3B8" letter-spacing="4">
    VOLKERN
  </text>

  <!-- Divider accent line -->
  <line x1="80" y1="100" x2="260" y2="100" stroke="${def.color}" stroke-width="2" opacity="0.6"/>

  <!-- Main title -->
  ${titleLines.map((line, i) =>
    `<text x="80" y="${380 + i * 64}" font-family="'Inter','Segoe UI',system-ui,sans-serif" font-weight="700" font-size="52" fill="#F1F5F9" letter-spacing="-0.5">${escapeXml(line)}</text>`
  ).join('\n  ')}

  <!-- Accent underline -->
  <rect x="80" y="${380 + (titleLines.length - 1) * 64 + 20}" width="180" height="4" rx="2" fill="${def.color}" opacity="0.8"/>

  <!-- Tagline -->
  ${taglineWrapped.map((line, i) =>
    `<text x="80" y="${430 + (titleLines.length - 1) * 64 + i * 32}" font-family="'Inter','Segoe UI',system-ui,sans-serif" font-weight="400" font-size="24" fill="#64748B">${escapeXml(line)}</text>`
  ).join('\n  ')}

  <!-- Bottom: "14 días gratis · Sin tarjeta" badge -->
  <rect x="80" y="530" width="280" height="38" rx="19" fill="${def.color}" opacity="0.15"/>
  <rect x="80" y="530" width="280" height="38" rx="19" stroke="${def.color}" stroke-width="1.5" opacity="0.4"/>
  <text x="220" y="555" font-family="'Inter','Segoe UI',sans-serif" font-weight="600" font-size="16" fill="${def.color}" text-anchor="middle">
    14 días gratis · Sin tarjeta
  </text>

  <!-- Bottom: URL -->
  <text x="1120" y="560" font-family="'Inter','Segoe UI',monospace,sans-serif" font-weight="400" font-size="16" fill="#475569" text-anchor="end">
    volkern.app
  </text>

  <!-- Decorative corner dots (top right) -->
  <circle cx="1080" cy="60" r="3" fill="${def.color}" opacity="0.3"/>
  <circle cx="1100" cy="60" r="3" fill="${def.color}" opacity="0.2"/>
  <circle cx="1090" cy="80" r="3" fill="${def.color}" opacity="0.15"/>
</svg>`
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    if (current.length + word.length + 1 > maxChars && current.length > 0) {
      lines.push(current)
      current = word
    } else {
      current = current ? `${current} ${word}` : word
    }
  }
  if (current) lines.push(current)
  return lines
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const publicDir = path.resolve(__dirname, '..', 'public')
  await fs.mkdir(publicDir, { recursive: true })

  console.log(`Generating ${OG_DEFS.length} OG images → ${publicDir}/\n`)

  for (const def of OG_DEFS) {
    const svg = buildSvg(def)
    const outputPath = path.join(publicDir, `og-${def.slug}.png`)

    await sharp(Buffer.from(svg))
      .resize(1200, 630)
      .png()
      .toFile(outputPath)

    console.log(`  ✅ og-${def.slug}.png  (${def.vertical})`)
  }

  console.log(`\n🎉 Done! ${OG_DEFS.length} images in public/`)
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
