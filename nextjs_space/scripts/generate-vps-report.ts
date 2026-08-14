import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const HTML = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>
  @page { size: A4; margin: 20mm 18mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    font-size: 11px;
    line-height: 1.6;
    color: #1a1a2e;
    max-width: 100%;
  }

  /* ─── Cover ─── */
  .cover {
    page-break-after: always;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    text-align: center; min-height: 90vh; padding: 40px;
    background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
    color: white; border-radius: 12px;
  }
  .cover h1 { font-size: 42px; font-weight: 800; margin-bottom: 12px; letter-spacing: -1px; }
  .cover .subtitle { font-size: 18px; opacity: 0.9; margin-bottom: 40px; }
  .cover .meta { font-size: 13px; opacity: 0.7; }
  .cover .logo { font-size: 64px; margin-bottom: 20px; }

  /* ─── Sections ─── */
  h1 { font-size: 22px; font-weight: 700; color: #302b63; margin: 28px 0 14px; border-bottom: 3px solid #4F46E5; padding-bottom: 8px; }
  h2 { font-size: 16px; font-weight: 700; color: #4F46E5; margin: 22px 0 10px; }
  h3 { font-size: 13px; font-weight: 600; color: #302b63; margin: 16px 0 8px; }
  p { margin-bottom: 10px; text-align: justify; }
  ul, ol { margin: 8px 0 14px 20px; }
  li { margin-bottom: 4px; }

  /* ─── Tables ─── */
  table { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 10.5px; }
  th, td { padding: 8px 10px; border: 1px solid #d1d5db; text-align: left; }
  th { background: #4F46E5; color: white; font-weight: 600; }
  tr:nth-child(even) { background: #f3f4f6; }

  /* ─── Alert boxes ─── */
  .info, .warn, .tip { padding: 12px 16px; margin: 14px 0; border-radius: 8px; border-left: 5px solid; }
  .info { background: #eff6ff; border-color: #3b82f6; }
  .warn { background: #fffbeb; border-color: #f59e0b; }
  .tip { background: #f0fdf4; border-color: #10b981; }

  /* ─── Code blocks ─── */
  code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-family: 'Fira Code', 'Cascadia Code', monospace; }
  pre { background: #1e293b; color: #e2e8f0; padding: 14px; border-radius: 8px; overflow-x: auto; font-size: 10px; line-height: 1.5; margin: 12px 0; }
  pre code { background: none; color: inherit; padding: 0; }

  /* ─── Steps / Timeline ─── */
  .step { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; margin: 10px 0; }
  .step .number { display: inline-block; width: 28px; height: 28px; background: #4F46E5; color: white; border-radius: 50%; text-align: center; line-height: 28px; font-weight: 700; font-size: 14px; margin-right: 10px; }
  .step .title { font-weight: 700; font-size: 13px; }

  /* ─── Phase blocks ─── */
  .phase { background: linear-gradient(135deg, #eff6ff, #faf5ff); border: 1px solid #c7d2fe; border-radius: 10px; padding: 18px 22px; margin: 16px 0; }
  .phase h3 { color: #4F46E5; margin-top: 0; font-size: 15px; }

  /* ─── Check list ─── */
  .checklist { list-style: none; margin-left: 0; }
  .checklist li { padding: 4px 0; }
  .checklist li::before { content: "☐ "; color: #4F46E5; font-weight: bold; }

  /* ─── Architecture diagram ─── */
  .arch-box { border: 2px solid #4F46E5; border-radius: 10px; padding: 20px; margin: 16px 0; background: #faf5ff; }
  .arch-box .layer { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; margin: 10px 0; }
  .arch-box .component { background: white; border: 1px solid #c7d2fe; border-radius: 8px; padding: 10px 16px; font-size: 10px; font-weight: 600; text-align: center; min-width: 100px; }

  .footer { text-align: center; font-size: 9px; color: #9ca3af; margin-top: 30px; padding-top: 14px; border-top: 1px solid #e5e7eb; }
  .page-break { page-break-before: always; }

  /* ─── Cost table highlight ─── */
  .cost-highlight { background: #10b981; color: white; font-weight: 700; }
</style>
</head>
<body>

<!-- ═══════════ COVER ═══════════ -->
<div class="cover">
  <div class="logo">🚀</div>
  <h1>Volkern · Plan de Infraestructura</h1>
  <p class="subtitle">Requerimientos de Servidor VPS<br>+ Plan de Migración desde Vercel</p>
  <p class="meta">
    Versión 1.0 · Mayo 2026<br>
    Preparado por: Equipo Técnico Volkern<br>
    Clasificación: Confidencial
  </p>
</div>

<!-- ═══════════ 1. RESUMEN EJECUTIVO ═══════════ -->
<h1>1. Resumen Ejecutivo</h1>

<p>Este documento detalla los requerimientos técnicos para migrar la plataforma <strong>Volkern</strong> desde Vercel (serverless) a un servidor VPS dedicado. La migración busca mayor control sobre la infraestructura, reducción de costos operativos a largo plazo, y la capacidad de ejecutar servicios complementarios (n8n, Apprise, Puppeteer) que actualmente no son viables en el entorno serverless de Vercel.</p>

<h2>1.1 Estado Actual</h2>
<ul>
  <li><strong>Plataforma actual:</strong> Vercel (Hobby/Pro)</li>
  <li><strong>Base de datos:</strong> PostgreSQL en Neon Tech (serverless)</li>
  <li><strong>Dominio:</strong> volkern.app con subdominios multi-tenant</li>
  <li><strong>84 tests unitarios y de integración — 100% pasando</strong></li>
  <li><strong>Cobertura de código:</strong> 98.3% statements</li>
  <li><strong>Stack:</strong> Next.js 14, Prisma ORM, PostgreSQL, Redis, BullMQ, S3/R2</li>
</ul>

<h2>1.2 Motivación para la Migración</h2>
<ul>
  <li>Ejecutar <strong>n8n</strong> self-hosted para automatizaciones (no viable en Vercel)</li>
  <li>Ejecutar <strong>Apprise-API</strong> para notificaciones multicanal</li>
  <li>Ejecutar <strong>Puppeteer/Chromium</strong> para generación de PDFs y scraping</li>
  <li>Workers de <strong>BullMQ</strong> para procesamiento asíncrono</li>
  <li>Reducción de latencia en cold starts de serverless</li>
  <li>Mayor control sobre logs, monitoreo y seguridad</li>
</ul>

<div class="page-break"></div>

<!-- ═══════════ 2. ARQUITECTURA ═══════════ -->
<h1>2. Arquitectura del Sistema</h1>

<h2>2.1 Diagrama de Componentes</h2>

<div class="arch-box">
  <h3 style="text-align:center;margin-top:0">Capa de Usuario</h3>
  <div class="layer">
    <div class="component">🌐 Navegador Web</div>
    <div class="component">📱 App Móvil (Expo)</div>
    <div class="component">🤖 API Externa</div>
  </div>

  <h3 style="text-align:center">Capa de Proxy (VPS)</h3>
  <div class="layer">
    <div class="component">🔒 Nginx (SSL)</div>
    <div class="component">🛡️ UFW Firewall</div>
  </div>

  <h3 style="text-align:center">Capa de Aplicación (VPS)</h3>
  <div class="layer">
    <div class="component">⚡ Next.js 14 (PM2)</div>
    <div class="component">🔄 n8n (Docker)</div>
    <div class="component">🔔 Apprise-API (Docker)</div>
    <div class="component">📄 Puppeteer</div>
    <div class="component">📨 BullMQ Workers</div>
  </div>

  <h3 style="text-align:center">Capa de Datos (VPS)</h3>
  <div class="layer">
    <div class="component">🐘 PostgreSQL</div>
    <div class="component">🔴 Redis (Cache + Colas)</div>
  </div>

  <h3 style="text-align:center">Servicios Externos (API)</h3>
  <div class="layer">
    <div class="component">💳 Stripe</div>
    <div class="component">📧 Amazon SES</div>
    <div class="component">☁️ S3 / Cloudflare R2</div>
    <div class="component">🧠 OpenRouter AI</div>
    <div class="component">📱 OneSignal</div>
    <div class="component">📅 Google Calendar</div>
    <div class="component">💬 WhatsApp (Evolution)</div>
  </div>
</div>

<h2>2.2 Stack Tecnológico Detallado</h2>

<table>
<tr><th>Componente</th><th>Tecnología</th><th>Versión</th><th>Propósito</th></tr>
<tr><td>Framework</td><td>Next.js</td><td>14.2.28</td><td>Frontend + API Routes (monolito)</td></tr>
<tr><td>ORM</td><td>Prisma</td><td>6.7.0</td><td>Capa de datos (200+ modelos)</td></tr>
<tr><td>Base de datos</td><td>PostgreSQL</td><td>16</td><td>Almacenamiento principal</td></tr>
<tr><td>Cache / Colas</td><td>Redis + BullMQ</td><td>7 / 5.74</td><td>Caché + trabajos asíncronos</td></tr>
<tr><td>Almacenamiento</td><td>S3 / Cloudflare R2</td><td>—</td><td>Archivos, attachments, assets</td></tr>
<tr><td>Email</td><td>Amazon SES (SMTP)</td><td>—</td><td>Correos transaccionales</td></tr>
<tr><td>Notificaciones</td><td>Apprise-API</td><td>latest</td><td>Telegram, Slack, Discord, SMS</td></tr>
<tr><td>IA / LLM</td><td>OpenRouter</td><td>—</td><td>DeepSeek V4 + Gemini fallback</td></tr>
<tr><td>IA (opcional)</td><td>OpenAI / Anthropic</td><td>—</td><td>GPT-4o, Claude (fallback models)</td></tr>
<tr><td>Pagos</td><td>Stripe</td><td>19.2</td><td>Suscripciones y pagos</td></tr>
<tr><td>WhatsApp</td><td>Evolution API</td><td>—</td><td>Mensajería WhatsApp</td></tr>
<tr><td>Push</td><td>OneSignal</td><td>5.4</td><td>Notificaciones push (app móvil)</td></tr>
<tr><td>Calendario</td><td>Google Calendar API</td><td>170+</td><td>Sincronización de citas</td></tr>
<tr><td>PDF / Scraping</td><td>Puppeteer</td><td>25.0</td><td>Generación PDF + scraping</td></tr>
<tr><td>Automatizaciones</td><td>n8n (self-hosted)</td><td>latest</td><td>Flujos de trabajo visuales</td></tr>
<tr><td>Autenticación</td><td>NextAuth.js</td><td>4.24</td><td>JWT + OAuth + credenciales</td></tr>
<tr><td>Mensajería Social</td><td>Meta Messenger API</td><td>—</td><td>Facebook + Instagram DM</td></tr>
<tr><td>Banca</td><td>Plaid + GoCardless</td><td>42+ / 8+</td><td>Conexión bancaria</td></tr>
</table>

<div class="page-break"></div>

<!-- ═══════════ 3. REQUERIMIENTOS VPS ═══════════ -->
<h1>3. Requerimientos del Servidor VPS</h1>

<h2>3.1 Perfiles de VPS Recomendados</h2>

<table>
<tr><th></th><th>🧪 Mínimo (Dev)</th><th>✅ Recomendado (Prod)</th><th>🏢 Escalable (Enterprise)</th></tr>
<tr><td><strong>CPU</strong></td><td>4 vCPU</td><td>8 vCPU</td><td>8 vCPU + 4 vCPU (2 servidores)</td></tr>
<tr><td><strong>RAM</strong></td><td>8 GB</td><td>16 GB</td><td>16 GB + 8 GB</td></tr>
<tr><td><strong>Disco</strong></td><td>100 GB SSD</td><td>200 GB NVMe</td><td>200 GB + 100 GB NVMe</td></tr>
<tr><td><strong>Swap</strong></td><td>4 GB</td><td>4 GB</td><td>4 GB + 2 GB</td></tr>
<tr><td><strong>SO</strong></td><td>Ubuntu 22.04 LTS</td><td>Ubuntu 22.04 LTS</td><td>Ubuntu 22.04 LTS</td></tr>
<tr><td><strong>Tráfico</strong></td><td>Ilimitado</td><td>Ilimitado</td><td>Ilimitado</td></tr>
<tr><td><strong>Tenants</strong></td><td>1–5</td><td>10–50</td><td>50–200+</td></tr>
</table>

<h2>3.2 Distribución de RAM (Perfil Recomendado 16 GB)</h2>

<table>
<tr><th>Servicio</th><th>RAM Estimada</th><th>Notas</th></tr>
<tr><td>PostgreSQL</td><td>~4 GB</td><td>Cache de queries + índices (200+ tablas)</td></tr>
<tr><td>Next.js (PM2, 2–4 instancias)</td><td>~3 GB</td><td>Node.js runtime + serverless functions</td></tr>
<tr><td>n8n (Docker)</td><td>~2 GB</td><td>Workflow engine + ejecución</td></tr>
<tr><td>Redis + BullMQ</td><td>~1 GB</td><td>Caché en memoria + colas de trabajo</td></tr>
<tr><td>Puppeteer / Chromium</td><td>~1 GB</td><td>Headless Chrome (PDF, scraping)</td></tr>
<tr><td>Apprise-API (Docker)</td><td>~512 MB</td><td>Notificaciones multicanal</td></tr>
<tr><td>Sistema + Nginx</td><td>~2 GB</td><td>OS + proxy reverso + buffers</td></tr>
<tr style="font-weight:700"><td><strong>Margen libre</strong></td><td><strong>~2.5 GB</strong></td><td>Picos de carga, backups, logs</td></tr>
</table>

<h2>3.3 Comparativa de Proveedores VPS</h2>

<table>
<tr><th>Proveedor</th><th>Plan</th><th>vCPU</th><th>RAM</th><th>Disco</th><th>Precio/mes (€)</th></tr>
<tr><td><strong>Hetzner</strong> ⭐</td><td>CX42</td><td>8</td><td>16 GB</td><td>160 GB NVMe</td><td class="cost-highlight">~€30</td></tr>
<tr><td><strong>Netcup</strong> ⭐</td><td>RS 4000 G11</td><td>8</td><td>16 GB</td><td>256 GB SSD</td><td class="cost-highlight">~€20</td></tr>
<tr><td>Contabo</td><td>Cloud VPS L</td><td>8</td><td>30 GB</td><td>800 GB SSD</td><td>~€15</td></tr>
<tr><td>DigitalOcean</td><td>CPU-Optimized</td><td>8</td><td>16 GB</td><td>100 GB NVMe</td><td>~€160</td></tr>
<tr><td>AWS Lightsail</td><td>8 GB</td><td>2</td><td>8 GB</td><td>160 GB SSD</td><td>~€70</td></tr>
</table>

<div class="tip">
  <strong>⭐ Recomendado:</strong> <strong>Hetzner CX42</strong> o <strong>Netcup RS 4000 G11</strong> por la mejor relación precio/rendimiento en Europa. Contabo como opción económica, pero el rendimiento de disco es inferior.
</div>

<h2>3.4 Software a Instalar en la VPS</h2>

<table>
<tr><th>#</th><th>Software</th><th>Versión</th><th>Método</th></tr>
<tr><td>1</td><td>Node.js</td><td>20 LTS</td><td>APT / NVM</td></tr>
<tr><td>2</td><td>PostgreSQL</td><td>16</td><td>APT</td></tr>
<tr><td>3</td><td>Redis</td><td>7</td><td>APT</td></tr>
<tr><td>4</td><td>Nginx</td><td>latest</td><td>APT</td></tr>
<tr><td>5</td><td>Certbot (Let's Encrypt)</td><td>latest</td><td>Snap</td></tr>
<tr><td>6</td><td>Chromium</td><td>latest</td><td>APT (para Puppeteer)</td></tr>
<tr><td>7</td><td>PM2</td><td>latest</td><td>NPM (global)</td></tr>
<tr><td>8</td><td>Docker + Docker Compose</td><td>latest</td><td>APT</td></tr>
<tr><td>9</td><td>n8n</td><td>latest</td><td>Docker</td></tr>
<tr><td>10</td><td>Apprise-API</td><td>latest</td><td>Docker (docker-compose)</td></tr>
<tr><td>11</td><td>UFW</td><td>latest</td><td>APT</td></tr>
<tr><td>12</td><td>Git</td><td>latest</td><td>APT</td></tr>
</table>

<div class="page-break"></div>

<!-- ═══════════ 4. SERVICIOS EXTERNOS ═══════════ -->
<h1>4. Servicios Externos y Variables de Entorno</h1>

<p>Estos servicios no se instalan en la VPS — se conectan vía API. Sus credenciales deben configurarse como variables de entorno.</p>

<h2>4.1 Variables de Entorno Requeridas</h2>

<table>
<tr><th>Categoría</th><th>Variable</th><th>Servicio</th></tr>
<tr><td rowspan="3"><strong>Base de datos</strong></td><td><code>DATABASE_URL</code></td><td>PostgreSQL</td></tr>
<tr><td><code>DIRECT_URL</code></td><td>PostgreSQL (migraciones)</td></tr>
<tr><td><code>REDIS_URL</code></td><td>Redis</td></tr>
<tr><td rowspan="4"><strong>Auth</strong></td><td><code>NEXTAUTH_SECRET</code></td><td>NextAuth.js</td></tr>
<tr><td><code>NEXTAUTH_URL</code></td><td>URL base de la app</td></tr>
<tr><td><code>NEXT_PUBLIC_APP_URL</code></td><td>URL pública</td></tr>
<tr><td><code>NEXT_PUBLIC_CDN_URL</code></td><td>CDN para assets</td></tr>
<tr><td rowspan="3"><strong>Stripe</strong></td><td><code>STRIPE_SECRET_KEY</code></td><td>API secreta</td></tr>
<tr><td><code>NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code></td><td>API pública</td></tr>
<tr><td><code>STRIPE_WEBHOOK_SECRET</code></td><td>Webhooks</td></tr>
<tr><td rowspan="5"><strong>AWS / S3</strong></td><td><code>AWS_ACCESS_KEY_ID</code></td><td>Credenciales S3/R2</td></tr>
<tr><td><code>AWS_SECRET_ACCESS_KEY</code></td><td>Credenciales S3/R2</td></tr>
<tr><td><code>AWS_BUCKET_NAME</code></td><td>Bucket name</td></tr>
<tr><td><code>AWS_REGION</code></td><td>Región</td></tr>
<tr><td><code>AWS_ENDPOINT_URL</code></td><td>Endpoint (R2)</td></tr>
<tr><td rowspan="3"><strong>Email (SES)</strong></td><td><code>AWS_SES_USER</code></td><td>SMTP user</td></tr>
<tr><td><code>AWS_SES_PASSWORD</code></td><td>SMTP password</td></tr>
<tr><td><code>AWS_SES_REGION</code></td><td>Región SES</td></tr>
<tr><td rowspan="4"><strong>IA / LLM</strong></td><td><code>OPENROUTER_API_KEY</code></td><td>OpenRouter (principal)</td></tr>
<tr><td><code>OPENAI_API_KEY</code></td><td>OpenAI (fallback)</td></tr>
<tr><td><code>ANTHROPIC_API_KEY</code></td><td>Anthropic (fallback)</td></tr>
<tr><td><code>GOOGLE_AI_KEY</code></td><td>Google AI / Gemini</td></tr>
<tr><td rowspan="2"><strong>Push</strong></td><td><code>ONESIGNAL_APP_ID</code></td><td>App ID</td></tr>
<tr><td><code>ONESIGNAL_API_KEY</code></td><td>API key</td></tr>
<tr><td rowspan="2"><strong>WhatsApp</strong></td><td><code>EVOLUTION_API_URL</code></td><td>URL Evolution API</td></tr>
<tr><td><code>EVOLUTION_API_KEY</code></td><td>API key</td></tr>
<tr><td rowspan="2"><strong>Meta</strong></td><td><code>FACEBOOK_APP_ID</code></td><td>Meta App ID</td></tr>
<tr><td><code>FACEBOOK_APP_SECRET</code></td><td>Meta App Secret</td></tr>
<tr><td><strong>Telegram</strong></td><td><code>TELEGRAM_BOT_TOKEN</code></td><td>Bot token</td></tr>
</table>

<div class="page-break"></div>

<!-- ═══════════ 5. PLAN DE MIGRACIÓN ═══════════ -->
<h1>5. Plan de Migración desde Vercel</h1>

<div class="info">
  <strong>Principio rector:</strong> Migración progresiva sin downtime. Cada fase puede revertirse independientemente. Se mantiene Vercel como fallback hasta la validación completa en producción.
</div>

<!-- ── FASE 0 ── -->
<div class="phase">
<h3>🗓️ Fase 0 — Preparación (Semana 1)</h3>
<p><strong>Objetivo:</strong> Preparar el entorno VPS sin afectar producción.</p>
<br>
<div class="step"><span class="number">1</span> <span class="title">Contratar y aprovisionar la VPS</span><br>
  Seleccionar proveedor (Hetzner CX42 o Netcup RS 4000), instalar Ubuntu 22.04 LTS, configurar acceso SSH con clave.</div>
<div class="step"><span class="number">2</span> <span class="title">Instalar software base</span><br>
  Node.js 20 LTS, PostgreSQL 16, Redis 7, Nginx, Chromium, Docker, Git, PM2, UFW.</div>
<div class="step"><span class="number">3</span> <span class="title">Configurar firewall (UFW)</span><br>
  <code>ufw allow 22/tcp</code> (SSH), <code>ufw allow 80,443/tcp</code> (HTTP/S), <code>ufw allow 5678/tcp</code> (n8n), <code>ufw enable</code>.</div>
<div class="step"><span class="number">4</span> <span class="title">Migrar base de datos PostgreSQL</span><br>
  Opción A: Exportar desde Neon Tech con <code>pg_dump</code> e importar en la VPS.<br>
  Opción B: Usar replicación lógica si Neon lo soporta (zero-downtime).<br>
  Opción C: Empezar con base limpia y migrar datos selectivamente.</div>
<div class="step"><span class="number">5</span> <span class="title">Configurar Redis</span><br>
  <code>bind 127.0.0.1</code>, <code>requirepass</code> con contraseña fuerte, persistencia AOF.</div>
<div class="step"><span class="number">6</span> <span class="title">Configurar S3 / R2 (sin cambios)</span><br>
  El almacenamiento de archivos permanece en S3/R2 — no se migra.</div>
</div>

<!-- ── FASE 1 ── -->
<div class="phase">
<h3>🗓️ Fase 1 — Despliegue (Semana 2)</h3>
<p><strong>Objetivo:</strong> Desplegar la aplicación en la VPS con dominio de pruebas.</p>
<br>
<div class="step"><span class="number">1</span> <span class="title">Clonar repositorio en la VPS</span><br>
  <code>git clone https://github.com/DeXpertmx/volkern.git /opt/volkern</code></div>
<div class="step"><span class="number">2</span> <span class="title">Configurar variables de entorno</span><br>
  Crear <code>.env.production</code> en la VPS con todas las variables (ver Sección 4).</div>
<div class="step"><span class="number">3</span> <span class="title">Instalar dependencias y hacer build</span>
<pre><code>cd /opt/volkern
npm ci
npx prisma generate
npm run build</code></pre></div>
<div class="step"><span class="number">4</span> <span class="title">Configurar PM2</span>
<pre><code>pm2 start npm --name "volkern" -- start
pm2 save
pm2 startup</code></pre></div>
<div class="step"><span class="number">5</span> <span class="title">Configurar Nginx como reverse proxy</span>
<pre><code>server {
    listen 80;
    server_name staging.volkern.app;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}</code></pre></div>
<div class="step"><span class="number">6</span> <span class="title">Probar con dominio de staging</span><br>
  Crear registro DNS <code>staging.volkern.app</code> → IP de la VPS. Verificar que la app carga, login funciona, APIs responden, subdominios funcionan.</div>
</div>

<div class="page-break"></div>

<!-- ── FASE 2 ── -->
<div class="phase">
<h3>🗓️ Fase 2 — Servicios Complementarios (Semana 2–3)</h3>
<p><strong>Objetivo:</strong> Activar servicios que Vercel no soporta.</p>
<br>
<div class="step"><span class="number">1</span> <span class="title">Desplegar n8n en Docker</span>
<pre><code>docker run -d --name n8n --restart unless-stopped \\
  -p 5678:5678 \\
  -v n8n_data:/home/node/.n8n \\
  -e N8N_SECURE_COOKIE=false \\
  -e WEBHOOK_URL=https://n8n.volkern.app \\
  n8nio/n8n</code></pre></div>
<div class="step"><span class="number">2</span> <span class="title">Desplegar Apprise-API</span>
  Usar el <code>docker-compose.apprise.yml</code> existente en el proyecto.</div>
<div class="step"><span class="number">3</span> <span class="title">Configurar workers de BullMQ</span>
<pre><code>pm2 start worker.js --name "volkern-worker"</code></pre></div>
<div class="step"><span class="number">4</span> <span class="title">Instalar Chromium para Puppeteer</span>
<pre><code>apt install -y chromium-browser
export PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser</code></pre></div>
<div class="step"><span class="number">5</span> <span class="title">Configurar backups automáticos</span>
  PostgreSQL: <code>pg_dump</code> diario + rotación de 7 días. Directorio <code>/opt/volkern</code>: git pull automático. Volúmenes Docker: backup semanal.</div>
</div>

<!-- ── FASE 3 ── -->
<div class="phase">
<h3>🗓️ Fase 3 — Corte de Producción (Semana 3)</h3>
<p><strong>Objetivo:</strong> Migrar tráfico real a la VPS.</p>
<br>
<div class="step"><span class="number">1</span> <span class="title">Sincronización final de base de datos</span><br>
  Ejecutar <code>pg_dump</code> de Neon Tech, restaurar en PostgreSQL local. Verificar integridad de datos.</div>
<div class="step"><span class="number">2</span> <span class="title">Configurar SSL con Let's Encrypt</span>
<pre><code>certbot --nginx -d volkern.app -d *.volkern.app</code></pre></div>
<div class="step"><span class="number">3</span> <span class="title">Actualizar DNS</span><br>
  Cambiar registro A de <code>volkern.app</code> y <code>*.volkern.app</code> para que apunten a la IP de la VPS. TTL bajo (60s) 24h antes para acelerar propagación.</div>
<div class="step"><span class="number">4</span> <span class="title">Monitorear durante 24–48h</span><br>
  Logs de Next.js (PM2), logs de Nginx, métricas del sistema (htop, iostat), alertas de error (Sentry o similar).</div>
<div class="step"><span class="number">5</span> <span class="title">Desactivar Vercel (tras validación)</span><br>
  Mantener el proyecto en Vercel en modo "pausado" durante 1 semana como rollback de emergencia.</div>
</div>

<div class="page-break"></div>

<!-- ═══════════ 6. AJUSTES DE CÓDIGO ═══════════ -->
<h1>6. Ajustes de Código Requeridos para la Migración</h1>

<p>Estos son los cambios necesarios en el código de Volkern para funcionar en VPS (actualmente optimizado para Vercel serverless).</p>

<h2>6.1 Middleware — Subdominios Multi-Tenant</h2>
<div class="info">
  <strong>Estado actual:</strong> El middleware usa <code>getSubdomain(host)</code> detectando <code>.volkern.app</code>. En VPS detrás de Nginx, el header <code>Host</code> llega correctamente con el subdominio → <strong>no requiere cambios</strong>.
</div>

<h2>6.2 Variables de Entorno</h2>
<ul>
  <li>✅ <code>DATABASE_URL</code> — Cambiar de Neon Tech a PostgreSQL local</li>
  <li>✅ <code>REDIS_URL</code> — Cambiar de Redis cloud a Redis local (<code>redis://127.0.0.1:6379</code>)</li>
  <li>✅ <code>NEXTAUTH_URL</code> — Cambiar a <code>https://volkern.app</code></li>
  <li>✅ <code>NEXT_PUBLIC_APP_URL</code> — Cambiar a <code>https://volkern.app</code></li>
  <li>⚠️ <code>NEXT_PUBLIC_CDN_URL</code> — Si usas CDN, mantener; si no, apuntar al mismo VPS</li>
</ul>

<h2>6.3 Configuración de Next.js</h2>
<p>El archivo <code>next.config.js</code> actual es mínimo y funciona en VPS sin cambios:</p>
<pre><code>const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  images: { unoptimized: true },
};
module.exports = nextConfig;</code></pre>
<div class="warn">
  <strong>⚠️ Nota:</strong> <code>images.unoptimized: true</code> delega la optimización al servidor. En VPS, considera usar <code>next/image</code> con el optimizer integrado o mantenerlo así si usas un CDN externo.
</div>

<h2>6.4 Prisma — Binary Targets</h2>
<p>El schema de Prisma ya incluye el target para Linux ARM64 (compatible con servidores ARM):</p>
<pre><code>generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "linux-musl-arm64-openssl-3.0.x"]
}</code></pre>
<div class="tip">
  ✅ Ya está preparado para VPS. Si usas arquitectura x86_64 (Intel/AMD), el target <code>native</code> lo cubre automáticamente.
</div>

<h2>6.5 Puppeteer</h2>
<p>En Vercel se usa <code>@sparticuz/chromium</code> o <code>chrome-aws-lambda</code>. En VPS, configurar la variable de entorno:</p>
<pre><code>PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
PUPPETEER_SKIP_DOWNLOAD=true</code></pre>

<h2>6.6 Rate Limiting</h2>
<p>El rate limiting actual (<code>lib/edge-rate-limiter.ts</code>) funciona en memoria. En VPS con PM2 cluster, considerar migrar a rate limiting basado en Redis para compartir estado entre instancias.</p>

<h2>6.7 Webhooks de Stripe</h2>
<p>Actualizar el endpoint de webhook en el dashboard de Stripe:</p>
<pre><code>https://volkern.app/api/webhooks/stripe</code></pre>

<div class="page-break"></div>

<!-- ═══════════ 7. COMANDOS DE REFERENCIA ═══════════ -->
<h1>7. Comandos de Referencia para la VPS</h1>

<h2>7.1 Instalación Inicial</h2>
<pre><code># Actualizar sistema
apt update && apt upgrade -y

# Instalar Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Instalar PostgreSQL 16
apt install -y postgresql postgresql-contrib

# Instalar Redis
apt install -y redis-server

# Instalar Nginx
apt install -y nginx

# Instalar Chromium (Puppeteer)
apt install -y chromium-browser

# Instalar Docker
apt install -y docker.io docker-compose-v2

# Instalar PM2
npm install -g pm2

# Instalar Git
apt install -y git

# Configurar firewall
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 5678/tcp
ufw enable</code></pre>

<h2>7.2 PostgreSQL — Usuario y Base de Datos</h2>
<pre><code>sudo -u postgres psql
CREATE USER volkern WITH PASSWORD 'contraseña_segura';
CREATE DATABASE volkern OWNER volkern;
GRANT ALL PRIVILEGES ON DATABASE volkern TO volkern;
\\q</code></pre>

<h2>7.3 Despliegue de la Aplicación</h2>
<pre><code>cd /opt/volkern
git pull origin master
npm ci --production
npx prisma generate
npx prisma migrate deploy
npm run build
pm2 restart volkern</code></pre>

<h2>7.4 SSL con Let's Encrypt</h2>
<pre><code>apt install -y snapd
snap install core
snap refresh core
snap install --classic certbot
ln -s /snap/bin/certbot /usr/bin/certbot
certbot --nginx -d volkern.app -d '*.volkern.app'</code></pre>

<h2>7.5 Backups</h2>
<pre><code># Backup diario de PostgreSQL
0 2 * * * pg_dump -U volkern volkern | gzip > /backups/volkern_$(date +\\%Y\\%m\\%d).sql.gz

# Rotación (7 días)
0 3 * * * find /backups -name "*.sql.gz" -mtime +7 -delete</code></pre>

<div class="page-break"></div>

<!-- ═══════════ 8. PLAN DE CONTINGENCIA ═══════════ -->
<h1>8. Plan de Contingencia y Rollback</h1>

<h2>8.1 Rollback Rápido</h2>
<p>Si algo falla tras el corte de DNS:</p>
<ol>
  <li><strong>Revertir DNS:</strong> Apuntar <code>volkern.app</code> de vuelta al CNAME de Vercel</li>
  <li><strong>Propagación:</strong> Con TTL de 60s, la reversión toma ~5 minutos</li>
  <li><strong>Vercel:</strong> Mantener el proyecto de Vercel activo (no eliminarlo) durante 1 semana post-migración</li>
</ol>

<h2>8.2 Monitoreo Post-Migración</h2>
<ul class="checklist">
  <li>CPU usage &lt; 80% sostenido</li>
  <li>RAM usage &lt; 85% (sin swap excesivo)</li>
  <li>Disco &lt; 80%</li>
  <li>Next.js responde en &lt; 500ms p95</li>
  <li>PostgreSQL sin locks ni slow queries (&gt;1s)</li>
  <li>Redis respondiendo (sin timeouts)</li>
  <li>n8n workflows ejecutándose correctamente</li>
  <li>Apprise notificaciones llegando</li>
  <li>Webhooks de Stripe procesándose</li>
  <li>Subdominios multi-tenant funcionando</li>
</ul>

<h2>8.3 Escalación</h2>
<table>
<tr><th>Problema</th><th>Acción Inmediata</th></tr>
<tr><td>Alto uso de RAM</td><td>Reducir instancias PM2, agregar swap, considerar upgrade de VPS</td></tr>
<tr><td>PostgreSQL lento</td><td>Ajustar <code>shared_buffers</code>, <code>work_mem</code>, crear índices faltantes</td></tr>
<tr><td>Cold starts (Next.js)</td><td>Configurar <code>pm2 start --instances max</code> para usar todos los cores</td></tr>
<tr><td>Disco lleno</td><td>Rotar logs de PM2, limpiar <code>.next/cache</code>, expandir volumen</td></tr>
<tr><td>n8n no responde</td><td>Reiniciar contenedor Docker, verificar límites de memoria</td></tr>
</table>

<div class="page-break"></div>

<!-- ═══════════ 9. COSTOS ESTIMADOS ═══════════ -->
<h1>9. Comparativa de Costos: Vercel vs VPS</h1>

<table>
<tr><th>Concepto</th><th>Vercel (actual)</th><th>VPS (Hetzner CX42)</th></tr>
<tr><td>Hosting app</td><td>$20–$55/mes (Pro)</td><td>~€30/mes</td></tr>
<tr><td>Base de datos</td><td>Neon Tech ~$19/mes</td><td>Incluido en VPS</td></tr>
<tr><td>Redis</td><td>Upstash ~$10/mes</td><td>Incluido en VPS</td></tr>
<tr><td>n8n</td><td>No disponible (requiere VPS)</td><td>Incluido en VPS</td></tr>
<tr><td>Apprise</td><td>No disponible</td><td>Incluido en VPS</td></tr>
<tr><td>Puppeteer</td><td>Limitado (browserless.io)</td><td>Incluido en VPS</td></tr>
<tr><td>Funciones serverless</td><td>Incluido (con límites)</td><td>Ilimitado en VPS</td></tr>
<tr><td>Ancho de banda</td><td>100 GB–1 TB</td><td>Ilimitado (20 TB en Hetzner)</td></tr>
<tr style="font-weight:700"><td><strong>TOTAL mensual</strong></td><td><strong>~$50–$84/mes</strong></td><td class="cost-highlight"><strong>~€30/mes</strong></td></tr>
</table>

<div class="tip">
  <strong>Ahorro estimado:</strong> Migrando a Hetzner CX42, el costo mensual se reduce de ~$50–$84 a ~€30, un ahorro del <strong>40–65%</strong>, mientras se ganan n8n, Apprise, Puppeteer completo, y workers de BullMQ — servicios imposibles en Vercel.
</div>

<!-- ═══════════ 10. CRONOGRAMA ═══════════ -->
<h1>10. Cronograma Estimado</h1>

<table>
<tr><th>Fase</th><th>Duración</th><th>Entregable</th></tr>
<tr><td>Fase 0 — Preparación</td><td>1 semana</td><td>VPS aprovisionada, software instalado, BD migrada</td></tr>
<tr><td>Fase 1 — Despliegue</td><td>1 semana</td><td>App corriendo en staging.volkern.app</td></tr>
<tr><td>Fase 2 — Servicios</td><td>3–5 días</td><td>n8n, Apprise, BullMQ workers, backups funcionando</td></tr>
<tr><td>Fase 3 — Corte</td><td>2–3 días</td><td>DNS actualizado, SSL, monitoreo 48h, Vercel en pausa</td></tr>
<tr style="font-weight:700"><td><strong>TOTAL</strong></td><td><strong>~3 semanas</strong></td><td><strong>Volkern 100% en VPS</strong></td></tr>
</table>

<div class="footer">
  Volkern · Plan de Infraestructura v1.0 · Mayo 2026 · CONFIDENCIAL<br>
  Este documento contiene información propietaria de Volkern. No distribuir sin autorización.
</div>

</body>
</html>`;

async function main() {
  console.log('🚀 Generando PDF del Plan de Infraestructura Volkern...');
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  
  const outputPath = path.resolve(__dirname, '..', 'docs', 'volkern-plan-infraestructura-vps.pdf');
  
  await page.setContent(HTML, { waitUntil: 'networkidle0' });
  
  await page.pdf({
    path: outputPath,
    format: 'A4',
    margin: { top: '20mm', bottom: '20mm', left: '18mm', right: '18mm' },
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<div style="font-size:8px;text-align:center;width:100%;color:#9ca3af;padding-top:8px;">Volkern · Plan de Infraestructura VPS · CONFIDENCIAL</div>',
    footerTemplate: '<div style="font-size:8px;text-align:center;width:100%;color:#9ca3af;">Página <span class="pageNumber"></span> de <span class="totalPages"></span></div>',
  });

  await browser.close();
  
  console.log(`✅ PDF generado: ${outputPath}`);
  
  const stats = fs.statSync(outputPath);
  console.log(`📄 Tamaño: ${(stats.size / 1024).toFixed(1)} KB`);
}

main().catch(console.error);
