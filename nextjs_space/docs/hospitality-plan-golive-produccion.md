# Plan de go-live del módulo Hospitality — de homologación a producción

> **Qué es:** el esqueleto operativo para pasar del tenant de homologación
> «Homologación MIR» (aislado, datos de prueba) a producción con el primer
> hotel real. Es el plan que el runbook (paso 3.2) llama «otro plan».
>
> **Estado:** ESQUELETO — los huecos `____` se rellenan cuando lleguen los
> datos (credenciales de producción, códigos, XSD, fecha de corte). Nada de
> este plan se ejecuta hasta que la homologación esté SUPERADA (paso 2.4 del
> runbook con los 18 casos) y el proveedor confirme producción.
>
> **Regla de secretos:** en este plan nunca hay valores — solo referencias al
> canal seguro y a dónde se cifran. Las credenciales viven cifradas por tenant
> (`HospitalityMirConfig`, capa de conectividad) o en el canal acordado.

---

## Fase A — Credenciales de PRODUCCIÓN (dos vías, en paralelo)

### A.1 Proveedor de conectividad

| Dato | Valor | De quién |
| --- | --- | --- |
| Base URL de producción | `____` | Proveedor (respuesta a la pregunta 1 del email) |
| Partner ID de producción | `____` | Proveedor (pregunta 2) |
| Basic Auth producción | *(canal seguro — nunca aquí)* | Proveedor (pregunta 3) |
| ¿Sandbox o directo? | `____` (si el sandbox sigue activo, ensayar primero allí) | Proveedor (pregunta 4) |

- [ ] **Rotación confirmada**: procedimiento y plazo de rotación preguntado
  (pregunta 3 del email); anotarlo en `____`.
- [ ] **Preflight de producción** en verde:
  `npx tsx scripts/preflight-conectividad.ts --pegado "…"` — el preflight de
  producción es un evento distinto al de pruebas: nueva pega, nueva validación.

### A.2 Ministerio (SES.Hospedajes)

| Dato | Valor | De quién |
| --- | --- | --- |
| Credenciales de producción del servicio | *(canal seguro)* | Cliente (tras validar las de pruebas) |
| Código de arrendador (producción) | `____` | Cliente |
| Código de aplicación (producción) | `____` | Cliente |
| Código de establecimiento por propiedad | `____` (una pareja por propiedad) | Cliente |
| `NS_ALTA_RESERVA` (namespace del XSD) | `____` | Extraído del XSD oficial → se escribe en `lib/hospitality/registro-viajeros.ts` con su procedencia (paso 2.2 del runbook) |

- [ ] Las credenciales de PRUEBAS quedan **invalidadas o revocadas** por el
  cliente tras la homologación (pedirlo expresamente: dos juegos vivos = dos
  superficies de fuga).

---

## Fase B — Rotación de credenciales (procedimiento)

1. **Nuevos valores** por el canal seguro → preflight → guardar **desde el
   panel** (guardar desde el panel cifra los valores nuevos: ver
   `hospitality-go-live-pms-guia.md`, «Diagrama de credenciales»).
2. **Verificación inmediata post-rotación** (las tres):
   - Health check en verde: «Probar conexión» y marca «Última verificación»
     reciente (el cron de las 05:00 también lo mueve).
   - Push de prueba de inventario (rango corto) aceptado.
   - **Contraprueba de credenciales viejas**: el proveedor confirma que la
     pareja anterior está revocada (un push con las viejas debe dar 401 — si
     aún entra, la rotación no fue real).
3. **Custodia**: quién guarda qué (lista, no valores):
   - [ ] Basic Auth del proveedor → `____` (persona + canal)
   - [ ] Credenciales SES.Hospedajes → `____` (persona + canal)
   - [ ] Certificado de firma del establecimiento → `____` (el hotel)
4. Si la rotación toca las credenciales del webhook **que el proveedor usa
   para llamarnos** (las que emitimos nosotros): emitir pareja nueva,
   comunicarla por el canal seguro y confirmar que su cola ya envía con la
   nueva antes de revocar la vieja (si revocamos antes, su cola entra en 401
   y las reservas entran por reintento).

---

## Fase C — Pase de la configuración homologación → producción

**Decisión recomendada: RECONFIGURAR EN LIMPIO en el tenant del hotel real, no
copiar la configuración del tenant de homologación.** La configuración son
pocos campos (MIR + conectividad + wizard) y reconfigurar a mano con el
wizard es una hora; copiar arrastraría residuos de prueba (reservas `BE-*`,
partes, huéspedes ficticios, vínculos del simulacro) que luego hay que
auditar uno a uno. Lo que sí se reutiliza: esta guía y las recetas del
runbook.

| Elemento | ¿Migrar o reconfigurar? | Nota |
| --- | --- | --- |
| Config MIR (códigos, tipo de pago) | **Reconfigurar** en el tenant real | Los códigos de producción son distintos de los de pruebas |
| Capa de conectividad (credenciales, `activo`) | **Reconfigurar** | Preflight + guardado + health check |
| Mappings (vínculos roomCode↔unidad) | **Reconfigurar** con el catálogo real | El catálogo de producción manda (ver día H real, paso 2) |
| Reservas/partes/huéspedes de prueba | **NO migrar — quedan en el tenant aislado** | El tenant de homologación se conserva como entorno de pruebas |
| Preguntas del check-in, plantillas | Reconfigurar (o copiar si el hotel lo pide) | Contenido, no estructura |
| Roles y usuario del hotel | Crear en el tenant real (provisioner + script de rol) | El defecto del provisioner ya tiene receta (`asignar-rol-admin-tenant.ts`) |

- [ ] Tenant real del hotel creado y provisionado (`____` slug/fecha)
- [ ] Rol Administrador asignado (script de operador)
- [ ] Wizard del hotel completado en producción (pasos 1–6)
- [ ] **Limpieza verificada del tenant de homologación**: nada de datos de
  prueba de producción (la homologación dejo de usarla; queda como sandbox
  interno)

---

## Fase D — Checklist de corte (la ventana)

> La Etapa 3 de `hospitality-go-live-pms-guia.md` ya define el corte de
> conectividad; aquí se completa con lo del módulo entero. Fecha de corte:
> `____` (media jornada, con el hotel disponible).

- [ ] **Pre-corte**: homologación SUPERADA (18/18) · XSD informado y
  desplegado · preflight de producción en verde · rotaciones hechas (Fase B) ·
  tenant real provisionado (Fase C) · canal habilitado en la OTA (autoservicio
  o email al account manager, según canal).
- [ ] **T-0 — Cierre de inventario**: congelar altas/edits de mappings y
  unidades durante la ventana (regla de la Etapa 3).
- [ ] **T+0 — Configurar producción**: credenciales, wizard, mappings con el
  catálogo real (día H real, pasos 2–3, en el tenant del hotel).
- [ ] **T+1 — Push inicial**: inventario + tarifas del calendario real y
  **confirmación del proveedor** (un 200 propio no es éxito).
- [ ] **T+2 — Doble publish**: comparar unas horas lo publicado contra el
  planning interno antes de abrir ventas.
- [ ] **T+3 — Primera reserva real** por el canal: entra por webhook, unidad
  correcta, importe/divisa del canal, check-in OK.
- [ ] **T+4 — Primera comunicación real al Ministerio** (parte de una
  estancia real): respuesta «código 0, comunicación número `____`».
- [ ] **Rollback** (si algo crítico): desactivar la capa (`activo: false`),
  re-publicar a los canales previos del hotel, y las reservas ya entradas se
  gestionan a mano. El webhook responde a eventos de reservas que no entraron
  (404) — es el síntoma esperado del rollback, se escala al proveedor.
- [ ] **Post-corte — semana 1**: incidencias a cero o explicadas ·
  divergencias revisadas a diario · vínculos automáticos revisados · holds
  caducados en su tasa normal · **criterio de cierre de go-live**: una semana
  sin reserva de canal perdida ni duplicada (firma del checklist del contrato).

---

## Huecos que este plan NO puede rellenar (de quién dependen)

1. URL/partner ID/Basic Auth de producción → **proveedor** (email ya enviado).
2. Códigos y credenciales de producción del Ministerio → **cliente**.
3. XSD oficial (namespace) → **Ministerio** vía cliente.
4. Hotel piloto y fecha de corte → **decisión de Bruno con el cliente**.
5. Términos/DPA y región de datos → **proveedor** (pregunta 33 del email).
