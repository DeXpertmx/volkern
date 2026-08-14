#!/usr/bin/env node
/**
 * Genera un PDF profesional del Reporte Técnico para Asesorías Contables y Fiscales.
 *
 * Equivalente Node.js de generate_reporte_contable_pdf.py (que usaba WeasyPrint).
 * En esta máquina no hay pip/WeasyPrint, así que se usa el stack ya instalado en
 * el proyecto: marked (markdown→tokens) + jspdf + jspdf-autotable, replicando el
 * estilo corporativo (A4, portada, encabezado/pie, tablas con cabecera azul, código).
 *
 * Uso:  node generate_reporte_asesoria_pdf.js
 */

import fs from 'fs';
import path from 'path';
import { marked } from 'marked';
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';

// ─── Rutas (relativas al script) ──────────────────────────────────────
const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const MD_PATH = path.join(SCRIPT_DIR, 'documentacion_tecnica', 'REPORTE_TECNICO_ASESORIA_CONTABLE_FISCAL.md');
const PDF_PATH = path.join(SCRIPT_DIR, 'documentacion_tecnica', 'REPORTE_TECNICO_ASESORIA_CONTABLE_FISCAL.pdf');

// ─── Paleta corporativa (idéntica a la del script Python) ─────────────
const C = {
  darkBlue: [26, 58, 92],      // #1a3a5c
  midBlue: [36, 113, 163],     // #2471a3
  accent: [41, 128, 185],      // #2980b9
  text: [44, 62, 80],          // #2c3e50
  muted: [149, 165, 166],      // #95a5a6
  lightBg: [234, 242, 248],    // #eaf2f8
  codeBg: [30, 30, 46],        // #1e1e2e
  codeFg: [205, 214, 244],     // #cdd6f4
  zebra: [234, 242, 248],
  border: [213, 219, 219],     // #d5dbdb
};

const PAGE = { w: 210, h: 297, marginX: 18, marginY: 22, contentW: 174 };

// ─── Sanitización de texto para fuentes WinAnsi (sin emojis rotos) ────
const EMOJI_MAP = {
  '✅': 'OK ', '❌': 'NO ', '⚠️': '! ', '⚠': '! ', '🚨': '! ', '🔴': '',
  '📊': '', '📑': '', '🧾': '', '💰': '', '📥': '', '📤': '', '📅': '', '🏠': '',
  '💸': '', '⚖️': '', '🟢': '', '🗑️': '', '⏳': '', '↩️': '', '🔵': '', '🟣': '',
  '→': '->', '▼': 'v', '▲': '^', '⬅': '<-',
  '┌': '+', '┐': '+', '└': '+', '┘': '+', '─': '-', '│': '|', '═': '=',
  '║': '|', '├': '+', '┤': '+', '┬': '+', '┴': '+', '■': '#', '·': '-',
};

function sanitize(text) {
  if (!text) return '';
  let out = '';
  for (const ch of String(text)) {
    if (EMOJI_MAP[ch] !== undefined) { out += EMOJI_MAP[ch]; continue; }
    const cp = ch.codePointAt(0);
    // WinAnsi cubre 0x20..0x7E, 0xA0..0xFF y el euro (0x20AC).
    if (cp === 0x20AC) { out += '€'; continue; }
    if (cp >= 0x20 && cp <= 0x7E) { out += ch; continue; }
    if (cp >= 0xA0 && cp <= 0xFF) { out += ch; continue; }
    if (cp === 0xA9 || cp === 0xAE) { out += ch; continue; } // © ® (WinAnsi)
    // Saltos de línea/espacios permitidos
    if (ch === '\n' || ch === '\t') { out += ch; continue; }
    // Cualquier otro (emoji, símbolos raros) se omite
  }
  return out;
}

// ─── Inline: **bold**, *em*, `code`, [text](url) ──────────────────────
const INLINE_RE = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]*\))/g;

function renderInline(doc, text, x, y, opts = {}) {
  const size = opts.size || 10;
  const color = opts.color || C.text;
  const maxWidth = opts.maxWidth || (PAGE.w - PAGE.marginX * 2);
  doc.setFontSize(size);
  doc.setTextColor(color[0], color[1], color[2]);
  doc.setFont('helvetica', 'normal');
  const parts = String(text).split(INLINE_RE);
  let cx = x;
  const maxX = x + maxWidth;
  for (const part of parts) {
    if (!part) continue;
    let content = part;
    let style = 'normal';
    let mono = false;
    if (part.startsWith('**') && part.endsWith('**')) { content = part.slice(2, -2); style = 'bold'; }
    else if (part.startsWith('*') && part.endsWith('*') && part.length > 2) { content = part.slice(1, -1); style = 'italic'; }
    else if (part.startsWith('`') && part.endsWith('`')) { content = part.slice(1, -1); mono = true; style = 'normal'; }
    else if (part.startsWith('[') && part.includes('](')) {
      content = part.slice(1, part.indexOf(']('));
      style = 'bold'; // los enlaces del índice se resaltan
    }
    const clean = sanitize(content);
    if (mono) {
      doc.setFont('courier', 'normal');
      doc.setFontSize(Math.max(6.5, size - 1.5));
      // Fondo del código inline
      const w = doc.getTextWidth(clean) + 1.6;
      doc.setFillColor(244, 246, 246);
      doc.rect(cx - 0.8, y - 3.2, w, 4.6, 'F');
      doc.setTextColor(192, 57, 43);
      doc.text(clean, cx, y);
      cx += w + 1.2;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(size);
      doc.setTextColor(color[0], color[1], color[2]);
      continue;
    }
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
    let words = doc.splitTextToSize(clean, maxX - cx);
    if (words.length > 1) { words = [clean]; } // sin wrap a mitad de inline
    doc.text(words[0], cx, y);
    cx += doc.getTextWidth(words[0]);
  }
  return cx;
}

function measureInline(doc, text, size = 10) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(size);
  let total = 0;
  const parts = String(text).split(INLINE_RE);
  for (const part of parts) {
    if (!part) continue;
    let content = part;
    if (part.startsWith('**') && part.endsWith('**')) content = part.slice(2, -2);
    else if (part.startsWith('*') && part.endsWith('*') && part.length > 2) content = part.slice(1, -1);
    else if (part.startsWith('`') && part.endsWith('`')) content = part.slice(1, -1);
    else if (part.startsWith('[') && part.includes('](')) content = part.slice(1, part.indexOf(']('));
    doc.setFont('helvetica', part.startsWith('`') ? 'courier' : 'normal');
    total += doc.getTextWidth(sanitize(content)) + (part.startsWith('`') ? 1.2 : 0);
  }
  return total;
}

// ─── Código de bloque: fondo oscuro, courier ──────────────────────────
function renderCodeBlock(doc, code, startY) {
  let y = startY;
  const lines = code.split('\n');
  const size = 7;
  doc.setFont('courier', 'normal');
  doc.setFontSize(size);
  let maxW = 0;
  for (const line of lines) maxW = Math.max(maxW, doc.getTextWidth(sanitize(line)));
  const blockW = Math.min(PAGE.contentW, maxW + 10);
  const blockH = lines.length * (size * 0.42) + 7;
  if (y + blockH > PAGE.h - 25) { doc.addPage(); y = PAGE.marginY; }
  doc.setFillColor(C.codeBg[0], C.codeBg[1], C.codeBg[2]);
  doc.roundedRect(PAGE.marginX, y - 4, blockW, blockH, 1.5, 1.5, 'F');
  doc.setTextColor(C.codeFg[0], C.codeFg[1], C.codeFg[2]);
  let ly = y;
  for (const line of lines) {
    const t = sanitize(line);
    if (t) doc.text(t, PAGE.marginX + 5, ly);
    ly += size * 0.42;
  }
  return y + blockH + 3;
}

// ─── Tabla con autotable ───────────────────────────────────────────────
function renderTable(doc, token, startY) {
  const head = token.header.map((h) => sanitize(h));
  const body = token.rows.map((r) => r.map((c) => sanitize(c)));
  autoTable(doc, {
    startY: startY + 3,
    margin: { left: PAGE.marginX, right: PAGE.marginX },
    head: [head],
    body,
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.6, textColor: C.text, lineColor: C.border, lineWidth: 0.15 },
    headStyles: { fillColor: C.darkBlue, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
    alternateRowStyles: { fillColor: C.zebra },
    columnStyles: {},
  });
  return doc.lastAutoTable.finalY + 4;
}

// ─── Párrafo con wrapping ──────────────────────────────────────────────
function renderParagraph(doc, text, startY, opts = {}) {
  let y = startY;
  const size = opts.size || 10;
  const maxW = opts.maxWidth || PAGE.contentW;
  const lh = size * 0.52;
  // Wrapping: dividir por palabras usando splitTextToSize sobre texto plano sanitizado
  const clean = sanitize(text);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(size);
  const wrapped = doc.splitTextToSize(clean, maxW);
  for (const line of wrapped) {
    if (y > PAGE.h - 25) { doc.addPage(); y = PAGE.marginY; }
    renderInline(doc, line, PAGE.marginX, y, { size, color: C.text });
    y += lh;
  }
  return y + 1;
}

// ─── Listas ────────────────────────────────────────────────────────────
function renderList(doc, token, startY) {
  let y = startY;
  const items = token.items;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (y > PAGE.h - 25) { doc.addPage(); y = PAGE.marginY; }
    let label = token.ordered ? `${token.start + i}.` : '•';
    if (item.task) label = item.checked ? '☑' : '☐';
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(C.accent[0], C.accent[1], C.accent[2]);
    doc.text(label, PAGE.marginX + 2, y);
    const x0 = PAGE.marginX + 8;
    const remaining = PAGE.w - PAGE.marginX - 8 - PAGE.marginX;
    const text = Array.isArray(item.tokens) && item.tokens.length > 0
      ? item.tokens.map(t => t.type === 'text' ? t.text : (t.type === 'codespan' ? `\`${t.text}\`` : t.raw || t.text || '')).join(' ')
      : item.text || '';
    renderInline(doc, text, x0, y, { size: 10, maxWidth: remaining });
    y += 5.2;
    // sub-listas
    for (const sub of item.tokens || []) {
      if (sub.type === 'list') {
        y = renderList(doc, sub, y) + 1;
      }
    }
    if (item.tokens) {
      for (const t of item.tokens) {
        if (t.type === 'space') { y += 1.5; }
      }
    }
  }
  return y + 1;
}

// ─── Blockquote ────────────────────────────────────────────────────────
function renderBlockquote(doc, token, startY) {
  let y = startY;
  const lines = token.text.split('\n').map(l => l.replace(/^>\s?/, '')).filter(Boolean);
  doc.setFillColor(C.lightBg[0], C.lightBg[1], C.lightBg[2]);
  // estimar altura
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9.5);
  let h = 6;
  for (const line of lines) {
    const wrapped = doc.splitTextToSize(sanitize(line), PAGE.contentW - 10);
    h += wrapped.length * 4.8;
  }
  if (y + h > PAGE.h - 25) { doc.addPage(); y = PAGE.marginY; }
  doc.setFillColor(C.lightBg[0], C.lightBg[1], C.lightBg[2]);
  doc.rect(PAGE.marginX, y - 1, PAGE.contentW, h, 'F');
  doc.setDrawColor(C.accent[0], C.accent[1], C.accent[2]);
  doc.setLineWidth(1);
  doc.line(PAGE.marginX, y - 1, PAGE.marginX, y + h);
  doc.setTextColor(C.text[0], C.text[1], C.text[2]);
  let ly = y + 5;
  for (const line of lines) {
    for (const wl of doc.splitTextToSize(sanitize(line), PAGE.contentW - 12)) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9.5);
      doc.text(wl, PAGE.marginX + 6, ly);
      ly += 4.8;
    }
  }
  return y + h + 4;
}

// ─── Encabezado de página (excepto portada) ────────────────────────────
const HEADER_TEXT = 'Volkern — Reporte Técnico para Asesorías Contables y Fiscales';

function drawPageChrome(doc) {
  for (let p = 1; p <= doc.getNumberOfPages(); p++) {
    doc.setPage(p);
    if (p === 1) continue; // portada sin encabezado
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
    doc.text(sanitize(HEADER_TEXT), PAGE.w / 2, 10, { align: 'center' });
    doc.text(`Página ${p} de ${doc.getNumberOfPages()}`, PAGE.w / 2, PAGE.h - 8, { align: 'center' });
  }
}

// ─── Portada ───────────────────────────────────────────────────────────
function renderCover(doc) {
  // Fondo superior azul
  doc.setFillColor(C.darkBlue[0], C.darkBlue[1], C.darkBlue[2]);
  doc.rect(0, 0, PAGE.w, 90, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  doc.text('REPORTE TÉCNICO INTEGRAL', PAGE.w / 2, 42, { align: 'center' });
  doc.setFontSize(17);
  doc.text('Sistema Contable y Fiscal Volkern', PAGE.w / 2, 58, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.setTextColor(205, 220, 235);
  doc.text('Para asesorías contables y fiscales', PAGE.w / 2, 72, { align: 'center' });
  // Línea de acento
  doc.setDrawColor(C.accent[0], C.accent[1], C.accent[2]);
  doc.setLineWidth(2);
  doc.line(PAGE.w / 2 - 40, 80, PAGE.w / 2 + 40, 80);

  doc.setTextColor(C.text[0], C.text[1], C.text[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Contenido del documento', PAGE.marginX, 120);
  doc.setDrawColor(C.accent[0], C.accent[1], C.accent[2]);
  doc.setLineWidth(0.8);
  doc.line(PAGE.marginX, 124, PAGE.w - PAGE.marginX, 124);

  const bullets = [
    'Núcleo contable: PGC (Normal/PYMES/Micro x 14 sectores), partida doble y libro diario encadenado (HMAC-SHA256)',
    'Motor fiscal: Modelos 303, 111, 115, 130, 180, 347, 349 y 390 calculados en tiempo real',
    'Calendario fiscal proactivo con importes estimados y alertas de vencimiento',
    'Reportes: balance de comprobación, cuenta de resultados y balance de situación',
    'Captura documental con OCR: desglose de IVA múltiple, plantillas por proveedor y aprendizaje automático',
    'Facturación Veri*factu: encadenamiento, QR, firma XAdES y envío a la AEAT',
    'Control de contabilidad e impuestos desde Telegram (19 entrenamientos)',
    'Catálogo de endpoints, modelo de datos, seguridad, operativa y roadmap',
  ];
  let y = 134;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  for (const b of bullets) {
    doc.setTextColor(C.accent[0], C.accent[1], C.accent[2]);
    doc.setFont('helvetica', 'bold');
    doc.text('•', PAGE.marginX + 2, y);
    doc.setTextColor(C.text[0], C.text[1], C.text[2]);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(sanitize(b), PAGE.contentW - 12);
    doc.text(lines, PAGE.marginX + 8, y);
    y += lines.length * 5 + 2.5;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(C.muted[0], C.muted[1], C.muted[2]);
  doc.text('Plataforma: Volkern (volkern.app)  ·  Módulo: Contabilidad, Fiscalidad y Gestión Documental', PAGE.w / 2, PAGE.h - 30, { align: 'center' });
  doc.text('Fecha: Agosto 2026  ·  Versión 1.0', PAGE.w / 2, PAGE.h - 25, { align: 'center' });
  doc.text('Elaborado a partir del código fuente y la documentación técnica del proyecto', PAGE.w / 2, PAGE.h - 20, { align: 'center' });
}

// ─── Render principal ──────────────────────────────────────────────────
function build() {
  const md = fs.readFileSync(MD_PATH, 'utf8');
  const tokens = marked.lexer(md);

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setLineHeightFactor(1.15);

  renderCover(doc);
  doc.addPage();

  let y = PAGE.marginY;
  for (const token of tokens) {
    switch (token.type) {
      case 'heading': {
        const level = token.depth;
        const sizeMap = { 1: 17, 2: 13, 3: 11, 4: 10.5 };
        const size = sizeMap[level] || 10;
        if (level <= 1 && y > PAGE.marginY) { doc.addPage(); y = PAGE.marginY; }
        if (y > PAGE.h - 40) { doc.addPage(); y = PAGE.marginY; }
        if (level <= 2) {
          // línea inferior azul
          doc.setDrawColor(C.accent[0], C.accent[1], C.accent[2]);
          doc.setLineWidth(0.9);
        }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(size);
        doc.setTextColor(...(level === 1 ? C.darkBlue : level === 2 ? C.midBlue : C.text));
        const clean = sanitize(token.text);
        const lines = doc.splitTextToSize(clean, PAGE.contentW);
        doc.text(lines, PAGE.marginX, y);
        y += lines.length * (size * 0.55) + 1.5;
        if (level <= 2) {
          doc.line(PAGE.marginX, y, PAGE.marginX + 60, y);
          y += 4;
        } else {
          y += 2;
        }
        break;
      }
      case 'paragraph': {
        y = renderParagraph(doc, token.text, y);
        break;
      }
      case 'table': {
        if (y > PAGE.h - 45) { doc.addPage(); y = PAGE.marginY; }
        y = renderTable(doc, token, y);
        break;
      }
      case 'code': {
        y = renderCodeBlock(doc, token.text, y);
        break;
      }
      case 'list': {
        y = renderList(doc, token, y);
        break;
      }
      case 'blockquote': {
        y = renderBlockquote(doc, token, y);
        break;
      }
      case 'hr': {
        if (y > PAGE.h - 20) { doc.addPage(); y = PAGE.marginY; }
        doc.setDrawColor(C.border[0], C.border[1], C.border[2]);
        doc.setLineWidth(0.4);
        doc.line(PAGE.marginX, y, PAGE.w - PAGE.marginX, y);
        y += 5;
        break;
      }
      case 'space': {
        y += 3;
        break;
      }
      default:
        break;
    }
    if (y > PAGE.h - 15) { doc.addPage(); y = PAGE.marginY; }
  }

  drawPageChrome(doc);
  doc.save(PDF_PATH);
  return doc;
}

// ─── Ejecutar ──────────────────────────────────────────────────────────
const t0 = Date.now();
console.log(`📄 Generando PDF desde: ${path.basename(MD_PATH)}`);
const mdSize = fs.statSync(MD_PATH).size;
const doc = build();
const fileSizeKb = (fs.statSync(PDF_PATH).size / 1024).toFixed(1);
console.log(`   Tamaño del Markdown: ${mdSize.toLocaleString()} bytes`);
console.log(`   Páginas generadas:   ${doc.getNumberOfPages()}`);
console.log(`\n✅ PDF generado exitosamente:`);
console.log(`   📁 Ruta:  ${PDF_PATH}`);
console.log(`   📏 Tamaño: ${fileSizeKb} KB`);
console.log(`   ⏱️  Tiempo: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
