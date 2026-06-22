#!/usr/bin/env -S npx tsx
/**
 * generate-partner-api-docs.ts — Regenera la documentación Partner API.
 *
 * Pipeline:
 *   docs/PARTNER-API.md
 *     → marked (MD → HTML)
 *       → docs/partner-api.html           (copia de respaldo)
 *       → public/docs/partner-api.html    (servido por Next.js en /api/partner)
 *     → weasyprint (HTML → PDF)
 *       → docs/Volkern-Partner-API-Integracion-RRHH.pdf
 *
 * Uso:
 *   npm run generate-partner-docs
 *   npx tsx scripts/generate-partner-api-docs.ts
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { marked } from "marked";

const MD_SOURCE = "docs/PARTNER-API.md";
const HTML_BOTH = ["docs/partner-api.html", "public/docs/partner-api.html"];
const PDF_OUT = "docs/Volkern-Partner-API-Integracion-RRHH.pdf";

// ─── CSS template ────────────────────────────────────────────────────────────

const STYLES = `
:root {
  --bg: #ffffff;
  --text: #1a1a2e;
  --heading: #0f172a;
  --border: #e2e8f0;
  --code-bg: #f1f5f9;
  --pre-bg: #1e293b;
  --pre-text: #e2e8f0;
  --link: #2563eb;
  --link-hover: #1d4ed8;
  --blockquote-bg: #eff6ff;
  --blockquote-border: #60a5fa;
  --blockquote-text: #1e40af;
  --th-bg: #f8fafc;
  --sidebar-bg: #f8fafc;
  --sidebar-link: #475569;
  --sidebar-active: #2563eb;
  --badge-bg: #dbeafe;
  --badge-text: #1e40af;
  --note-bg: #fefce8;
  --note-border: #facc15;
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  font-size: 15px; line-height: 1.7; color: var(--text); background: var(--bg);
  display: flex; min-height: 100vh;
}
.sidebar {
  width: 260px; min-width: 260px; background: var(--sidebar-bg);
  border-right: 1px solid var(--border); padding: 24px 16px;
  position: sticky; top: 0; height: 100vh; overflow-y: auto; font-size: 13px;
}
.sidebar h2 {
  font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;
  color: #94a3b8; margin-bottom: 16px; font-weight: 700;
}
.sidebar a {
  display: block; color: var(--sidebar-link); text-decoration: none;
  padding: 4px 8px; border-radius: 4px; margin-bottom: 2px; transition: background 0.15s;
}
.sidebar a:hover { background: #e2e8f0; }
.sidebar a.h2 { padding-left: 8px; font-weight: 600; margin-top: 8px; }
.sidebar a.h3 { padding-left: 20px; }
.sidebar a.h4 { padding-left: 32px; font-size: 12px; color: #94a3b8; }
.main { flex: 1; max-width: 860px; padding: 40px 48px 80px; margin: 0 auto; }
h1 { font-size: 28px; border-bottom: 2px solid #2563eb; padding-bottom: 10px; color: var(--heading); margin: 36px 0 20px; }
h1:first-child { margin-top: 0; }
h2 { font-size: 20px; border-bottom: 1px solid var(--border); padding-bottom: 6px; color: var(--heading); margin: 32px 0 14px; }
h3 { font-size: 16px; color: var(--heading); margin: 24px 0 10px; }
h4 { font-size: 14px; color: #334155; margin: 18px 0 8px; }
p { margin: 10px 0; }
a { color: var(--link); text-decoration: none; }
a:hover { text-decoration: underline; color: var(--link-hover); }
code {
  background: var(--code-bg); padding: 2px 6px; border-radius: 4px;
  font-family: 'SF Mono', 'Fira Code', 'Fira Mono', Menlo, Consolas, monospace; font-size: 13px;
}
pre {
  background: var(--pre-bg); color: var(--pre-text); padding: 16px 20px;
  border-radius: 8px; overflow-x: auto; font-size: 13px; line-height: 1.5;
  margin: 14px 0; position: relative;
}
pre code { background: transparent; padding: 0; color: inherit; font-size: inherit; }
.copy-btn {
  position: absolute; top: 8px; right: 12px; background: #334155; color: #e2e8f0;
  border: none; padding: 4px 10px; border-radius: 4px; font-size: 11px;
  cursor: pointer; opacity: 0; transition: opacity 0.2s;
}
pre:hover .copy-btn { opacity: 1; }
.copy-btn:hover { background: #475569; }
table { border-collapse: collapse; width: 100%; margin: 14px 0; font-size: 14px; }
th, td { border: 1px solid var(--border); padding: 8px 12px; text-align: left; }
th { background: var(--th-bg); font-weight: 700; color: var(--heading); }
tr:hover { background: #f8fafc; }
blockquote {
  border-left: 4px solid var(--blockquote-border); margin: 14px 0; padding: 10px 18px;
  background: var(--blockquote-bg); color: var(--blockquote-text); border-radius: 0 6px 6px 0;
}
blockquote p { margin: 4px 0; }
hr { border: none; border-top: 1px solid var(--border); margin: 28px 0; }
ul, ol { padding-left: 24px; margin: 8px 0; }
li { margin: 3px 0; }
strong { color: var(--heading); }
img { max-width: 100%; border-radius: 6px; }
.badge {
  display: inline-block; background: var(--badge-bg); color: var(--badge-text);
  padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 600; margin-left: 6px;
}
.note {
  background: var(--note-bg); border: 1px solid var(--note-border);
  border-radius: 8px; padding: 12px 18px; margin: 14px 0; font-size: 14px;
}
.page-header {
  text-align: center; padding: 40px 0 30px;
  border-bottom: 3px solid #2563eb; margin-bottom: 36px;
}
.page-header h1 { font-size: 32px; border: none; margin: 0 0 8px; color: #0f172a; }
.page-header p { color: #64748b; font-size: 15px; margin: 4px 0; }
@media (max-width: 900px) {
  body { flex-direction: column; }
  .sidebar { display: none; }
  .main { padding: 20px 16px 60px; }
  h1 { font-size: 22px; } h2 { font-size: 18px; }
  pre { font-size: 12px; padding: 12px 14px; }
}
@media print {
  .sidebar, .copy-btn { display: none; }
  .main { max-width: 100%; padding: 0; }
}
`;

// ─── HTML template ───────────────────────────────────────────────────────────

function buildHtml(body: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Volkern Partner API — Integración SaaS-a-SaaS RRHH</title>
  <meta name="description" content="Documentación de integración de la Volkern Partner API para Restauranteros SaaS. Endpoints REST para marcajes de asistencia, gestión de empleados, cálculo de nóminas y envío AEAT vía Verifactu.">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="https://docs.volkern.app/api/partner">
  <style>${STYLES}</style>
</head>
<body>
<nav class="sidebar" id="sidebar">
  <h2>📖 Partner API</h2>
  <div id="sidebar-links"></div>
</nav>
<main class="main">
  <div class="page-header">
    <h1>🔌 Volkern Partner API</h1>
    <p>Documentación de integración SaaS-a-SaaS — RRHH, Nómina y Verifactu para Restauranteros</p>
    <p><small>Última actualización: ${new Date().toLocaleDateString("es-ES", { year: "numeric", month: "long" })} · Base URL: <code>https://api.volkern.com/api/v1/partner</code></small></p>
  </div>
${body}
</main>
<script>
  // ── Copy button for code blocks ──
  document.querySelectorAll('pre').forEach(pre => {
    const btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.textContent = 'Copiar';
    btn.addEventListener('click', () => {
      const code = pre.querySelector('code') || pre;
      navigator.clipboard.writeText(code.textContent).then(() => {
        btn.textContent = '✓ Copiado';
        setTimeout(() => btn.textContent = 'Copiar', 2000);
      });
    });
    pre.appendChild(btn);
  });

  // ── Auto-generate sidebar from headings ──
  const sidebar = document.getElementById('sidebar-links');
  const headings = document.querySelectorAll('.main h2, .main h3, .main h4');
  headings.forEach(h => {
    const level = h.tagName.toLowerCase();
    const text = h.textContent;
    const id = text.toLowerCase().replace(/[^a-z0-9áéíóúñ]+/g, '-').replace(/(^-|-$)/g, '');
    h.id = id;
    const a = document.createElement('a');
    a.href = '#' + id;
    a.textContent = text;
    a.className = level;
    sidebar.appendChild(a);
  });

  // ── Highlight current section on scroll ──
  const links = sidebar.querySelectorAll('a');
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const id = entry.target.id;
      const link = sidebar.querySelector('a[href="#' + id + '"]');
      if (link) {
        if (entry.isIntersecting) {
          links.forEach(l => l.style.color = '');
          link.style.color = 'var(--sidebar-active)';
          link.style.fontWeight = '600';
        }
      }
    });
  }, { rootMargin: '-80px 0px -70% 0px' });
  headings.forEach(h => observer.observe(h));
</script>
</body>
</html>`;
}

// ─── PDF template ────────────────────────────────────────────────────────────

function buildPdfHtml(body: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Volkern Partner API — Integración RRHH</title>
<style>
  @page { size: A4; margin: 2cm; }
  body { font-family: 'DejaVu Sans', Arial, sans-serif; font-size: 9.5pt; line-height: 1.55; color: #1a1a1a; }
  h1 { font-size: 16pt; border-bottom: 2px solid #2563eb; padding-bottom: 6px; color: #1e3a5f; margin-top: 28px; }
  h2 { font-size: 13pt; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; color: #1e3a5f; margin-top: 24px; }
  h3 { font-size: 11pt; color: #374151; margin-top: 18px; }
  h4 { font-size: 10pt; color: #4b5563; }
  code { background: #f1f5f9; padding: 1px 5px; border-radius: 3px; font-family: 'DejaVu Sans Mono', monospace; font-size: 8.5pt; }
  pre { background: #1e293b; color: #e2e8f0; padding: 10px 14px; border-radius: 6px; overflow-x: auto; font-size: 8pt; line-height: 1.35; white-space: pre-wrap; word-break: break-all; }
  pre code { background: transparent; padding: 0; color: inherit; font-size: 8pt; }
  table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 8.5pt; }
  th, td { border: 1px solid #cbd5e1; padding: 5px 8px; text-align: left; }
  th { background: #f8fafc; font-weight: 700; }
  blockquote { border-left: 4px solid #60a5fa; margin: 10px 0; padding: 6px 14px; background: #eff6ff; color: #1e40af; font-style: italic; }
  hr { border: none; border-top: 1px solid #e2e8f0; margin: 20px 0; }
  strong { color: #0f172a; }
  a { color: #2563eb; }
  ul, ol { padding-left: 22px; }
  li { margin: 2px 0; }
  .header { text-align: center; margin-bottom: 30px; }
  .header h1 { border: none; font-size: 20pt; color: #1e3a5f; }
  .header p { color: #64748b; font-size: 10pt; }
</style>
</head>
<body>
<div class="header">
  <h1>Volkern Partner API</h1>
  <p>Documentación de integración SaaS-a-SaaS — RRHH, Nómina y Verifactu para Restauranteros</p>
  <p>${new Date().toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" })} · Confidencial</p>
</div>
${body}
</body>
</html>`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const cwd = process.cwd();
  console.log("📄 Leyendo", MD_SOURCE, "...");

  if (!fs.existsSync(path.join(cwd, MD_SOURCE))) {
    console.error("❌ No se encontró", MD_SOURCE);
    process.exit(1);
  }

  const md = fs.readFileSync(path.join(cwd, MD_SOURCE), "utf-8");

  // 1. Convertir MD → HTML
  marked.use({ gfm: true, breaks: true });

  // Inyectar anchor IDs en headings para navegación
  const mdWithAnchors = md.replace(
    /^(#{1,4})\s+(.+)$/gm,
    (_match, hashes, title) => {
      const id = title
        .toLowerCase()
        .replace(/[^a-z0-9áéíóúñ]+/g, "-")
        .replace(/(^-|-$)/g, "");
      return `${hashes} ${title} {#${id}}`;
    },
  );

  const body = marked.parse(mdWithAnchors);

  // 2. Escribir HTML standalone (ambas ubicaciones)
  const htmlContent = buildHtml(body);
  for (const outPath of HTML_BOTH) {
    const full = path.join(cwd, outPath);
    const dir = path.dirname(full);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(full, htmlContent, "utf-8");
    console.log("✅ HTML:", outPath, `(${(htmlContent.length / 1024).toFixed(0)} KB)`);
  }

  // 3. Generar PDF vía weasyprint
  const pdfHtml = buildPdfHtml(body);
  const tmpHtml = path.join(cwd, "docs", ".partner-api-tmp.html");
  fs.writeFileSync(tmpHtml, pdfHtml, "utf-8");

  try {
    execSync(`weasyprint "${tmpHtml}" "${path.join(cwd, PDF_OUT)}"`, {
      stdio: "pipe",
      timeout: 30_000,
    });
    const pdfSize = fs.statSync(path.join(cwd, PDF_OUT)).size;
    console.log("✅ PDF: ", PDF_OUT, `(${(pdfSize / 1024).toFixed(0)} KB)`);
  } catch (err) {
    console.error("⚠️  No se pudo generar el PDF (¿weasyprint instalado?)");
    console.error("   Instálalo con: pip install weasyprint");
  } finally {
    try { fs.unlinkSync(tmpHtml); } catch {}
  }

  console.log("\n📊 Documentación Partner API regenerada correctamente.");
  console.log("   HTML → https://volkern.app/api/partner");
}

main();
