# 21. Gemma 4 Móvil y Asistencia en Campo

## 1. Nombre del hub
App Móvil Volkern + Gemma 4 Assistant.

## 2. Propósito operativo
Llevar la potencia del ecosistema ERP al bolsillo de los operarios de planta, vendedores en ruta e inspectores. Gemma 4 actúa como un coplioto conversacional que puede interactuar mediante voz o texto, consumiendo el Servidor MCP de Volkern para realizar acciones sin navegar por menús.

## 3. Quién lo usa
- Vendedores en reuniones fuera de la oficina (Field Sales).
- Operarios de Montacargas (Consultando ubicaciones por voz).
- Inspectores de Calidad (Para reportar defectos dictando a la IA).

## 4. Qué ve el usuario al entrar por primera vez
- Interfaz simplificada enfocada en una **Barra de Búsqueda y Chat (Micrófono)**.
- Widgets rápidos (Mis visitas de hoy, Mis órdenes en proceso).
- Alertas Push urgentes.

## 5. Qué puede hacer
- Hablar con Gemma: *"Gemma, créame una cotización para el cliente Acme Corp por 10 piezas del SKU 101"*.
- Subir fotos (Ej: Para reportar una No Conformidad o un Gasto/Viático) y que Gemma 4 extraiga los datos usando Visión por Computadora.
- Consultar el inventario escaneando un código de barras con la cámara del teléfono y preguntando a la IA si ese lote está aprobado.

## 6. Qué no puede hacer
- Operaciones de gran volumen visual (Ej: Ver un Gantt de 50 hitos de un Proyecto no es cómodo ni operable en la interfaz móvil).
- Las funciones de alto impacto financiero (Sellar la Nómina, Ajustar el Margin Guard) están limitadas a la versión de escritorio por seguridad y porque requieren una revisión profunda.

## 7. Qué ayudas necesita el administrador de tenant
- Configurar el MDM (Mobile Device Management) corporativo para pre-instalar la App Volkern con el Slug del Tenant inyectado.
- Explicar a la fuerza laboral cómo activar permisos de micrófono y cámara.

## 8. Problemas o dudas frecuentes
- **"Gemma me dice 'Sin Conexión'"**: El dispositivo móvil perdió cobertura (4G/Wi-Fi). Gemma necesita internet para inferir, aunque la app local guarda borradores (Drafts) offline para su posterior subida.
- **"Gemma no entendió mi comando de voz"**: El ruido ambiental en una planta industrial puede dificultar el reconocimiento (Speech-to-Text). Sugerir uso de auriculares industriales o texto.

## 9. Reglas de jerarquía y seguridad
- **Biometría forzada:** Para iniciar la app móvil, el usuario debe usar FaceID o Huella, previniendo accesos si el teléfono se pierde.
- Las consultas que hace el usuario a Gemma desde el móvil heredan automáticamente el `ContactId` del usuario. Si un operario pregunta el sueldo del CEO, Gemma dirá "Acceso Denegado" debido a la herencia de permisos del operario.

## 10. Flujo normal de uso (Ejemplo: Almacén)
1. El Montacarguista saca su móvil.
2. Abre la app (FaceID OK).
3. Presiona el ícono del Micrófono: *"Gemma, necesito mover 5 cajas del Lote X al Pasillo 2"*.
4. Gemma invoca la Tool de MCP `stock_transfer`.
5. Gemma contesta por voz: *"Movimiento registrado exitosamente. El lote X ahora está en el Pasillo 2"*.
6. El operario guarda el móvil sin haber tocado ningún menú.

## 11. Indicadores operativos importantes
- Tasa de adopción de la app móvil vs Interfaz Web.
- Frecuencia de uso del asistente de voz (Gemma Interactions por sesión).

## 12. Escalamiento cuando algo falla
1. Si Gemma alucina repetidamente o ejecuta la Tool incorrecta, el caso debe reportarse al equipo técnico para refinar el `System Prompt` del Agente Móvil y ajustar los descriptores del MCP Manifest.

---

### Resumen para soporte y administración
1. **La voz es la interfaz final:** Entrenar a los usuarios de campo para que "platiquen" con el sistema reduce los errores de tipeo y la fricción.
2. **Privacidad por defecto:** Los comandos de voz se transcriben on-device o se mandan encriptados. Gemma no escucha pasivamente (No es un Alexa), solo "escucha" cuando el botón de micrófono está presionado.
3. **El contexto lo es todo:** Gemma en el móvil sabe quién le habla, dónde está (por GPS, si se autoriza), y qué cliente tiene enfrente en base a su agenda. Esto hace sus respuestas hiper-relevantes.
4. **Resguardo de Evidencias:** Usar Gemma para sacar fotos de facturas de gasolina (Gastos) en lugar de juntar tickets de papel ahorra horas de contabilidad a fin de mes.
5. **Autenticación Delegada:** La App móvil debe expirar sus tokens JWT agresivamente por riesgo de robo de teléfonos, exigiendo re-login biométrico frecuente.
