# PENDIENTES — Volkern

Anotado el 2026-08-11. Estado real de cada tema para retomar donde se quedó.

## Resueltos

- **Chatwoot en el signup (bloqueaba el onboarding)** — `9b3f52a`: best-effort, ya no borra el tenant. Instancia reparada, token correcto `fQuQ...LtX7` verificado en `.env` y `.env.production.local`.
- **Chatwoot createAccountUser 422 "User must exist"** — `2e42d51`: crear usuario vía `POST /platform/api/v1/users` (password fuerte) y luego vincular con `account_users {user_id, role}`. E2E verificado contra la instancia real; quedó `scripts/e2e-provision-chatwoot.ts` para re-probar en cualquier momento.

## En curso

- **403 en `GET /api/deals` para tenants con rol creado por `scripts/bootstrap-admin.ts`** — resuelto en código (ver abajo): el rol queda con `permisos: { all: true }` (wildcard) y `hasPermission()` no lo interpretaba → 403 en rutas con gating por módulo. **Requiere deploy** para que afecte a producción.
- **"Error al actualizar perfil fiscal" desde la página de contacto** — el PATCH `/api/contacts/[id]` devuelve el contacto crudo (no `{ success: true }`) y la página solo miraba `data.success` → mostraba el error aunque el guardado funcionara. Fix en las dos páginas (con y sin `[tenant]`) + normalización de `country` ("España" → "ES") en el PATCH. **Requiere deploy.**

## Pendientes (por orden de valor)

1. ~~**Deuda técnica de campos mixtos en PerfilFiscalCliente**~~ — resuelto `cc8bcf1`: todos los consumidores (campaign-engine, tax-service modelo 349, variables-parser, from-cotizacion de ordenes y contratos) usan las columnas reales `nif`/`country`/`address`. `invoicing-service` y `fiscal-engine` ya mapeaban bien. La decisión de fondo (migrar la BD a los nombres nuevos vs consolidar los viejos) queda abierta pero ya no rompe nada en runtime.
2. **500 intermitente de `GET /platform/api/v1/accounts`** (Chatwoot) — POST/show/DELETE funcionan; revisar log de Rails cuando ocurra.
3. **Probar canal de Telegram completo** end-to-end (bot token real → inbox + webhook) ahora que Chatwoot responde.
4. **`.env.production`** sigue con CHATWOOT vacío (best-effort desactiva el canal en ese entorno) — activar URL+token si el despliegue de producción lo necesita.
5. **Resend: el plan solo permite 1 dominio** — el PASO 8 del provisioner falla con 403 para cada tenant nuevo (queda `pending_dns`). Decidir: subir plan, dominios por defecto, o aceptar configuración manual.
6. **Integrar `scripts/e2e-provision-chatwoot.ts` como check de regresión** en deploy/CI.
7. ~~**Campo "Motivo de exención" en el modal**~~ — resuelto `748a8bd`: el modal tiene el input obligatorio y el flujo exento ya no da 400.
8. **Unificar `ConfiguracionFiscalEmisor` vs `PerfilFiscalCliente`** — dos modelos paralelos de datos fiscales (emisor propio vs clientes) con campos distintos; verificar que la facturación los usa coherentemente.
9. ~~**403 por wildcard `{ all: true }` en permisos**~~ — resuelto en código (pendiente de deploy): `hasPermission`/`getVisibleModules` ahora entienden `permisos.all === true` y `permisos[module] === true` (shape de `bootstrap-admin.ts`). Afectaba a tenants nuevos (dexpert incluido): `GET /api/deals` daba 403.
10. ~~**Múltiples tipos de IVA por proveedor**~~ — implementado (pendiente de deploy): `Supplier.vatRates` (Float[], columna aplicada en Neon), editor en la página de proveedores (crear + detalle), y el formulario de gasto ofrece un select con los tipos del proveedor (pre-rellenado por OCR, con opción manual). Tests `erp-suppliers.test.ts`.
11. ~~**Autocalcular cuota de IVA en el gasto**~~ — implementado (pendiente de deploy): al elegir el tipo o cambiar la base imponible, `vatAmount` se recalcula (base × tipo / 100) vía `lib/finance/vat.ts`. Tests `vat.test.ts`.
12. ~~**Mostrar base/IVA/IRPF en gastos**~~ — implementado (pendiente de deploy): columnas Base e IVA en el listado, y tarjeta "Desglose de Impuestos" (base, IVA, IRPF, total) en el detalle de verificación.

## Notas operativas

- La BD de desarrollo apunta a **Neon** (nube), no local — cualquier script que escriba tenant/usuarios lo hace en la nube; limpiar siempre después.
- `tsconfig.tsbuildinfo` y `.checkpoints/` son del entorno; no se tocan.

---

# 2026-09-12 — Pendientes nuevos (dejados aquí para retomar al día siguiente)

Salió de la revisión de las páginas legales, del cobro por verticales y del despliegue a producción del 12 sep. **Nada de esta lista está hecho**: son hallazgos verificados contra el código y contra producción, pendientes de decisión o de arreglo.

## Estado al cierre del 12 sep (para no repetir trabajo)

- **`master` = `origin/master` = `b7c5b758`**, árbol limpio. CI en verde (Vitest 341 archivos, E2E Reconciliation).
- **Desplegado al VPS** con `deploy-local.sh --skip-migrator`: build `0a2ca23a5e48`, smoke 12/12, servicio `1/1`.
- **Verificado en vivo**: las 4 páginas legales ya sirven `3 de septiembre de 2026 · Versión 2026-09`, la tabla nueva está en la privacidad y el lenguaje de borrador es 0 en las cuatro.
- El paso **`[4b/5]`** (verificación del image ID) se validó en su primer despliegue real: `0a2ca23a5e48 = 0a2ca23a5e48`.
- Ojo: **`volkern.app` lo sirve el VPS**, no Vercel (`admin.volkern.app` sí es Vercel). Un push a master **no** publica las páginas públicas.

## Pendientes por orden de valor

1. **Decidir qué proveedores de IA quedan vivos.** El código puede llamar a **cinco**: OpenRouter, DeepSeek, OpenAI, Anthropic y Google (`api.deepseek.com` incluido). DeepSeek tiene sede en **China**: una llamada real es transferencia internacional a un país sin decisión de adecuación y exige cláusulas contractuales tipo **y** evaluación de impacto. **No se arregla redactando**; hay que confirmar cuáles están en uso, apagar los que no, y solo entonces ajustar la política.
2. **Error del chatbot que falla en silencio en producción.** `[ChatbotService] Error extrayendo facts (fire-and-forget): PrismaClientKnownRequestError: Invalid \`prisma.conversation.update()\` invocation`. 2 apariciones en 400 líneas de log del contenedor nuevo. Es **previo** al despliegue del 12 sep y es *fire-and-forget*, así que falla sin que el usuario lo note.
3. **Planes huérfanos en producción.** Hay **11 valores de plan** distintos y ninguno es una vertical: `basico` 6, `pro-accounting` 4, `growth` 3, `accounting-slot` 2, `infinity` 2, `enterprise` 1, `premium` 1, `pro-agency` 1, `profesional` 1, `trial` 3, `agency-slot` 7. **`growth` (3 tenants) y `enterprise` (1) no existen en el código**: `getPlanConfig` devuelve precio 0 y cae **en silencio** a los límites de Esencial. Decidir: migrarlos a la vertical o a los límites correctos, **sin cambiar su importe**.
4. **Bug de precio en el motor dinámico.** Calcula el año como **80 % del importe MENSUAL** y lo cobra como anual: un descuento del ~92 %, casi con seguridad un error. Cambiarlo altera importes, por eso no se tocó.
5. **Falta el proveedor del VPS como encargado en la política de privacidad.** La política nombra Vercel, pero la aplicación corre en un VPS y ahí viven la base de datos y los documentos. Un proveedor de infraestructura que aloja datos personales **es un encargado** y debe figurar. Marcado como **bloqueante** en `docs/compliance/ENCARGADOS-DPA-PENDIENTES.md`, con la fila deliberadamente sin nombre en lugar de publicar un dato inventado. **Lo primero: averiguar quién aloja el VPS.**
6. **Correos dispares entre páginas legales.** Conviven `privacidad@volkern.app`, `soporte@volkern.app`, `security@dimensionexpert.com` y `dpo@volkern.app` (este último definido en otros documentos legales pero ausente de la política). Es anterior a los cambios del 12 sep, pero en una revisión legal se nota.
7. **Confirmar por escrito la retención de los proveedores de IA.** La política afirma que no se usan datos para entrenar modelos de terceros; con proveedores externos reales eso depende de la retención configurada en cada contrato. Es una comprobación contractual, no de código.

## Referencia

- Comprobaciones pendientes de DPA, con el antes y el después de cada fila: `docs/compliance/ENCARGADOS-DPA-PENDIENTES.md`.
- Guardias que ya protegen esto (no romperlas): `tests/legal-pages-consistency.test.ts`, `tests/vertical-plans.test.ts`, `tests/deploy-docker-templates-guard.test.ts`, `tests/deploy-scripts-syntax-guard.test.ts`.
