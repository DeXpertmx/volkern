# PENDIENTES — Volkern

Anotado el 2026-08-11. Estado real de cada tema para retomar donde se quedó.

## Resueltos

- **Chatwoot en el signup (bloqueaba el onboarding)** — `9b3f52a`: best-effort, ya no borra el tenant. Instancia reparada, token correcto `fQuQ...LtX7` verificado en `.env` y `.env.production.local`.
- **Chatwoot createAccountUser 422 "User must exist"** — `2e42d51`: crear usuario vía `POST /platform/api/v1/users` (password fuerte) y luego vincular con `account_users {user_id, role}`. E2E verificado contra la instancia real; quedó `scripts/e2e-provision-chatwoot.ts` para re-probar en cualquier momento.

## En curso

- **Perfil fiscal: "Error al actualizar perfil fiscal" + scroll del modal** — la API (POST/PATCH) escribe `pais`/`idFiscal`/`direccionFiscal`/`ciudadFiscal`/`estadoFiscal`/`codigoPostalFiscal`, pero la BD real (Neon) y el schema.prisma tienen los nombres viejos: `nif`/`country`/`address`/`city`/`province`/`zipCode`. Prisma lanza "Unknown argument" → 500. Fix: mapear la API a las columnas reales y devolver en GET los nombres que espera el componente. Modal: mover el scroll a un contenedor interno (header+footer fijos).

## Pendientes (por orden de valor)

1. ~~**Deuda técnica de campos mixtos en PerfilFiscalCliente**~~ — resuelto `cc8bcf1`: todos los consumidores (campaign-engine, tax-service modelo 349, variables-parser, from-cotizacion de ordenes y contratos) usan las columnas reales `nif`/`country`/`address`. `invoicing-service` y `fiscal-engine` ya mapeaban bien. La decisión de fondo (migrar la BD a los nombres nuevos vs consolidar los viejos) queda abierta pero ya no rompe nada en runtime.
2. **500 intermitente de `GET /platform/api/v1/accounts`** (Chatwoot) — POST/show/DELETE funcionan; revisar log de Rails cuando ocurra.
3. **Probar canal de Telegram completo** end-to-end (bot token real → inbox + webhook) ahora que Chatwoot responde.
4. **`.env.production`** sigue con CHATWOOT vacío (best-effort desactiva el canal en ese entorno) — activar URL+token si el despliegue de producción lo necesita.
5. **Resend: el plan solo permite 1 dominio** — el PASO 8 del provisioner falla con 403 para cada tenant nuevo (queda `pending_dns`). Decidir: subir plan, dominios por defecto, o aceptar configuración manual.
6. **Integrar `scripts/e2e-provision-chatwoot.ts` como check de regresión** en deploy/CI.
7. ~~**Campo "Motivo de exención" en el modal**~~ — resuelto `748a8bd`: el modal tiene el input obligatorio y el flujo exento ya no da 400.
8. **Unificar `ConfiguracionFiscalEmisor` vs `PerfilFiscalCliente`** — dos modelos paralelos de datos fiscales (emisor propio vs clientes) con campos distintos; verificar que la facturación los usa coherentemente.

## Notas operativas

- La BD de desarrollo apunta a **Neon** (nube), no local — cualquier script que escriba tenant/usuarios lo hace en la nube; limpiar siempre después.
- `tsconfig.tsbuildinfo` y `.checkpoints/` son del entorno; no se tocan.
