# Tareas pendientes (guardadas para después)

> Lista de trabajo pendiente acordada con el usuario. Completar una a la vez.

## Fecha: 2026-09-07

1. **Verificación visual de Nueva Campaña en producción**
   Entrar a una cuenta con acceso en volkern.app y confirmar visualmente que Nueva
   Campaña muestra los 6 canales seleccionables (WhatsApp, Email, SMS, Telegram,
   Facebook, Instagram) tras el despliegue del catálogo de canales.

2. **Suite completa tras el refactor de canales**
   Ejecutar `npx vitest run` en local y confirmar que la suite completa sigue en
   verde (6013+ tests) después de la extracción de `lib/campaign-channels.ts`.

3. **Auditar catálogos hardcodeados restantes en la UI de campañas**
   Revisar las demás pantallas del módulo de campañas (estados, segmentos,
   programación) en busca de listas hardcodeadas que dupliquen validación del
   servidor y extraerlas a módulos puros compartidos si aplica.
