# Política de sesiones del ERP

> Aplica al ERP de Volkern (Next.js + next-auth v4, estrategia **JWT**).
> La app móvil (Gemma) usa su propio sistema (`CustomerAuthService`, con
> `CUSTOMER_JWT_SECRET`) y **no** se rige por este documento.

## Resumen

| Regla | Valor | Dónde vive |
|---|---|---|
| Vida absoluta de la sesión | **24 h** | `session.maxAge` en `lib/auth.ts` |
| Cierre por inactividad | **1800 s (30 min)**, configurable | `SESSION_IDLE_TIMEOUT_SECONDS` → `lib/session-policy.ts` |
| Ventana de aviso previo | **120 s** (nunca más de la mitad del timeout) | `SESSION_EXPIRY_WARNING_SECONDS` → `lib/session-policy.ts` |
| Sesiones simultáneas por usuario | **sin límite** (revocables en bloque) | `tokenVersion` en BD y en el JWT |
| Cookie de sesión | `next-auth.session-token` (httpOnly, SameSite=Lax) | `lib/session-policy.ts` / `lib/auth.ts` |

## 1. Varias sesiones simultáneas y revocación explícita

Al iniciar sesión (`authorize()` en `lib/auth.ts`) el JWT recibe el
`User.tokenVersion` vigente como claim `tokenVersion`. **El login no incrementa
`tokenVersion`**: iniciar sesión en un dispositivo no toca las sesiones ya
abiertas.

En cada petición, el callback `session` compara el `tokenVersion` del JWT con
el vigente en BD:

- coinciden → sesión válida;
- no coinciden, o el usuario ya no existe → **sesión vacía** (equivale a no
  autenticado);
- la consulta a BD falla → *fail-open* (se permite la sesión y se registra el
  aviso `session_version_check_unavailable`): un fallo puntual de base de datos
  no debe cerrar en bloque todas las sesiones.

Consecuencias:

- un usuario puede tener **varias sesiones a la vez** (escritorio, móvil, otra
  pestaña); abrir una no cierra las demás;
- el endpoint `POST /api/auth/logout-all` incrementa `tokenVersion` y por eso
  **revoca todas** las sesiones del usuario de inmediato; es el único camino
  para cerrar sesiones ajenas sin esperar a su caducidad;
- los JWT sin `tokenVersion` (p. ej. acuñados a mano) se aceptan hasta que
  caduquen solos; los que lo llevan se validan contra BD como el resto.

> **Cambio del 2026-11-20.** Antes cada login incrementaba `tokenVersion`, de
> modo que entrar desde el móvil invalidaba la sesión del escritorio. El chat
> abierto en esa pestaña recibía 401 en cada mensaje y el cliente lo mostraba
> como un error genérico («No pude procesar tu mensaje»), un callejón sin
> salida: reintentar no servía y no se pedía volver a iniciar sesión. Ahora el
> login no revoca nada, y el chat, ante un 401, avisa de que la sesión se cerró
> y ofrece el login con `callbackUrl=/chat`.

## 2. Cierre por inactividad

"Inactividad" = **tiempo sin peticiones válidas del usuario** (no mide ratón ni
teclado). El reloj lo lleva el claim `lastActivity` (epoch en segundos) del JWT.

- **Middleware** (primera línea): en cada petición a ruta protegida comprueba
  `isSessionIdleExpired`. Si pasó más del timeout:
  - páginas (`/dashboard`, `/app`, `/admin`) → redirect a login **limpiando la
    cookie**;
  - APIs → **401** con `code: "SESSION_IDLE_EXPIRED"`.
- **Refresco deslizante**: cada petición válida re-emite la cookie con
  `lastActivity = ahora`, así la ventana cuenta desde la última actividad.
- **Callback `session`** (segunda línea): si `getServerSession()` ve una sesión
  inactiva, devuelve sesión vacía — ningún `getServerSession()` puede usar una
  sesión caducada aunque la petición no pase por el middleware.
- Los tokens **sin** `lastActivity` (legacy o acuñados a mano) **no** expiran por
  inactividad: caducan solos por su `exp` absoluta de 24 h.

### Configuración

`SESSION_IDLE_TIMEOUT_SECONDS` (segundos). Si falta o es inválida (≤0 no
numérica), se usa **1800** por defecto.

En el VPS la variable vive en `/root/volkern-erp/.env` (el `env_file` del stack
`deploy-vps/volkern-erp.yaml`). Para cambiarla:

```bash
# 1. Editar la fuente de verdad (para que un re-deploy del stack la conserve)
ssh root@62.171.134.195 'printf "\nSESSION_IDLE_TIMEOUT_SECONDS=3600\n" >> /root/volkern-erp/.env'

# 2. Aplicarla al servicio ya en marcha (docker service update NO re-lee env_file)
ssh root@62.171.134.195 'docker service update --env-add SESSION_IDLE_TIMEOUT_SECONDS=3600 volkern-erp_app'
```

> `docker stack deploy` **sí** re-lee el `.env`; `docker service update` no. Por
> eso hay que hacer las dos cosas: el `.env` es la fuente de verdad y
> `--env-add` el efecto inmediato.

## 3. Aviso de sesión a punto de expirar (dashboard)

El dashboard monta `components/session-idle-warning.tsx` (en
`DashboardLayout`). Cuando al servidor le quedan **≤ 120 s** de ventana:

- muestra una tarjeta fija con **cuenta atrás** y el botón **«Seguir
  conectado»**;
- el botón llama a `POST /api/session/renew`, que pasa por el middleware y
  re-emite la cookie (renueva la ventana);
- si la sesión ya expiró, ofrece **volver a iniciar sesión** con el
  `callbackUrl` de la página actual.

Endpoints implicados:

| Endpoint | Método | Efecto |
|---|---|---|
| `/api/session/status` | `GET` | **Solo informa** (segundos restantes, timeout, ventana). El middleware lo **exime** del refresco deslizante. |
| `/api/session/renew` | `POST` | **Renueva**: el middleware re-emite la cookie. |

> Importante: el sondeo de estado **no** mantiene viva la sesión (está exento del
> refresco). Solo renueva el botón, o la actividad real de la app (peticiones).

La cuenta atrás sale del servidor (`lastActivity` del JWT), no del reloj local,
para que coincida exactamente con lo que hará el middleware.

## 4. Cómo comprobarlo

```bash
# El contenedor debe tener la variable
ssh root@62.171.134.195 'docker service inspect volkern-erp_app \
  --format "{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}" | grep SESSION_IDLE'

# Sin cookie: el dashboard redirige al login limpiando la cookie
curl -s -o /dev/null -D - https://volkern.app/dashboard | grep -iE '^HTTP|^location|^set-cookie'
```

## Referencias de código

- `lib/session-policy.ts` — política pura y *edge-safe* (timeout, expiración,
  refresco, ventana de aviso, rutas).
- `lib/auth.ts` — `tokenVersion` en el JWT al iniciar sesión (sin incremento) y
  validación en el callback `session`.
- `middleware.ts` — comprobación por petición, cookie deslizante y `401
  SESSION_IDLE_EXPIRED`.
- `app/api/session/{status,renew}/route.ts` — estado y renovación.
- `tests/session-policy.test.ts`, `tests/session-auth-callbacks.test.ts`,
  `tests/middleware.integration.test.ts`, `tests/session-idle-warning.test.tsx`.
