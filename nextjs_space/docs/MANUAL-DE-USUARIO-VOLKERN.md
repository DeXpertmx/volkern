# Manual del Usuario Volkern (Guía Paso a Paso)

Este manual te guiará "clic a clic" por cada módulo de Volkern. Aprenderás cómo realizar las tareas principales y qué hacer si te equivocas.

---

## 1. Módulo de Ventas y CRM (Sales Hub)

### Crear un nuevo Prospecto (Lead)
1. Ve al menú lateral y haz clic en **CRM > Leads**.
2. Haz clic en el botón superior derecho **"+ Nuevo Lead"**.
3. Llena el formulario con el Nombre, Correo y Teléfono.
4. Haz clic en **Guardar**.
* *¿Me equivoqué?* Haz clic en el nombre del lead, ve a "Editar" para corregir los datos, o usa el botón rojo "Eliminar" si fue un error (solo si no tiene transacciones asociadas).

### Mover una Oportunidad (Deal) en el Pipeline
1. Ve a **CRM > Deals (Oportunidades)**. Verás un tablero estilo Kanban.
2. Haz clic sobre la tarjeta de un Deal y **arrástrala** hacia la siguiente columna (ej. de "Contacto Inicial" a "Reunión Agendada").
* *¿Me equivoqué?* Simplemente arrastra la tarjeta de vuelta a la columna anterior.

### Generar una Cotización
1. Abre un **Deal** específico.
2. En la pestaña "Cotizaciones", haz clic en **"Generar Cotización"**.
3. Agrega ítems desde tu Catálogo (propiedades, productos o servicios).
4. Haz clic en **"Enviar al Cliente"**.
* *¿Me equivoqué?* Si el cliente aún no la acepta, abre la cotización y haz clic en "Editar". Si ya fue aceptada, deberás generar una nueva versión.

---

## 2. Módulo de Operaciones y ERP

### Crear y Firmar un Contrato (ContractSealer)
1. Ve a **Operaciones > Contratos** (o desde una cotización aprobada, haz clic en "Convertir a Contrato").
2. Revisa las cláusulas y montos. Haz clic en **"Sellar y Enviar"**.
3. **Importante:** Al sellar, el sistema genera una huella inmutable (Hash).
4. El cliente recibirá un enlace para firmar digitalmente.
* *¿Me equivoqué?* **¡Atención!** Los contratos sellados son inmutables. No puedes modificarlos. Si hay un error, debes usar el botón **"Anular Contrato"** (lo que dejará un registro de auditoría) y crear uno nuevo.

### Registrar una Entrada de Inventario (Stock Movement)
1. Ve a **Inventario > Movimientos**.
2. Haz clic en **"Registrar Entrada"**.
3. Selecciona el Producto, el Almacén y la Cantidad. Añade una nota justificativa.
4. Haz clic en **"Confirmar Movimiento"**.
* *¿Me equivoqué?* Los movimientos de stock están sellados contra fraude. No puedes "editar" la entrada. Debes ir a **"Registrar Salida / Ajuste"**, descontar la cantidad equivocada y poner en la nota "Corrección de error de entrada anterior".

---

## 3. Módulo Financiero y Fiscal (Veri*Factu)

### Emitir una Factura Electrónica
1. Ve a **Finanzas > Facturas**.
2. Haz clic en **"Nueva Factura"**.
3. Selecciona el Cliente (sus datos fiscales se autocompletarán).
4. Añade los conceptos o importa desde un Contrato activo.
5. Haz clic en **"Emitir y Sellar a AEAT"**. El sistema generará el XML y lo enviará a Hacienda.
* *¿Me equivoqué?* Si la factura ya fue sellada, es intocable. Debes abrir la factura errónea y hacer clic en **"Generar Factura Rectificativa" (Nota de Crédito)** para anular el impacto fiscal, y luego emitir una nueva.

### Revisar el Estado Fiscal
1. En la lista de facturas, verás un semáforo (🟢 Aceptada, 🔴 Rechazada, 🟡 Pendiente).
2. Si está rechazada, haz clic en ella para leer el mensaje de error exacto de Hacienda.

---

## 4. Módulo de Recursos Humanos (HR)

### Sellar una Nómina Mensual
1. Ve a **Recursos Humanos > Nóminas**.
2. Genera las nóminas del mes actual haciendo clic en **"Calcular Periodo"**.
3. Revisa los montos brutos y netos de cada empleado.
4. Haz clic en **"Sellar Nóminas"**.
* *¿Me equivoqué?* Las nóminas selladas generan una cadena de auditoría estricta. No se pueden editar directamente. Debes seleccionar la nómina y hacer clic en **"Corregir Nómina"**, lo que anulará la actual y generará una nueva versión vinculada a la errónea para justificar el cambio.

---

## 5. Módulo Omnicanal (Bandeja Unificada)

### Contestar un Mensaje de Cliente (WhatsApp/Web)
1. Ve a **Omnicanal > Bandeja de Entrada**.
2. En el panel izquierdo, selecciona el chat no leído.
3. Escribe tu respuesta en la caja de texto inferior y presiona "Enviar".
* *¿No sé la respuesta?* Usa el botón ✨ (Sparkles) para que **Gemma (IA)** te sugiera una respuesta profesional basada en los manuales de tu empresa.

### Crear un Ticket de Soporte
1. Desde un chat abierto, haz clic en el botón superior derecho **"Convertir a Ticket"**.
2. Asigna una prioridad (Alta, Media, Baja) y un responsable de tu equipo.
3. El ticket aparecerá en el tablero de **Soporte > Tickets**.

---

## 6. Módulo de Academia (LMS)

### Crear un Curso
1. Ve a **Academia > Cursos**.
2. Haz clic en **"Crear Curso"**. Sube una imagen de portada y título.
3. En el constructor, usa el botón **"+ Agregar Módulo"** y luego **"+ Agregar Lección"**.
4. Puedes incrustar videos de YouTube/Vimeo o subir PDFs.
5. Haz clic en **"Publicar"** arriba a la derecha.
* *¿Me equivoqué?* Abre el curso, haz los cambios necesarios y presiona "Guardar". Los estudiantes verán los cambios en tiempo real.

---

## 7. Módulo AIOps y Control Remoto (Para Administradores)

La plataforma trabaja sola, pero si eres administrador, usas Telegram para controlarla.

### Usar ChatOps (Telegram)
1. Abre tu chat con el Bot de Volkern en Telegram.
2. Escribe `/fiscal_status` para ver si hay errores en el sistema.
3. Escribe `/fiscal_ai_forecast` para ver cuánto vas a facturar este mes según la predicción de la IA.
* *¿Recibiste una alerta roja?* El bot te dirá "Nuevo Incidente". Responde con `/fiscal_ack [ID]` para decirle al sistema que ya lo estás revisando y detener las alarmas sonoras.
