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

## Notas operativas

- La BD de desarrollo apunta a **Neon** (nube), no local — cualquier script que escriba tenant/usuarios lo hace en la nube; limpiar siempre después.
- `tsconfig.tsbuildinfo` y `.checkpoints/` son del entorno; no se tocan.
