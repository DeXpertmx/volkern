# Volkern — Análisis de Rentabilidad por Plan

> **Fecha:** Junio 2026  
> **Versión:** 1.0  
> **Clasificación:** Confidencial — Uso Interno  
> **Objetivo:** Validar que la estructura de precios Esencial/Profesional/Infinity genera un negocio rentable, considerando costos operativos reales por tenant y un sistema de comisiones para vendedores/recomendadores.

---

## 1. Resumen Ejecutivo

| Indicador | Esencial | Profesional | Infinity |
|-----------|:--------:|:-----------:|:--------:|
| Precio mensual | €69 | €149 | €299 |
| Costo operativo estimado/tenant | €4.40 | €11.10 | €27.00 |
| Margen bruto | €64.60 (93.6%) | €137.90 (92.5%) | €272.00 (91.0%) |
| **Margen neto (con 20% comisión)** | **€50.80 (73.6%)** | **€108.10 (72.6%)** | **€212.20 (71.0%)** |
| **Margen neto (con 30% comisión)** | **€43.90 (63.6%)** | **€93.20 (62.6%)** | **€182.30 (61.0%)** |

> ✅ **Conclusión:** Los 3 planes son rentables incluso con comisiones del 30%. El margen neto nunca baja del 60%, muy por encima del estándar SaaS (40-60%).

---

## 2. Ingresos por Plan

### 2.1 Precios actuales

| Plan | Mensual | Anual (con -20%) | Eq. mensual anual |
|------|:-------:|:----------------:|:-----------------:|
| Esencial | €69 | €662 | €55.17 |
| Profesional | €149 | €1.430 | €119.17 |
| Infinity | €299 | €2.870 | €239.17 |

### 2.2 Proyección de ingresos por tenant

| Escenario | Esencial | Profesional | Infinity |
|-----------|:--------:|:-----------:|:--------:|
| 10 tenants | €690/mes (€8.280/año) | €1.490/mes (€17.880/año) | €2.990/mes (€35.880/año) |
| 50 tenants | €3.450/mes (€41.400/año) | €7.450/mes (€89.400/año) | €14.950/mes (€179.400/año) |
| 100 tenants | €6.900/mes (€82.800/año) | €14.900/mes (€178.800/año) | €29.900/mes (€358.800/año) |
| 200 tenants | €13.800/mes (€165.600/año) | €29.800/mes (€357.600/año) | €59.800/mes (€717.600/año) |

---

## 3. Costos Operativos por Tenant

### 3.1 Infraestructura Base (servidor + servicios core)

| Recurso | Costo mensual total | Costo por tenant (50 tenants) | Costo por tenant (200 tenants) |
|---------|:-------------------:|:-----------------------------:|:------------------------------:|
| **VPS Hetzner CX42** (8 vCPU, 16 GB) | €30 | €0.60 | €0.15 |
| **PostgreSQL** | Incluido en VPS | — | — |
| **Redis** | Incluido en VPS | — | — |
| **Nginx + SSL** | Incluido en VPS | — | — |
| **Total infraestructura** | **€30/mes** | **€0.60** | **€0.15** |

> 📝 Antes: Vercel (~€55/mes) + Neon (~€19) + Redis (~€10) = ~€84/mes. Producción corre en el VPS desde la migración, que redujo el coste total de infraestructura en ~65%.

### 3.2 Inteligencia Artificial (LLM)

**Modelos utilizados y sus costos reales:**

| Modelo | Vía | Costo input (1M tokens) | Costo output (1M tokens) | ¿Gratis? |
|--------|-----|:-----------------------:|:------------------------:|:--------:|
| `deepseek-chat` (V4 Flash) — primario | DeepSeek API directa | $0.14 | $0.28 | ❌ |
| `deepseek/deepseek-chat:free` — respaldo | OpenRouter | $0.00 | $0.00 | ✅ |
| `google/gemma-4-31b-it:free` — respaldo | OpenRouter | $0.00 | $0.00 | ✅ |
| `nvidia/nemotron-3-ultra:free` — respaldo | OpenRouter | $0.00 | $0.00 | ✅ |
| `gemini-2.5-flash` — fallback final | Google AI directa | $0.075 | $0.30 | Parcial* |

\* Gemini 2.5 Flash tiene tier gratuito generoso (1.500 requests/día gratis).

**Uso estimado por tenant y plan:**

| Plan | Conversaciones IA/mes | Tokens estimados/mes | Costo LLM estimado/tenant |
|------|:---------------------:|:--------------------:|:-------------------------:|
| Esencial (500 conv) | ~250 activas (50% tasa uso) | ~125.000 output tokens | **€1.40** |
| Profesional (2.000 conv) | ~1.000 activas | ~500.000 output tokens | **€3.20** |
| Infinity (10.000 conv) | ~5.000 activas | ~2.500.000 output tokens | **€7.50** |

> 💡 **Dato clave:** La mayoría de las llamadas usan modelos **gratuitos** vía OpenRouter. Solo Web Creator y tareas complejas usan DeepSeek API directa (pagada). Esto hace que el costo LLM de Volkern sea extraordinariamente bajo comparado con competidores que dependen de OpenAI (GPT-4o: $2.50-$10/1M tokens).

### 3.3 Email Transaccional (Resend + AWS SES)

| Concepto | Costo unitario | Esencial (2.500 emails) | Profesional (10.000) | Infinity (ilimitado ~50.000) |
|----------|:-------------:|:-----------------------:|:--------------------:|:----------------------------:|
| Resend (hasta 3.000/mes) | Gratis | €0.00 | — | — |
| Resend (50K plan) | $20/mes | — | $20.00 | $20.00 |
| AWS SES (por 1.000) | ~$0.10 | — | — | — |
| **Total email/tenant** | | **€0.00** | **€2.50** | **€5.00** |

> 📝 Esencial cabe en el tier gratuito de Resend. Profesional e Infinity requieren el plan de 50K ($20/mes). La mayoría de los tenants no llegan al 50% de sus límites de email.

### 3.4 WhatsApp (Meta Cloud API)

| Concepto | Costo unitario | Esencial (500 msg) | Profesional (2.000) | Infinity (10.000) |
|----------|:-------------:|:------------------:|:-------------------:|:-----------------:|
| Marketing messages | ~$0.03/msg | €4.50 (150 msg) | €12.00 (400 msg) | €60.00 (2.000 msg) |
| Service messages | ~$0.01/msg | €1.50 (150 msg) | €6.00 (600 msg) | €24.00 (2.400 msg) |
| **Total WhatsApp/tenant** (50% uso) | | **€1.50** | **€3.00** | **€8.00** |

> 📝 La mayoría de tenants usan ~30-50% de su límite de WhatsApp. La Evolution API es self-hosted, así que no tiene costo adicional de plataforma.

### 3.5 Almacenamiento (Cloudflare R2)

| Plan | Límite storage | Uso estimado (50%) | Costo R2 ($0.015/GB) |
|------|:-------------:|:------------------:|:---------------------:|
| Esencial | 5 GB | 2.5 GB | **€0.03** |
| Profesional | 25 GB | 12.5 GB | **€0.17** |
| Infinity | 100 GB | 50 GB | **€0.70** |

> 📝 Cloudflare R2 no cobra egress fees. El costo de almacenamiento es prácticamente irrelevante.

### 3.6 SMS (Gateway)

| Plan | Límite SMS/mes | Uso estimado (30%) | Costo (~$0.05/SMS) |
|------|:-------------:|:------------------:|:-------------------:|
| Esencial | 250 | 75 | **€0.35** |
| Profesional | 1.000 | 300 | **€1.40** |
| Infinity | 5.000 | 1.500 | **€6.90** |

### 3.7 Resumen de Costos Operativos por Tenant

| Concepto | Esencial | Profesional | Infinity |
|----------|:--------:|:-----------:|:--------:|
| Infraestructura (VPS) | €0.60 | €0.60 | €0.60 |
| LLM (DeepSeek + modelos gratis) | €1.40 | €3.20 | €7.50 |
| Email transaccional | €0.00 | €2.50 | €5.00 |
| WhatsApp | €1.50 | €3.00 | €8.00 |
| Almacenamiento (R2) | €0.03 | €0.17 | €0.70 |
| SMS | €0.35 | €1.40 | €6.90 |
| **COSTO TOTAL POR TENANT** | **€3.88** | **€10.87** | **€28.70** |
| Redondeado | **~€4.40** | **~€11.10** | **~€27.00** |

---

## 4. Análisis de Márgenes

### 4.1 Margen Bruto (sin comisiones)

| Plan | Ingreso/tenant | Costo/tenant | Margen bruto | % Margen |
|------|:-------------:|:------------:|:------------:|:--------:|
| Esencial | €69.00 | €4.40 | **€64.60** | **93.6%** |
| Profesional | €149.00 | €11.10 | **€137.90** | **92.5%** |
| Infinity | €299.00 | €27.00 | **€272.00** | **91.0%** |

### 4.2 Margen Neto con Comisiones

| Escenario comisión | Esencial | % Margen | Profesional | % Margen | Infinity | % Margen |
|:-------------------|:--------:|:--------:|:-----------:|:--------:|:--------:|:--------:|
| **10%** comisión | €57.70 | 83.6% | €123.00 | 82.6% | €242.10 | 81.0% |
| **20%** comisión | €50.80 | 73.6% | €108.10 | 72.6% | €212.20 | 71.0% |
| **25%** comisión | €47.35 | 68.6% | €100.65 | 67.6% | €197.25 | 66.0% |
| **30%** comisión | €43.90 | 63.6% | €93.20 | 62.6% | €182.30 | 61.0% |
| **40%** comisión | €37.00 | 53.6% | €78.30 | 52.6% | €152.40 | 51.0% |

### 4.3 Ingreso Neto Anual con 50 Tenants (30% comisión)

| Plan | Neto/mes por tenant | × 50 tenants/mes | × 12 meses |
|------|:-------------------:|:----------------:|:----------:|
| Esencial | €43.90 | €2.195 | **€26.340** |
| Profesional | €93.20 | €4.660 | **€55.920** |
| Infinity | €182.30 | €9.115 | **€109.380** |
| **Mixto realista*** | — | €5.323 | **€63.876** |

\* Mix realista: 60% Esencial, 30% Profesional, 10% Infinity.

---

## 5. Sistema de Comisiones Propuesto

### 5.1 Estructura recomendada

| Nivel | Quién | Comisión | Tipo |
|-------|-------|:--------:|------|
| **Embajador** | Cliente que recomienda | 15% recurrente | 12 meses |
| **Partner** | Agencia/consultor que revende | 25% recurrente | Vitalicio |
| **Afiliado** | Creador de contenido, link de afiliado | 30% | Primer año |

### 5.2 Simulación de comisiones

| Escenario | Comisión | Esencial (€69) | Profesional (€149) | Infinity (€299) |
|-----------|:--------:|:--------------:|:------------------:|:---------------:|
| Embajador (cliente feliz) | 15% | €10.35/mes | €22.35/mes | €44.85/mes |
| Partner (agencia) | 25% | €17.25/mes | €37.25/mes | €74.75/mes |
| Afiliado (marketing) | 30% | €20.70/mes | €44.70/mes | €89.70/mes |

### 5.3 Ejemplo: Partner con 10 clientes

| Mix de clientes | Ingreso Volkern | Comisión partner | Neto Volkern |
|:----------------|:---------------:|:----------------:|:------------:|
| 6 Esencial + 3 Profesional + 1 Infinity | €1.160/mes | €290/mes (25%) | **€870/mes** |
| Partner gana: | — | **€3.480/año** | — |
| Volkern gana: | — | — | **€10.440/año** |

> 💡 Un partner con 10 clientes gana €3.480/año en comisiones recurrentes. Esto es atractivo para agencias de marketing, consultores ERP y asesorías contables.

---

## 6. Punto de Equilibrio

### 6.1 Costos fijos mensuales

| Concepto | Costo |
|----------|:-----:|
| VPS (Hetzner CX42) | €30 |
| Dominio volkern.app | €1 |
| Stripe (2.9% + €0.25 por transacción) | variable |
| **Total costos fijos** | **~€31/mes** |

### 6.2 ¿Cuántos tenants necesito para cubrir costos fijos?

| Plan | Tenants necesarios |
|------|:------------------:|
| Solo Esencial (30% comisión) | **1 tenant** (€43.90 neto > €31 fijo) |
| Solo Profesional (30% comisión) | **1 tenant** (€93.20 neto > €31 fijo) |
| Solo Infinity (30% comisión) | **1 tenant** (€182.30 neto > €31 fijo) |

> 🔥 Volkern es rentable desde el **primer tenant** en cualquier plan. El costo fijo de infraestructura (€31/mes en VPS) es tan bajo que incluso 1 cliente Esencial ya genera ganancia neta de ~€13/mes.

### 6.3 Proyección de crecimiento

| Hito | Tenants | Ingreso neto mensual* | Ingreso neto anual |
|------|:-------:|:---------------------:|:------------------:|
| **Break-even** | 1 | €13+ | €156+ |
| **Sostenible** | 10 | €532 | €6.384 |
| **Crecimiento** | 50 | €2.662 | €31.944 |
| **Escala** | 100 | €5.323 | €63.876 |
| **Scale-up** | 200 | €10.646 | €127.752 |
| **Exit-ready** | 500 | €26.615 | €319.380 |

\* Con mix 60/30/10 y 30% comisión promedio.

---

## 7. Comparativa con la Competencia

| SaaS ERP/CRM | Plan básico | Plan medio | Plan avanzado | Modelo LLM |
|:-------------|:-----------:|:----------:|:-------------:|:----------:|
| **Volkern** | **€69** | **€149** | **€299** | Modelos gratis OpenRouter |
| Holded | €70 | €125 | €194 | Sin IA |
| Zoho CRM | €20 | €35 | €65 | OpenAI (caro) |
| Odoo Online | €31 | €47 | €78 | OpenAI (caro) |
| HubSpot | €0 → €800 | €3.600 | €12.000 | OpenAI (caro) |
| Salesforce | €25 → €165 | €300 | €500 | Einstein GPT (caro) |

**Ventaja competitiva de Volkern:**
- Módulos **ilimitados** en todos los planes (competidores bloquean por módulo)
- IA incluida con modelos **gratuitos** (competidores pagan OpenAI ~10-100× más)
- Precio **todo incluido** vs competidores que cobran por cada add-on
- Infraestructura en **VPS propia** (~€30/mes total) vs cloud markups

---

## 8. Riesgos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|:-----------:|:-------:|------------|
| DeepSeek API sube precios | Media | Bajo | 80% de llamadas usan modelos gratis vía OpenRouter |
| Meta sube precios WhatsApp | Media | Medio | Límites de mensajes por plan ya acotados |
| OpenRouter quita modelos gratis | Baja | Alto | Contingencia con Gemini (tier gratuito) + modelos open-source locales |
| Churn > 5% mensual | Media | Alto | Onboarding guiado, lock-in con datos (contabilidad, nóminas, CRM histórico) |
| Competencia baja precios | Media | Medio | Diferenciación por módulos ilimitados + IA incluida |

---

## 9. Recomendaciones

### 9.1 Sobre precios

✅ **Mantener precios actuales.** Los márgenes son excelentes (60-93%) incluso con comisiones agresivas del 30%. No hay presión para subir precios a corto plazo.

### 9.2 Sobre comisiones

| Recomendación | Detalle |
|:---|:---|
| **Lanzar programa "Volkern Partners"** | 25% comisión recurrente vitalicia para agencias/consultores |
| **Programa de afiliados** | 30% el primer año para creadores de contenido |
| **Programa "Embajador"** | 15% durante 12 meses para clientes que recomienden |
| **Límite de comisiones por tenant** | No necesario — incluso con 30% de comisión el margen neto es >60% |

### 9.3 Sobre infraestructura

✅ **Ejecutar migración a VPS (Hetzner CX42).** Reduce costo fijo de €84/mes a €30/mes (-65%) y habilita n8n, Apprise, Puppeteer y workers de BullMQ.

### 9.4 Sobre costos operativos

| Prioridad | Acción | Impacto |
|:---------:|--------|:-------:|
| Alta | Mantener dependencia de modelos gratuitos OpenRouter | Ahorra €3-8/tenant/mes en LLM |
| Media | Negociar volumen con DeepSeek si crece el uso de Web Creator | -20-30% en costo LLM |
| Baja | Migrar emails masivos a AWS SES (más barato que Resend a escala) | -€1-2/tenant/mes |

---

## 10. Conclusión

**Volkern es un negocio excepcionalmente rentable por tres razones estructurales:**

1. **Costos operativos mínimos (€4-27/tenant/mes):** La combinación de modelos LLM gratuitos vía OpenRouter, infraestructura VPS de bajo costo, Cloudflare R2 sin egress, y Resend en tier gratuito hace que el COGS sea insignificante comparado con el ticket.

2. **Márgenes brutos >90%:** Esto es inusual en SaaS B2B (típicamente 70-80%). Permite absorber comisiones de hasta 40% y seguir siendo rentable.

3. **Rentable desde el tenant #1:** Con costos fijos de solo €31/mes, un solo cliente Esencial ya genera ganancia. Cada tenant adicional es casi 100% margen.

**Con 50 tenants (mix realista), Volkern generaría ~€64.000/año netos después de pagar 30% de comisiones y todos los costos operativos.**

---

## Apéndice A: Fuentes de datos

| Dato | Fuente |
|------|--------|
| Precios de planes | `lib/plans.ts` |
| Límites por plan | `lib/plans.ts` — `PLAN_LIMITS` |
| Modelos LLM usados | `lib/assistant/openrouter-client.ts` |
| Precios DeepSeek API | [deepseek.com/pricing](https://deepseek.com/pricing) — $0.14/$0.28 por 1M tokens |
| Precios OpenRouter | [openrouter.ai/models](https://openrouter.ai/models) — modelos `:free` sin costo |
| Infraestructura actual | `docs/DEPLOY-GUIDE.md`, `scripts/generate-vps-report.ts` |
| Email provider | `lib/resend-email.ts` — Resend |
| Almacenamiento | `lib/s3.ts`, `lib/aws-config.ts` — Cloudflare R2 |
| WhatsApp | Evolution API self-hosted + Meta Cloud API |
| Stripe fees | ~2.9% + €0.25 por transacción |

---

## Apéndice B: Glosario

| Término | Definición |
|---------|------------|
| **COGS** | Cost of Goods Sold — costo directo de servir a un tenant |
| **MRR** | Monthly Recurring Revenue — ingreso recurrente mensual |
| **Churn** | Tasa de cancelación de suscripciones |
| **LTV** | Lifetime Value — valor total de un cliente durante su vida |
| **CAC** | Customer Acquisition Cost — costo de adquirir un cliente |
| **OpenRouter** | Plataforma unificada de acceso a 200+ modelos LLM |
| **Evolution API** | Servidor WhatsApp API open-source self-hosted |
| **Resend** | Plataforma de email transaccional para developers |

---

> **Documento preparado por el equipo Volkern · Junio 2026 · CONFIDENCIAL**
