/**
 * generate-pricing-pdf.ts
 * Genera un PDF profesional con la documentación completa del pricing de Volkern.
 *
 * Uso: npx tsx scripts/generate-pricing-pdf.ts
 */

import puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

const HTML = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>
  @page { margin: 2.5cm 2cm; }
  @page :first { margin-top: 3cm; }

  * { box-sizing: border-box; }

  body {
    font-family: 'Helvetica Neue', 'Segoe UI', Arial, sans-serif;
    color: #1e293b;
    font-size: 10.5pt;
    line-height: 1.6;
  }

  /* ─── Cover page ─────────────────────────────────────── */
  .cover {
    page-break-after: always;
    text-align: center;
    padding-top: 6cm;
  }
  .cover h1 {
    font-size: 32pt;
    font-weight: 900;
    color: #0f172a;
    margin-bottom: 0.4cm;
    letter-spacing: -0.02em;
  }
  .cover .subtitle {
    font-size: 14pt;
    color: #64748b;
    margin-bottom: 2cm;
  }
  .cover .meta {
    font-size: 9pt;
    color: #94a3b8;
  }
  .cover .gradient-bar {
    width: 5cm;
    height: 4px;
    margin: 0.6cm auto 1.2cm auto;
    background: linear-gradient(90deg, #a855f7, #6366f1, #3b82f6);
    border-radius: 2px;
  }

  /* ─── Headings ───────────────────────────────────────── */
  h2 {
    font-size: 18pt;
    font-weight: 800;
    color: #0f172a;
    border-bottom: 3px solid #a855f7;
    padding-bottom: 4px;
    margin-top: 1.4cm;
    margin-bottom: 0.6cm;
    page-break-after: avoid;
  }
  h3 {
    font-size: 13pt;
    font-weight: 700;
    color: #334155;
    margin-top: 0.8cm;
    margin-bottom: 0.3cm;
    page-break-after: avoid;
  }
  h4 {
    font-size: 11pt;
    font-weight: 700;
    color: #475569;
    margin-top: 0.5cm;
    margin-bottom: 0.2cm;
  }

  p, li { color: #334155; }

  /* ─── Tables ─────────────────────────────────────────── */
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 0.4cm 0 0.6cm 0;
    font-size: 9.5pt;
    page-break-inside: avoid;
  }
  th {
    background: #1e293b;
    color: #fff;
    font-weight: 700;
    padding: 7px 10px;
    text-align: left;
    font-size: 8.5pt;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  td {
    padding: 6px 10px;
    border-bottom: 1px solid #e2e8f0;
  }
  tr:nth-child(even) td { background: #f8fafc; }
  tr:hover td { background: #f1f5f9; }

  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .center { text-align: center; }

  /* ─── Cards / Highlights ──────────────────────────────── */
  .card {
    background: #f8fafc;
    border-left: 4px solid #a855f7;
    padding: 12px 16px;
    margin: 0.4cm 0;
    border-radius: 0 6px 6px 0;
    page-break-inside: avoid;
  }
  .card.compliance { border-left-color: #6366f1; }
  .card.warn { border-left-color: #f59e0b; }

  .card strong { color: #0f172a; }
  .card code {
    background: #e2e8f0;
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 9pt;
  }

  /* ─── Formula ─────────────────────────────────────────── */
  .formula {
    background: #0f172a;
    color: #e2e8f0;
    padding: 14px 18px;
    border-radius: 8px;
    font-family: 'Courier New', monospace;
    font-size: 11pt;
    text-align: center;
    margin: 0.5cm 0;
    page-break-inside: avoid;
  }
  .formula .hl { color: #a78bfa; font-weight: 700; }
  .formula .hl2 { color: #34d399; font-weight: 700; }
  .formula .hl3 { color: #f472b6; font-weight: 700; }
  .formula .hl4 { color: #fb923c; font-weight: 700; }

  /* ─── Two-column layout ──────────────────────────────── */
  .two-col {
    display: flex;
    gap: 0.6cm;
    margin: 0.4cm 0;
  }
  .two-col > div {
    flex: 1;
    padding: 12px 14px;
    border-radius: 8px;
  }
  .col-scale {
    background: linear-gradient(135deg, #faf5ff, #f3e8ff);
    border: 1px solid #e9d5ff;
  }
  .col-compliance {
    background: linear-gradient(135deg, #eef2ff, #e0e7ff);
    border: 1px solid #c7d2fe;
  }

  /* ─── TOC ─────────────────────────────────────────────── */
  .toc { margin: 0.6cm 0; }
  .toc a {
    display: block;
    padding: 5px 0;
    color: #6366f1;
    text-decoration: none;
    font-size: 10.5pt;
    border-bottom: 1px solid #f1f5f9;
  }
  .toc a:hover { color: #4f46e5; }

  .page-break { page-break-before: always; }

  .tag {
    display: inline-block;
    font-size: 7.5pt;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 2px 7px;
    border-radius: 4px;
    margin-left: 4px;
  }
  .tag-new { background: #dcfce7; color: #166534; }
  .tag-legacy { background: #fef9c3; color: #854d0e; }

  .badge {
    display: inline-block;
    padding: 1px 8px;
    border-radius: 10px;
    font-size: 7.5pt;
    font-weight: 700;
  }
  .badge-green { background: #22c55e; color: #fff; }
  .badge-purple { background: #a855f7; color: #fff; }
  .badge-amber { background: #f59e0b; color: #fff; }
</style>
</head>
<body>

<!-- ═══════════ COVER ═══════════ -->
<div class="cover">
  <h1>Volkern</h1>
  <div class="gradient-bar"></div>
  <p class="subtitle">
    Documentación del Modelo de Precios<br>
    Pricing Engine • Planes • Límites • Arquitectura
  </p>
  <p class="meta">
    Versión 2.0 — Junio 2026<br>
    <em>Infraestructura Soberana para tu Empresa</em>
  </p>
</div>

<!-- ═══════════ TOC ═════════════ -->
<h2 style="margin-top:0">Índice</h2>
<div class="toc">
  <a href="#s1">1.  Resumen ejecutivo</a>
  <a href="#s2">2.  Planes disponibles</a>
  <a href="#s3">3.  Fórmula del pricing dinámico</a>
  <a href="#s4">4.  Niveles de escalado</a>
  <a href="#s5">5.  Tabla de precios de referencia</a>
  <a href="#s6">6.  Diferencia entre Scale y Compliance Pro</a>
  <a href="#s7">7.  Límites técnicos de cada plan</a>
  <a href="#s8">8.  Módulos incluidos por plan</a>
  <a href="#s9">9.  Descuento anual</a>
  <a href="#s10">10. Planes legacy (esencial, profesional, infinity)</a>
  <a href="#s11">11. Add-ons</a>
  <a href="#s12">12. Flujo de checkout y Stripe</a>
  <a href="#s13">13. Migración de planes legacy a dinámicos</a>
</div>

<!-- ═══════════ 1 ═══════════════ -->
<h2 id="s1">1. Resumen ejecutivo</h2>

<p>
Volkern ofrece <strong>2 planes de suscripción dinámicos</strong> cuyo precio se calcula en tiempo real
en función de tres variables: <strong>usuarios</strong>, <strong>contactos</strong> y <strong>tipo de plan</strong>
(Scale o Compliance Pro).
</p>

<p>
Los planes legacy (Esencial, Profesional, Infinity) con precios fijos ya no están disponibles
para nuevas suscripciones. Los tenants existentes fueron migrados al nuevo modelo.
</p>

<div class="card">
  <strong>Principio clave:</strong> El precio se adapta automáticamente al tamaño del cliente.
  No hay módulos ocultos ni límites artificiales — todos los módulos están incluidos en ambos planes.
  La única diferencia real entre Scale y Compliance es el <strong>modo compliance</strong>
  (trazabilidad, auditoría, gates obligatorios).
</div>

<!-- ═══════════ 2 ═══════════════ -->
<h2 id="s2">2. Planes disponibles</h2>

<table>
  <tr>
    <th>Plan</th>
    <th>Slug</th>
    <th class="center">Precio base*</th>
    <th>Perfil</th>
    <th class="center">Estado</th>
  </tr>
  <tr>
    <td><strong>Scale</strong></td>
    <td><code>scale</code></td>
    <td class="num">€50+/mo</td>
    <td>Operación general, escalar y automatizar</td>
    <td class="center"><span class="badge badge-green">Activo</span></td>
  </tr>
  <tr>
    <td><strong>Compliance Pro</strong></td>
    <td><code>compliance</code></td>
    <td class="num">€62+/mo</td>
    <td>Control, trazabilidad, auditoría y preparación fiscal</td>
    <td class="center"><span class="badge badge-purple">Activo</span></td>
  </tr>
  <tr>
    <td><strong>Trial</strong></td>
    <td><code>trial</code></td>
    <td class="num">Gratis</td>
    <td>14 días de prueba con todas las funcionalidades</td>
    <td class="center"><span class="badge badge-amber">Trial</span></td>
  </tr>
</table>

<p style="font-size:9pt;color:#94a3b8">
  * Precio base para 1 usuario y 1.000 contactos. El precio final se calcula con la fórmula dinámica.
</p>

<!-- ═══════════ 3 ═══════════════ -->
<h2 id="s3">3. Fórmula del pricing dinámico</h2>

<p>El precio mensual se calcula con la siguiente fórmula:</p>

<div class="formula">
  precio = (<span class="hl">precio_base</span> + (<span class="hl2">usuarios</span> × 8) + ((<span class="hl3">contactos</span> / 1.000) × 3))
  × <span class="hl4">factor_nivel</span> × <span class="hl">multiplicador_plan</span>
</div>

<table>
  <tr><th>Variable</th><th>Valor</th><th>Descripción</th></tr>
  <tr><td><code>precio_base</code></td><td class="num">€50</td><td>Cargo fijo base por suscripción</td></tr>
  <tr><td><code>usuarios × 8</code></td><td class="num">€8/user</td><td>Cada usuario adicional suma €8/mes</td></tr>
  <tr><td><code>(contactos / 1000) × 3</code></td><td class="num">€3/bloque</td><td>Cada bloque de 1.000 contactos suma €3/mes</td></tr>
  <tr><td><code>factor_nivel</code></td><td class="num">1.0 – 6.0</td><td>Factor multiplicador según el nivel de escalado (ver sección 4)</td></tr>
  <tr><td><code>multiplicador_plan</code></td><td class="num">1.0 / 1.25</td><td>Scale = ×1.0 · Compliance = ×1.25 (+25%)</td></tr>
</table>

<div class="card">
  <strong>Ejemplo:</strong> 5 usuarios, 5.000 contactos, plan Scale, nivel 2 (factor 1.4):
  <br><br>
  Base = 50 + (5 × 8) + ((5.000 / 1.000) × 3) = <strong>€105</strong>
  <br>
  Precio final = 105 × 1.4 × 1.0 = <strong>€147/mo</strong>
</div>

<!-- ═══════════ 4 ═══════════════ -->
<div class="page-break"></div>
<h2 id="s4">4. Niveles de escalado</h2>

<p>
El <strong>factor_nivel</strong> se determina automáticamente según el mayor de los dos valores
(usuarios y contactos). El nivel se selecciona cuando <strong>ambos</strong> valores están dentro
de los rangos del nivel.
</p>

<table>
  <tr>
    <th>Nivel</th>
    <th>Usuarios</th>
    <th>Contactos</th>
    <th>Factor</th>
    <th>Facturación</th>
    <th>Automatización</th>
  </tr>
  <tr><td class="center">1</td><td class="num">≤ 2</td><td class="num">≤ 2.000</td><td class="num"><strong>×1.0</strong></td><td>Estándar</td><td>Básica</td></tr>
  <tr><td class="center">2</td><td class="num">≤ 5</td><td class="num">≤ 8.000</td><td class="num"><strong>×1.4</strong></td><td>Ampliada</td><td>Mejorada</td></tr>
  <tr><td class="center">3</td><td class="num">≤ 10</td><td class="num">≤ 15.000</td><td class="num"><strong>×1.8</strong></td><td>Mayor capacidad</td><td>Media</td></tr>
  <tr><td class="center">4</td><td class="num">≤ 20</td><td class="num">≤ 30.000</td><td class="num"><strong>×2.5</strong></td><td>Alto volumen</td><td>Estructurada</td></tr>
  <tr><td class="center">5</td><td class="num">≤ 40</td><td class="num">≤ 60.000</td><td class="num"><strong>×3.5</strong></td><td>Empresarial</td><td>Avanzada</td></tr>
  <tr><td class="center">6</td><td class="num">≤ 70</td><td class="num">≤ 85.000</td><td class="num"><strong>×4.5</strong></td><td>Masivo</td><td>Avanzada + lógica</td></tr>
  <tr><td class="center">7</td><td class="num">≤ 99</td><td class="num">≤ 99.000</td><td class="num"><strong>×6.0</strong></td><td>Ilimitada</td><td>Completa</td></tr>
</table>

<div class="card warn">
  <strong>Límites máximos:</strong> 99 usuarios y 99.000 contactos. Si se supera cualquiera de estos
  valores, se muestra un mensaje de "plan personalizado" y se redirige al cliente a contactar
  con ventas para un plan a medida.
</div>

<!-- ═══════════ 5 ═══════════════ -->
<h2 id="s5">5. Tabla de precios de referencia</h2>

<table>
  <tr>
    <th>Usuarios</th><th>Contactos</th><th>Nivel</th>
    <th class="num">Scale</th><th class="num">Compliance</th>
    <th class="num">Scale anual</th><th class="num">Compliance anual</th>
  </tr>
  <tr><td class="num">1</td><td class="num">1.000</td><td class="center">1</td><td class="num"><strong>€61</strong></td><td class="num"><strong>€76</strong></td><td class="num">€586</td><td class="num">€730</td></tr>
  <tr><td class="num">3</td><td class="num">3.000</td><td class="center">1</td><td class="num"><strong>€83</strong></td><td class="num"><strong>€104</strong></td><td class="num">€797</td><td class="num">€998</td></tr>
  <tr><td class="num">5</td><td class="num">5.000</td><td class="center">2</td><td class="num"><strong>€147</strong></td><td class="num"><strong>€184</strong></td><td class="num">€1.411</td><td class="num">€1.766</td></tr>
  <tr><td class="num">10</td><td class="num">10.000</td><td class="center">3</td><td class="num"><strong>€252</strong></td><td class="num"><strong>€315</strong></td><td class="num">€2.419</td><td class="num">€3.024</td></tr>
  <tr><td class="num">15</td><td class="num">15.000</td><td class="center">3</td><td class="num"><strong>€315</strong></td><td class="num"><strong>€394</strong></td><td class="num">€3.024</td><td class="num">€3.782</td></tr>
  <tr><td class="num">20</td><td class="num">30.000</td><td class="center">4</td><td class="num"><strong>€750</strong></td><td class="num"><strong>€938</strong></td><td class="num">€7.200</td><td class="num">€9.005</td></tr>
  <tr><td class="num">50</td><td class="num">60.000</td><td class="center">5</td><td class="num"><strong>€1.295</strong></td><td class="num"><strong>€1.619</strong></td><td class="num">€12.432</td><td class="num">€15.542</td></tr>
  <tr><td class="num">99</td><td class="num">99.000</td><td class="center">7</td><td class="num"><strong>€5.178</strong></td><td class="num"><strong>€6.473</strong></td><td class="num">€49.709</td><td class="num">€62.141</td></tr>
</table>

<p style="font-size:9pt;color:#94a3b8">
  * Precios en EUR. Anual incluye 20% de descuento sobre 12 meses.
</p>

<!-- ═══════════ 6 ═══════════════ -->
<div class="page-break"></div>
<h2 id="s6">6. Diferencia entre Scale y Compliance Pro</h2>

<div class="two-col">
  <div class="col-scale">
    <h4 style="margin-top:0;color:#7c3aed">⚡ Scale</h4>
    <p style="font-size:9pt"><strong>Multiplicador:</strong> ×1.0</p>
    <p style="font-size:9pt"><strong>Perfil:</strong> Operación general, escalar y automatizar</p>
    <p style="font-size:9pt"><strong>Módulos:</strong> 51 (todos excepto <code>compliance_pro</code>)</p>
    <p style="font-size:9pt"><strong>Almacenamiento:</strong> 100 GB</p>
    <p style="font-size:9pt"><strong>Business email:</strong> 10 GB</p>
    <p style="font-size:9pt"><strong>Compliance mode:</strong> ❌ No</p>
    <p style="font-size:9pt"><strong>Público objetivo:</strong> Pymes y equipos que necesitan un CRM completo sin requisitos de auditoría</p>
  </div>
  <div class="col-compliance">
    <h4 style="margin-top:0;color:#4f46e5">🛡️ Compliance Pro</h4>
    <p style="font-size:9pt"><strong>Multiplicador:</strong> ×1.25 (+25%)</p>
    <p style="font-size:9pt"><strong>Perfil:</strong> Control, trazabilidad, auditoría</p>
    <p style="font-size:9pt"><strong>Módulos:</strong> 52 (todos + <code>compliance_pro</code>)</p>
    <p style="font-size:9pt"><strong>Almacenamiento:</strong> 250 GB</p>
    <p style="font-size:9pt"><strong>Business email:</strong> 25 GB</p>
    <p style="font-size:9pt"><strong>Compliance mode:</strong> ✅ Sí</p>
    <p style="font-size:9pt"><strong>Público objetivo:</strong> Empresas reguladas, despachos, auditors</p>
  </div>
</div>

<h3>Características exclusivas de Compliance Pro</h3>
<ul>
  <li><strong>Trazabilidad total</strong> — cada acción del sistema queda registrada con timestamp y usuario</li>
  <li><strong>Gates obligatorios</strong> — flujos de aprobación antes de ejecutar acciones críticas</li>
  <li><strong>Score dashboard</strong> — panel de cumplimiento normativo en tiempo real</li>
  <li><strong>Alertas inteligentes</strong> — notificaciones proactivas sobre desviaciones de compliance</li>
  <li><strong>Certificación digital</strong> — preparación para auditorías externas</li>
  <li><strong>Gestión documental certificada</strong> — almacenamiento con cadena de custodia</li>
  <li><strong>Preparación fiscal</strong> — informes listos para presentación ante autoridades</li>
</ul>

<!-- ═══════════ 7 ═══════════════ -->
<h2 id="s7">7. Límites técnicos de cada plan</h2>

<table>
  <tr>
    <th>Límite</th>
    <th class="num">Scale</th>
    <th class="num">Compliance</th>
    <th class="num">Trial</th>
  </tr>
  <tr><td>Usuarios</td><td class="num">99</td><td class="num">99</td><td class="num">2</td></tr>
  <tr><td>Leads / contactos</td><td class="num">-1 (∞)</td><td class="num">-1 (∞)</td><td class="num">100</td></tr>
  <tr><td>Emails / mes</td><td class="num">-1 (∞)</td><td class="num">-1 (∞)</td><td class="num">500</td></tr>
  <tr><td>WhatsApp messages / mes</td><td class="num">-1 (∞)</td><td class="num">-1 (∞)</td><td class="num">100</td></tr>
  <tr><td>SMS / mes</td><td class="num">-1 (∞)</td><td class="num">-1 (∞)</td><td class="num">50</td></tr>
  <tr><td>Automation runs</td><td class="num">-1 (∞)</td><td class="num">-1 (∞)</td><td class="num">0</td></tr>
  <tr><td>AI image generations</td><td class="num">-1 (∞)</td><td class="num">-1 (∞)</td><td class="num">5</td></tr>
  <tr><td>Storage</td><td class="num"><strong>100 GB</strong></td><td class="num"><strong>250 GB</strong></td><td class="num">1 GB</td></tr>
  <tr><td>Business email</td><td class="num">-1 (∞)</td><td class="num">-1 (∞)</td><td class="num">0</td></tr>
  <tr><td>Business domains</td><td class="num">-1 (∞)</td><td class="num">-1 (∞)</td><td class="num">0</td></tr>
  <tr><td>Business email storage</td><td class="num">10 GB</td><td class="num">25 GB</td><td class="num">0</td></tr>
  <tr><td>Cursos</td><td class="num">-1 (∞)</td><td class="num">-1 (∞)</td><td class="num">0</td></tr>
  <tr><td>Estudiantes</td><td class="num">-1 (∞)</td><td class="num">-1 (∞)</td><td class="num">0</td></tr>
  <tr><td>Páginas web</td><td class="num">-1 (∞)</td><td class="num">-1 (∞)</td><td class="num">3</td></tr>
  <tr><td>Facturas</td><td class="num">-1 (∞)</td><td class="num">-1 (∞)</td><td class="num">5</td></tr>
  <tr><td>Contratos con firma</td><td class="num">-1 (∞)</td><td class="num">-1 (∞)</td><td class="num">2</td></tr>
  <tr><td>Compliance mode</td><td class="num">❌</td><td class="num"><strong>✅</strong></td><td class="num">❌</td></tr>
</table>

<p style="font-size:9pt;color:#94a3b8">
  <code>-1</code> = ilimitado. El sistema no bloquea el uso cuando el límite es -1.
</p>

<!-- ═══════════ 8 ═══════════════ -->
<div class="page-break"></div>
<h2 id="s8">8. Módulos incluidos por plan</h2>

<p>Ambos planes incluyen todos los módulos de Volkern. La única diferencia es que Compliance Pro
incluye además el módulo <code>compliance_pro</code>.</p>

<table>
  <tr><th>Grupo</th><th>Módulo</th><th class="center">Scale</th><th class="center">Compliance</th></tr>
  <tr><td rowspan="6">Ventas &amp; Leads</td><td>Leads</td><td class="center">✅</td><td class="center">✅</td></tr>
  <tr><td>Contactos</td><td class="center">✅</td><td class="center">✅</td></tr>
  <tr><td>Empresas</td><td class="center">✅</td><td class="center">✅</td></tr>
  <tr><td>Pipeline</td><td class="center">✅</td><td class="center">✅</td></tr>
  <tr><td>Tareas</td><td class="center">✅</td><td class="center">✅</td></tr>
  <tr><td>Analytics</td><td class="center">✅</td><td class="center">✅</td></tr>

  <tr><td rowspan="5">Comunicación</td><td>Mensajes</td><td class="center">✅</td><td class="center">✅</td></tr>
  <tr><td>Citas</td><td class="center">✅</td><td class="center">✅</td></tr>
  <tr><td>Catálogo</td><td class="center">✅</td><td class="center">✅</td></tr>
  <tr><td>Chatbot WhatsApp</td><td class="center">✅</td><td class="center">✅</td></tr>
  <tr><td>Telefonía</td><td class="center">✅</td><td class="center">✅</td></tr>

  <tr><td rowspan="6">Marketing</td><td>Campañas</td><td class="center">✅</td><td class="center">✅</td></tr>
  <tr><td>Email Marketing</td><td class="center">✅</td><td class="center">✅</td></tr>
  <tr><td>Constructor Web</td><td class="center">✅</td><td class="center">✅</td></tr>
  <tr><td>Constructor Premium</td><td class="center">✅</td><td class="center">✅</td></tr>
  <tr><td>Hub Social</td><td class="center">✅</td><td class="center">✅</td></tr>
  <tr><td>Formularios</td><td class="center">✅</td><td class="center">✅</td></tr>

  <tr><td rowspan="2">Academia</td><td>Cursos</td><td class="center">✅</td><td class="center">✅</td></tr>
  <tr><td>Estudiantes</td><td class="center">✅</td><td class="center">✅</td></tr>

  <tr><td>Automatización</td><td>Automatizaciones</td><td class="center">✅</td><td class="center">✅</td></tr>

  <tr><td rowspan="6">Administración</td><td>Integraciones</td><td class="center">✅</td><td class="center">✅</td></tr>
  <tr><td>Equipo</td><td class="center">✅</td><td class="center">✅</td></tr>
  <tr><td>Configuración</td><td class="center">✅</td><td class="center">✅</td></tr>
  <tr><td>Marca Blanca</td><td class="center">✅</td><td class="center">✅</td></tr>
  <tr><td>Dominio Personalizado</td><td class="center">✅</td><td class="center">✅</td></tr>
  <tr><td>Conocimiento</td><td class="center">✅</td><td class="center">✅</td></tr>

  <tr><td rowspan="6">ERP</td><td>RRHH</td><td class="center">✅</td><td class="center">✅</td></tr>
  <tr><td>Finanzas</td><td class="center">✅</td><td class="center">✅</td></tr>
  <tr><td>Calidad</td><td class="center">✅</td><td class="center">✅</td></tr>
  <tr><td>Producción</td><td class="center">✅</td><td class="center">✅</td></tr>
  <tr><td>Inventario</td><td class="center">✅</td><td class="center">✅</td></tr>
  <tr><td>Proyectos</td><td class="center">✅</td><td class="center">✅</td></tr>

  <tr><td rowspan="2">Compliance</td><td>Estrategia</td><td class="center">✅</td><td class="center">✅</td></tr>
  <tr><td><strong>Compliance PRO</strong></td><td class="center">❌</td><td class="center"><strong>✅</strong></td></tr>
</table>

<!-- ═══════════ 9 ═══════════════ -->
<h2 id="s9">9. Descuento anual</h2>

<p>Los clientes pueden optar por facturación anual y obtener un <strong>20% de descuento</strong>
sobre el precio mensual:</p>

<div class="formula">
  precio_anual = precio_mensual × 0.8 × 12
</div>

<div class="card">
  <strong>Ejemplo:</strong> Scale con 5 usuarios y 5.000 contactos:
  <br><br>
  Mensual: <strong>€147/mo</strong>
  <br>
  Anual: €147 × 0.8 × 12 = <strong>€1.411/año</strong> (equivalente a €118/mes, ahorro de €348)
</div>

<p>El descuento anual se aplica tanto en la UI del configurador como en la creación de la sesión
de checkout en Stripe.</p>

<!-- ═══════════ 10 ══════════════ -->
<div class="page-break"></div>
<h2 id="s10">10. Planes legacy <span class="tag tag-legacy">Ya no activos</span></h2>

<p>Los siguientes planes tenían precios fijos y ya no están disponibles para nuevas suscripciones.
Los tenants existentes con estos planes fueron migrados automáticamente al nuevo modelo:</p>

<table>
  <tr>
    <th>Plan</th>
    <th class="num">Precio mensual</th>
    <th class="num">Precio anual</th>
    <th class="num">Usuarios</th>
    <th class="num">Contactos</th>
    <th>Storage</th>
  </tr>
  <tr><td>Esencial</td><td class="num">€69</td><td class="num">€662</td><td class="num">2</td><td class="num">1.000</td><td>5 GB</td></tr>
  <tr><td>Profesional</td><td class="num">€149</td><td class="num">€1.430</td><td class="num">5</td><td class="num">5.000</td><td>25 GB</td></tr>
  <tr><td>Infinity</td><td class="num">€299</td><td class="num">€2.870</td><td class="num">15</td><td class="num">∞</td><td>100 GB</td></tr>
</table>

<h3>Migración realizada</h3>

<table>
  <tr><th>Plan antiguo</th><th>→ Plan nuevo</th><th>Razón</th></tr>
  <tr><td>Esencial</td><td><strong>Scale</strong></td><td>Sin compliance, tope básico → escala ilimitada</td></tr>
  <tr><td>Profesional</td><td><strong>Scale</strong></td><td>Sin compliance, gama media → escala ilimitada</td></tr>
  <tr><td>Infinity</td><td><strong>Compliance Pro</strong></td><td>Tenía compliance_mode: true → Compliance Pro</td></tr>
</table>

<div class="card">
  <strong>Nota:</strong> La migración fue ejecutada mediante un script con transacción Prisma y
  registro de auditoría. Cada tenant migrado tiene un <code>AuditLog</code> con los valores
  anteriores y nuevos. La migración es idempotente.
</div>

<!-- ═══════════ 11 ══════════════ -->
<h2 id="s11">11. Add-ons</h2>

<p>Adicionalmente al plan base, se pueden contratar los siguientes complementos:</p>

<table>
  <tr><th>Add-on</th><th>Precio</th><th>Descripción</th></tr>
  <tr>
    <td><strong>Usuarios Adicionales</strong></td>
    <td class="num">€10/user/mes</td>
    <td>Agregar un usuario extra al equipo</td>
  </tr>
  <tr>
    <td><strong>Compliance PRO</strong></td>
    <td class="num">€149/mes</td>
    <td>Trazabilidad total, gates obligatorios, score dashboard y alertas inteligentes</td>
  </tr>
</table>

<!-- ═══════════ 12 ══════════════ -->
<h2 id="s12">12. Flujo de checkout y Stripe</h2>

<h3>Diagrama del flujo</h3>
<ol>
  <li><strong>Configuración</strong> — El cliente ajusta sliders de usuarios/contactos en <code>/precios</code> y selecciona Scale o Compliance</li>
  <li><strong>Cálculo</strong> — Se ejecuta <code>calcularPrecio()</code> en cliente y se muestra el precio en tiempo real</li>
  <li><strong>Checkout</strong> — Al hacer clic en "Configura tu plan", se navega a <code>/checkout?usuarios=X&contactos=Y&plan=Z&interval=W&precio=P</code></li>
  <li><strong>Registro</strong> — El cliente completa el formulario con sus datos</li>
  <li><strong>API</strong> — <code>POST /api/signup</code> crea tenant, usuario, roles, pipeline stages, features seed demo y módulos</li>
  <li><strong>Stripe Checkout</strong> — Se recalcula el precio en servidor (no se confía en el cliente) y se crea una sesión de Stripe con <code>price_data</code> dinámico</li>
  <li><strong>Pago</strong> — El cliente es redirigido a Stripe para completar el pago</li>
  <li><strong>Webhook</strong> — Stripe envía el evento <code>checkout.session.completed</code> a <code>/api/webhooks/stripe</code></li>
  <li><strong>Activación</strong> — El webhook actualiza el tenant a estado <code>activo</code> con el plan seleccionado</li>
</ol>

<h3>Detalles técnicos de Stripe</h3>
<ul>
  <li>Se usa <strong>modo suscripción</strong> (<code>mode: 'subscription'</code>) con <code>price_data</code> recurrente</li>
  <li>No se usan Price IDs fijos para planes dinámicos — el precio se pasa como <code>unit_amount</code> en céntimos</li>
  <li>Los planes legacy usan Price IDs de Stripe predefinidos (<code>stripePriceId</code>)</li>
  <li>El <code>customer</code> de Stripe se crea con metadata <code>tenantId</code> para correlación</li>
  <li>El <code>subscription_data.metadata</code> contiene <code>tenantId</code>, <code>plan</code> e <code>interval</code></li>
  <li>La deduplicación de webhooks se maneja con <code>processedWebhook</code> (stripeEventId + tenantId unique)</li>
</ul>

<!-- ═══════════ 13 ══════════════ -->
<div class="page-break"></div>
<h2 id="s13">13. Migración de planes legacy a dinámicos</h2>

<h3>Script de migración</h3>
<p>Se ejecutó <code>scripts/migrate-plans-to-new-model.ts</code> con los siguientes detalles:</p>

<table>
  <tr><th>Propiedad</th><th>Valor</th></tr>
  <tr><td>Tenants migrados</td><td><strong>3</strong> (todos con plan 'profesional')</td></tr>
  <tr><td>Plan destino</td><td><code>scale</code></td></tr>
  <tr><td>Tipo de transacción</td><td>Prisma <code>$transaction</code> con auditoría</td></tr>
  <tr><td>Auditoría</td><td>Cada tenant tiene <code>AuditLog</code> con <code>cambiosAntes</code> y <code>cambiosDespues</code></td></tr>
</table>

<h3>Seed de SubscriptionPlan</h3>
<p>Se ejecutó <code>scripts/seed-subscription-plans.ts</code> para crear registros en la BD:</p>

<table>
  <tr><th>Plan</th><th>Módulos</th><th>Límites</th><th>Compliance</th></tr>
  <tr><td>Scale</td><td>51 (todos excepto compliance_pro)</td><td>99 users, -1 leads, 100 GB</td><td>false</td></tr>
  <tr><td>Compliance Pro</td><td>52 (todos + compliance_pro)</td><td>99 users, -1 leads, 250 GB</td><td>true</td></tr>
  <tr><td>Esencial (legacy)</td><td>51</td><td>2 users, 1.000 leads, 5 GB</td><td>false</td></tr>
  <tr><td>Profesional (legacy)</td><td>52</td><td>5 users, 5.000 leads, 25 GB</td><td>false</td></tr>
  <tr><td>Infinity (legacy)</td><td>52</td><td>15 users, -1 leads, 100 GB</td><td>true</td></tr>
</table>

<h3>Verificación post-migración</h3>
<p>Se ejecutó <code>scripts/verify-migrated-tenants.ts</code> que verifica:</p>
<ol>
  <li><code>SubscriptionPlan</code> existen en BD</li>
  <li><code>getPlanConfig('scale')</code> funciona tanto desde DB como desde fallback hardcodeado</li>
  <li><code>getTenantPlan()</code> resuelve correctamente para cada tenant</li>
  <li><code>getTenantEffectiveLimits()</code> retorna todos los campos</li>
  <li><code>checkFeatureLimit()</code> con límites -1 retorna ALLOWED</li>
  <li><code>getActiveModules()</code> retorna 51+ módulos</li>
  <li>Estado de Stripe (customer ID, subscriptions)</li>
</ol>

<div class="card">
  <strong>Resultado:</strong> ✅ 20/20 tests pasaron. Todos los tenants migrados funcionan sin errores
  en todas las rutas de código críticas (dashboard, billing, feature limits, módulos activos).
</div>

<p style="text-align:center;margin-top:2cm;color:#94a3b8;font-size:9pt">
  — Fin del documento —
</p>

</body>
</html>`;

async function main() {
  console.log('🚀 Generando PDF...');

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setContent(HTML, { waitUntil: 'networkidle0' });

  const outputPath = path.resolve(__dirname, '../docs/pricing-logic.pdf');
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  await page.pdf({
    path: outputPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '2.5cm', bottom: '2.5cm', left: '2cm', right: '2cm' },
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: `
      <div style="width:100%;font-size:8pt;color:#94a3b8;text-align:center;padding:0 2cm;">
        Volkern — Modelo de Precios v2.0 &nbsp;|&nbsp; Página <span class="pageNumber"></span> de <span class="totalPages"></span>
      </div>
    `,
  });

  await browser.close();

  const stats = fs.statSync(outputPath);
  const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`✅ PDF generado: ${outputPath}`);
  console.log(`   Tamaño: ${sizeMb} MB`);
  console.log(`   Páginas: variable (formato A4)`);
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
