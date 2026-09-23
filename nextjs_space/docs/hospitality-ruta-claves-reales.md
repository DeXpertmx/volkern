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

- Suite completa: **8.178 pruebas en verde / 0 rojas**, typecheck 0, lint 0.
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
- [ ] **PENDIENTE**
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
- [ ] **PENDIENTE**
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
- [ ] **PENDIENTE**
- **Acción**, en orden: (a) `/admin/hospitality` muestra el panel de crons con los jobs
  nuevos; (b) la pantalla de registro de viajeros muestra «Entorno: pruebas» y el campo
  de credenciales vacío y cifrado; (c) crear una propiedad y unidad de PRUEBA y recorrer
  reserva → check-in online → parte `datos_incompletos` en la pantalla de reservas;
  (d) la Academia muestra el Ranking de Cerradores con su sección «Ediciones cerradas»
  (vacía es correcto).
- **Verificado cuando**: los cuatro puntos constan en el §9. Limpiar los datos de prueba
  de (c) si ensucian el tenant elegido.

### 0.4 - Preparar el tenant de homologación y congelar la traza de partida
- [ ] **PENDIENTE**
- **Acción**: decidir con el usuario (pregunta §8-A) si se usa un tenant aislado o el del
  piloto; crear/limpiar; exportar copia de `HospitalityGuestRegistryCommunication` y de
  `HospitalityMirConfig` del tenant elegido como «traza de partida» (guardar en el VPS,
  nunca commitear datos).
- **Verificado cuando**: la copia está guardada con fecha y el tenant está sin
  configuración MIR activa (o con la previa respaldada).

### 0.5 - Simulacro de configuración con datos ficticios
- [ ] **PENDIENTE**
- **Acción**: en el tenant de homologación, recorrer `accion: 'configurar'` con valores
  ficticios SIN `activo: true`; verificar que `accion: 'estado'` devuelve el endpoint
  `https://hospedajes.pre-ses.mir.es/...` al elegir entorno pruebas; borrar los datos
  ficticios.
- **Verificado cuando**: el flujo completo funcionó sin errores y quedó limpio.
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
| A | ¿Tenant aislado para homologación o el del piloto? | Paso 0.4 |
| B | ¿Multimoneda: convertir o mostrar por moneda? | Paso 3.1 (o antes si el hotel mira Reportes) |
| C | ¿Se autoriza este despliegue ahora o hay ventana acordada? | Paso 0.2 si hay usuarios activos |
| D | El XSD no llegó / no trae namespace de RH | Paso 2.2 — RH queda documentado como no homologado |

## 9. Registro de avance (rellenar al marcar cada paso)

| Fecha | Paso | Resultado | Nota |
|---|---|---|---|
| 23 sep 2026 | — | Ruta creada | Estado baseline: 8.178 verdes, §5.1 cerrado, ~495 ficheros sin commitear |
