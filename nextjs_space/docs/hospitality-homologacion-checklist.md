# Checklist de homologación — día H con el proveedor real

> **Fuente de verdad del proceso**: `docs/hospitality-ruta-claves-reales.md`
> (runbook; los pasos 2.1–2.4 y su §9 son los que este checklist opera).
> Complementos: `docs/hospitality-mir-homologacion-plan.md` (plan del Ministerio),
> `docs/hospitality-dia-h-simulador.md` (el ensayo ya en verde), y
> `docs/hospitality-checklist-envio-correos.md` (plantillas de correo).
> Estado al crear este fichero: **26 sep 2026**.

## 0. Respuestas pendientes (estado de la espera)

| Emisor | Qué se pidió | Enviado | Recordatorio | Respuesta | Si no llega |
|---|---|---|---|---|---|
| **Cliente** (paso 1.1) | Puntos 1–4 de las 7 precondiciones: alta en Sede Electrónica, credenciales de **pruebas** del servicio, los 3 códigos del establecimiento (pareja por propiedad) y el **XSD oficial** | 24 sep 2026 | **1 oct** (día 7), plantilla del checklist de correos | ⬜ pendiente | Llamada «pantalla a pantalla» de media hora (la ofrecemos ya en el recordatorio) |
| **Proveedor de conectividad** (paso 1.2) | 36 preguntas; **A y B son bloqueantes**: A = URL de producción byte a byte + partner ID + Basic Auth de producción; B = formato/entorno de las respuestas del catálogo | 24 sep 2026 | **1 oct** (día 5 hábil: 25, 28, 29, 30 y 1-oct), citando SOLO A y B | ⬜ pendiente | Repetir por teléfono/WhatsApp con A y B textualmente: son lo único que separa del día H |

Notas de la espera:

- [ ] El **bloqueo crítico es el proveedor** (sin A y B no hay día H de conectividad).
- [ ] El **bloqueo del Ministerio es el XSD**: sin él, el paso 2.2 queda con el
  namespace placeholder (`pendienteXsd`) — el resto del día H sí puede avanzar.
- [ ] No hay nada que esperar de nuestra parte: el ensayo del día H está **38/38**
  contra el simulador y producción corre la imagen del 26-sep.

## 1. Semana previa — recordatorios del 1 oct

- [ ] **Enviar recordatorio al cliente** (plantilla «día 7», encima del mismo hilo,
  sin adjuntos): anotar fecha de envío en el §9 del runbook.
- [ ] **Enviar recordatorio al proveedor** (plantilla «día 5 hábil», en inglés, solo
  A y B contestables inline): anotar fecha en el §9.
- [ ] Si a los 2–3 días del recordatorio sigue el silencio: escalar según la tabla
  de la sección 0 (llamada; A y B textualmente).
- [ ] Al recibir la respuesta del proveedor: convertirla en reunión o respuestas
  por escrito y registrar la URL/ID/usuario/contraseña de pruebas para el preflight.

## 2. Puerta de entrada del día H (todo en verde antes de sentarse)

- [ ] **A y B contestadas** por el proveedor y entendidas (URL con el prefijo
  `/api/v2/cm` en escrito, partner ID, credenciales de Basic Auth de PRUEBAS).
- [ ] **Preflight verde** antes de tocar el servidor:
  `npx tsx scripts/preflight-conectividad.ts --pegado "URL | ID de socio | usuario | contraseña"`
  (compara con `CONNECTIVITY_BASE_URL` desplegada; no imprime la contraseña).
- [ ] **Credenciales del Ministerio recibidas** (puntos 1–2 del cliente) y los 3
  códigos del establecimiento; el **XSD** recibido o con fecha comprometida.
- [ ] `master` = producción (imagen `4c4b6b5141e5` o posterior), suite en verde y
  `npm run test:e2e:dia-h` en 38/38 el día antes.
- [ ] Tenant de homologación aislado creado y con rol asignado
  (`scripts/asignar-rol-admin-tenant.ts`); credenciales solo en el VPS.

## 3. Día H — sesión (medio día, en orden)

1. [ ] **2.1 — Conectividad con credenciales reales de pruebas**: guardar en el
   panel (quedan cifradas; jamás en ficheros versionados), códigos y mapa de
   pagos, `activo: true`. Verificación: `accion: 'estado'` → entorno `pruebas`,
   estado verde, `tenantPuedeComunicar === true`, cron activo y panel visible.
   «Probar conexión» en verde ANTES del primer envío (riesgo §7 del plan).
2. [ ] **2.2 — Namespace del XSD**: extraer el `targetNamespace` y escribirlo en
   `lib/hospitality/registro-viajeros.ts` junto a `FUENTE_NS_ALTA_RESERVA`
   (fichero, versión y fecha de procedencia). Guardias del módulo + typecheck +
   suite + commit + despliegue. Verificación: `NS_ALTA_RESERVA !== null` y el
   estado `pendienteXsd` del alta RH desbloqueado.
3. [ ] **2.3 — Parte manual de prueba**: `accion: 'enviar'` con una estancia de
   prueba. **Criterio de salida**: el servicio REAL responde «código 0,
   comunicacion número X». Guardar trama y códigos en el §9 del runbook.
4. [ ] **2.4 — Matriz de 18 casos**:
   `MIR_HOMOLOGACION=1 npx tsx scripts/homologacion-mir.mjs` (por grupos: feliz,
   anulación, rechazos, RH, ciclo; el cron corre cada hora — los lotes esperan su
   resolución real). Informe en /tmp. Registrar caso a caso en el §9.

Reglas del día: nada fuera del tenant de homologación; si el proveedor falla,
capturar la trama (hora, endpoint, respuesta) y no improvisar código en caliente.

## 4. Criterio de salida (definición de «homologado»)

- [ ] Pasos 2.1, 2.2, 2.3 y 2.4 con su «verificado cuando» cumplido (runbook).
- [ ] Los 18 casos de la matriz ejecutados o marcados con su motivo.
- [ ] §9 del runbook actualizado: fechas, tramas, códigos de retorno y lote.
- [ ] Resultados volcados a FASE 3 para las decisiones con datos reales
      (la multimoneda H11/H22 ya está decidida y hecha).

## 5. Apagadores y límites (por si alguien copia un comando)

- `MIR_HOMOLOGACION=1` — sin él, `homologacion-mir.mjs` no hace NADA: habla con un
  servicio REAL del Ministerio y no puede ejecutarse por accidente.
- `E2E_DIA_H=1` — el ensayo escribe en la base de datos (`DATABASE_URL`); el
  lanzador lo pone y escribe solo en el tenant `e2e-dia-h` con limpieza final.
- Las credenciales se guardan cifradas en el panel. Nunca en git, nunca en el chat,
  nunca en un doc.
