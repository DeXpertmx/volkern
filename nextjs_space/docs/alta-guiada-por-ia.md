# Alta guiada por IA — del primer «qué haces» al cliente vendiendo

**Diseño de la implantación asistida: descubrimiento, recomendación de módulos, elección, personalización, importación con control de calidad, informes y plantillas**

Fecha: **2026-10-31** · Complementa a [`crm-ventas-puesta-en-marcha.md`](./crm-ventas-puesta-en-marcha.md)

> **Qué resuelve este documento.** La puesta en marcha de hoy es una senda manual: alguien del
> equipo pregunta, elige módulos de una lista y carga datos. La idea es que **la IA conduzca el
> descubrimiento del cliente** —qué hace, qué le duele, qué quiere controlar, qué resultado
> persigue, con qué KPI— y que de ahí salga una propuesta de módulos explicada, elegible, con su
> personalización y su plan de datos. Este documento fija cómo se construye eso sin convertir la
> primera pantalla del cliente en una caja negra.

---

## 1. La experiencia, en siete pantallas

```
Descubrimiento → Propuesta → Elección → Personalización → Datos → Informes y plantillas → Listo
     (IA)          (motor)     (cliente)      (cliente)     (calidad)      (pack por perfil)
```

| Pantalla | Qué ve el cliente | Quién decide |
|---|---|---|
| 1. Descubrimiento | 12 preguntas en lenguaje de negocio, con «no lo sé» permitido | El cliente responde; la IA repregunta si algo es ambiguo |
| 2. Propuesta | «Con lo que me cuentas, esto es lo que te sirve y esto no» | El **motor** propone; la IA solo redacta el porqué |
| 3. Elección | Una tarjeta por módulo: qué te resuelve, qué necesitas, qué no hace | El cliente acepta o descarta, módulo a módulo |
| 4. Personalización | Embudo propuesto, roles, impuestos, moneda, canales, marca | El cliente aprueba cada pieza; nada se aplica solo |
| 5. Datos | Informe de calidad antes de escribir: qué entra, qué se actualiza, qué se rechaza y por qué | El cliente ve el informe y confirma |
| 6. Informes y plantillas | Qué informes quedan fijados y con qué plantillas arranca | El cliente elige 2–3 informes y las plantillas |
| 7. Listo | Checklist de go-live firmado y enlace a la primera tarea real | Cliente + implementador |

---

## 2. El principio que sostiene el diseño

> **La IA conversa y explica; el sistema decide con reglas.**

Es el mismo principio que ya rige el CRM —la IA propone y solo ejecuta con autopiloto y confianza
≥ 0,7 (`crm-ventas-documento-tecnico.md` §2.3)— aplicado a la implantación. Tiene tres
consecuencias prácticas:

1. **La recomendación de módulos es determinista y testeable.** Sale de reglas sobre respuestas
   estructuradas, no de un prompt libre. Se puede cubrir con casos dorados y mejorar con datos
   reales de aceptación.
2. **El diagnóstico de datos (duplicados, NIF, importes) no lo hace un LLM.** Es aritmética y
   comparación de cadenas: auditable, repetible y gratis. La IA, como mucho, **explica** el
   informe en lenguaje natural.
3. **La IA nunca escribe en la base de datos.** Genera propuestas; el cliente confirma; la
   escritura pasa por las rutas que ya existen y deja `auditLog`.

Sin esto, el primer día del cliente depende de que un modelo acierte. Con esto, depende de reglas
que se pueden corregir la semana siguiente.

---

## 3. Qué hay hoy y qué falta

| Pieza | Hoy | Falta |
|---|---|---|
| Elección de perfil | `/dashboard/onboarding-quick`: el cliente elige vertical (CRM, agencia, industria…) y se precargan módulos de `PERFIL_SUGGESTED_MODULES` (`lib/onboarding-modules.ts`) | No hay preguntas: el mapa estático no distingue «B2B industrial con ciclo de 3 meses» de «B2C de compra inmediata» |
| Módulos por perfil | `applyProfileSelection` añade los sugeridos y preserva el núcleo | No hay motivo por módulo, ni requisitos, ni «qué no hace» |
| Resolución de módulos efectivos | `resolverModulosTenant` (plan + `TenantFeature` + núcleo) y `PATCH /api/tenant/modules` con auditoría | La recomendación no conoce los topes del plan al proponer |
| Onboarding de 3 pasos | `/dashboard/onboarding`: ADN operativo, bóveda, módulos | No guarda respuestas de negocio: solo la elección final |
| Importación | `/dashboard/importar`: detecta plantilla y **escribe directamente** (`executeImport`) | No hay simulación previa, ni informe de calidad, ni cuarentena, ni deshacer por lote |
| Duplicados | Por email en contactos; email → NIF en clientes (`import-clients.ts`) | Sin duplicado intra-fichero, sin fuzzy por nombre/dominio, sin validación de NIF ni de teléfono |
| Informes y plantillas | Pantallas de previsión, salud, briefing; plantillas de email y documentos existen por separado | Nadie elige un **pack** al alta; el cliente aterriza en un panel vacío |
| Persistencia del proceso | Nada: si se abandona a mitad, no queda rastro | Sin estado por tenant, soporte no sabe en qué punto está cada alta |

**Conclusión:** no hay que inventar la recomendación desde cero. `PERFIL_SUGGESTED_MODULES` es la
semilla de las reglas; lo que falta es el cuestionario, el motor explicable y la calidad de datos.

---

## 4. El cuestionario de descubrimiento

Doce preguntas, tres bloques, cinco minutos. Cada una **desbloquea una decisión**; las que no la
desbloquean no se preguntan. El cliente puede responder «no lo sé»: entonces la pregunta queda
marcada como pendiente y no se inventa una recomendación sobre ella.

### Bloque A · El negocio

| # | Pregunta | Decisión que desbloquea |
|---|---|---|
| 1 | ¿Qué vendes? (productos / servicios / ambos / suscripción / alojamiento) | Catálogo (`producto` vs `servicio`), cotizaciones, inventario, hospitality |
| 2 | ¿A quién vendes? (empresas / particulares / ambos) | `empresas` + contactos, ciclo largo, varias personas por cuenta |
| 3 | ¿Cómo llega un cliente hoy? (referidos, web, redes, llamadas, ferias, partners) | Formularios, Web Creator, campañas, telefonía, scoring por origen |
| 4 | ¿Cuántas personas venden y quién más lo va a usar? (1 / 2–5 / 6–20 / +20; administración, dirección) | Roles, equipo, nivel de CRM (topes de embudos) |
| 5 | ¿Cuánto tarda una venta de media? (<7 días / 2–4 semanas / 1–3 meses / >3 meses) | Número de etapas, previsión, salud del pipeline |

### Bloque B · El dolor

| # | Pregunta | Decisión que desbloquea |
|---|---|---|
| 6 | ¿Qué te duele más hoy? (se me enfrían los leads / no sé qué voy a vender el mes que viene / las cotizaciones tardan / no sé qué hace mi equipo / pierdo el seguimiento tras la propuesta / facturo tarde) | Alertas y scoring, previsión, cotizaciones, analítica y roles, automatizaciones, orden de venta y finanzas |
| 7 | ¿Qué pasa después de enviar una propuesta? (nada / llamo yo / se pierde / se firma en papel) | Enlace público con seguimiento, compuerta de cumplimiento, contrato desde cotización, firma |
| 8 | ¿Qué te ha costado dinero últimamente? (perder un cliente / un error de precio / una factura mal / no cobrar) | Validación de catálogo, impuestos, control de calidad, finanzas |
| 9 | ¿Qué usas hoy y qué odias de ello? (Excel, otro CRM, papel, WhatsApp) | Plan de migración, qué importar, qué dejar morir |

### Bloque C · El control y el resultado

| # | Pregunta | Decisión que desbloquea |
|---|---|---|
| 10 | ¿Qué quieres ver en un panel cada lunes? (elige 2–3: embudo por etapa, previsión, actividad por comercial, conversión, tiempo de ciclo, margen, cobros) | Informes fijados, briefing, metas |
| 11 | ¿Qué decisión tomas hoy a ojo y quieres tomar con datos? (a quién llamar, qué precio, cuándo contratar, qué producto empujar) | Deal Coach, previsión, ranking, playbook |
| 12 | ¿Cómo sabrás en 90 días que esto ha funcionado? (número y umbral) | Éxito medible, informes de seguimiento, revisión a 14 días |

### Forma de los datos

```ts
// lib/implantacion/descubrimiento.ts — puro, sin Prisma, como lib/pipelines.ts
type RespuestaId = 'que_vende' | 'a_quien' | 'origen' | 'equipo' | 'ciclo'
                 | 'dolor' | 'tras_propuesta' | 'coste_error' | 'herramienta'
                 | 'panel' | 'decision' | 'exito_90d'

interface Descubrimiento {
  respuestas: Partial<Record<RespuestaId, string | string[] | number>>
  noSe: RespuestaId[]            // explícitas: no se recomienda sobre ellas
  notas: string                  // texto libre, nunca se usa como dato duro
  version: 1
}
```

`notas` existe para no perder matices, pero **no alimenta reglas**: si un matiz importa, se
convierte en opción de una pregunta. Un LLM que interpreta texto libre para decidir módulos es
exactamente lo que este diseño evita.

---

## 5. El motor de recomendación

### 5.1 Cómo funciona

```
Descubrimiento ──► reglas (señales → módulo, peso, requisito) ──► candidatos
                                                                    │
   plan del tenant ──► puerta (incluido / addon / no disponible) ◄───┤
   topes del nivel ──► ajuste (nº de embudos, usuarios)        ◄─────┘
                                                                    │
                                                          propuesta explicada
```

`lib/implantacion/recomendar.ts` (puro, testeable sin base de datos):

```ts
interface Recomendacion {
  modulos: {
    id: string
    motivo: string          // en las palabras del cliente, no en jerga
    requisito: string       // qué necesita para funcionar (datos, canal, gente)
    limite: string | null   // qué no hace
    incluidoEnPlan: boolean
    peso: number            // confianza de la regla, no del modelo
  }[]
  embudo: { nombre: string; etapas: { nombre: string; criterio: string; probabilidad: number }[] }
  informes: string[]
  plantillas: string[]
  riesgos: string[]         // contradicciones detectadas
}
```

Cada módulo del catálogo (`MODULE_GROUPS` de `lib/onboarding-modules.ts`) gana una tabla de
señales. Ejemplos reales de la primera versión:

| Señal | Módulo | Motivo que se muestra |
|---|---|---|
| `dolor` incluye «se me enfrían los leads» | `scoring` + alertas de salud | «Te avisa de la oportunidad que lleva días sin movimiento, antes de que la pierdas» |
| `tras_propuesta` = «nada» o «se pierde» | `cotizaciones` + compuerta | «La propuesta se envía con enlace y tú ves si la han abierto» |
| `panel` incluye «previsión» | `pronosticos` | «Tres cifras de lo que vas a vender, no una bola de cristal» |
| `a_quien` = empresas | `empresas` (núcleo) + varias personas por cuenta | «Cada empresa con sus contactos, sin duplicar cuentas» |
| `ciclo` = >3 meses | embudo de 6 etapas + salud | «Con ciclos largos, la etapa 2 no puede llamarse igual que la 5» |
| `equipo` ≥ 6 | `analytics` + `equipo` + roles | «Cada comercial ve lo suyo y tú ves todo» |

**Regla de oro:** el núcleo no se propone, se da por hecho (y se explica en una línea). Proponer
«te recomendamos Leads» a quien ya lo tiene encendido es ruido.

### 5.2 Qué hace la IA exactamente

| Tarea | ¿IA? | Por qué |
|---|---|---|
| Elegir qué módulos | **No** — reglas | Testeable, explicable, corregible |
| Redactar el motivo con las palabras del cliente | **Sí** — `callAssistantWithFallback` | Un motivo genérico no convence; uno que repite su dolor, sí |
| Detectar contradicciones («vendes a empresas» + «cierro en 3 días») | **Sí**, como aviso | Es lenguaje, no aritmética |
| Repreguntar cuando una respuesta es ambigua | **Sí**, con opciones cerradas | Evita el «cuéntame más» infinito |
| Decidir si dos filas son el mismo cliente | **No** — reglas (§7) | Un falso duplicado borra una venta real |
| Escribir en la base de datos | **No** | Toda escritura pasa por API con confirmación y auditoría |

La llamada usa el gateway existente (`lib/assistant/openrouter-client.ts`) y **valida la salida
antes de aplicarla** (`lib/implantacion/redactar.ts`): ids que no están en la propuesta se
descartan, el motivo se recorta a una línea y a 240 caracteres, y las contradicciones se
deduplican y se acotan a tres. Si el modelo devuelve algo que no encaja, se cae al texto plantilla:
la pantalla nunca se queda en blanco. El texto libre del cliente (`notas`) **no se envía**: el
prompt lleva solo opciones cerradas del cuestionario y los módulos propuestos, porque en una nota
cabe un nombre y un teléfono.

El modelo se llama como mucho una vez por guardado y cada reescritura consume cupo del plan
(`implantacion_ia_day`, 20 al día por defecto y ajustable por tenant). Agotado el cupo no hay
llamada: la respuesta trae `redaccion.aviso` con el motivo y la propuesta sale con los motivos del
motor. El aviso no se guarda —es de esa respuesta—, así que mañana la pantalla no repite un tope
que ya no aplica.

### 5.3 Casos dorados (la red de seguridad)

Doce fixtures en `tests/implantacion-recomendar.test.ts`, uno por perfil real:

1. B2B industrial, ciclo 3 meses, dolor «previsión» → embudo de 6 etapas, `pronosticos`, `cotizaciones`, `contratos`.
2. Autónomo B2C, ciclo <7 días, dolor «se me enfrían» → `scoring`, alertas, embudo de 4 etapas, sin `contratos`.
3. Agencia, origen «redes» y «web» → `campanas`, `cms`, `formularios`, `email_marketing`.
4. Asesoría con clientes propios → figura de **slot contable**, no tenant normal.
5. Empresa de 12 comerciales → `analytics` + roles + tope de embudos del nivel Profesional.

El test comprueba módulos propuestos, número de etapas y que **ningún módulo esté fuera del plan
sin marcarse como addon**.

---

## 6. La elección del cliente

Una tarjeta por módulo, con cuatro datos y ningún adjetivo:

```
┌──────────────────────────────────────────────────────────────┐
│ Cotizaciones                                    Incluido ✓   │
│                                                              │
│ Te resuelve: «las propuestas tardan» — del catálogo al PDF   │
│ en un clic, con enlace que avisa cuando la abren.            │
│                                                              │
│ Necesitas: tu catálogo cargado (lo importamos en el paso 5)  │
│            y el IVA configurado.                             │
│                                                              │
│ No hace: firma electrónica cualificada.                       │
│                                  [ Añadir ]   [ Ahora no ]   │
└──────────────────────────────────────────────────────────────┘
```

Reglas de la pantalla:

- **Núcleo bloqueado**, con una línea que explica por qué (sin candado silencioso).
- **«Ahora no» no borra nada**: queda como pendiente en el checklist y se puede activar en
  Configuración cuando quiera. Descartar un módulo no debe dar miedo.
- **Módulo fuera de plan** → se muestra como addon con su precio, no se esconde. Esconder lo que
  el cliente necesita para vender es la forma más rápida de que compre otra cosa.
- **El contador de embudos se ve al elegir** («tu nivel permite 1; este perfil suele necesitar 2»).

---

## 7. Importación con control de calidad

Objetivo explícito del encargo: **no importar basura**. Hoy `executeImport` escribe en la misma
petición en la que parsea; no hay segunda mirada. Se sustituye por cuatro puertas, y la escritura
solo ocurre en la cuarta.

### Puerta 1 · Formato y codificación

- BOM, separador (`;` vs `,`), decimal con coma, fechas `dd/mm/aaaa` vs `mm/dd/aaaa`, codificación.
- Si hay ambigüedad real (una columna de fechas con días ≤ 12), **se pregunta**, no se adivina.

### Puerta 2 · Mapeo

- `autoMapColumns` con la plantilla detectada; sin plantilla, mapeo asistido columna a columna.
- Columnas obligatorias sin mapear → no se puede continuar (mejor bloquear que importar a medias).

### Puerta 3 · Calidad (determinista)

Reglas por entidad, cada rechazo con **código y motivo**, nunca «error»:

| Entidad | Regla | Destino |
|---|---|---|
| Contactos/empresas | email con formato válido y normalizado (minúsculas, sin espacios) | Rechazo `EMAIL_INVALIDO` |
| Contactos/empresas | teléfono normalizable a E.164 | Aviso, se importa sin teléfono |
| Empresas | NIF con dígito de control correcto (ES) | Rechazo `NIF_INVALIDO`; si el país no es ES, aviso |
| Clientes con NIF | país ISO de 2 letras; «España» → `ES` | Normalización automática |
| Catálogo | `precioBase` numérico ≥ 0; SKU único en el fichero | Rechazo `SKU_DUPLICADO` / `PRECIO_INVALIDO` |
| Catálogo | moneda del ítem = moneda del tenant o vacía | Aviso `MONEDA_DISTINTA` |
| Todos | fila duplicada **dentro del fichero** (hash de fila normalizada) | Se queda la primera, el resto `DUPLICADO_FICHERO` |
| Contactos | ya existe por email | **Actualiza**, no duplica (`UPSERT`) |
| Clientes | ya existe por email; si no, por NIF | **Actualiza** (`UPSERT`) |
| Contactos sin email | nombre + dominio de empresa, similitud alta | **No se fusiona solo**: se marca `POSIBLE_DUPLICADO` y decide el cliente |
| Cualquiera | campo obligatorio vacío | Rechazo `CAMPO_OBLIGATORIO` |

**Lo que no se hace:** fusionar por parecido sin permiso. Un falso positivo borra una venta real;
un falso negativo deja una fila repetida que se limpia en dos minutos.

### Puerta 4 · Informe y escritura

Antes de escribir, el cliente ve:

```
412 filas leídas · 370 nuevas · 28 actualizadas · 9 rechazadas · 5 posibles duplicados
```

con muestra de cada grupo, motivo por fila y **descarga de las rechazadas en CSV** para corregirlas
fuera. Solo entonces aparece «Importar 398 registros».

Después:

- `ImportLog` gana `batchId`, `mode` (`preview` | `commit`), `report` (JSON con los grupos) y
  `revertedAt`. Un lote se puede **deshacer** si es el último y no hay dependencias (misma regla
  que ya usa la orden de venta desde cotización: idempotencia y reversibilidad donde se puede).
- La importación es **idempotente por hash de fila**: volver a subir el mismo fichero no duplica.

### Estado actual frente a esto

| Puerta | Hoy | Cambio |
|---|---|---|
| 1 Formato | Parcial (`parseFile`, sin preguntar ambigüedades) | Detección + pregunta puntual |
| 2 Mapeo | Sí, con plantilla; sin plantilla todo a `__skip__` | Plantillas genéricas + mapeo asistido |
| 3 Calidad | Solo dedupe por email / NIF | Motor de reglas con códigos |
| 4 Informe | No existe: escribe directo | `preview` obligatorio + cuarentena + batch |

---

## 8. Informes y plantillas: el pack que se elige al alta

Un CRM recién configurado con el panel vacío no demuestra nada. Según el perfil, se fijan **dos o
tres informes** y se preparan las plantillas que el cliente va a usar esa semana.

### Informes (pantallas que ya existen, fijadas por perfil)

| Perfil señalado | Informes fijados | Qué demuestra el lunes siguiente |
|---|---|---|
| Ciclo corto, volumen alto | Embudo por etapa + conversión por origen | Dónde se cae el volumen |
| Ciclo largo, B2B | Previsión (tres cifras) + tiempo de ciclo | Si el mes cierra o no |
| Equipo ≥ 6 | Actividad por comercial + ranking | Quién trabaja la cartera |
| Dolor «pierdo seguimiento» | Oportunidades sin próxima acción + ZOMBIE | Qué está muerto y nadie lo mira |
| Administración | Cotizaciones abiertas + facturación pendiente | Qué falta por cerrar |

> Los informes son vistas del módulo de analítica y previsión. **La programación por correo no se
> ha verificado en esta revisión**: si no existe, el pack se entrega como vistas fijadas más el
> briefing diario, y la programación queda como propuesta aparte.

### Plantillas

- **Cotización**: condiciones, validez, forma de pago y datos fiscales del emisor precargados.
- **Contrato**: el que se genera desde la cotización, con las cláusulas del vertical.
- **Email de primer contacto y de seguimiento**: dos, no diez; se eligen al alta y se editan después.
- **Briefing de la mañana**: activado para el administrador y para cada comercial (opt-in por usuario, como ya funciona).

El pack **no inventa contenido jurídico**: el contrato se siembra desde las plantillas del sistema
que ya usa Contratos (las mismas cláusulas, revisables con la asesoría). Los dos emails sí se crean,
con copy corto y editable, porque son texto comercial y su ausencia es exactamente lo que deja la
cuenta vacía la primera semana. Cotización y briefing no tienen registro que crear: uno es
configuración y el otro, opt-in de cada persona, así que se devuelven como **paso manual** con el
enlace exacto.

### 8.1 Cómo queda implementado (R3)

| Pieza | Dónde |
|---|---|
| Catálogo, topes y mínimos | `lib/implantacion/entregables.ts` (puro) |
| Cálculo de los informes | `lib/implantacion/informes-datos.ts` (puro + lectura) |
| Aplicación en cuenta | `lib/implantacion/aplicar-entregables.ts` (idempotente) |
| API | `GET/POST /api/implantacion/entregables` |
| Selección | `components/implantacion/EntregablesSelector.tsx`, dentro de la propuesta |
| Panel | widget «Tus informes» (`components/dashboard/PanelInformes.tsx`) |

Reglas que se aplican en servidor, no en la pantalla:

- **Topes**: máximo 4 informes y 4 plantillas; más de eso no se mira.
- **Mínimos**: al menos 2 informes y 1 plantilla. Si el cliente baja del mínimo se completa desde su
  propia propuesta y se le dice; si la propuesta no tiene más, se avisa en vez de inventar.
- **Idempotente**: aplicar dos veces no duplica plantillas ni pisa lo que el cliente ya editó.
- **Estado vacío honesto**: un informe sin datos enseña `—` y el primer paso que lo llena, nunca un
  cero que parezca actividad.
- **Propuesta ≠ fijado**: el panel pinta la propuesta aunque no se haya aplicado, porque es útil
  verla, pero avisa (`pendienteDeAplicar` en el `GET`) y enlaza a terminar el alta. Sin ese aviso,
  una lista propuesta y vacía se lee como un problema de datos y no como un clic pendiente.

---

## 8.2 Personalización: el embudo

El embudo es lo primero que el cliente usa cada día, y el que más se estropea cuando se crea por
defecto: cinco columnas heredadas que nadie toca y un «Propuesta» donde se acumula todo. El paso de
personalización parte del embudo que propuso el descubrimiento y deja **retocarlo etapa a etapa**
antes de existir.

| Pieza | Dónde |
|---|---|
| Reglas del plan (puro) | `lib/implantacion/plan.ts` |
| Escritura en la cuenta | `lib/implantacion/aplicar-embudo.ts` |
| API | `GET/POST/DELETE /api/implantacion/plan` |
| Pantalla | `components/implantacion/EmbudoEditor.tsx`, dentro del paso de personalización |
| Persistencia | `ImplantacionTenant.plan` (JSON: embudo, `pipelineId`, cuándo se aplicó) |

Reglas que se aplican **en servidor**, no en la pantalla:

- **Mínimo de etapas**: dos (una abierta y la de cierre). Con menos no se crea nada; si el cliente
  borró de más, se recompone desde su propuesta y se le dice cuántas etapas se añadieron.
- **Máximo**: ocho. Más columnas no se leen, se arrastran.
- **Nombres**: sin repetir (dos columnas iguales confunden a quien mueve la oportunidad); las
  etapas sin nombre se descartan.
- **Probabilidades**: entre 0 y 100, no bajan etapa a etapa y la última cierra al 100 %. Cada ajuste
  sale en `avisos` y la pantalla lo pinta en ámbar **también después de aplicar**: el cliente tiene
  que saber qué se cambió en su embudo.
- **Criterio de salida**: vacío no bloquea, pero se avisa. Sin criterio, el embudo no dice dónde se
  atasca una venta.

Lo que se escribe y lo que se puede deshacer:

- Crear el embudo escribe `pipeline` + `pipelineStage`, con la última etapa marcada como final
  (`ganado`). Las oportunidades perdidas se marcan con motivo, sin etapa propia.
- **Tope**: los mismos embudos que la pantalla de Pipeline (plan y nivel de CRM). Si no cabe, se
  dice cuál es el tope y se propone ajustar el que ya existe.
- **No se pisa nada ajeno**: un embudo con el mismo nombre que no salió del alta devuelve 409.
- **Reversible solo sin datos**: deshacer borra el embudo y sus etapas, pero si ya tiene
  oportunidades devuelve 409 y se edita desde Pipeline, que es donde se avisa de lo que se mueve.
- **Auditoría**: `implantacion_plan` al aplicar y `implantacion_plan_deshacer` al deshacer, con el
  nombre, las etapas y el `pipelineId`.
- **El checklist no se fía del registro**: «Embudo aprobado» se cierra solo si el embudo sigue
  existiendo en la cuenta. Si alguien lo borra a mano, la línea vuelve a abrirse.

> Lo demás de la personalización (impuestos, moneda y datos fiscales) está en §8.4. Quedan canales y
> marca: se propusieron en el diseño y no están en estas rebanadas.

---

## 8.3 Personalización: el equipo y sus permisos

Un embudo con criterios no sirve si todo el mundo entra con el mismo rol. Los roles de catálogo
—Admin, Sales Agent— no dicen quién hace qué **en esta empresa**: el alta propone un rol por cada
trabajo que el cliente ha descrito, con el motivo por el que encaja, y el cliente decide cuáles se
crean.

| Pieza | Dónde |
|---|---|
| Catálogo y reglas (puro) | `lib/implantacion/roles.ts` |
| Escritura en la cuenta | `lib/implantacion/aplicar-roles.ts` |
| API | `GET/POST/DELETE /api/implantacion/roles` |
| Pantalla | `components/implantacion/RolesEditor.tsx`, dentro del paso de personalización |
| Persistencia | `ImplantacionTenant.plan` → `roles` (selección, roles creados, cuándo) |

Los cinco roles del catálogo y de qué respuesta sale cada uno:

| Rol | Se propone cuando | Qué puede |
|---|---|---|
| Dirección | Siempre: alguien responde por la cuenta | Ve todo el embudo, exporta e invita al equipo |
| Responsable de ventas | Seis o más vendiendo, o dolor «no sé qué hace mi equipo» | Ve y reasigna el embudo entero; no configura la cuenta |
| Comercial | Vende más de una persona | Sus oportunidades y sus clientes; no ve la cartera ajena |
| Preventa | Dolor «se me enfrían los leads» y más de una persona | Trabaja los leads entrantes y agenda; no negocia |
| Administración | Factura tarde, error de factura/precio o firmar en papel | Ve y exporta para facturar y cobrar; no mueve oportunidades |

Reglas que se aplican **en servidor**:

- **El perfil decide, no el nombre**: cada rol propuesto guarda sus señales (`equipo_grande`,
  `dolor_leads_frios`, `coste_error`…) para poder explicar y depurar la propuesta.
- **Lo que no encaja se enseña igual**, con lo que haría falta para que encajara. Esconderlo
  obligaría al cliente a adivinar; enseñarlo sin motivo le animaría a crear roles que no va a usar.
- **La última palabra es del cliente**: todo lo propuesto se puede quitar y todo lo no propuesto se
  puede añadir. La propuesta ordena, no encierra.
- **El alcance es un permiso** (`leads.ver_todos`), no una etiqueta: el botón «ve todo el embudo /
  solo su cartera» escribe o quita esa llave.
- **Tope de personas**: si el equipo que describe no cabe en el plan, se avisa al proponer, no
  cuando la siguiente persona no puede entrar. Los roles se crean igual.

Lo que se escribe y lo que se puede deshacer:

- **Aplicar nunca retira**: un rol con ese nombre que ya existía se **completa** con lo que le falte
  del diseño y conserva lo que tuviera de más (incluido un `{ all: true }`, que se deja intacto).
  Recortar se hace desde Equipo, donde se ve a quién afecta.
- **No se crean personas**: un rol vacío no entra a ningún sitio; asignarlo es un paso aparte en
  Equipo, enlazado desde la pantalla.
- **Reversible solo sin gente**: deshacer borra los roles que creó el alta y que nadie usa; los que
  tienen personas asignadas se conservan y se informa de cuántas. Si esa persona se va, deshacer
  vuelve a funcionar porque la entrada sigue guardada.
- **Auditoría**: `implantacion_roles` al aplicar (con el resultado por rol) y
  `implantacion_roles_deshacer` al deshacer (borrados y conservados).
- **El checklist no se fía del registro**: «Equipo y permisos» se cierra solo si los roles elegidos
  siguen existiendo en la cuenta. Si alguien borra «Comercial» a mano, la línea vuelve a abrirse.

---

## 8.4 Personalización: impuestos, moneda y datos fiscales

Las tres cosas que, mal puestas, se descubren facturando. La propuesta sale del **país desde el que
se factura** —el del emisor principal, y si no lo hay, el de las tasas que ya existan— y de **lo que
el cliente vende**.

| Pieza | Dónde |
|---|---|
| Catálogo y reglas (puro) | `lib/implantacion/fiscal.ts` |
| Escritura en la cuenta | `lib/implantacion/aplicar-fiscal.ts` |
| API | `GET/POST/DELETE /api/implantacion/fiscal` |
| Pantalla | `components/implantacion/FiscalEditor.tsx`, dentro del paso de personalización |
| Persistencia | `ImplantacionTenant.plan` → `fiscal` (país, moneda, tasas, creados, cuándo) |

Qué se propone según el perfil:

| Señal | Propuesta |
|---|---|
| País del emisor | El tipo general de ese país, marcado como tipo por defecto del catálogo |
| Vende alojamiento | El reducido pasa a ser el tipo por defecto de la estancia |
| Tipos superreducido y exento | Se listan **sin marcar**, con lo que haría falta para usarlos |
| Servicios a empresas en España | Nota de retención de IRPF (15 %, o 7 % los primeros años), no una tasa |
| Moneda del país ≠ `Tenant.moneda` | Se detecta la moneda heredada (MXN por defecto) y se propone la correcta |
| EE. UU., Brasil, México | Aviso de que el impuesto depende del estado o la provincia |

Reglas que se aplican **en servidor**:

- **No se inventa nada legal.** Sin país no se propone ninguna tasa; con un país sin tipos cargados
  tampoco se copian los de otro. El NIF, la razón social y la dirección **no se rellenan**: la
  pantalla dice qué falta y enlaza a Configuración fiscal.
- **La retención no se crea como tasa.** En esta plataforma se marca por línea y en el perfil fiscal
  del cliente; una fila que nadie lee sería dato muerto que parece configuración.
- **No se duplican tasas.** La ruta de Configuración fiscal hace `upsert` con `fechaInicioVigencia:
  now`, que cambia en cada llamada; aquí se busca la tasa **activa por código** y se corrige su
  porcentaje en vez de crear otra tongada con otra fecha.
- **La moneda no se cambia en silencio.** Al aplicarla se escribe `Tenant.moneda` y se deja
  constancia (`monedaInferida`, `monedaInferenciaSource: EXPLICIT`). La pantalla avisa de que **lo ya
  escrito no se convierte**: cambia la moneda de lo que se cree a partir de ahí.
- **Reversible solo sin documentos**: deshacer borra las tasas que creó el alta y que no usa ninguna
  cotización, orden ni contrato; las que sí se conservan y se informa de cuántos documentos las usan.
  La moneda **no** se revierte.
- **Auditoría**: `implantacion_fiscal` al aplicar (tasas, porcentajes, cambio de moneda) y
  `implantacion_fiscal_deshacer` al deshacer.
- **El checklist no se fía del registro**: «Fiscal listo para facturar» exige un impuesto activo, un
  emisor principal con datos y una moneda confirmada en el alta. Si alguien borra el emisor o las
  tasas, la línea vuelve a abrirse.

## 8.5 Personalización: marca y canales de captación

La cuarta pieza cierra dos agujeros que solo se ven al entrar: documentos que el cliente no reconoce
porque firman con el nombre interno de la cuenta, e informes de conversión que no se pueden leer
porque ningún lead dice por dónde llegó.

| Pieza | Dónde |
|---|---|
| Catálogo y reglas (puro) | `lib/implantacion/marca-canales.ts` |
| Escritura en la cuenta | `lib/implantacion/aplicar-marca-canales.ts` |
| API | `GET/POST/DELETE /api/implantacion/marca` |
| Pantalla | `components/implantacion/MarcaCanalesEditor.tsx`, dentro del paso de personalización |
| Persistencia | `ImplantacionTenant.plan` → `marca` (nombre, color, canales, tareas, estado previo) |

Qué se propone según el perfil:

| Señal | Propuesta |
|---|---|
| «¿Cómo llega un cliente hoy?» | Los canales marcados, con su primer paso para montarlos |
| Partners o distribuidores | Canal `referido`, con el nombre del partner en `Lead.fuente` |
| Dolor «se me enfrían los leads» | Formulario web conectado (asigna y avisa el mismo día) |
| Hoy gestiona clientes por WhatsApp | Conectar WhatsApp, para no dejar fuera el histórico |
| Vende a empresas con ciclo largo | LinkedIn, donde están los decisores |
| Leads que ya existen por canal | Ese canal se marca como «ya en uso», con su recuento |
| Sin respuesta de origen | Solo referido y web, avisando de que es una suposición |
| Lo que vende | Color de partida (alojamiento, servicios, productos, suscripción) |
| Nombre comercial ya escrito | No se pisa: se mantiene |

Reglas que se aplican **en servidor**:

- **El catálogo de canales es el de la plataforma.** Los ids son los valores de `Lead.canal` que ya
  ofrece el alta de leads; una prueba compara el catálogo del alta contra ese desplegable para que no
  aparezca un canal que luego nadie puede atribuir.
- **Nada de datos muertos.** El canal no se guarda en una fila que nadie lee: se convierte en una
  **tarea** (`Task`, con su primer paso y siete días de plazo) que el equipo ve en su panel. La marca
  se escribe en `Configuracion.business_name` y `Tenant.brandingConfig.primaryColor`, que es de donde
  `getEffectiveBranding()` saca la marca de propuestas, facturas y páginas públicas.
- **El logo no se genera.** Es del cliente: la pantalla dice que falta y enlaza a Identidad Visual.
- **No se duplican tareas.** Se guardan los ids en el plan; si la tarea sigue en la cuenta se reutiliza,
  y si alguien la borró a mano se vuelve a crear.
- **Deshacer respeta el trabajo hecho.** Devuelve el nombre y el color anteriores (o los retira si no
  existían) y borra las tareas que nadie ha completado; las completadas se quedan y se informan.
- **Auditoría**: `implantacion_marca` al aplicar y `implantacion_marca_deshacer` al deshacer.
- **El checklist no se fía del registro**: «Marca y canales» exige el nombre comercial escrito, el
  color guardado y una tarea viva por cada canal elegido. Si alguien borra la tarea, la línea vuelve
  a abrirse.

## 8.6 Cierre del paso: el resumen del go-live

Las cuatro piezas aprobadas por separado se leen juntas en una tarjeta antes de cargar nada, porque
un embudo sin etapas, un equipo sin roles o una marca sin nombre no se notan hasta el primer día.

| Pieza | Dónde |
|---|---|
| Resumen y pasos hasta datos (puro) | `lib/implantacion/resumen-golive.ts` |
| Pantalla | `components/implantacion/ResumenGoLive.tsx`, al final del paso de personalización |
| Avance de estado | `PATCH /api/implantacion` con `{ estado }` (el que ya existía) |

Qué muestra y qué no:

- **Se lee del checklist, no del plan.** Cada fila trae el `completada` y el detalle que la API acaba
  de comprobar en la cuenta. Si alguien borra el embudo, la tarjeta lo vuelve a abrir aunque el
  cliente lo hubiera aprobado: no hay estado «aplicado» guardado que pueda mentir.
- **Cuenta las cuatro, no una.** El distintivo dice «3 de 4 aplicadas» y el texto nombra lo que falta
  (`Falta 1 de 4: Fiscal listo para facturar.`), en vez de un «casi listo» que no dice qué tocar.
- **Sin las cuatro líneas no se cierra.** Un checklist recortado no da el paso por bueno: faltaría una
  pieza entera, no una etiqueta.
- **El paso a datos no se puede saltar a mano.** El botón recorre los estados que faltan de uno en uno
  (`personalizacion → datos`), porque la API rechaza los saltos. Quien entró a personalizar desde la
  elección ve el paso intermedio, no un error.
- **Con el botón no se cargan datos.** Se escribe el estado y se ofrece el acceso a
  `/dashboard/importar`: la carga sigue siendo del cliente, con su informe de calidad.
- **Progreso honesto:** la tarjeta muestra además las líneas del go-live cerradas (`6 de 10`), que
  incluyen datos, informes, plantillas y la firma del go-live.

## 8.7 Cierre del alta: la firma del go-live

El último paso no es un botón de «terminar»: antes, llegar a `listo` cerraba «Plantillas revisadas»
y «Go-live firmado» sin que nadie hubiera firmado nada ni escrito con qué criterio se mide. Ahora el
alta se cierra con una firma que exige lo que se puede medir.

| Pieza | Dónde |
|---|---|
| Reglas de la firma (puro) | `lib/implantacion/cierre.ts` |
| Pantalla | `components/implantacion/CierreGoLive.tsx`, en la vista de cierre del alta |
| Persistencia | `ImplantacionTenant.firmaGoLive` (`criterioExito`, `plantillasRevisadas`, `firmadoEn`, `firmadoPor`) |
| Escritura | `PATCH /api/implantacion` con `{ firma }` o `{ retirarFirma: true }` |

Qué hace cumplir:

- **Criterio de éxito escrito.** Entre 20 y 240 caracteres: sin una frase medible, la revisión de
  los 14 días no se puede evaluar. La fecha de revisión se calcula desde la firma, no se teclea.
- **Plantillas revisadas, firmado por una persona.** La confirmación viaja dentro de la firma: es lo
  único del checklist que el sistema no puede comprobar contra la cuenta.
- **Nada abierto se tapa.** El gate se recalcula en el servidor con los hechos de la cuenta: si
  falta el embudo, un rol, el emisor, un informe o los datos, la firma devuelve 409 con la lista.
- **No se llega a `listo` cambiando de paso.** `PATCH { estado: 'listo' }` sin firma devuelve 409; y
  con la firma puesta no se retrocede sin retirarla primero.
- **Reversible.** Retirar la firma borra el criterio y devuelve el alta al paso de datos; queda en
  `auditLog` (`implantacion_go_live` / `implantacion_go_live_deshacer`).
- **Sin firma, las dos últimas líneas siguen abiertas** aunque el alta haya llegado al último paso:
  es el único tramo del checklist que no se cierra con un hecho de la cuenta.

> La línea «Datos cargados» sigue cerrándose al entrar en el paso de datos, no con importaciones
> confirmadas. Es la deuda pendiente que queda en el checklist (§11).

---

## 9. Estado y persistencia

```
descubrimiento → propuesta → seleccion → personalizacion → datos → listo
                       ↘ (abandono: se retoma donde estaba)
```

Se guarda en un modelo propio, no en un JSON suelto, porque soporte necesita consultarlo:

```prisma
model ImplantacionTenant {
  id            String   @id @default(cuid())
  tenantId      String   @unique
  estado        String   @default("descubrimiento")
  descubrimiento Json?           // respuestas + noSe + versión
  recomendacion  Json?           // la propuesta completa, con motivos
  aceptados      String[] @default([])
  descartados    String[] @default([])
  informes       String[] @default([])   // informes fijados (ids del catálogo)
  plantillas     String[] @default([])   // plantillas elegidas
  entregablesAplicadosEn DateTime?      // última vez que se materializaron
  plan           Json?           // personalización aprobada
  firmaGoLive    Json?           // criterio de éxito, plantillas revisadas, quién y cuándo
  completadoEn   DateTime?
  actualizadoEn  DateTime @updatedAt
}
```

Con eso, el checklist de go-live de `crm-ventas-puesta-en-marcha.md` deja de ser un documento y
pasa a ser una pantalla: qué falta, quién lo bloquea y desde cuándo. Y el implementador ve el
estado sin preguntar.

Una línea no se cierra por avanzar de paso: «Informes fijados» exige que la selección esté
**aplicada** en la cuenta (`entregablesAplicadosEn` con al menos dos informes). Proponerlos no llena
el panel, así que tampoco puede tachar la tarea. Lo mismo vale para «Embudo aprobado», «Equipo y
permisos» y «Fiscal listo para facturar»: se comprueba que el embudo, los roles y el emisor sigan
existiendo, no que se hayan propuesto.

---

## 10. Seguridad, coste y auditoría

- **PII**: `PiiFilter` antes de cualquier llamada al modelo; al modelo van respuestas de negocio, no
  ficheros ni datos de clientes finales.
- **Ficheros**: el análisis de calidad es local y determinista. Un CSV de 5.000 clientes no se
  envía a ningún proveedor.
- **Coste**: presupuesto de llamadas por tenant para la guía (unas 15 llamadas cortas por alta);
  agotado el presupuesto, la guía sigue funcionando con textos plantilla.
- **Auditoría**: cada aplicación de una pieza de personalización escribe `auditLog` con
  `accion: 'implantacion_aplicar'`, `entidad: 'implantacion'` y el detalle de lo aplicado.
- **Prompts versionados** junto al esquema de salida; cambiar el prompt sin cambiar la versión es
  un fallo de revisión.

---

## 11. Plan de construcción en cuatro rebanadas

Cada una se puede entregar sola, y la primera ya cambia la experiencia sin IA.

| Rebanada | Qué entrega | Criterio de aceptación | Esfuerzo |
|---|---|---|---|
| **R1 · Descubrimiento y propuesta** | Cuestionario de 12 preguntas, motor determinista, tarjetas de elección, persistencia y checklist | Los 12 casos dorados pasan; un cliente completa el flujo y acepta/descarta módulos; queda `ImplantacionTenant` con su estado | 3–4 días |
| **R2 · Calidad de importación** | `preview` obligatorio, motor de reglas con códigos, cuarentena CSV, `batchId` y deshacer | Un fichero con NIF inválidos, SKU repetidos y duplicados internos produce el informe correcto y **no escribe nada** hasta confirmar | 2–3 días |
| **R3 · Conversación con IA** | Preguntas adaptativas, motivos redactados con las palabras del cliente, detección de contradicciones y fallback. **Entregado: `redactar.ts` (salida validada, plantilla si el proveedor falla) y `adaptativo.ts` (siguiente pregunta marcada, sin mover el cuestionario).** | Con el proveedor de IA caído, el flujo se completa con textos plantilla (probado) | 2–3 días |
| **R4 · Personalización y pack** | Plan aplicable pieza a pieza + informes fijados + plantillas preseleccionadas | Aplicar el plan crea el embudo, los roles y los impuestos, todo con auditoría y reversible. **Entregado: embudo, roles, impuestos, marca y canales, e informes/plantillas.** | 2–3 días |

Total: **9–13 días**. La tentación es empezar por R3 (la IA); el orden correcto es R1, porque sin
esquema de preguntas y motor no hay nada que la IA redacte bien.

> **Estado (31 oct 2026): R1 implementada.** El cuestionario, el motor y el estado viven en
> `lib/implantacion/` (`descubrimiento.ts`, `recomendar.ts`, `estado.ts`); la API en
> `app/api/implantacion/route.ts` (GET/POST/PATCH) y la pantalla en
> `app/dashboard/implantacion/page.tsx`, con entrada desde el onboarding rápido. Persiste en
> `ImplantacionTenant` y deja `auditLog` en cada paso. Casos dorados:
> `tests/implantacion-recomendar.test.ts`; flujo de interfaz: `tests/implantacion-page.test.tsx`.
> **Estado (1 nov 2026): R1, R2 y R4 completas.** El alta recorre descubrimiento, propuesta,
> elección, las cuatro piezas de personalización —embudo (`plan.ts` + `aplicar-embudo.ts`), roles,
> fiscal y marca/canales—, informes y plantillas (`entregables.ts` + `aplicar-entregables.ts`), el
> resumen del go-live (§8.6) y la firma (§8.7). Casos: `tests/implantacion-*.test.ts` y los
> `tests/*-editor.test.tsx`. **Estado (2 nov 2026): «Datos cargados» ya se cierra con datos en la
> cuenta**, no por llegar al paso: cuentan las importaciones confirmadas (`mode='commit'`, sin
> deshacer y con registros escritos) y los registros propios —leads, contactos y catálogo—, así que
> quien mete los datos a mano también cierra la línea y deshacer el último lote la vuelve a abrir.
> **R3 entregada (2 nov 2026):** la IA reescribe los motivos con las palabras del cliente y suma
> contradicciones a los riesgos, siempre validada y con `fuente: 'plantilla'` si falla; POST es el
> único punto que llama al modelo (GET reaprovecha la redacción guardada) y la pantalla marca la
> siguiente pregunta a contestar sin reordenar las tarjetas. El fallback está probado de punta a
> punta con el proveedor caído (`tests/implantacion-redactar.test.ts` y
> `tests/implantacion-redaccion-route.test.ts`). Las migraciones nuevas van con el despliegue (no se
> han aplicado a ninguna base en esta revisión).

---

## 12. Cómo se mide que la guía funciona

| Indicador | Objetivo | Qué corrige si falla |
|---|---|---|
| % de módulos recomendados aceptados | > 70 % | Reglas demasiado generosas o motivos poco convincentes |
| Tiempo descubrimiento → primer dato importado | < 48 h | Fricción en el cuestionario o en la importación |
| Tasa de rechazo de importación | < 10 % | Origen sucio: hay que guiar la exportación, no el fichero |
| Tiempo hasta la primera cotización enviada | < 5 días | El pack de plantillas o el catálogo no está listo |
| Altas que llegan al checklist completo | > 60 % | La senda tiene un punto donde todos se caen; mirar el estado |

---

## 13. Fuera de alcance (a propósito)

- **Que la IA configure sola la cuenta.** El cliente confirma cada pieza; sin confirmación no hay
  escritura.
- **Que la IA decida duplicados o valide NIF.** Eso es aritmética, y se audita.
- **Leer ficheros con el modelo.** Privacidad y coste; el análisis es determinista.
- **Sustituir al implementador** en cuentas de más de 20 usuarios o con integraciones propias.
- **Generar contenido legal** (cláusulas, condiciones) desde el alta: se preseleccionan plantillas
  existentes.

---

## Anexo · Dónde vive cada cosa

| Pieza | Fichero propuesto | Reutiliza |
|---|---|---|
| Preguntas y tipos | `lib/implantacion/descubrimiento.ts` | `lib/onboarding-modules.ts` (catálogo de módulos) |
| Motor de recomendación | `lib/implantacion/recomendar.ts` | `MODULE_GROUPS`, `PERFIL_SUGGESTED_MODULES`, `getStagesForCategory` de `lib/pipelines.ts` |
| Plan de personalización | `lib/implantacion/plan.ts`, `lib/implantacion/aplicar-embudo.ts` | `lib/pipelines.ts`, `lib/pipelines-server.ts`, `lib/crm-entitlements.ts` |
| Reglas de calidad | `lib/implantacion/calidad-importacion.ts` | `lib/import/column-mapper.ts`, `lib/import/import-types.ts` |
| Rutas | `app/api/implantacion/route.ts` (GET/POST/PATCH) | `withTenantAuth`, `auditLog` |
| Pantalla | `app/dashboard/implantacion/page.tsx` | `Card`, `ImportWizard` como base del paso de datos |
| Persistencia | `ImplantacionTenant` + campos nuevos en `ImportLog` | — |
| Pruebas | `tests/implantacion-recomendar.test.ts`, `tests/implantacion-page.test.tsx` (R2: `tests/implantacion-calidad-importacion.test.ts`) | `vitest` sin base de datos para el motor puro |
