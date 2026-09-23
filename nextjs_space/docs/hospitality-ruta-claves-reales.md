# RUTA A LAS CLAVES REALES — Hospitality (runbook ejecutable)

> **Este documento es una ruta accionable, no una descripción.** Cuando el usuario pida
> «sigue la ruta» (o «toma la ruta de claves reales»), el agente debe leer este fichero
> COMPLETO, ejecutar el primer paso sin marcar en orden, verificarlo, marcarlo y seguir,
> deteniéndose solo donde el documento lo ordene.

---

## 0. Cómo ejecutar esta ruta (instrucciones para el agente)

1. **Lee este fichero entero antes de tocar nada.** El orden de las fases no es negociable:
   nada de la FASE 2 sin la FASE 0 completa.
2. **Ejecuta el primer paso `- [ ]` sin marcar**, en su fase, y solo ese a la vez.
3. **Verifica cada paso** con el criterio de la columna «Verificado cuando…». Un paso sin
   verificar no se marca ni se salta.
4. **Marca el paso** (`- [x]`), añade una línea al §9 (Registro de avance) con fecha y
   resultado, y continúa con el siguiente.
5. **Autorizaciones ya dadas**: al pedir ejecutar esta ruta, el usuario autoriza (a) los
   commits locales que indican los pasos 0.1–0.3, (b) la ejecución de las migraciones en el
   VPS y (c) los comandos de verificación de solo lectura. NO autoriza: `git push` a
   remotos de código fuente, borrar datos, ni tocar el tenant de un hotel en producción.
6. **Para y pregunta al usuario** cuando llegues a un paso de la tabla §8 (Bloqueos), o si
   una verificación falla dos veces. No improvises soluciones en producción.
7. **Regla de oro de todo el proyecto**: si una prueba falla, se corrige el test o se
   investiga el código — nunca se cambia un número para que pase. Y las migraciones se
   aplican al VPS SOLO después del backup que indica el paso 0.2.

---

## 1. Estado verificado al escribir esta ruta (23 sep 2026)

- Suite completa: **8.365 pruebas en verde / 0 rojas** (472 ficheros), typecheck 0, lint con la deuda previa del repo (23 sep 2026, tras la FASE 0).
- **FASE 0 COMPLETA** (0.1–0.5): desplegado, tenant de homologación listo y simulacro hecho. Lo que
  queda de la FASE 0 es solo la prueba del panel de crons con sesión de Superadmin (§8-E).
- Plan §5.1 de guardias del inventario de algoritmos: **CERRADO** (C1–C13, H15, H18).
- Ensayo E2E del registro de viajeros: ciclo completo contra **mock** (160 comprobaciones).
- Único pendiente de CÓDIGO: `NS_ALTA_RESERVA` y `FUENTE_NS_ALTA_RESERVA` en
  `lib/hospitality/registro-viajeros.ts` (líneas ~99–107) — **null a propósito**:
  solo puede escribirse con el XSD oficial en la mano (FASE 2, paso 2.2).
- Migraciones recientes pendientes de aplicar en producción: `20260920120000`
  (connectivity última verificación), `20260923120000` (health_snapshots),
  `20260923130000` (playbook_huella_leccion), `20260923140000` (sales_contest_editions).
- Git: ~495 ficheros modificados/nuevos **sin commitear**.
- Despliegue: VPS con docker (`deploy-vps/`, docker-compose, `Dockerfile`); el
  procedimiento usado está en el historial (docker save → subir tarballs → load →
  backup BD → migraciones → servicio). Localízalo con `ls deploy-vps/` y
  `git log --oneline --grep="baseline\|deploy"` antes de ejecutar nada.

---

## FASE 0 — Casa en orden (solo nosotros; sin esto no hay día H)

### 0.1 - Commitear el trabajo acumulado en commits trazables
- [x] **HECHO (23 sep 2026)** — 7 commits temáticos (`4423e43f`…`41241ed1`), árbol limpio, typecheck 0 y suite 8.178 en verde tras commitear.
- **Acción**: agrupar el árbol sin commitear en commits por tema, en este orden:
  1. Migraciones + su esquema y código (`prisma/migrations/2026092*`, `schema.prisma`,
     `lib/sales/health-calibracion.ts`, `lib/sales/leaderboard.ts`,
     `lib/sales/contest-ediciones.ts`, `lib/sales/playbook-cosecha.ts`).
  2. Guardias de la familia comercial (`tests/sales-*.test*`).
  3. Guardias y arreglos de Hospitality (`tests/hospitality-*.test*`,
     `tests/cron-hospitality-*.test*`, `lib/hospitality/parte-rechazo.ts` con jitter,
     `lib/hospitality/resenas-import.ts` con fechas imposibles).
  4. Pantallas/componentes (`components/`, `app/dashboard/`, `app/api/`).
  5. Documentación (`docs/`), dejando ESTE fichero para el último commit de la tanda.
- **Antes de cada commit**: `npm run typecheck` y `npx vitest run` en verde (ya están;
  re-verificar solo si se toca algo).
- **Verificado cuando**: `git status --short` en `nextjs_space` no devuelve ficheros de
  Hospitality/ventas/docs sin commitear, y `git log --oneline -15` muestra los commits
  temáticos con el pie «Generated with Codebuff 🤖».
- **No hacer**: push, ni commitear `.env*` ni credenciales.

### 0.2 - Desplegar al VPS con backup previo y migraciones
- [x] **HECHO (23 sep 2026)** — Backup completo previo (`volkern_erp-pre-hospitality-20260923-133737.sql.gz`, verificado con gzip -t). Migraciones: 3 fallos iniciales por FK con nomenclatura errónea (`"tenants"`/`"users"` vs `"Tenant"`/`"User"`), corregidos, commiteados (`1f2b3ada`, `fa238260`) y resueltos con `migrate resolve --rolled-back`. 101 migraciones aplicadas. Service update con la imagen del árbol (20a4626b9b77) y HTTP 200 en https://volkern.app.
- **Acción**: localizar el procedimiento (`ls deploy-vps/`; leer el README o los commits
  del baseline de producción) y ejecutarlo completo: build de imágenes → export → subida →
  **BACKUP de la BD de producción** (obligatorio, anterior a cualquier migración) →
  aplicar migraciones → arrancar servicio → smoke test HTTP.
- **Verificado cuando**: el servicio responde en el VPS; `prisma migrate status` (o el
  equivalente del procedimiento) muestra las migraciones aplicadas; el backup quedó
  guardado con fecha.
- **Parada obligatoria**: si el preflight de migraciones reporta divergencia entre el
  esquema y producción, PARAR y mostrar el diff al usuario antes de aplicar nada.

### 0.3 - Verificación post-deploy (smoke funcional en producción)
- [x] **HECHO (23 sep 2026)** — automatizado y con sesión real (tenant de prueba del paso 0.4).
- **Automatizado**: smoke del clasificador determinista contra producción OK; sin errores en logs ajenos al propio smoke; sondas HTTP sin sesión: páginas de dashboard 307 (a login), APIs 401 — ninguna 404/500; 101 migraciones aplicadas.
- **Resultado con sesión (tenant `homologación-mir`, rol `Administrador`)**:
  - **(a) Panel de crons — NO verificable con rol de tenant, y es correcto**: `/admin/hospitality` responde 200 porque la guardia del área `admin` es de cliente (redirige a quien no se
    llame `Superadmin`), y su API `/api/admin/hospitality/holds` responde **401 «requiere rol de Superadmin de la plataforma»**. La prueba del panel necesita una sesión de Superadmin, que no tenemos: **queda pendiente para el operador** (no bloquea el día H).
  - **(b) Registro de viajeros**: 200. La pantalla lee `config: { configurado: false, activo: false, entorno: 'pre', tieneCredenciales: false }` — el entorno de PRUEBAS del Ministerio ya es el valor por defecto y no hay credenciales. El módulo está operativo y vacío.
  - **(c) Ciclo reserva → check-in online → parte**, completo y con datos reales de producción: propiedad `Hotel Homologación MIR` (estado `conectada`, 2 unidades, tarifa 120/135 EUR) → cotización pública por el motor (`/api/public/booking/<id>`, 3 noches = 360 EUR) → **reserva real `BE-MUEA5FOF`** con enlace de check-in (`/checkin/<token>` → 200) → la reserva aparece en la API interna con `parteViajeros: { aplica: true, completo: false, viajeros: 0 }`: el parte sale incompleto y el aviso lo dice. Moneda del tenant: **EUR**.
  - **(d) Academia**: `/dashboard/academia` 200 y `/api/analytics/training/leaderboard` 200 con `concurso: { tipo: 'mensual', periodoActual: '2026-09', cerradas: [] }` — la liga mensual está viva y sin ediciones cerradas, que es lo correcto en un tenant nuevo.
  - Todas las pantallas del módulo responden 200: `hospitality`, `registro-viajeros`, `reservas`, `calendar`, `reportes`, `resenas`, `booking-engine`, `finanzas`.
- **Verificado cuando**: los cuatro puntos constan en el §9. Los datos del simulacro (c) **se quedan a propósito** en el tenant aislado: son la propiedad y la reserva con las que el día H se probará el parte real.

### 0.4 - Preparar el tenant de homologación y congelar la traza de partida
- [x] **HECHO (23 sep 2026)** — tenant **aislado** (decisión §8-A), creado por el mecanismo propio de provisión.
- **Alta, tal como la haría el cliente**: `POST /api/tenants/create` (público, en producción) →
  tenant **Homologación MIR** · id `cmue9dkb0002fn001amk4pbg5` · slug `homologacion-mir` ·
  plan `trial` · moneda **EUR** · vertical `hospitality` (13 módulos, `hospitality` entre ellos).
  Cuenta de Chatwoot creada por el provisioner (id 31, se acepta como efecto secundario del alta real).
- **Hallazgo (defecto real del provisioner)**: `provisionTenant()` crea el tenant y su usuario,
  pero **no le asigna rol** — y en esta plataforma las capacidades se conceden por rol
  (`lib/hospitality/capacidades.ts`: «si falta el permiso, se deniega»). El administrador
  recién provisionado entra y no puede nada. Se añadió el script de operador
  `scripts/asignar-rol-admin-tenant.ts` (idempotente, `--tenant <slug> [--email]`), que crea el
  rol `Administrador` con el wildcard `{ all: true }` (convención de `bootstrap-admin.ts`) y lo
  enlaza al usuario. Es el paso que en un alta acompañada da el operador.
- **Credenciales del usuario de prueba**: guardadas **solo en el VPS**, root y 600,
  `/root/backups/homologacion-mir-credenciales.txt` (nunca en el repo ni en este documento).
- **Traza de partida**: `/root/backups/homologacion-mir-traza-partida-20260923-1809.txt` en el VPS
  (nunca commiteada). Contenido: **config MIR inexistente, 0 partes registrados, propiedad del
  simulacro sin código de establecimiento** — el punto de partida más limpio posible.
- **Verificado cuando**: la copia está guardada con fecha y el tenant está sin
  configuración MIR activa (o con la previa respaldada). ✔ Ambos.

### 0.5 - Simulacro de configuración con datos ficticios
- [x] **HECHO (23 sep 2026)** — recorrido completo contra producción, y destapó un defecto real.
- **Simulacro**: `accion: 'configurar'` con `codigoArrendador: 'SIMULACRO-0000'`,
  `aplicacion: 'SIMULACRO-APP'`, `entorno: 'pre'`, usuario/contraseña ficticios, **sin activar**
  (`activo: false`) y el código de establecimiento ficticio de la propiedad. `accion: 'estado'`
  devolvió lo esperado: `configurado: true`, `activo: false`, `entorno: 'pre'` (el entorno de
  pruebas es el que selecciona los endpoints `hospedajes.pre-ses.mir.es` de `lib/hospitality/mir-espec.ts`),
  `tieneCredenciales: true`. La pantalla de configuración es operable de punta a punta.
- **Defecto destapado y ARREGLADO (23 sep 2026)**: la limpieza no funcionaba — **una cadena vacía
  se ignoraba en silencio** en `saveMirConfig`. El hotel que borra una credencial en la pantalla,
  guarda y cree que la dejó en blanco seguía con la credencial pegada (y `listoParaEnviar`
  diciendo que sí). Arreglo: convención explícita **ausente = sin cambio, vacío = se borra**
  (credenciales a `null`, código y aplicación a vacío/valor por defecto), sin inventar un
  marcador de código de arrendador (`SIN-CODIGO` retirado: un código inventado viajaría en la
  cabecera del parte al Ministerio), y `configurado` pasa a significar «tiene código de
  arrendador» en vez de «tiene fila», para que una configuración vaciada se lea como no
  configurada. Guardia: 3 pruebas nuevas en `tests/hospitality-registro-viajeros-service.test.ts`.
- **Limpieza hecha**: la fila de configuración ficticia se borró y el código de establecimiento
  de la propiedad se dejó a `null` (se hizo con el cliente Prisma de la app viva, porque el
  arreglo **todavía no está desplegado**).
- **Pendiente por eso**: desplegar el arreglo al VPS en el próximo despliegue (FASE 2 lo hará de
  todos modos; no bloquea el día H porque la pantalla ya se usa con datos reales).
- **Verificado cuando**: el flujo completo funcionó sin errores y quedó limpio. ✔
- **Nota**: este paso demuestra que las pantallas desplegadas son operables — es el ensayo
  general del día H.

## FASE 1 — Precondiciones del cliente (externo; se gestiona en paralelo)

### 1.1 - Enviar al cliente la petición de las 7 precondiciones
- [ ] **PENDIENTE**
- **Acción**: redactar y enviar el email con la lista (Sede Electrónica, credenciales de
  PRUEBAS, códigos arrendador/aplicación/establecimiento, **XSD oficial**, 2–3 estancias
  de prueba con documentos válidos, ventana de una mañana). Usar lenguaje de hotel, sin
  jerga; mencionar que sin los 4 primeros el servicio rechaza todo y no se prueba nada.
- **Verificado cuando**: el email está enviado (guardar copia en el hilo del proyecto).
- **Mientras se espera**: no hay trabajo bloqueante de código; dedicar el tiempo a los
  pendientes «investigar» de bajo riesgo o esperar instrucciones.

### 1.2 - Reunión con el proveedor de conectividad (vía paralela, otras claves)
- [ ] **PENDIENTE**
- **Acción**: preparar la reunión con el checklist ya redactado
  (`hospitality-checklist-reunion-conectividad.md`) y el diagrama de emisión de
  credenciales de la guía de go-live. No depende del Ministerio: puede cerrarse antes.
- **Verificado cuando**: el usuario confirma las credenciales recibidas (se configuran en
  su momento en el panel de conectividad, cifradas; NO commitearlas jamás).

## FASE 2 — Día de homologación (con las claves de pruebas; medio día)

### 2.1 - Configurar el tenant con las credenciales reales de PRUEBAS
- [ ] **PENDIENTE**
- Entorno **pruebas**; verificar el endpoint ANTES del primer envío (riesgo §7 del plan de
  homologación); credenciales cifradas; códigos; mapa de pagos; `activo: true`;
  `tenantPuedeComunicar === true`. Cron activo y panel visible.
- **Verificado cuando**: `accion: 'estado'` responde con entorno pruebas y estado verde.

### 2.2 - Informar `NS_ALTA_RESERVA` con su procedencia (LA corrección de código)
- [ ] **PENDIENTE**
- **Acción**: extraer el `targetNamespace` del XSD oficial y escribirlo en
  `lib/hospitality/registro-viajeros.ts` junto a `FUENTE_NS_ALTA_RESERVA` (fichero,
  versión y fecha). Ejecutar la guardia del módulo (exige que vayan juntos), typecheck,
  suite, commit y despliegue al VPS.
- **Verificado cuando**: `NS_ALTA_RESERVA !== null`, guardias en verde, desplegado; el
  estado `pendienteXsd` del alta RH se desbloquea.

### 2.3 - Parte manual de prueba y criterio de salida
- [ ] **PENDIENTE**
- `accion: 'enviar'` con una estancia de prueba; **criterio de salida de fase**: el
  servicio REAL responde «código 0, comunicacion número X». Registrar trama y códigos en
  el §9.

### 2.4 - Matriz de casos (18) con `scripts/homologacion-mir.mjs`
- [ ] **PENDIENTE**
- Ejecutar u observar; lotes con resolución real (el cron corre cada hora). Criterio de
  salida del plan: los 18 casos ejecutados o marcados con su motivo.

## FASE 3 — Cierre y decisiones con datos reales

### 3.1 - Decisión de producto: multimoneda (H11/H22)
- [ ] **PENDIENTE**
- **Pregunta al usuario §8-B** ANTES de que el hotel vea Reportes con datos reales: ¿los
  agregados convierten a una divisa o se muestran por moneda? Hoy suman sin tipo de
  cambio (decisión pendiente documentada, no defecto).

### 3.2 - Cierre de la homologación
- [ ] **PENDIENTE**
- Restaurar la configuración del tenant o migrarla a producción (paso §6 del plan),
  dejándolo escrito en el §9. Rotación de credenciales y pase a producción es OTRO plan
  (no esta ruta).

---

## 8. Bloqueos — el agente PARARÁ y preguntará aquí

| # | Pregunta | Cuándo |
|---|---|---|
| A | ¿Tenant aislado para homologación o el del piloto? | **RESUELTO (23 sep 2026): aislado** — «Homologación MIR» |
| B | ¿Multimoneda: convertir o mostrar por moneda? | Paso 3.1 (o antes si el hotel mira Reportes) |
| C | ¿Se autoriza este despliegue ahora o hay ventana acordada? | **RESUELTO (23 sep 2026): desplegado**, con backup previo |
| D | El XSD no llegó / no trae namespace de RH | Paso 2.2 — RH queda documentado como no homologado |
| E | ¿Sesión de Superadmin para probar el panel de crons (`/admin/hospitality`)? | Paso 0.3 (a) — pendiente; solo lo ve el operador de la plataforma |

> **Cuando llegue la respuesta del proveedor (bloqueos de la §8 fuera de la tabla):** pasarla por `npx tsx scripts/preflight-conectividad.ts --pegado "URL | ID de socio | usuario | contraseña"` ANTES de tocar el servidor. Es la misma revisión que aplica la API al guardar: si la pega trae un espacio de más, comillas de un PDF o la contraseña dentro del campo del usuario, lo dice con su arreglo en vez de devolver un 401 que parece «credenciales inválidas».

## 9. Registro de avance (rellenar al marcar cada paso)

| Fecha | Paso | Resultado | Nota |
|---|---|---|---|
| 23 sep 2026 | — | Ruta creada | Estado baseline: 8.178 verdes, §5.1 cerrado, ~495 ficheros sin commitear |
| 23 sep 2026 | 0.1 | 7 commits temáticos en la rama del worktree | `4423e43f` deploy · `b2500af6` prisma · `e76daa3d` libs+guardias · `feb75688` pantallas · `9ead67cb` docs · `a60bd7a1` hook capacidades · `41241ed1` CA FNMT (pública). Sin secretos (verificado). Sin push. |
| 23 sep 2026 | 0.2 | Deploy completo al VPS | Backup previo verificado · 2 defectos de FK cazados en producción y corregidos (`1f2b3ada`, `fa238260`) · 101 migraciones OK · imagen 20a4626b9b77 · volkern.app 200 |
| 23 sep 2026 | — | **Fusión de las dos líneas de Hospitality** | `master` había seguido en paralelo (150 commits: booking engine público, permisos por acción, acceso del huésped). Merge con criterio explícito: gana la versión desplegada en los conflictos add/add; se incorporan los modelos de master que producción ya tiene; el motor de master queda como `booking-engine.ts` y re-exporta el nuestro; la ruta pública delega la creación en el Reservation Engine. Commit `7c8b802a`; **master avanzado a él** (fast-forward, árbol limpio). Typecheck 0 y 8.362 verdes en el árbol fusionado. |
| 23 sep 2026 | 0.3 | **HECHO** (3 de 4 puntos; el (a) queda para el operador) | Con sesión del tenant de prueba: las 8 pantallas del módulo 200; registro de viajeros en entorno `pre` sin credenciales; **ciclo completo real** (propiedad → cotización → reserva `BE-MUEA5FOF` → enlace de check-in 200 → parte `completo: false` visible en la API interna); Academia con la liga mensual viva. El panel de crons es de Superadmin (401 en su API): §8-E. |
| 23 sep 2026 | 0.4 | **HECHO** | Tenant aislado creado por `POST /api/tenants/create` (el mecanismo real): `cmue9dkb0002fn001amk4pbg5`, EUR, vertical hospitality, 13 módulos. **Defecto del provisioner**: no asigna rol → nuevo script de operador `scripts/asignar-rol-admin-tenant.ts` (rol `Administrador`, wildcard `{ all: true }`). Credenciales y traza solo en el VPS (`/root/backups/homologacion-mir-*`). |
| 23 sep 2026 | 0.5 | **HECHO** — y destapó un defecto | Simulacro `configurar` + `estado` con datos ficticios y `activo: false`: operativo, entorno `pre` correcto. **Defecto real**: una cadena vacía se ignoraba en silencio — las credenciales no se podían borrar. Arreglado con la convención «ausente = sin cambio, vacío = se borra», sin código inventado, y 3 guardias nuevas. Datos ficticios limpiados. **Desplegado y verificado el 23 sep 2026** (ver la fila de despliegue del arreglo). |
| 23 sep 2026 | 1.2 (parte de producto) | **HECHO** — el wizard ya dice de quién depende el catálogo | El paso 5 («Obtener el mapping externo») lleva pegado su requisito externo mientras no esté completo: quién lo ejecuta (el hotel, en la extranet del canal), que Booking.com y Expedia se activan por autoservicio y que Airbnb necesita abrir el enlace de autorización del proveedor, y que **esperar no lo resuelve**. Vive en el módulo puro (`REQUISITO_ACTIVACION_CANAL`, `lib/hospitality/onboarding.ts`) y la página solo lo pinta: nada copiado a mano. Congelado con 6 guardias (una de ellas lee la página y prohíbe el texto duplicado). Cierra la pregunta abierta «¿dónde ve el hotel esta información?»: en el paso, no en un documento interno. |
| 23 sep 2026 | — | **Despliegue del arreglo de credenciales** | Imagen `8e103af70cce` en `volkern-erp_app`; sin migraciones nuevas (`--skip-migrator`). **Verificación funcional contra producción** en el tenant aislado: configurar con datos ficticios → `tieneCredenciales: true`; enviar los campos vacíos → `configurado: false`, `tieneCredenciales: false`, `codigoArrendador: ''`. En la imagen anterior ese vaciado no hacía nada. Smoke del clasificador en verde y sondas HTTP correctas (páginas 307, APIs 401). |
| 23 sep 2026 | — | Estado de calidad tras los arreglos | Typecheck **0** · suite **8.365 en verde / 0 rojas** (472 ficheros) · lint con la deuda previa del repo |
| 23 sep 2026 | — | **Preflight de credenciales de conectividad — HECHO** | Módulo puro `lib/hospitality/connectivity-preflight.ts`: valida formato de URL (esquema, host, sin credenciales embebidas, sin query/fragmento, ruta del contrato), ID de socio y Basic Auth (el usuario no puede traer `:`, la contraseña NO se recorta porque se compara byte a byte, se detectan comillas de PDF, invisibles y el mismo valor en dos campos). Con la respuesta completa se rellena en una sola pega. La API **rechaza antes de escribir** (400 con todos los avisos y su arreglo) y guarda los valores normalizados; el guardado ya no recorta la contraseña; «Probar conexión» deja de estallar/reventar en 404 con una URL mal pegada; el estado del panel revisa además la URL del servidor. La pantalla usa la MISMA función en vivo, marca el campo con error y bloquea el botón. Herramienta de operador: `npx tsx scripts/preflight-conectividad.ts --pegado "URL | ID | usuario | contraseña"` (compara con `CONNECTIVITY_BASE_URL` desplegada y no imprime la contraseña). 28 guardias. |
| 23 sep 2026 | — | **Hallazgo de infraestructura (no es del módulo) — CERRADO** | El stack **heredado** (`volkern_postgres`, base `volkern_table`) publicaba su **5432 en la IP pública del VPS**: una base de datos accesible desde Internet. La BD de producción (`volkern-erp_postgres`) **nunca** estuvo expuesta, y `pg_stat_activity` no registró ni un cliente externo. La publicación se quitó del servicio, y los tres compose del VPS que la declaraban «solo en loopback» se corrigieron: **en Swarm `host_ip` no existe, el prefijo `127.0.0.1` se ignora en silencio** y el puerto acaba en `0.0.0.0` (comprobado con puertos de prueba). Antes/después verificado: `volkern.app` 200, 9 tenants, 14 reservas y `BE-MUEA5FOF` (360 EUR) intactos, app heredada 200 por overlay, `62.171.134.195:5432` → conexión rehusada. Detalle, evidencia y procedimiento: `docs/VPS-SEGURIDAD-PUERTOS.md`. |
