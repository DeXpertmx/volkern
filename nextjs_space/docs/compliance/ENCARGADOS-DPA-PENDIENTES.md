# 🔐 Encargados del tratamiento — verificaciones pendientes

> **Estado:** Pendiente de confirmación | **Prioridad:** Alta
> **Origen:** la sección 6 de la política de privacidad publicaba estas comprobaciones como instrucciones internas.
> **Destino de esas comprobaciones:** este documento.

---

## 1. Por qué existe este documento

La tabla de encargados de `/privacy` decía cosas como *"verificar DPA y mecanismo de transferencia"*,
*"la región depende de la configuración del proyecto"* o *"verificar la ubicación de la instancia en
producción"*. Eso son notas de trabajo, no política: quien lee la página no puede verificar nada, y el
propio texto se desmentía dos secciones más abajo ("no representamos que una transferencia sea lícita
únicamente porque un proveedor figure en esta lista").

La política ahora **afirma el mecanismo** —acuerdo de tratamiento de datos más cláusulas contractuales
tipo cuando la transferencia las requiere— y remite a `privacidad@volkern.app` para el detalle por
proveedor. Lo que hay que comprobar es el contenido de esa afirmación, y se comprueba aquí.

---

## 2. Qué se movió exactamente

| Antes, en la página pública | Ahora publicado | Verificación pendiente |
|---|---|---|
| "La región depende de la configuración del proyecto; verificar DPA" | "Tratamiento regido por su acuerdo de tratamiento de datos y por las cláusulas contractuales tipo…" | Confirmar incorporación del DPA de Vercel y la región del proyecto |
| "Puede implicar tratamiento fuera del EEE; verificar DPA" | "Se aplican su acuerdo de tratamiento de datos y las cláusulas contractuales tipo." | Confirmar DPA de AWS y región de S3 y SES |
| "Verificar la ubicación de la instancia en producción" | "Alojada en la infraestructura de la plataforma, con acceso restringido y datos cifrados…" | Ver el hallazgo 1: el hosting no está identificado en la lista |
| "El procesamiento de pagos… se rigen por los términos/DPA de Stripe" | "Los pagos se procesan en Stripe, con su acuerdo de tratamiento de datos y las cláusulas contractuales tipo. No almacenamos los datos completos de tu tarjeta." | Confirmar DPA y que la integración no almacena datos de tarjeta |
| "El tratamiento se rige por los términos de Google" | "Se rigen por las condiciones de Google y su addendum de tratamiento de datos." | Confirmar el addendum y el alcance de los permisos OAuth |
| "verificar DPA, ubicación y salvaguardas" | "Tratamiento regido por las condiciones de Meta para plataformas…" | Confirmar condiciones de plataforma y SCC aplicables |
| "regido por el DPA del proveedor aplicable" | "Tratamiento regido por su acuerdo de tratamiento de datos…" | Ver el hallazgo 3: identificar los proveedores reales |
| "verificar DPA y salvaguarda aplicable antes de su uso" | "Se activan bajo instrucción del cliente. Tratamiento regido por su acuerdo de tratamiento de datos…" | Ver el hallazgo 2: hay **cinco** proveedores de IA alcanzables |

---

## 3. Verificaciones pendientes por proveedor

| Proveedor | Qué hay que confirmar | Estado |
|---|---|---|
| **Hosting de producción (VPS)** | Proveedor, región y DPA. La aplicación de producción corre en un VPS y **no figura en la lista pública** | 🔴 Bloqueante |
| Vercel | DPA incorporado, región del proyecto y subencargados | 🟠 Pendiente |
| Amazon Web Services | DPA, región del bucket S3 y de la identidad SES | 🟠 Pendiente |
| Stripe | DPA y SCC; confirmar que no se almacenan datos de tarjeta | 🟠 Pendiente |
| Google | Addendum de tratamiento y permisos OAuth efectivamente solicitados (Calendar, Tasks, login) | 🟠 Pendiente |
| Meta / WhatsApp | Condiciones para plataformas y SCC; distinguir Cloud API de la instancia propia | 🟠 Pendiente |
| Notificaciones | Ver hallazgo 3 | 🟡 Por identificar |
| Proveedores de IA | Ver hallazgo 2 y 4 | 🔴 Bloqueante para la afirmación de §5 |

---

## 4. Hallazgos aparecidos al reescribir la tabla

### Hallazgo 1 — El proveedor del VPS no está en la lista

La política nombra Vercel como alojamiento, pero la aplicación de producción corre en un VPS con sus
propios contenedores. Un proveedor de infraestructura que aloja la base de datos y los documentos
**es un encargado del tratamiento** y debe figurar. Antes de publicarlo hay que identificarlo,
confirmar su región y su DPA. Mientras tanto, la fila de la base de datos se redactó **sin afirmar
quién la aloja**, para no publicar un dato sin verificar.

### Hallazgo 2 — Hay cinco proveedores de IA alcanzables, no uno

La política habla de "proveedores de modelos de IA" en genérico, pero el código puede llamar a
**OpenRouter, DeepSeek, OpenAI, Anthropic y Google (Gemini)**. Hay que decidir dos cosas:

1. **Cuáles están activos en producción.** El código admite los cinco; la política no debería nombrar
   ni omitir a ninguno por accidente.
2. **La afirmación de §5, sección "Uso de inteligencia artificial":** dice que "no utilizamos sus datos
   para entrenar o mejorar modelos de terceros". Eso depende de la configuración de retención de cada
   proveedor y no del código. Hay que confirmarlo por escrito antes de mantener la frase.

### Hallazgo 3 — Las notificaciones pueden ser autoalojadas

El repositorio usa **Apprise** para notificaciones, que se despliega en la propia infraestructura. Si el
envío real es autoalojado, la fila "Proveedores de notificaciones" como encargado externo es
**inexacta**: se corregiría describiéndolo como tratamiento propio, no como tercero. Confirmar qué
parte es autoalojada y qué parte sale a un proveedor.

### Hallazgo 4 — DeepSeek implica transferencia a China

`api.deepseek.com` es alcanzable desde el código y DeepSeek es un proveedor con sede en **China**. Si
está activo en producción, hay una transferencia internacional a un país sin decisión de adecuación,
que exige cláusulas contractuales tipo **y** una evaluación de impacto de la transferencia. Es el punto
más delicado de toda la sección y no se resuelve redactando: se resuelve confirmando si está activo.

### Hallazgo 5 — El DPO no aparece en la política

El resto de documentos legales del repositorio (`docs/legal/CLAUSULA-ASISTENCIA-GPS.md`,
`docs/DPIA-ASISTENCIA-GPS.md`) y la propia aplicación definen `dpo@volkern.app` como delegado de
protección de datos. La política publica `privacidad@volkern.app` y no menciona al DPO. **Decisión
pendiente:** publicar ambos o unificar el contacto. No se cambió por no tomar esa decisión sin
confirmarla.

### Hallazgo 6 — Contrato de encargo con el cliente (art. 28 RGPD)

La sección 1 también decía que la relación responsable/encargado "debe confirmarse en el acuerdo de
servicio". Se reescribió en presente —Volkern trata los datos del cliente siguiendo sus instrucciones—
porque eso describe el comportamiento real de la plataforma.

Lo que queda por confirmar es el **documento**: cuando un cliente trata datos personales de terceros
(sus contactos, sus leads, sus huéspedes) a través de Volkern, el RGPD exige un contrato de encargo del
artículo 28 con las instrucciones, la duración, las medidas de seguridad y el destino de los datos.
Comprobar si los Términos de Servicio vigentes **son** ese contrato o si hace falta un anexo aparte.

### Hallazgo 7 — "PostgreSQL" no es un encargado

Aparecía como proveedor, pero PostgreSQL es un motor de base de datos, no una entidad que trate datos
por cuenta de Volkern. Se corrigió la fila a "Base de datos gestionada (PostgreSQL)" y la verificación
real es quién la aloja (hallazgo 1).

---

## 5. Criterio para futuras ediciones

Nada de esto debe volver a la página pública:

- ❌ "Verificar…", "debe confirmarse…", "puede implicar…", "no representamos que…".
- ✅ El mecanismo que se aplica, en presente, y a quién se le pide el detalle.

Si una afirmación no se puede sostener, la política **no la escribe**: se quita la fila o se redacta de
forma que solo diga lo verificado. Es preferible una política más corta que una que se desmienta sola.
