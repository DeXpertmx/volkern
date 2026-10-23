#!/usr/bin/env node
/**
 * Pantallas del dossier comercial de CRM de Ventas.
 *
 * Cada pantalla es una composición HTML con la misma tipografía, colores y
 * estructura que el panel real (barra lateral, cabecera, tarjetas, embudo).
 * Los datos son de ejemplo: no hay base de datos ni sesión detrás.
 *
 * Uso directo:
 *   node scripts/dossier-crm-ventas/pantallas.cjs [directorio-de-salida]
 *
 * El generador del PDF (`generar-dossier-crm-ventas.cjs`) importa
 * `generarCapturas()` para que las imágenes y el documento salgan siempre de
 * la misma ejecución.
 */
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');

const ANCHO = 1440;
const ALTO = 900;

/* ─────────────────────────────── Iconos ─────────────────────────────────── */

const TRAZOS = {
  dash: '<rect x="3" y="3" width="7" height="9" rx="1.6"/><rect x="14" y="3" width="7" height="5" rx="1.6"/><rect x="14" y="12" width="7" height="9" rx="1.6"/><rect x="3" y="16" width="7" height="5" rx="1.6"/>',
  funnel: '<path d="M3 4h18l-7 8.6V20l-4 2v-9.4L3 4Z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  user: '<circle cx="12" cy="8" r="4.5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M9 6h.01M15 6h.01M9 10h.01M15 10h.01M9 14h.01M15 14h.01"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M9 13h6M9 17h6"/>',
  contract: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v5h5M8 13h8M8 17h5"/>',
  check: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  megaphone: '<path d="M3 11l18-5v12L3 14v-3Z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  chart: '<path d="M12 20V10M18 20V4M6 20v-4"/>',
  zap: '<path d="M13 2 3 14h8l-1 8 10-12h-8l1-8Z"/>',
  search: '<circle cx="11" cy="11" r="7.5"/><path d="M21 21l-4.5-4.5"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  video: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m16 10 6-3v10l-6-3"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  alert: '<path d="M10.3 3.2 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.2a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.8 2.8M14.9 14.9l2.8 2.8M17.7 6.3l-2.8 2.8M9.1 14.9l-2.8 2.8"/>',
  trending: '<path d="M3 17l6-6 4 4 8-8"/><path d="M17 7h4v4"/>',
  euro: '<path d="M18 5a7 7 0 1 0 0 14"/><path d="M3 10h11M3 14h9"/>',
  more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  grip: '<circle cx="9" cy="6" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="9" cy="18" r="1.3"/><circle cx="15" cy="6" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="15" cy="18" r="1.3"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="2.6"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  home: '<path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
};

function icon(nombre, tam = 18) {
  return `<svg class="ic" width="${tam}" height="${tam}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${TRAZOS[nombre] || ''}</svg>`;
}

/* ─────────────────────────────── Estilos ────────────────────────────────── */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --azul:#2563eb; --azul-osc:#1d4ed8; --tinta:#0f172a; --gris:#64748b; --gris2:#94a3b8;
  --linea:#e6ebf2; --fondo:#f6f8fb; --verde:#059669; --ambar:#d97706; --rojo:#dc2626;
  --cian:#0891b2;
}
body{font-family:'Inter','Segoe UI',Arial,sans-serif;background:var(--fondo);color:var(--tinta);-webkit-font-smoothing:antialiased}
.screen{width:${ANCHO}px;height:${ALTO}px;display:flex;overflow:hidden;background:var(--fondo);position:relative}
.ic{flex:0 0 auto}
.muted{color:var(--gris)} .tiny{font-size:11px} .mini{font-size:10.5px}
.spacer{flex:1}
.num{font-variant-numeric:tabular-nums}

/* ── Barra lateral ───────────────────────────────── */
.sidebar{width:252px;flex:0 0 252px;background:#fff;border-right:1px solid var(--linea);display:flex;flex-direction:column;padding:0 12px}
.brand{height:64px;display:flex;align-items:center;gap:10px;padding:0 8px;border-bottom:1px solid var(--linea)}
.logo{width:34px;height:34px;border-radius:10px;background:linear-gradient(140deg,#2563eb,#4f46e5 60%,#7c3aed);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:17px;box-shadow:0 6px 14px rgba(37,99,235,.28)}
.brand-txt b{display:block;font-size:14.5px;letter-spacing:.16em;font-weight:800}
.brand-txt span{display:block;font-size:8.5px;letter-spacing:.22em;color:var(--gris2);font-weight:700;margin-top:1px}
.workspace{margin:12px 4px 4px;border:1px solid var(--linea);border-radius:11px;padding:9px 10px;display:flex;align-items:center;gap:9px;background:#fbfcfe}
.workspace .wk-ic{width:26px;height:26px;border-radius:7px;background:#eef2ff;color:#4338ca;display:flex;align-items:center;justify-content:center}
.workspace b{font-size:11.5px;display:block;line-height:1.2}
.workspace span{font-size:9.5px;color:var(--gris2)}
.nav{flex:1;overflow:hidden;padding-top:8px}
.nav-label{font-size:8.5px;font-weight:800;letter-spacing:.17em;color:#a8b3c4;padding:12px 12px 6px}
.nav-item{display:flex;align-items:center;gap:10px;padding:8px 11px;border-radius:9px;font-size:12px;font-weight:500;color:#3f4c61;margin-bottom:1px}
.nav-item .ic{color:#8794a8}
.nav-item.act{background:linear-gradient(120deg,#2563eb,#3b82f6);color:#fff;font-weight:600;box-shadow:0 7px 16px rgba(37,99,235,.26)}
.nav-item.act .ic{color:#fff}
.nav-item .badge{margin-left:auto;background:#eef2ff;color:#4338ca;border-radius:20px;font-size:9px;font-weight:800;padding:1px 6px}
.nav-item.act .badge{background:rgba(255,255,255,.2);color:#fff}
.plan-card{margin:8px 4px 10px;border:1px solid #dbeafe;background:linear-gradient(135deg,#eff6ff,#eef2ff);border-radius:11px;padding:10px 11px}
.plan-card b{font-size:10.5px;display:block;color:#1e3a8a}
.plan-card span{font-size:9.5px;color:#3b5bdb;display:block;margin-top:2px}
.plan-bar{height:4px;border-radius:9px;background:#dbeafe;margin-top:7px;overflow:hidden}
.plan-bar i{display:block;height:100%;width:64%;border-radius:9px;background:#2563eb}
.who{display:flex;align-items:center;gap:9px;border-top:1px solid var(--linea);padding:11px 8px 12px}
.who b{font-size:11px;display:block}
.who span{font-size:9.5px;color:var(--gris2)}
.who .ic{color:var(--gris2);margin-left:auto}

/* ── Marco principal ─────────────────────────────── */
.main{flex:1;min-width:0;display:flex;flex-direction:column}
.topbar{height:64px;flex:0 0 64px;background:rgba(255,255,255,.92);border-bottom:1px solid var(--linea);display:flex;align-items:center;gap:14px;padding:0 26px}
.crumb{font-size:11.5px;color:var(--gris2);display:flex;align-items:center;gap:7px}
.crumb b{color:#334155;font-weight:600}
.topsearch{margin-left:auto;width:238px;height:34px;border:1px solid var(--linea);background:#f8fafc;border-radius:9px;display:flex;align-items:center;gap:8px;padding:0 11px;color:#a2adbd;font-size:11.5px}
.top-ic{width:34px;height:34px;border:1px solid var(--linea);border-radius:9px;display:flex;align-items:center;justify-content:center;color:#64748b;position:relative;background:#fff}
.top-ic .ping{position:absolute;top:7px;right:8px;width:6px;height:6px;border-radius:50%;background:#ef4444;border:1.5px solid #fff}
.top-user{display:flex;align-items:center;gap:8px;padding-left:6px;border-left:1px solid var(--linea)}
.top-user .who2 b{font-size:11px;display:block}
.top-user .who2 span{font-size:9.5px;color:var(--gris2)}
.content{padding:18px 26px 16px;flex:1;min-height:0;overflow:hidden}
.page-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:12px}
.page-head h1{font-size:22px;font-weight:800;letter-spacing:-.02em;line-height:1.15}
.page-head p{font-size:12px;color:var(--gris);margin-top:4px}
.actions{display:flex;align-items:center;gap:9px}
.btn{height:36px;padding:0 14px;border-radius:9px;border:1px solid var(--linea);background:#fff;font-size:11.5px;font-weight:600;color:#334155;display:inline-flex;align-items:center;gap:7px;box-shadow:0 1px 2px rgba(15,23,42,.03)}
.btn.pri{background:var(--azul);border-color:var(--azul);color:#fff;box-shadow:0 8px 18px rgba(37,99,235,.24)}
.btn.soft{background:#eff6ff;border-color:#dbeafe;color:#1d4ed8}
.btn.sm{height:30px;padding:0 11px;font-size:10.5px;border-radius:8px}

/* ── Tarjetas y métricas ─────────────────────────── */
.card{background:#fff;border:1px solid var(--linea);border-radius:13px;box-shadow:0 1px 2px rgba(15,23,42,.03)}
.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:11px;margin-bottom:12px}
.metric{padding:11px 14px}
.metric .lab{font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--gris2);display:flex;align-items:center;justify-content:space-between}
.metric .val{font-size:20px;font-weight:800;letter-spacing:-.02em;margin-top:4px;font-variant-numeric:tabular-nums}
.metric .sub{font-size:10px;color:var(--gris);margin-top:2px}
.delta{font-size:9.5px;font-weight:700;border-radius:20px;padding:2px 6px;background:#ecfdf5;color:#047857}
.delta.warn{background:#fffbeb;color:#b45309}
.metric.hl{background:linear-gradient(135deg,#eff6ff,#eef2ff);border-color:#dbeafe}

/* ── Filtros ─────────────────────────────────────── */
.filters{display:flex;align-items:center;gap:9px;margin-bottom:11px}
.fsearch{width:322px;height:34px;border:1px solid var(--linea);border-radius:9px;background:#fff;display:flex;align-items:center;gap:8px;padding:0 11px;color:#a2adbd;font-size:11px}
.fsel{height:34px;border:1px solid var(--linea);border-radius:9px;background:#fff;display:flex;align-items:center;gap:7px;padding:0 11px;font-size:11px;color:#475569;font-weight:500}
.fsel .ic{color:#94a3b8}
.viewtog{margin-left:auto;display:flex;background:#eef2f7;border-radius:9px;padding:3px;gap:2px}
.viewtog span{font-size:10.5px;font-weight:600;padding:5px 10px;border-radius:7px;color:#64748b;display:flex;align-items:center;gap:5px}
.viewtog span.on{background:#fff;color:#1e293b;box-shadow:0 1px 3px rgba(15,23,42,.12)}

/* ── Embudo ──────────────────────────────────────── */
.board{display:flex;gap:13px;min-height:0}
.col{width:270px;flex:0 0 270px;border:1.5px dashed #dbe3ee;border-radius:12px;padding:11px;background:rgba(255,255,255,.45)}
.col-head{display:flex;align-items:center;gap:7px;margin-bottom:3px}
.col-head .dot{width:8px;height:8px;border-radius:50%}
.col-head b{font-size:12px;font-weight:700}
.col-head .count{font-size:9px;font-weight:800;background:#eef2f7;color:#475569;border-radius:20px;padding:1px 6px}
.col-head .prob{margin-left:auto;font-size:9.5px;color:var(--gris2);font-weight:600}
.col-val{font-size:11px;color:#475569;font-weight:700;margin:0 0 9px 15px;font-variant-numeric:tabular-nums}
.deal{background:#fff;border:1px solid var(--linea);border-radius:10px;padding:10px 11px;margin-bottom:8px;box-shadow:0 1px 2px rgba(15,23,42,.04)}
.deal.hot{border-left:3px solid #f59e0b}
.deal-top{display:flex;gap:8px;align-items:flex-start}
.deal-title{font-size:11.5px;font-weight:650;line-height:1.3;flex:1}
.deal .grip{color:#cbd5e1;margin-top:-1px}
.deal-sub{font-size:10px;color:var(--gris);margin:2px 0 7px}
.deal-row{display:flex;align-items:center;justify-content:space-between}
.deal-val{font-size:14px;font-weight:800;letter-spacing:-.01em;font-variant-numeric:tabular-nums}
.pill{font-size:9px;font-weight:700;border-radius:20px;padding:2px 7px;background:#eff6ff;color:#1d4ed8}
.pill.amb{background:#fffbeb;color:#b45309}
.pill.grn{background:#ecfdf5;color:#047857}
.deal-foot{display:flex;align-items:center;gap:6px;margin-top:8px;padding-top:7px;border-top:1px solid #f1f5f9;font-size:9.5px;color:var(--gris)}
.avatar{width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;color:#fff;background:var(--c,#64748b)}
.avatar.sm{width:19px;height:19px;font-size:8px}
.avatar.lg{width:44px;height:44px;font-size:14px;border-radius:13px}
.health{width:7px;height:7px;border-radius:50%;display:inline-block}
.health.ok{background:#10b981}.health.warn{background:#f59e0b}.health.bad{background:#ef4444}

/* ── Ficha del lead ──────────────────────────────── */
.lead-head{display:flex;align-items:center;gap:14px;padding:15px 17px;margin-bottom:13px}
.lead-id h1{font-size:20px;font-weight:800;letter-spacing:-.02em}
.lead-id .sub{font-size:11.5px;color:var(--gris);margin-top:2px}
.chips{display:flex;gap:6px;margin-top:7px}
.chip{font-size:9.5px;font-weight:600;border-radius:20px;padding:3px 8px;background:#f1f5f9;color:#475569}
.chip.grn{background:#ecfdf5;color:#047857}
.chip.blu{background:#eff6ff;color:#1d4ed8}
.chip.amb{background:#fffbeb;color:#b45309}
.two{display:grid;grid-template-columns:1fr 342px;gap:13px}
.stack{display:flex;flex-direction:column;gap:12px}
.panel-head{display:flex;align-items:center;justify-content:space-between;padding:11px 14px;border-bottom:1px solid #f1f5f9}
.panel-head b{font-size:11.5px;font-weight:700;display:flex;align-items:center;gap:6px}
.panel-body{padding:11px 14px}
.next{background:linear-gradient(135deg,#eff6ff,#f5f8ff);border:1px solid #bfdbfe;border-radius:13px;padding:14px 16px;display:flex;gap:12px;align-items:flex-start}
.next .n-ic{width:34px;height:34px;border-radius:10px;background:#2563eb;color:#fff;display:flex;align-items:center;justify-content:center;flex:0 0 34px}
.next .lab{font-size:9px;font-weight:800;letter-spacing:.13em;color:#1d4ed8;text-transform:uppercase}
.next h3{font-size:15px;font-weight:750;margin:3px 0 2px;letter-spacing:-.01em}
.next p{font-size:10.5px;color:#475569}
.next .n-actions{display:flex;gap:7px;margin-top:9px}
.timeline{display:flex;flex-direction:column;gap:0}
.tl{display:flex;gap:11px;padding:9px 0;border-bottom:1px solid #f4f7fb}
.tl:last-child{border-bottom:0}
.tl-ic{width:27px;height:27px;border-radius:8px;background:#f1f5f9;color:#64748b;display:flex;align-items:center;justify-content:center;flex:0 0 27px}
.tl-ic.blu{background:#eff6ff;color:#1d4ed8}.tl-ic.grn{background:#ecfdf5;color:#059669}.tl-ic.amb{background:#fffbeb;color:#b45309}
.tl b{font-size:11px;display:block}
.tl p{font-size:10px;color:var(--gris);margin-top:1px}
.tl .when{font-size:9px;color:#a2adbd;margin-left:auto;white-space:nowrap}
.score-ring{display:flex;align-items:center;gap:14px}
.ring{width:82px;height:82px;border-radius:50%;background:conic-gradient(#10b981 0 87%,#e8eef6 87% 100%);display:flex;align-items:center;justify-content:center;position:relative}
.ring:after{content:'';position:absolute;inset:7px;background:#fff;border-radius:50%}
.ring b{position:relative;z-index:1;font-size:22px;font-weight:800}
.ring span{position:relative;z-index:1;font-size:9px;color:var(--gris)}
.factor{display:flex;align-items:center;gap:8px;font-size:10px;color:#475569;margin-top:7px}
.factor .bar{flex:1;height:4px;background:#eef2f7;border-radius:9px;overflow:hidden}
.factor .bar i{display:block;height:100%;background:#10b981;border-radius:9px}
.kv{display:flex;justify-content:space-between;font-size:10.5px;padding:6px 0;border-bottom:1px solid #f4f7fb}
.kv:last-child{border:0}
.kv span{color:var(--gris2)}
.task{display:flex;gap:8px;align-items:flex-start;font-size:10.5px;padding:6px 0}
.box{width:13px;height:13px;border:1.5px solid #cbd5e1;border-radius:4px;flex:0 0 13px;margin-top:1px}
.box.on{background:#2563eb;border-color:#2563eb;position:relative}
.box.on:after{content:'';position:absolute;left:3px;top:0.5px;width:4px;height:7px;border:1.7px solid #fff;border-top:0;border-left:0;transform:rotate(42deg)}

/* ── Mi día ──────────────────────────────────────── */
.prio{display:flex;gap:12px;padding:11px 0;border-bottom:1px solid #f4f7fb;align-items:flex-start}
.prio:last-child{border:0}
.prio .n{width:24px;height:24px;border-radius:50%;background:#eff6ff;color:#1d4ed8;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;flex:0 0 24px}
.prio b{font-size:11.5px;display:block}
.prio p{font-size:10px;color:var(--gris);margin-top:2px}
.prio .amt{font-size:11px;font-weight:800;margin-left:auto;white-space:nowrap}
.agenda{display:flex;gap:10px;padding:9px 0;border-bottom:1px solid #f4f7fb}
.agenda:last-child{border:0}
.agenda .hr{font-size:10px;font-weight:800;color:#475569;width:38px;flex:0 0 38px}
.agenda .ln{width:3px;border-radius:4px;background:#2563eb;flex:0 0 3px}
.agenda .ln.g{background:#10b981}.agenda .ln.a{background:#f59e0b}
.agenda b{font-size:10.5px;display:block}
.agenda span{font-size:9.5px;color:var(--gris)}
.alert{display:flex;gap:9px;padding:9px 11px;border-radius:9px;background:#fffbeb;border:1px solid #fde68a;margin-bottom:8px}
.alert:last-child{margin:0}
.alert .ic{color:#b45309;margin-top:1px}
.alert b{font-size:10.5px;color:#92400e;display:block}
.alert span{font-size:9.5px;color:#a16207}

/* ── Resultados ──────────────────────────────────── */
.grid2{display:grid;grid-template-columns:1.35fr 1fr;gap:12px}
.funnel-row{display:flex;align-items:center;gap:9px;margin-bottom:7px}
.funnel-row .nm{font-size:10.5px;width:104px;color:#475569;flex:0 0 104px}
.funnel-row .track{flex:1;height:19px;background:#f1f5f9;border-radius:6px;overflow:hidden}
.funnel-row .track i{display:block;height:100%;border-radius:6px;background:linear-gradient(90deg,#3b82f6,#6366f1)}
.funnel-row .track i.g{background:linear-gradient(90deg,#10b981,#059669)}
.funnel-row .vv{font-size:10px;font-weight:700;width:74px;text-align:right;color:#334155}
.bars{display:flex;align-items:flex-end;gap:14px;height:104px;padding:0 4px}
.barcol{flex:1;display:flex;flex-direction:column;align-items:center;gap:5px}
.barcol .bar{width:100%;border-radius:6px 6px 3px 3px;background:#dbeafe}
.barcol .bar.on{background:linear-gradient(180deg,#3b82f6,#2563eb)}
.barcol .lb{font-size:9px;color:var(--gris2);font-weight:600}
.barcol .vl{font-size:9.5px;font-weight:700;color:#334155}
table{width:100%;border-collapse:collapse}
th{font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:var(--gris2);text-align:left;padding:6px 10px;border-bottom:1px solid var(--linea)}
td{font-size:10.5px;padding:6px 10px;border-bottom:1px solid #f4f7fb;color:#334155}
tr:last-child td{border:0}
td.r,th.r{text-align:right}
.trackline{height:5px;border-radius:9px;background:#eef2f7;overflow:hidden;width:96px}
.trackline i{display:block;height:100%;background:#2563eb;border-radius:9px}

/* ── Automatizaciones ────────────────────────────── */
.auto{display:flex;gap:12px;padding:13px 14px;border-bottom:1px solid #f1f5f9;align-items:flex-start}
.auto:last-child{border:0}
.auto .a-ic{width:34px;height:34px;border-radius:10px;background:#eff6ff;color:#1d4ed8;display:flex;align-items:center;justify-content:center;flex:0 0 34px}
.auto .a-ic.g{background:#ecfdf5;color:#047857}
.auto .a-ic.a{background:#fffbeb;color:#b45309}
.auto .a-ic.v{background:#f5f3ff;color:#6d28d9}
.auto b{font-size:11.5px;display:block}
.auto .flow{font-size:10px;color:var(--gris);margin-top:3px}
.auto .flow em{font-style:normal;color:#334155;font-weight:600}
.auto .meta{font-size:9px;color:#a2adbd;margin-top:5px;display:flex;gap:9px;align-items:center}
.toggle{margin-left:auto;width:34px;height:19px;border-radius:20px;background:#2563eb;position:relative;flex:0 0 34px}
.toggle:after{content:'';position:absolute;width:15px;height:15px;border-radius:50%;background:#fff;top:2px;right:2px}
.toggle.off{background:#cbd5e1}
.toggle.off:after{right:auto;left:2px}
.step{display:flex;gap:9px;padding:8px 0;font-size:10.5px;color:#475569}
.step b{display:block;font-size:10.5px;color:#1e293b}
.step .sn{width:20px;height:20px;border-radius:50%;background:#eff6ff;color:#1d4ed8;font-size:9.5px;font-weight:800;display:flex;align-items:center;justify-content:center;flex:0 0 20px}

/* ── Cotización ──────────────────────────────────── */
.doc-head{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px}
.doc-head h1{font-size:21px;font-weight:800;letter-spacing:-.02em}
.doc-head .sub{font-size:11px;color:var(--gris);margin-top:3px}
.client{display:flex;gap:11px;align-items:center;padding:13px 15px}
.client b{font-size:12px;display:block}
.client span{font-size:10px;color:var(--gris)}
.lines th{background:#f8fafc}
.lines td{padding:8px 10px}
.lines .desc b{font-size:10.5px;display:block;font-weight:600}
.lines .desc span{font-size:9px;color:var(--gris2)}
.totals{width:300px;margin-left:auto;padding:4px 15px 12px}
.tot{display:flex;justify-content:space-between;font-size:10.5px;padding:4px 0;color:#475569}
.tot.big{font-size:15px;font-weight:800;color:#0f172a;border-top:1px solid var(--linea);margin-top:5px;padding-top:9px}
.doc-actions{display:flex;gap:7px;padding:11px 15px;border-top:1px solid #f1f5f9;background:#fbfcfe;border-radius:0 0 13px 13px}
.note{font-size:9.5px;color:var(--gris);line-height:1.5}
.opened{display:flex;gap:8px;align-items:center;font-size:10px;color:#047857;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:7px 9px;margin-top:9px}
`;

/* ─────────────────────────── Piezas comunes ─────────────────────────────── */

function navItem(nombre, ic, activo = false, extra = '') {
  return `<div class="nav-item${activo ? ' act' : ''}">${icon(ic, 16)}<span>${nombre}</span>${extra}</div>`;
}

function sidebar(activo) {
  return `<aside class="sidebar">
    <div class="brand">
      <div class="logo">V</div>
      <div class="brand-txt"><b>VOLKERN</b><span>CRM &amp; VENTAS</span></div>
    </div>
    <div class="workspace">
      <div class="wk-ic">${icon('building', 15)}</div>
      <div><b>Dimension eXpert</b><span>Equipo comercial</span></div>
      ${icon('chevron', 13)}
    </div>
    <div class="nav">
      ${navItem('Global', 'dash', activo === 'global')}
      <div class="nav-label">VENTAS</div>
      ${navItem('Embudo', 'funnel', activo === 'embudo', '<span class="badge">24</span>')}
      ${navItem('Leads', 'users', activo === 'leads', '<span class="badge">18</span>')}
      ${navItem('Contactos', 'user', activo === 'contactos')}
      ${navItem('Empresas', 'building', activo === 'empresas')}
      ${navItem('Cotizaciones', 'file', activo === 'cotizaciones')}
      ${navItem('Contratos', 'contract', activo === 'contratos')}
      <div class="nav-label">ORGANIZACIÓN</div>
      ${navItem('Mi día', 'check', activo === 'dia')}
      ${navItem('Tareas', 'check', activo === 'tareas')}
      ${navItem('Citas', 'calendar', activo === 'citas')}
      ${navItem('Campañas', 'megaphone', activo === 'campanas')}
      <div class="nav-label">ANÁLISIS</div>
      ${navItem('Resultados', 'chart', activo === 'resultados')}
      ${navItem('Automatizaciones', 'zap', activo === 'automatizaciones')}
    </div>
    <div class="plan-card">
      <b>Prueba de 14 días</b>
      <span>Quedan 9 días · sin tarjeta</span>
      <div class="plan-bar"><i></i></div>
    </div>
    <div class="who">
      <div class="avatar" style="--c:#2563eb">LM</div>
      <div><b>Laura Martín</b><span>Directora comercial</span></div>
      ${icon('chevron', 13)}
    </div>
  </aside>`;
}

function topbar(miga, usuario = 'Laura Martín', rol = 'Directora comercial') {
  return `<header class="topbar">
    <div class="crumb">Ventas ${icon('chevron', 12)} <b>${miga}</b></div>
    <div class="topsearch">${icon('search', 15)}<span>Buscar leads, empresas, negocios…</span></div>
    <div class="top-ic">${icon('bell', 16)}<span class="ping"></span></div>
    <div class="top-ic">${icon('settings', 16)}</div>
    <div class="top-user">
      <div class="avatar" style="--c:#2563eb">LM</div>
      <div class="who2"><b>${usuario}</b><span>${rol}</span></div>
      ${icon('chevron', 12)}
    </div>
  </header>`;
}

function metrica(label, valor, sub, extra = '', hl = false) {
  return `<div class="card metric${hl ? ' hl' : ''}">
    <div class="lab">${label}${extra}</div>
    <div class="val">${valor}</div>
    <div class="sub">${sub}</div>
  </div>`;
}

function avatar(iniciales, color, clase = '') {
  return `<div class="avatar ${clase}" style="--c:${color}">${iniciales}</div>`;
}

/* ───────────────────────────── Pantalla 1 ───────────────────────────────── */

function pantallaEmbudo() {
  const columnas = [
    {
      nombre: 'Calificación', color: '#94a3b8', prob: '10 %', total: '74.200 €',
      deals: [
        { t: 'Renovación de flota', e: 'Grupo Atlántida', v: '24.000 €', p: '10 %', d: 'hace 2 d', who: 'AR', c: '#2563eb', h: 'ok', hot: false },
        { t: 'Pack de bienvenida', e: 'Hotel Miramar', v: '8.400 €', p: '10 %', d: 'hace 4 d', who: 'LG', c: '#7c3aed', h: 'warn', hot: false },
        { t: 'Ampliación de sede', e: 'Nortec', v: '18.800 €', p: '10 %', d: 'ayer', who: 'MS', c: '#0891b2', h: 'ok', hot: false },
      ],
    },
    {
      nombre: 'Contacto inicial', color: '#3b82f6', prob: '25 %', total: '96.500 €',
      deals: [
        { t: 'Implantación CRM', e: 'Clínica Sana', v: '32.000 €', p: '25 %', d: 'hace 1 d', who: 'MS', c: '#0891b2', h: 'ok', hot: true },
        { t: 'Acuerdo marco anual', e: 'Logística Peñalba', v: '41.500 €', p: '25 %', d: 'hace 6 d', who: 'DM', c: '#059669', h: 'warn', hot: false },
        { t: 'Plan de crecimiento', e: 'Estudio Ábaco', v: '23.000 €', p: '25 %', d: 'hace 3 d', who: 'LM', c: '#2563eb', h: 'ok', hot: false },
      ],
    },
    {
      nombre: 'Propuesta', color: '#8b5cf6', prob: '50 %', total: '128.300 €',
      deals: [
        { t: 'Digitalización de tiendas', e: 'Moda Sur', v: '58.300 €', p: '50 %', d: 'enviada hace 2 d', who: 'LM', c: '#2563eb', h: 'ok', hot: true },
        { t: 'Licencias · 120 puestos', e: 'Vetra', v: '70.000 €', p: '50 %', d: 'enviada hace 5 d', who: 'AR', c: '#2563eb', h: 'warn', hot: false },
      ],
    },
    {
      nombre: 'Negociación', color: '#f59e0b', prob: '75 %', total: '87.400 €',
      deals: [
        { t: 'Renovación anual', e: 'Grupo Norte', v: '46.900 €', p: '75 %', d: 'cierre el 24 oct', who: 'AR', c: '#2563eb', h: 'ok', hot: true },
        { t: 'Servicio premium', e: 'Estudio Ábaco', v: '40.500 €', p: '75 %', d: 'cierre el 30 oct', who: 'LG', c: '#7c3aed', h: 'ok', hot: false },
      ],
    },
  ];

  return `<section class="screen" id="embudo">
    ${sidebar('embudo')}
    <div class="main">
      ${topbar('Embudo')}
      <div class="content">
        <div class="page-head">
          <div>
            <h1>Embudo de ventas</h1>
            <p>Todo lo que está en juego, ordenado por etapa y por probabilidad de cierre.</p>
          </div>
          <div class="actions">
            <button class="btn">${icon('settings', 15)} Configurar etapas</button>
            <button class="btn pri">${icon('plus', 15)} Nuevo negocio</button>
          </div>
        </div>
        <div class="metrics">
          ${metrica('Oportunidades activas', '24', 'en 4 etapas abiertas', '<span class="delta">+3 este mes</span>')}
          ${metrica('Valor en juego', '386.400 €', 'suma de todo el embudo', '<span class="delta">+12,4 %</span>')}
          ${metrica('Previsión ponderada', '168.900 €', 'según la probabilidad de cada etapa', '<span class="delta">sobre objetivo</span>', true)}
          ${metrica('Objetivo del mes', '210.000 €', 'faltan 41.200 € para llegar', '<span class="delta warn">8 días</span>')}
        </div>
        <div class="filters">
          <div class="fsearch">${icon('search', 15)}<span>Buscar negocios, leads, empresas…</span></div>
          <div class="fsel">${icon('filter', 14)} Todas las prioridades ${icon('chevron', 12)}</div>
          <div class="fsel"><span class="health ok"></span> Salud del negocio ${icon('chevron', 12)}</div>
          <div class="fsel">${icon('user', 14)} Todo el equipo ${icon('chevron', 12)}</div>
          <div class="viewtog"><span class="on">${icon('funnel', 13)} Tablero</span><span>${icon('chart', 13)} Lista</span></div>
        </div>
        <div class="board">
          ${columnas.map((col) => `
            <div class="col">
              <div class="col-head">
                <span class="dot" style="background:${col.color}"></span>
                <b>${col.nombre}</b>
                <span class="count">${col.deals.length}</span>
                <span class="prob">${col.prob}</span>
              </div>
              <div class="col-val">${col.total}</div>
              ${col.deals.map((d) => `
                <div class="deal${d.hot ? ' hot' : ''}">
                  <div class="deal-top">
                    <div class="deal-title">${d.t}</div>
                    <div class="grip">${icon('grip', 13)}</div>
                  </div>
                  <div class="deal-sub">${d.e}</div>
                  <div class="deal-row">
                    <div class="deal-val">${d.v}</div>
                    <span class="pill">${d.p}</span>
                  </div>
                  <div class="deal-foot">
                    ${avatar(d.who, d.c, 'sm')}
                    <span>${d.d}</span>
                    <span class="spacer"></span>
                    <span class="health ${d.h}"></span>
                  </div>
                </div>`).join('')}
            </div>`).join('')}
        </div>
      </div>
    </div>
  </section>`;
}

/* ───────────────────────────── Pantalla 2 ───────────────────────────────── */

function pantallaLead() {
  return `<section class="screen" id="lead">
    ${sidebar('leads')}
    <div class="main">
      ${topbar('Leads · Marta Sánchez')}
      <div class="content">
        <div class="card lead-head">
          <div class="avatar lg" style="--c:#0891b2">MS</div>
          <div class="lead-id">
            <h1>Marta Sánchez</h1>
            <div class="sub">Directora de Operaciones · Clínica Sana · Madrid</div>
            <div class="chips">
              <span class="chip grn">Lead calificado</span>
              <span class="chip blu">Interés alto</span>
              <span class="chip">Asignado a Laura</span>
              <span class="chip amb">Creado hace 12 días</span>
            </div>
          </div>
          <div class="actions" style="margin-left:auto">
            <button class="btn">${icon('phone', 15)} Llamar</button>
            <button class="btn">${icon('mail', 15)} Email</button>
            <button class="btn pri">${icon('plus', 15)} Crear oportunidad</button>
          </div>
        </div>

        <div class="two">
          <div class="stack">
            <div class="next">
              <div class="n-ic">${icon('target', 18)}</div>
              <div style="flex:1">
                <div class="lab">Siguiente paso recomendado</div>
                <h3>Llamar hoy antes de las 12:00</h3>
                <p>El presupuesto ya está aprobado y la decisión se toma esta semana. Es el momento de cerrar la reunión con su director financiero.</p>
                <div class="n-actions">
                  <button class="btn sm pri">${icon('check', 13)} Marcar hecho</button>
                  <button class="btn sm">${icon('clock', 13)} Reprogramar</button>
                  <button class="btn sm">Ver por qué</button>
                </div>
              </div>
            </div>

            <div class="card">
              <div class="panel-head"><b>${icon('clock', 14)} Actividad con este lead</b><span class="tiny muted">Últimos 12 días</span></div>
              <div class="panel-body timeline">
                <div class="tl">
                  <div class="tl-ic grn">${icon('check', 14)}</div>
                  <div><b>Reunión de 45 minutos · presupuesto aprobado</b><p>Asistieron Marta y su director financiero. Piden empezar en noviembre.</p></div>
                  <div class="when">Ayer</div>
                </div>
                <div class="tl">
                  <div class="tl-ic blu">${icon('mail', 14)}</div>
                  <div><b>Abrió la propuesta 3 veces</b><p>Última apertura hoy a las 09:12. Señal clara de que la está revisando.</p></div>
                  <div class="when">Hoy</div>
                </div>
                <div class="tl">
                  <div class="tl-ic blu">${icon('phone', 14)}</div>
                  <div><b>Llamada de 12 minutos</b><p>Nos cuenta que comparan con otra herramienta. Le preocupa la formación del equipo.</p></div>
                  <div class="when">Hace 4 días</div>
                </div>
                <div class="tl">
                  <div class="tl-ic amb">${icon('message', 14)}</div>
                  <div><b>Nota del comercial</b><p>“Prefiere hablar por la mañana. No tomar decisiones sin ver una demo con su equipo.”</p></div>
                  <div class="when">Hace 6 días</div>
                </div>
              </div>
            </div>

            <div class="card">
              <div class="panel-head"><b>${icon('funnel', 14)} Oportunidad abierta</b><span class="pill amb">Propuesta enviada</span></div>
              <div class="panel-body" style="display:flex;align-items:center;gap:14px">
                <div style="flex:1">
                  <b style="font-size:12px">Implantación CRM · Clínica Sana</b>
                  <p class="tiny muted" style="margin-top:3px">32.000 € · 50 % de probabilidad · cierre previsto el 31 de octubre</p>
                </div>
                <button class="btn sm">Abrir negocio ${icon('arrow', 13)}</button>
              </div>
            </div>
          </div>

          <div class="stack">
            <div class="card">
              <div class="panel-head"><b>${icon('spark', 14)} Puntuación del lead</b><span class="chip grn">87 / 100</span></div>
              <div class="panel-body">
                <div class="score-ring">
                  <div class="ring"><b>87</b><span>/100</span></div>
                  <div>
                    <b style="font-size:11.5px">Intención de compra alta</b>
                    <p class="tiny muted" style="margin-top:2px">Ha pasado el filtro comercial: merece una llamada hoy.</p>
                  </div>
                </div>
                <div style="margin-top:11px">
                  <div class="factor"><span>Reunión realizada</span><span class="bar"><i style="width:100%"></i></span><b>+25</b></div>
                  <div class="factor"><span>Presupuesto aprobado</span><span class="bar"><i style="width:92%"></i></span><b>+22</b></div>
                  <div class="factor"><span>Abrió la propuesta</span><span class="bar"><i style="width:78%"></i></span><b>+18</b></div>
                  <div class="factor"><span>Datos completos</span><span class="bar"><i style="width:60%"></i></span><b>+12</b></div>
                </div>
              </div>
            </div>

            <div class="card">
              <div class="panel-head"><b>Datos de contacto</b><span class="tiny muted">Ver ficha</span></div>
              <div class="panel-body">
                <div class="kv"><span>Email</span><b>marta@clinicasana.es</b></div>
                <div class="kv"><span>Teléfono</span><b>+34 612 44 90 18</b></div>
                <div class="kv"><span>Empresa</span><b>Clínica Sana</b></div>
                <div class="kv"><span>Origen</span><b>Formulario de la web</b></div>
              </div>
            </div>

            <div class="card">
              <div class="panel-head"><b>Tareas</b><span class="tiny muted">2 pendientes</span></div>
              <div class="panel-body">
                <div class="task"><span class="box"></span><span>Llamar antes de las 12:00<br><span class="tiny muted">Hoy · prioridad alta</span></span></div>
                <div class="task"><span class="box"></span><span>Enviar agenda de la demo<br><span class="tiny muted">Mañana · 10:00</span></span></div>
                <div class="task"><span class="box on"></span><span style="text-decoration:line-through;color:#94a3b8">Confirmar recepción de la propuesta</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>`;
}

/* ───────────────────────────── Pantalla 3 ───────────────────────────────── */

function pantallaDia() {
  return `<section class="screen" id="dia">
    ${sidebar('dia')}
    <div class="main">
      ${topbar('Mi día')}
      <div class="content">
        <div class="page-head">
          <div>
            <h1>Mi día</h1>
            <p>Lunes, 19 de octubre · 6 tareas, 3 citas y 2 avisos que no deberías dejar pasar.</p>
          </div>
          <div class="actions">
            <button class="btn">${icon('calendar', 15)} Ver agenda</button>
            <button class="btn pri">${icon('plus', 15)} Añadir tarea</button>
          </div>
        </div>
        <div class="two">
          <div class="stack">
            <div class="card">
              <div class="panel-head">
                <b>${icon('spark', 14)} Tus tres prioridades de hoy</b>
                <span class="chip blu">Sugeridas por tu asistente</span>
              </div>
              <div class="panel-body">
                <div class="pri">
                  <div class="n">1</div>
                  <div><b>Llamar a Marta Sánchez · Clínica Sana</b><p>Presupuesto aprobado y decisión esta semana. Es la oportunidad más caliente del embudo.</p></div>
                  <div class="amt">32.000 €</div>
                </div>
                <div class="pri">
                  <div class="n">2</div>
                  <div><b>Reactivar propuesta de Vetra</b><p>Sin respuesta desde hace 5 días. La propuesta caduca el viernes.</p></div>
                  <div class="amt">70.000 €</div>
                </div>
                <div class="pri">
                  <div class="n">3</div>
                  <div><b>Preparar la renovación de Grupo Norte</b><p>Se reúne el comité el jueves. Falta enviar el resumen de resultados.</p></div>
                  <div class="amt">46.900 €</div>
                </div>
              </div>
            </div>

            <div class="card">
              <div class="panel-head"><b>${icon('check', 14)} Pendientes de hoy</b><span class="tiny muted">3 de 6 completadas</span></div>
              <div class="panel-body">
                <div class="task"><span class="box on"></span><span style="text-decoration:line-through;color:#94a3b8">Revisar los leads nuevos del fin de semana</span><span class="spacer"></span><span class="tiny muted">08:45</span></div>
                <div class="task"><span class="box"></span><span>Llamar a Marta Sánchez</span><span class="spacer"></span><span class="tiny" style="color:#b45309;font-weight:700">09:30</span></div>
                <div class="task"><span class="box"></span><span>Enviar propuesta actualizada a Vetra</span><span class="spacer"></span><span class="tiny muted">11:00</span></div>
                <div class="task"><span class="box"></span><span>Reunión interna de previsión mensual</span><span class="spacer"></span><span class="tiny muted">12:30</span></div>
                <div class="task"><span class="box"></span><span>Preparar la demo de Clínica Sana</span><span class="spacer"></span><span class="tiny muted">16:00</span></div>
                <div class="task"><span class="box on"></span><span style="text-decoration:line-through;color:#94a3b8">Responder al email de Logística Peñalba</span></div>
              </div>
            </div>
          </div>

          <div class="stack">
            <div class="card">
              <div class="panel-head"><b>${icon('calendar', 14)} Agenda</b><span class="tiny muted">Hoy</span></div>
              <div class="panel-body">
                <div class="agenda"><div class="hr">09:30</div><div class="ln"></div><div><b>Llamada · Clínica Sana</b><span>Marta Sánchez · 20 min</span></div></div>
                <div class="agenda"><div class="hr">11:30</div><div class="ln g"></div><div><b>Demo · Moda Sur</b><span>Equipo de operaciones · 45 min</span></div></div>
                <div class="agenda"><div class="hr">16:00</div><div class="ln a"></div><div><b>Revisión interna</b><span>Previsión del mes · 30 min</span></div></div>
              </div>
            </div>

            <div class="card">
              <div class="panel-head"><b>${icon('alert', 14)} Avisos</b><span class="chip amb">2</span></div>
              <div class="panel-body">
                <div class="alert">${icon('clock', 15)}<div><b>3 oportunidades sin contacto en 7 días</b><span>Juntas suman 64.500 €. Ábrelas antes del viernes.</span></div></div>
                <div class="alert">${icon('file', 15)}<div><b>La propuesta de Vetra caduca en 4 días</b><span>Sin respuesta desde el 14 de octubre.</span></div></div>
              </div>
            </div>

            <div class="card">
              <div class="panel-head"><b>${icon('trending', 14)} Tu mes</b><span class="tiny muted">Octubre</span></div>
              <div class="panel-body">
                <div class="kv"><span>Cerrado</span><b>94.600 €</b></div>
                <div class="kv"><span>Previsión</span><b>168.900 €</b></div>
                <div class="kv"><span>Objetivo</span><b>210.000 €</b></div>
                <div class="plan-bar" style="margin-top:9px;background:#e8eef6"><i style="width:45%;background:#2563eb"></i></div>
                <p class="mini muted" style="margin-top:6px">45 % del objetivo · quedan 8 días</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>`;
}

/* ───────────────────────────── Pantalla 4 ───────────────────────────────── */

function pantallaResultados() {
  return `<section class="screen" id="resultados">
    ${sidebar('resultados')}
    <div class="main">
      ${topbar('Resultados')}
      <div class="content">
        <div class="page-head">
          <div>
            <h1>Resultados del equipo</h1>
            <p>Cómo va el mes, quién necesita ayuda y qué se puede corregir a tiempo.</p>
          </div>
          <div class="actions">
            <div class="fsel">${icon('calendar', 14)} Este mes ${icon('chevron', 12)}</div>
            <button class="btn">${icon('download', 15)} Exportar</button>
          </div>
        </div>
        <div class="metrics">
          ${metrica('Cerrado este mes', '94.600 €', '12 operaciones ganadas', '<span class="delta">+18 % vs. septiembre</span>')}
          ${metrica('Previsión del mes', '168.900 €', 'ponderada por etapa', '<span class="delta">+9 %</span>')}
          ${metrica('Tasa de cierre', '32 %', 'de las propuestas enviadas', '<span class="delta warn">-2 pts</span>')}
          ${metrica('Ticket medio', '12.400 €', 'por operación cerrada', '<span class="delta">+1.100 €</span>', true)}
        </div>
        <div class="grid2" style="margin-bottom:12px">
          <div class="card">
            <div class="panel-head"><b>${icon('funnel', 14)} Embudo del mes</b><span class="tiny muted">24 oportunidades · 386.400 €</span></div>
            <div class="panel-body">
              <div class="funnel-row"><div class="nm">Calificación</div><div class="track"><i style="width:38%"></i></div><div class="vv">9 · 74.200 €</div></div>
              <div class="funnel-row"><div class="nm">Contacto inicial</div><div class="track"><i style="width:52%"></i></div><div class="vv">8 · 96.500 €</div></div>
              <div class="funnel-row"><div class="nm">Propuesta</div><div class="track"><i style="width:68%"></i></div><div class="vv">4 · 128.300 €</div></div>
              <div class="funnel-row"><div class="nm">Negociación</div><div class="track"><i style="width:47%"></i></div><div class="vv">3 · 87.400 €</div></div>
              <div class="funnel-row"><div class="nm">Ganado</div><div class="track"><i class="g" style="width:50%"></i></div><div class="vv">12 · 94.600 €</div></div>
              <div style="display:flex;gap:14px;margin-top:12px;padding-top:10px;border-top:1px solid #f1f5f9">
                <div style="flex:1"><div class="mini muted">Motivo de pérdida más repetido</div><b style="font-size:11px">Precio (7 de 19)</b></div>
                <div style="flex:1"><div class="mini muted">Tiempo medio hasta el cierre</div><b style="font-size:11px">28 días</b></div>
              </div>
            </div>
          </div>
          <div class="card">
            <div class="panel-head"><b>${icon('chart', 14)} Cerrado por mes</b><span class="tiny muted">Últimos 6 meses</span></div>
            <div class="panel-body">
              <div class="bars">
                <div class="barcol"><span class="vl">58k</span><div class="bar" style="height:46%"></div><span class="lb">May</span></div>
                <div class="barcol"><span class="vl">64k</span><div class="bar" style="height:52%"></div><span class="lb">Jun</span></div>
                <div class="barcol"><span class="vl">71k</span><div class="bar" style="height:58%"></div><span class="lb">Jul</span></div>
                <div class="barcol"><span class="vl">68k</span><div class="bar" style="height:56%"></div><span class="lb">Ago</span></div>
                <div class="barcol"><span class="vl">80k</span><div class="bar" style="height:66%"></div><span class="lb">Sep</span></div>
                <div class="barcol"><span class="vl">94,6k</span><div class="bar on" style="height:82%"></div><span class="lb">Oct</span></div>
              </div>
              <div style="display:flex;align-items:center;gap:8px;margin-top:10px;padding-top:9px;border-top:1px solid #f1f5f9">
                <span class="health ok"></span><span class="mini muted">Objetivo anual: 1,2 M€ · vas un 6 % por delante</span>
              </div>
            </div>
          </div>
        </div>
        <div class="card">
          <div class="panel-head"><b>${icon('users', 14)} El equipo, de un vistazo</b><span class="tiny muted">Octubre · 3 comerciales</span></div>
          <div style="padding:0 4px 4px">
            <table>
              <tr><th>Comercial</th><th>Oportunidades</th><th>Cerrado</th><th>Previsión</th><th>Avance del objetivo</th><th class="r">Tasa de cierre</th></tr>
              <tr><td><div style="display:flex;align-items:center;gap:8px">${avatar('LM', '#2563eb', 'sm')} Laura Martín</div></td><td>10</td><td><b>42.300 €</b></td><td>61.200 €</td><td><div class="trackline"><i style="width:78%"></i></div></td><td class="r">38 %</td></tr>
              <tr><td><div style="display:flex;align-items:center;gap:8px">${avatar('AR', '#7c3aed', 'sm')} Ana Ruiz</div></td><td>8</td><td><b>31.800 €</b></td><td>54.400 €</td><td><div class="trackline"><i style="width:61%"></i></div></td><td class="r">31 %</td></tr>
              <tr><td><div style="display:flex;align-items:center;gap:8px">${avatar('LG', '#0891b2', 'sm')} Luis García</div></td><td>6</td><td><b>20.500 €</b></td><td>38.100 €</td><td><div class="trackline"><i style="width:44%"></i></div></td><td class="r">26 %</td></tr>
            </table>
          </div>
        </div>
      </div>
    </div>
  </section>`;
}

/* ───────────────────────────── Pantalla 5 ───────────────────────────────── */

function pantallaAutomatizaciones() {
  return `<section class="screen" id="automatizaciones">
    ${sidebar('automatizaciones')}
    <div class="main">
      ${topbar('Automatizaciones')}
      <div class="content">
        <div class="page-head">
          <div>
            <h1>Automatizaciones</h1>
            <p>Lo que hoy se hace a mano o se olvida, hecho solo. Sin escribir una línea de código.</p>
          </div>
          <div class="actions">
            <button class="btn">Ver plantillas</button>
            <button class="btn pri">${icon('plus', 15)} Nueva automatización</button>
          </div>
        </div>
        <div class="two">
          <div class="card">
            <div class="panel-head"><b>${icon('zap', 14)} Reglas activas</b><span class="chip grn">4 de 4 funcionando</span></div>
            <div>
              <div class="auto">
                <div class="a-ic">${icon('users', 17)}</div>
                <div>
                  <b>Nuevo lead de la web</b>
                  <div class="flow">Cuando <em>entra un lead del formulario</em> → asignar al comercial de guardia → avisar por WhatsApp.</div>
                  <div class="meta"><span>34 ejecuciones este mes</span><span>Última: hoy, 09:12</span></div>
                </div>
                <div class="toggle"></div>
              </div>
              <div class="auto">
                <div class="a-ic a">${icon('clock', 17)}</div>
                <div>
                  <b>Propuesta sin respuesta</b>
                  <div class="flow">Cuando <em>pasan 3 días desde el envío</em> → recordatorio al comercial → email suave al cliente.</div>
                  <div class="meta"><span>12 ejecuciones este mes</span><span>Última: ayer, 08:00</span></div>
                </div>
                <div class="toggle"></div>
              </div>
              <div class="auto">
                <div class="a-ic v">${icon('alert', 17)}</div>
                <div>
                  <b>Negocio que se enfría</b>
                  <div class="flow">Cuando <em>una oportunidad lleva 7 días sin actividad</em> → marcarla en riesgo → avisar al responsable.</div>
                  <div class="meta"><span>5 ejecuciones este mes</span><span>Última: hoy, 07:30</span></div>
                </div>
                <div class="toggle"></div>
              </div>
              <div class="auto">
                <div class="a-ic g">${icon('check', 17)}</div>
                <div>
                  <b>Cierre ganado</b>
                  <div class="flow">Cuando <em>una oportunidad pasa a Ganado</em> → crear tarea de alta de cliente → avisar a administración.</div>
                  <div class="meta"><span>8 ejecuciones este mes</span><span>Última: 17 oct, 16:40</span></div>
                </div>
                <div class="toggle"></div>
              </div>
            </div>
          </div>

          <div class="stack">
            <div class="card">
              <div class="panel-head"><b>${icon('zap', 14)} Así se monta una regla</b></div>
              <div class="panel-body">
                <div class="step"><span class="sn">1</span><div><b>Elige cuándo</b>“Cuando llega un lead nuevo”, “cuando pasan 3 días”…</div></div>
                <div class="step"><span class="sn">2</span><div><b>Decide qué debe cumplirse</b>Importe, origen, prioridad, comercial asignado.</div></div>
                <div class="step"><span class="sn">3</span><div><b>Indica qué hacer</b>Asignar, avisar, crear una tarea o cambiar la etapa.</div></div>
                <div style="margin-top:8px;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:9px;padding:9px 10px" class="mini muted">Se tarda menos de dos minutos. Y se puede pausar cuando quieras.</div>
              </div>
            </div>
            <div class="card">
              <div class="panel-head"><b>Plantillas listas para usar</b></div>
              <div class="panel-body" style="padding-top:6px">
                <div class="task"><span class="chip blu">Leads</span><span style="margin-left:6px">Reparto automático por turno</span></div>
                <div class="task"><span class="chip blu">Propuestas</span><span style="margin-left:6px">Recordatorio a los 3 días</span></div>
                <div class="task"><span class="chip blu">Cierres</span><span style="margin-left:6px">Alta de cliente y aviso interno</span></div>
                <div class="task"><span class="chip blu">Renovaciones</span><span style="margin-left:6px">Aviso 30 días antes</span></div>
              </div>
            </div>
            <div class="card" style="background:linear-gradient(135deg,#eff6ff,#eef2ff);border-color:#dbeafe">
              <div class="panel-body">
                <b style="font-size:11px;color:#1e3a8a">La regla de oro</b>
                <p class="mini" style="color:#3b5bdb;margin-top:3px;line-height:1.55">Una automatización no sustituye al comercial: le quita de encima el trabajo que no vende.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>`;
}

/* ───────────────────────────── Pantalla 6 ───────────────────────────────── */

function pantallaCotizacion() {
  return `<section class="screen" id="cotizacion">
    ${sidebar('cotizaciones')}
    <div class="main">
      ${topbar('Cotizaciones · 2026-148')}
      <div class="content">
        <div class="doc-head">
          <div>
            <h1>Cotización 2026-148</h1>
            <div class="sub">Clínica Sana · creada el 14 de octubre de 2026 · válida hasta el 31 de octubre</div>
          </div>
          <div class="actions">
            <span class="chip blu">Enviada</span>
            <button class="btn">${icon('eye', 15)} Ver como cliente</button>
            <button class="btn pri">${icon('send', 15)} Enviar de nuevo</button>
          </div>
        </div>

        <div class="two">
          <div class="stack">
            <div class="card">
              <div class="client">
                <div class="avatar lg" style="--c:#0891b2">MS</div>
                <div style="flex:1">
                  <b>Clínica Sana</b>
                  <span>Marta Sánchez · Directora de Operaciones · marta@clinicasana.es</span>
                </div>
                <span class="chip">Cliente</span>
              </div>
            </div>

            <div class="card">
              <div class="panel-head"><b>Conceptos</b><span class="tiny muted">IVA 21 %</span></div>
              <table class="lines">
                <tr><th style="padding-left:15px">Concepto</th><th class="r">Cantidad</th><th class="r">Precio</th><th class="r" style="padding-right:15px">Importe</th></tr>
                <tr><td class="desc" style="padding-left:15px"><b>Implantación y configuración</b><span>Puesta en marcha, migración de contactos y configuración del embudo</span></td><td class="r">1</td><td class="r">12.000 €</td><td class="r" style="padding-right:15px"><b>12.000 €</b></td></tr>
                <tr><td class="desc" style="padding-left:15px"><b>Licencias · 25 usuarios</b><span>12 meses · soporte y actualizaciones incluidas</span></td><td class="r">25</td><td class="r">720 €</td><td class="r" style="padding-right:15px"><b>18.000 €</b></td></tr>
                <tr><td class="desc" style="padding-left:15px"><b>Formación del equipo</b><span>2 sesiones prácticas de 90 minutos</span></td><td class="r">2</td><td class="r">1.200 €</td><td class="r" style="padding-right:15px"><b>2.400 €</b></td></tr>
              </table>
              <div class="totals">
                <div class="tot"><span>Subtotal</span><span>32.400 €</span></div>
                <div class="tot"><span>Descuento (5 %)</span><span style="color:#047857">−1.620 €</span></div>
                <div class="tot"><span>IVA (21 %)</span><span>6.464 €</span></div>
                <div class="tot big"><span>Total</span><span>37.244 €</span></div>
              </div>
              <div class="doc-actions">
                <button class="btn sm">${icon('download', 13)} Descargar PDF</button>
                <button class="btn sm">${icon('file', 13)} Duplicar</button>
                <button class="btn sm pri" style="margin-left:auto">${icon('contract', 13)} Convertir en contrato</button>
              </div>
            </div>
          </div>

          <div class="stack">
            <div class="card">
              <div class="panel-head"><b>${icon('eye', 14)} Seguimiento</b><span class="chip grn">Abierta hoy</span></div>
              <div class="panel-body">
                <div class="opened">${icon('check', 14)} <span>El cliente ha abierto la propuesta 3 veces</span></div>
                <div class="timeline" style="margin-top:6px">
                  <div class="tl"><div class="tl-ic blu">${icon('send', 13)}</div><div><b>Enviada por email</b><p>A Marta Sánchez y a su director financiero</p></div><div class="when">14 oct</div></div>
                  <div class="tl"><div class="tl-ic amb">${icon('eye', 13)}</div><div><b>Primera apertura</b><p>2 minutos y 40 segundos en la página de precios</p></div><div class="when">15 oct</div></div>
                  <div class="tl"><div class="tl-ic blu">${icon('phone', 13)}</div><div><b>Llamada de seguimiento</b><p>Pide empezar en noviembre y formación para 25 personas</p></div><div class="when">Ayer</div></div>
                </div>
              </div>
            </div>

            <div class="card">
              <div class="panel-head"><b>${icon('target', 14)} Siguiente paso</b></div>
              <div class="panel-body">
                <b style="font-size:11.5px">Cerrar la reunión con el director financiero</b>
                <p class="mini muted" style="margin-top:3px;line-height:1.55">La propuesta está abierta y el presupuesto aprobado. Propón dos horarios para esta semana.</p>
                <div class="n-actions" style="display:flex;gap:7px;margin-top:10px">
                  <button class="btn sm pri">${icon('calendar', 13)} Proponer hora</button>
                  <button class="btn sm">${icon('mail', 13)} Escribir</button>
                </div>
              </div>
            </div>

            <div class="card">
              <div class="panel-body">
                <div class="kv"><span>Comercial</span><b>Laura Martín</b></div>
                <div class="kv"><span>Forma de pago</span><b>50 % al inicio · 50 % a 30 días</b></div>
                <div class="kv"><span>Validez</span><b>31 de octubre</b></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>`;
}

/* ───────────────────────────── Generación ───────────────────────────────── */

const PANTALLAS = [
  { id: '01-embudo', selector: 'embudo', funcion: pantallaEmbudo },
  { id: '02-ficha-lead', selector: 'lead', funcion: pantallaLead },
  { id: '03-mi-dia', selector: 'dia', funcion: pantallaDia },
  { id: '04-resultados', selector: 'resultados', funcion: pantallaResultados },
  { id: '05-automatizaciones', selector: 'automatizaciones', funcion: pantallaAutomatizaciones },
  { id: '06-cotizacion', selector: 'cotizacion', funcion: pantallaCotizacion },
];

async function generarCapturas(dirSalida) {
  fs.mkdirSync(dirSalida, { recursive: true });

  const navegador = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--font-render-hinting=none'],
  });

  const generadas = [];
  try {
    const page = await navegador.newPage();
    await page.setViewport({ width: ANCHO, height: ALTO, deviceScaleFactor: 2 });
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);

    for (const pantalla of PANTALLAS) {
      const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
        <style>${CSS}</style></head><body>${pantalla.funcion()}</body></html>`;
      await page.setContent(html, { waitUntil: 'load', timeout: 60000 });
      await page.evaluate(() => document.fonts.ready).catch(() => {});
      await new Promise((r) => setTimeout(r, 700));

      const el = await page.$(`#${pantalla.selector}`);
      if (!el) throw new Error(`No encontré la pantalla ${pantalla.id}`);

      const archivo = path.join(dirSalida, `${pantalla.id}.jpg`);
      await el.screenshot({ path: archivo, type: 'jpeg', quality: 88 });
      generadas.push(archivo);
      const kb = (fs.statSync(archivo).size / 1024).toFixed(0);
      console.log(`   · ${pantalla.id}.jpg (${kb} KB)`);
    }
  } finally {
    await navegador.close();
  }

  return generadas;
}

module.exports = { generarCapturas, PANTALLAS };

if (require.main === module) {
  const destino = process.argv[2] || path.join(__dirname, '..', '..', 'documentacion_comercial', 'img', 'crm-ventas');
  console.log(`→ Generando pantallas en ${destino} …`);
  generarCapturas(path.resolve(destino))
    .then(() => console.log('✓ Pantallas listas'))
    .catch((e) => {
      console.error('❌ Error generando las pantallas:', e.message);
      process.exit(1);
    });
}
