-- Plantillas briefing_diario para el tenant demo (setup reproducible)
DELETE FROM hospitality_communication_templates
WHERE "tenantId"='cmtlytty10000s1uuafjc2ril' AND evento='briefing_diario';

INSERT INTO hospitality_communication_templates
 (id, "tenantId", evento, canal, asunto, contenido, activo, idioma, "fechaCreacion", "fechaEdicion")
VALUES
 ('tmpl_briefing_wa_demo', 'cmtlytty10000s1uuafjc2ril', 'briefing_diario', 'whatsapp', NULL,
$$🌅 Buenos días. Briefing de {{fecha}}:

• Ocupación: {{ocupacion}} ({{unidades_ocupadas}} de {{total_unidades}} unidades)
• Llegan hoy ({{llegadas_hoy}}):
{{detalle_llegadas}}
• Salen hoy ({{salidas_hoy}}):
{{detalle_salidas}}
• Mañana: {{llegadas_manana}} llegadas y {{salidas_manana}} salidas
• Incidencias activas: {{incidencias}}
• Cobros pendientes ({{cobros_pendientes}}): {{detalle_pendientes}}$$, true, 'es', NOW(), NOW()),

 ('tmpl_briefing_email_demo', 'cmtlytty10000s1uuafjc2ril', 'briefing_diario', 'email', '🌅 Briefing {{fecha}} — ocupación {{ocupacion}}',
$$Buenos días. Resumen del día en vuestras propiedades:

Ocupación: {{ocupacion}} ({{unidades_ocupadas}} de {{total_unidades}} unidades)
Llegan hoy ({{llegadas_hoy}}): {{detalle_llegadas}}
Salen hoy ({{salidas_hoy}}): {{detalle_salidas}}
Mañana: {{llegadas_manana}} llegadas y {{salidas_manana}} salidas
Incidencias activas: {{incidencias}}
Cobros pendientes ({{cobros_pendientes}}): {{detalle_pendientes}}$$, true, 'es', NOW(), NOW());

SELECT 'PLANTILLA', canal, activo, left(contenido, 60) FROM hospitality_communication_templates
WHERE "tenantId"='cmtlytty10000s1uuafjc2ril' AND evento='briefing_diario' ORDER BY canal;
