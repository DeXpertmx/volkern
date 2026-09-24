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
- [x] **ENVIADO el 24 sep 2026** (confirmado por Bruno durante la sesión)
- Cuerpo: `hospitality-email-precondiciones-cliente.md` (las 7 precondiciones, sin
  adjuntos). El cliente debe devolver los puntos 1–4 (Sede Electrónica, credenciales de
  PRUEBAS, códigos, **XSD oficial**); el 5–7 se agenda después.
- **Recordatorio**: el 1 de oct 2026 (día 7) con la plantilla del
  `hospitality-checklist-envio-correos.md`. Si no hay respuesta, ahí se propone la
  llamada «pantalla a pantalla».

### 1.2 - Reunión con el proveedor de conectividad (vía paralela, otras claves)
- [x] **ENVIADO el 24 sep 2026** (confirmado por Bruno durante la sesión)
- Cuerpo: `hospitality-email-proveedor-conectividad.md` (36 preguntas, A/B bloqueantes)
  + adjunto `hospitality-connectivity-contract-externo.md` (contrato externo en inglés,
  ya expurgado). Convertir la respuesta en reunión/respuestas por escrito.
- **Recordatorio**: el 1 de oct 2026 (día 5 hábil) citando SOLO A y B, con la plantilla
  del `hospitality-checklist-envio-correos.md`.
- **Cuando llegue la respuesta**: `npx tsx scripts/preflight-conectividad.ts --pegado
  "URL | ID de socio | usuario | contraseña"` ANTES de tocar el servidor; verde →
  paso 2.1. Las credenciales, cifradas en el panel; NO commitearlas jamás.

## FASE 2 — Día de homologación (con las claves de pruebas; medio día)

> **Antes de esta fase: el día H ya está ensayado sin el proveedor.**
> `npm run test:e2e:dia-h` recorre, contra un simulador local del proveedor y con
> el código real (preflight → credenciales → `property_details` → mapping → push
> de inventario y tarifas → reserva empujada por webhook → check-in → modify →
> cancel → reconciliación), las 34 comprobaciones del día. Con la respuesta real
> del proveedor delante, lo único que cambia es pegar SUS valores: el formato se
> valida antes de guardar (`scripts/preflight-conectividad.ts`) y el resto del
> camino ya está probado. Detalle: `docs/hospitality-dia-h-simulador.md`.

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
- [x] **HECHO (23 sep 2026): mostrar por moneda, sin convertir**
- El defecto real no era «no convertir»: era que Reportes **sumaba divisas distintas bajo
  una sola etiqueta** (`analytics.kpisVentana`, `reportes.ts`), es decir, un «ingreso del
  período» que no era dinero de ningún sitio. Ya no se suma nunca: cada informe declara su
  divisa (`moneda`), los importes de las otras no entran en sus totales y se informan en
  `porMoneda`, con el aviso (`multimoneda.nota`) en la pantalla.
- **Por qué no se convierte**: convertir exige un tipo de cambio y hoy no hay ninguno
  autoritativo en el sistema. Un tipo inventado (constante, o el de otro día) produce una
  cifra peor que un total que dice en qué divisa está. La regla ya existía en la casa
  (`resumen.porMoneda` en Finanzas, `lib/insurance/currency.ts` en Seguros): Reportes era
  el único que no la aplicaba.
- La divisa del informe es la de los datos del período y, si no hay ninguno, la moneda de
  reporte del tenant (`Tenant.moneda`). Una reserva sin divisa hereda la del informe: no se
  inventa una nueva.
- **Si el hotel exige un total único**: el tipo de cambio entra explícito y auditado por
  `lib/hospitality/multimoneda.ts` (con fecha y origen), nunca como constante escondida.
  Mientras eso no exista, el informe muestra las dos cifras separadas, que es la verdad.

### 3.2 - Cierre de la homologación
- [ ] **PENDIENTE**
- Restaurar la configuración del tenant o migrarla a producción (paso §6 del plan),
  dejándolo escrito en el §9. Rotación de credenciales y pase a producción es OTRO plan:
  **el esqueleto de ese plan ya existe** — `docs/hospitality-plan-golive-produccion.md`
  (Fase A credenciales de producción por las dos vías, B rotación con contraprueba de
  credenciales viejas, C reconfigurar en limpio en el tenant real —no copiar el de
  homologación—, D checklist de corte con doble publish y rollback). Los huecos `____`
  se rellenan cuando lleguen los datos; nada se ejecuta hasta que la homologación esté
  SUPERADA (2.4 con los 18 casos).

---

## 8. Bloqueos — el agente PARARÁ y preguntará aquí

| # | Pregunta | Cuándo |
|---|---|---|
| A | ¿Tenant aislado para homologación o el del piloto? | **RESUELTO (23 sep 2026): aislado** — «Homologación MIR» |
| B | ¿Multimoneda: convertir o mostrar por moneda? | **RESUELTO (23 sep 2026): mostrar por moneda, sin convertir** — es la regla que ya aplicaban Finanzas y Seguros; ver §3.1 |
| C | ¿Se autoriza este despliegue ahora o hay ventana acordada? | **RESUELTO (23 sep 2026): desplegado**, con backup previo |
| D | El XSD no llegó / no trae namespace de RH | Paso 2.2 — RH queda documentado como no homologado |
| E | ¿Sesión de Superadmin para probar el panel de crons (`/admin/hospitality`)? | **REDUCIDO (24 sep 2026): la necesidad operativa queda cubierta sin sesión.** El job que el panel debía vigilar corre 2×/día con resultado verificable por fuera: `hospitality-reconcile` OK (200) a las 04:00 y 07:00 los últimos 4 días (log `/var/log/volkern-cron.log`), sync logs con 26 `exito` y 2 `error` históricos, y detalle de la divergencia pendiente consultable por el operador con `psql` (sección 14, tipo `reconciliacion`, conservador). Queda abierto SOLO como prueba de UI del panel; no bloquea la homologación |

> **Cuando llegue la respuesta del proveedor (bloqueos de la §8 fuera de la tabla):** pasarla por `npx tsx scripts/preflight-conectividad.ts --pegado "URL | ID de socio | usuario | contraseña"` ANTES de tocar el servidor. Es la misma revisión que aplica la API al guardar: si la pega trae un espacio de más, comillas de un PDF o la contraseña dentro del campo del usuario, lo dice con su arreglo en vez de devolver un 401 que parece «credenciales inválidas». Con el preflight en verde, el ensayo contra el proveedor se ejecuta con la receta del día H real: `docs/hospitality-dia-h-real.md`.

### §8-E — Diseño del acceso de operador (auditoría 24 sep 2026, NO implementado)

**Qué hay:** el panel `/admin/hospitality` (340 líneas, client component) consulta
`GET /api/cron-status` (estado de los jobs: última ejecución, resultado,
duración, avisos por tenant — incluidos los partes que el barrido ya no
reintenta) y `GET /api/admin/hospitality/holds?dias=N` (holds caducados por
tenant). Ambos endpoints usan `isAdminRequest()` → `isSuperadminRequest()`
(`lib/auth-helpers.ts`): exige **sesión NextAuth + rol de plataforma
`Superadmin`** (no un admin de tenant). El layout `app/admin/layout.tsx` hace
la misma comprobación en cliente. **La auditoría de producción encontró 2
usuarios con rol Superadmin ya existentes** (`admin@volkern.app` verificado,
y otro sin verificar). **Conclusión: no falta ningún cambio de código** — el
acceso ya está diseñado y guardado correctamente; lo que faltaba era una
sesión de uno de esos dos usuarios.

**Cómo lo usaría el operador (sin tocar código):**

1. Recuperar la contraseña del Superadmin elegido (`admin@volkern.app`):
   mecanismo normal de reset por email, **no** por SQL.
2. `/auth/login` → redirección automática al backoffice `/admin` (el layout
   ya la hace para Superadmin).
3. Sidebar → «Hospitality»: estado de los crons (el reconcile diario, los
   avisos del registro de viajeros por tenant) y holds caducados con su
   ventana configurable.
4. Alternativa ya disponible sin UI: los mismos datos por `psql` —
   `hospitality_sync_logs` y `/var/log/volkern-cron.log` (usado en el §9).

**Si algún día se quisiera acceso SIN sesión de Superadmin** (p. ej. un token
de operador de plataforma tipo `CRON_SECRET`, que ya existe y solo habilita
las 3 rutas `/api/cron/*`):

- **No reutilizar `CRON_SECRET`** para leer paneles: convierte un secreto de
  disparo en un secreto de lectura de datos cross-tenant, y viaja en la URL
  del cron (logs).
- **Diseño propuesto**: token dedicado `ADMIN_PANEL_TOKEN` (32 bytes hex,
  `openssl rand -hex 32`), entregado por el canal seguro, almacenado igual que
  `CRON_SECRET` (fuera del repo), y un `isPlatformOperatorRequest(req)` en
  `lib/auth-helpers.ts` que acepte **sesión Superadmin O** header
  `Authorization: Bearer <ADMIN_PANEL_TOKEN>` comparado en tiempo constante.
  Aplicarlo SOLO a las dos rutas de lectura del panel (`/api/cron-status`,
  `/api/admin/hospitality/holds`); nada de escritura. Los paths de la UI no
  cambian: el layout `app/admin/layout.tsx` sigue exigiendo rol Superadmin,
  así que el acceso por token sería para `curl`/scripting, no para el panel
  visual (que seguiría pidiendo sesión).
- **Por qué no se ha hecho hoy**: con `admin@volkern.app` existente y
  recuperable, el token solo añade una segunda llave que custodiar. Se
  activaría si el acceso por email se vuelve fricción habitual.
- **Guardia pendiente de ese futuro**: que ningún otro endpoint admin acepte
  el token; y que el token no aparezca en el repo (`grep` de `ADMIN_PANEL_TOKEN`
  fuera del diseño).

**No implementado a propósito**: la sesión existe, el panel funciona, y el
runbook ya ofrece el camino por `psql`. Este diseño solo se activa si el
equipo decide cambiar la forma de acceso.

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
| 23 sep 2026 | — | **Simulador del proveedor + ensayo del día H — HECHO** | `scripts/simulador-conectividad.mjs` implementa el contrato (property_details con habitaciones y planes, push de inventario/tarifas, `data` de reservas) y **exige Basic Auth de verdad**: sin credenciales 401, partner desconocido 403, hotel desconocido 404, y la contraseña con un espacio de más también 401. `npm run test:e2e:dia-h` recorre el día completo con el código real contra él: **34/34 en verde** (preflight con sus contrapruebas, guardado, catálogo, mapping, push, credenciales malas visibles, webhook `book` con la reserva creada en su unidad e importe/divisa del proveedor, enlace de check-in 200, idempotencia, `modify`, `cancel`, reconciliación, estado final y limpieza con restauración de la configuración previa). Guardia del contrato en `tests/hospitality-simulador-conectividad.test.ts` (9 comprobaciones). Ensayado sobre un PostgreSQL temporal en `/tmp` —no se tocó ninguna base compartida— y con la limpieza verificada tabla a tabla. |
| 23 sep 2026 | — | **Dos hallazgos de infraestructura (no del módulo)** | (1) La **BD de desarrollo compartida (Neon) está 20 migraciones por detrás**: le faltan `sesHospedajes`, `connectivity_providers`, `hospitality_property_details`… `next dev` contra ella falla al primer `property_details` (`P2022`), así que cualquier ensayo local necesita una base al día. (2) La **serie de migraciones no se puede reproducir desde cero**: `0_init` y `20260907_add_platform_whatsapp_instance` crean la misma tabla, y `migrate deploy` sobre una base vacía muere con `42P07: relation already exists`. Producción no lo nota porque está baselinada; un entorno nuevo sí. Arreglarlo es higiene de migraciones aparte (absorber el `20260907_*` en `0_init` sin perder el registro que producción ya tiene). |
| 23 sep 2026 | 3.1 | **HECHO — bloqueo B cerrado: multimoneda se muestra por divisa, sin convertir** | El defecto no era la falta de conversión sino la suma: Reportes (`reportes.ts`) y los KPIs del dashboard (`analytics.kpisVentana`, `mixDeCanales`, `perChannelRevenueTrend`) sumaban importes de divisas distintas y los etiquetaban con una sola. Ahora ningún total mezcla: el informe declara su divisa, `porMoneda` da ingresos/noches/ADR de cada una y `multimoneda.nota` lo dice en pantalla (con el reparto por propiedad en `otrasMonedas`). Se eligió «mostrar por moneda» porque es lo que ya hacían Finanzas y Seguros y porque no hay ningún tipo de cambio autoritativo: inventarlo daría una cifra peor que un total con su divisa. 18 guardias nuevas (`tests/hospitality-multimoneda.test.ts`), incluidas las de que el informe con una sola divisa no cambia y de que no existe tasa en el módulo. |
| 23 sep 2026 | — | **Preflight de credenciales de conectividad — HECHO** | Módulo puro `lib/hospitality/connectivity-preflight.ts`: valida formato de URL (esquema, host, sin credenciales embebidas, sin query/fragmento, ruta del contrato), ID de socio y Basic Auth (el usuario no puede traer `:`, la contraseña NO se recorta porque se compara byte a byte, se detectan comillas de PDF, invisibles y el mismo valor en dos campos). Con la respuesta completa se rellena en una sola pega. La API **rechaza antes de escribir** (400 con todos los avisos y su arreglo) y guarda los valores normalizados; el guardado ya no recorta la contraseña; «Probar conexión» deja de estallar/reventar en 404 con una URL mal pegada; el estado del panel revisa además la URL del servidor. La pantalla usa la MISMA función en vivo, marca el campo con error y bloquea el botón. Herramienta de operador: `npx tsx scripts/preflight-conectividad.ts --pegado "URL | ID | usuario | contraseña"` (compara con `CONNECTIVITY_BASE_URL` desplegada y no imprime la contraseña). 28 guardias. |
| 23 sep 2026 | — | **Hallazgo de infraestructura (no es del módulo) — CERRADO** | El stack **heredado** (`volkern_postgres`, base `volkern_table`) publicaba su **5432 en la IP pública del VPS**: una base de datos accesible desde Internet. La BD de producción (`volkern-erp_postgres`) **nunca** estuvo expuesta, y `pg_stat_activity` no registró ni un cliente externo. La publicación se quitó del servicio, y los tres compose del VPS que la declaraban «solo en loopback» se corrigieron: **en Swarm `host_ip` no existe, el prefijo `127.0.0.1` se ignora en silencio** y el puerto acaba en `0.0.0.0` (comprobado con puertos de prueba). Antes/después verificado: `volkern.app` 200, 9 tenants, 14 reservas y `BE-MUEA5FOF` (360 EUR) intactos, app heredada 200 por overlay, `62.171.134.195:5432` → conexión rehusada. Detalle, evidencia y procedimiento: `docs/VPS-SEGURIDAD-PUERTOS.md`. |
| 24 sep 2026 | — | **§8-E reducido a prueba de UI: los crons tienen evidencia por fuera del panel** | `hospitality-reconcile` OK (200) dos veces al día los últimos 4 días (`/var/log/volkern-cron.log`); `hospitality_sync_logs` acumula 26 corridas `exito` y 2 `error`; la **divergencia pendiente (1)** es una reserva que ya no existe en el proveedor y queda **conservadoramente registrada, nunca cancelada** — su detalle está en `HospitalityReservation` sección 14 (tipo `reconciliacion`). El operador puede consultarlo con `psql`; el panel `/admin/hospitality` queda como mejora de ergonomía, no como requisito. |
| 24 sep 2026 | — | **Serie de migraciones reproducible desde cero — CERRADO (con corrección del diagnóstico)** | El hallazgo original subestimaba: no eran 2 migraciones, eran **10** cuyas tablas/índices/FKs ya vivían en el baseline `0_init` (17 tablas + índices + FKs con `ADD CONSTRAINT`, 569 en el baseline). Producción lo confirmando: `0_init` registrada con `applied_steps=0` (baseline marcado, no ejecutado) y las tablas conservando los nombres de índice ORIGINALES — la absorción histórica ya estaba hecha; las carpetas eran chatarra que mataba `migrate deploy` en base nueva con `42P07`. Se retiraron las 10 y **se validó la serie completa (29 migraciones) sobre un PostgreSQL 16 temporal desde cero: todas aplicadas, 338 tablas, `prisma migrate diff` contra los modelos = migración VACÍA** (esquema equivalente, FKs incluidas). Guardia nueva `tests/migraciones-serie.test.ts` (3 comprobaciones: baseline con sus tablas, ninguna re-creación no idempotente — la única convivencia legítima es `IF NOT EXISTS`, caso `User_contactId_idx` — y las carpetas absorbidas no vuelven; probada también en negativo). |
| 24 sep 2026 | 1.1 y 1.2 (munición) | **Borradores de correo listos para enviar** | El del cliente (paso 1.1, `hospitality-email-precondiciones-cliente.md`) y el del proveedor (paso 1.2, `hospitality-email-proveedor-conectividad.md`) llevan su bloque de «preparación de envío»: qué rellenar, canal, adjunto (el contrato técnico **expurgado** del encabezado interno — sin expurgar se entrega nuestro plano), y el recordatorio programado (7 días el cliente, 5 hábiles el proveedor). Pendiente solo de que Bruno los envíe; al hacerlo, marcar el paso y anotar fecha. |
| 24 sep 2026 | **1.1 y 1.2 ENVIADOS** | **Los dos correos salieron** (confirmación de Bruno en sesión) | Cliente: las 7 precondiciones, sin adjuntos. Proveedor: 36 preguntas + adjunto del contrato externo en inglés. **Recordatorios fijados al 1 oct 2026** (día 7 / día 5 hábil) con las plantillas del checklist de envío. El reloj de terceros empieza aquí: lo único que separa del paso 2.1 es la respuesta del proveedor, y del 2.2 la del Ministerio. |
| 24 sep 2026 | — | **Sprint de valor inmediato 1/3 — estacionalidad en los planes de tarifa** | Módulo puro `lib/hospitality/estacionalidad.ts`: la noche cuesta la tarifa de **su propia fecha** (estándar hotelero, y es justo lo que sabe expresar el push por rango de fechas de los canales). La temporada es una tarifa **absoluta**, no un multiplicador, y el recargo de fin de semana solo se aplica a las noches **sin** temporada (una tarifa de temporada ya está completa). Los Json se normalizan una sola vez: un dato malformado se **descarta** —nunca revienta ni deja vender a 0, cae a la tarifa plana del plan—. `cotizarEstancia` suma noche a noche cuando hay estacionalidad (y **lanza** si una noche se queda sin precio) y la línea de alojamiento lo dice: «N noche(s) — desglose por temporada», con el detalle fecha a fecha en `payload.cotizacion.desgloseNoches`. `buildRateUpdates` mantiene **exactamente** el bloque plano de siempre cuando el plan no tiene estacionalidad (contrato de canales intacto) y segmenta en tramos de precio constante cuando la tiene. Columnas `Json?` nullable: los planes existentes no cambian de precio ni piden migración de datos. 21 guardias del módulo + 3 del push. |
| 24 sep 2026 | — | **Sprint de valor inmediato 2/3 — fianza manual (vía 1 del análisis Lodgify)** | La fianza es un **depósito, no un ingreso**: `calcularBruto` la excluye igual que la penalización y solo lo **retenido por daños** se convierte en ingreso (`calcularFianzaRetenida`), que factura el ERP. Se modela como **línea tipada de la reserva** (`tipo: 'fianza'`), no como tabla nueva: mismo molde que `penalizaciones.ts` —idempotente, una sola línea, y los informes financieros ya suman líneas—. Su estado vive en el concepto (`pendiente de cobro` → `cobrada — devolver a la salida` → `devuelta a la salida` / `aplicada a daños`), así que el módulo mueve el **estado** de la garantía y nunca el dinero: el cobro y la devolución siguen en Finanzas (pagos/Stripe). API `GET|POST|DELETE /api/hospitality/reservations/[id]/fianza` (ver / gestionar) con auditoría, y en la fila de reservas un botón de escudo con el ciclo completo. 8 guardias + las de invariantes financieras. |
| 24 sep 2026 | — | **Sprint de valor inmediato 3/3 — el huésped reserva y lee en su idioma** | El **asistente/widget** era la última superficie pública clavada en español. Ahora sus textos viven en `WIZARD_TEXTOS` (ES/EN, mismo `Record<Idioma, …>` que impide añadir un texto sin traducirlo) y el idioma lo resuelve el **servidor** leyendo `?lang` en las dos rutas que lo montan (`/reservar/<slug>` y `/embed/reservar/<slug>`): el widget nace entero en el idioma pedido —sin parpadeo ni hidratación distinta— y el conmutador son enlaces reales, así que funciona dentro del iframe. Las pantallas de «no existe» y «reservas apagadas» se distinguen entre sí y se traducen. Y el agujero de fondo que apareció al investigarlo: la reserva directa del **motor nuevo** no guardaba el idioma del huésped, de modo que quien reservaba en inglés recibía sus comunicaciones automáticas en español — ahora viaja en `guestData.idioma`, que es lo que lee `comunicaciones.ts` (una reserva de OTA sin idioma sigue cayendo a español). Guardias: paridad de claves, plural de noche, plantillas con variable, y de cableado (el asistente manda `lang`, el motor lo persiste y las dos páginas leen `?lang`). |
| 24 sep 2026 | — | Estado de calidad al cerrar el sprint | Typecheck **0** · suite **8.483 recogidas: 8.475 en verde, 8 saltadas, 0 rojas** (477 ficheros). Al correr la suite completa apareció **una roja ajena al módulo**: la guardia de plantillas Docker no clasificaba `docker service ls` (falso positivo — `{{.Name}}` es una columna válida de `deploy-vps/auditar-superficie.sh`), así que el comando queda clasificado en `REGLAS`. |
| 24 sep 2026 | — | **La estancia en temporada se enseña noche a noche en las DOS superficies públicas** | El asistente ya sumaba por noche (motor nuevo) pero solo publicaba la **media**; y la **página pública** (`/booking/<slug>`, el enlace que da el panel) cotizaba con la tarifa **plana** del plan: las temporadas no existían para ella —el mismo hotel cobraba dos precios según por qué enlace entrara el huésped—. Ahora el desglose viaja en la respuesta pública y las dos pantallas listan cada noche con **su fecha y su tarifa**; la media desaparece de la vista (no es un precio que nadie pague). `booking-rates.cotizarEstancia` (motor de la página) suma con el **mismo** módulo `./estacionalidad` que el asistente y el push, y las rutas públicas le pasan la estacionalidad del plan en **GET y POST**: lo que se enseña y lo que se guarda salen del mismo cálculo, y la línea de alojamiento lo dice («desglose por temporada»). La fecha de cada noche se lee como **día local** (`fechaDeNoche`): `new Date('2026-09-25')` es medianoche UTC y en América se leería como el 24 —justo en el desglose que el huésped está mirando—. Sin estacionalidad, `desgloseNoches` es `null` y todo queda exactamente como estaba (línea «N noches × tarifa» y total del servidor). Guardias: 4 del motor (temporada, fin de semana que **no** pisa la temporada, desglose nulo sin estacionalidad, temporada que no vuelve vendible una unidad sin precio base), 3 de cableado, 2 de render del asistente y 1 de la página pública. |
| 24 sep 2026 | — | Estado de calidad tras el desglose noche a noche | Typecheck **0** · suite **8.493 recogidas: 8.485 en verde, 8 saltadas, 0 rojas** (478 ficheros en verde). |
| 24 sep 2026 | — | **Capa 2 del pricing dinámico: antelación, ocupación y duración ajustan la tarifa ya estacional** | Módulo puro `lib/hospitality/ajustes.ts`: tres reglas clásicas de revenue management que mueven **en %** la tarifa que ya resolvió la capa 1, con cuatro decisiones explícitas. (1) **Un tramo por regla, el más específico** —aplicarlos en cascada multiplicaría descuentos que nadie sumó— y multiplican en lugar de sumar (dos −10 % son −19 %). (2) **Sin dato la regla no aplica**: sin llegada conocida no hay tramo de antelación, y una noche sin lectura de ocupación se queda sin ese tramo; nunca se inventa un porcentaje para poder cobrar. (3) **El factor tiene suelo y techo** (10 %–500 %): una configuración no puede regalar la noche —«nunca vende a 0» es regla del sistema— ni multiplicarla por veinte. (4) **Solo reserva directa**: un calendario de tarifas por fecha no puede expresar «si se reserva con 30 días de antelación» ni «si la estancia es de 7 noches», así que el push de canales sigue empujando la tarifa **publicada** de la capa 1 y las reglas de demanda ajustan la web (decidido, documentado en el propio `sync.ts` y congelado con guardia). La **demanda** la mide el Availability Engine (`ocupacionPorNoche`, en `availability.ts`): unidades vendibles ya ocupadas **o bloqueadas** por noche, con la misma regla de ocupación que usa la disponibilidad —una segunda cuenta habría hecho que el precio dependiera de quién pregunta—. Y el dinero se calcula en **un solo sitio**: la página pública dejó de sumar por su cuenta y ahora llama al mismo `pricing.cotizarEstancia` del asistente; con ajustes, cada noche se ajusta y se redondea a céntimo y el alojamiento es **la suma de lo que se enseña** (redondear el total al final daría un importe que no cuadra con su propio desglose). El desglose de las dos pantallas públicas lleva ahora `base` y el ajuste con su nombre: el huésped ve una etiqueta con el efecto total («−15 %») y el detalle por regla. En el panel, el editor del plan gana los tres bloques de tramos, un contador «Con ajustes por demanda» y su aviso de alcance. La antelación y la ocupación son del **momento**: se recalculan al reservar, y el importe guardado es el que el huésped ve en su confirmación. Columna `ajustes Json?` nullable: ningún plan existente cambia de precio ni pide migración de datos. 17 guardias del módulo + 5 de la ocupación + 8 de tarificación + 4 de cableado + 1 de render. |
| 24 sep 2026 | — | Estado de calidad tras la capa 2 | Typecheck **0** · suite **8.529 recogidas: 8.521 en verde, 8 saltadas, 0 rojas** (480 ficheros en verde). |

---

## 10. Política de CI para migraciones (24 sep 2026)

La garantía «la serie se aplica desde cero y produce el esquema de los
modelos» está congelada en CI, no solo en el repo. Tres workflows, tres
papeles distintos:

**`migrations.yml` — el especialista (base PROPIA, vacía de cero).** Corre en
PR/push que toquen `prisma/**` y con `workflow_dispatch`. Cuatro pasos en
orden creciente de valor:

1. Guardia estática (`tests/migraciones-serie.test.ts`): sin re-creaciones no
   idempotentes, carpetas absorbidas retiradas, baseline intacto.
2. `prisma migrate deploy` COMPLETO sobre PostgreSQL 17 efímero vacío — aquí
   muere con `42P07` cualquier reintroducción de duplicados.
3. `prisma migrate status` — la serie completa queda registrada.
4. `prisma migrate diff` modelos↔base **en vacío** — aunque el deploy pase, si
   el esquema difiere de los modelos (una FK de menos, un índice renombrado,
   una columna con otro tipo), el PR falla imprimiendo el SQL exacto de la
   diferencia. Esta es la garantía fuerte: «se aplica» Y «produce lo que
dicen los modelos».

**Por qué base propia y no la compartida de los otros workflows:** este job
exige una base VERDE de cero. La base de `unit-tests` llega contaminada de
seed y datos de prueba — un `migrate deploy` contra ella no probaría nada (los
objetos ya existen) y podría pasar en verde exactamente el fallo que buscamos.
La base efímera es la única prueba honesta de «desde cero».

**`unit-tests.yml` y `e2e-reconciliation.yml` — abandonan `db push
--accept-data-loss`.** Ese atajo existía «porque las migraciones traen
CREATE TABLE duplicados» — documentaba el defecto que ya está arreglado.
Ahora aplican `migrate deploy`, el mismo camino que producción. La razón de
fondo: `db push` sincroniza el esquema directamente de los modelos y podría
aceptar en CI un estado que `deploy` (la serie real) no reprodujera — CI y
producción deben aplicar LO MISMO, no equivalentes.

**Cuándo falla a propósito (los tres modos):**

| Modo | Paso que falla | Qué significa |
|---|---|---|
| Duplicado reintroducido | deploy (`42P07`) | Las carpetas absorbidas volvieron, o una migración nueva recrea algo existente sin `IF NOT EXISTS` |
| Serie incompleta/rota | deploy (cualquier error SQL) | Una migración nueva no funciona en base nueva (dependencias de orden, objetos asumidos) |
| Esquema ≠ modelos | diff (SQL impreso en el log) | El deploy pasa pero el resultado no es lo que `schema.prisma` declara — se arregla en la migración, NO corrigiendo el diff a mano |

Regla operativa: si el diff falla en un PR tuyo, la corrección va en la
migración (o en los modelos si el cambio era intencionado); **nunca** se
relaja el job. Si algún día el diff falla sin cambio de esquema, sospechar de
un cambio de versión de Prisma y comparar la salida antes de tocar nada.

Verificación local del mismo circuito (sin esperar a CI):

```bash
# clúster temporal (PostgreSQL 16/17 local, socket en /tmp)
/usr/lib/postgresql/16/bin/initdb -D /tmp/mig/data -U postgres --auth=trust
/usr/lib/postgresql/16/bin/pg_ctl -D /tmp/mig/data -o "-p 5470 -k /tmp" -l /tmp/mig/log start
/usr/lib/postgresql/16/bin/createdb -h 127.0.0.1 -p 5470 -U postgres volkern_migrations
DATABASE_URL=postgresql://postgres@127.0.0.1:5470/volkern_migrations npx prisma migrate deploy
npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma \
  --to-url "postgresql://postgres@127.0.0.1:5470/volkern_migrations" --script
# salida esperada: "-- This is an empty migration."
```
