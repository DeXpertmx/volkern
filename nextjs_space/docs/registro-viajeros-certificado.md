# Registro de viajeros — certificado digital de la entidad (SES.HOSPEDAJES)

Nota operativa para quien pone en marcha el registro obligatorio de viajeros de un
tenant. Explica dónde se instala el certificado, qué se comprueba y qué falta para
que las comunicaciones (RH y PV) salgan solas.

## Dónde se instala

**Hospitality → Registro de viajeros → Configuración → “Certificado digital de la
entidad”.**

Ahí se sube el fichero que expide la FNMT (`.p12` o `.pfx`) y su contraseña. Al
guardar, Volkern abre el fichero antes de aceptarlo:

- si la contraseña no lo abre, se rechaza y se dice exactamente eso (no se guarda
  nada);
- si el certificado ya caducó, se rechaza y se dice la fecha;
- si no está vigente todavía, también.

Si se acepta, la configuración enseña de quién es (titular y NIF), quién lo emitió,
su huella SHA-256 y hasta cuándo vale. El fichero y su contraseña **nunca** se
vuelven a mostrar: se guardan cifrados y solo se usan para hablar con el Ministerio.

## Qué hace ese certificado

Es la mitad de cliente del TLS: viaja **presentado en cada comunicación** (junto a
la cabecera `Authorization: Basic`). Sin él, el Ministerio no sabe quién comunica, y
el fallo se ve como un error de TLS que no explica nada.

La otra mitad (validar el certificado del Ministerio) la cubre la CA intermedia de
la FNMT que viaja dentro de la imagen (`docker/ca/`, `NODE_EXTRA_CA_CERTS`).

El botón **“Probar conexión”** de la misma pantalla hace la prueba completa: sale con
el certificado de la entidad, y si el certificado instalado ya no sirve lo dice con
su causa en lugar de parecer una caída de red.

## Cuándo caduca

La configuración avisa cuando al certificado le quedan 60 días o menos, y lo marca
en rojo si ya caducó. Un certificado caducado no rompe nada más: la comunicación
falla con el motivo exacto («El certificado de la entidad caducó el …») y queda en
el último error de la configuración.

Para renovarlo: pedir el certificado nuevo a la FNMT, subirlo en la misma pantalla y
guardar. No hace falta tocar nada más.

## Qué falta del lado de la entidad (no lo puede hacer Volkern)

1. **Registrarse como entidad** en SES.HOSPEDAJES con certificado o Cl@ve. De ahí
   salen:
   - el **código de arrendador** (va en la configuración del registro);
   - el **código de establecimiento** de cada alojamiento (va en la propiedad);
   - el **usuario y la contraseña de servicios web**.
2. **Activar el servicio web** en la sede electrónica; sin esa activación el
   Ministerio responde 401 aunque las credenciales sean correctas.
3. **Instalar el certificado** en esta pantalla y pulsar “Probar conexión” para
   comprobar el TLS antes de la primera comunicación real.

## Verificación técnica (para desarrollo)

- `lib/hospitality/ses-hospedajes/certificado.ts` — abre el PKCS#12, elige la hoja
  (la que casa con la clave privada), saca los metadatos y construye el agente TLS.
  No guarda nada: eso es de `compliance-store.ts`.
- `tests/ses-hospedajes-certificado.test.ts` — incluye un TLS mutuo real contra un
  servidor local que pide certificado: comprueba que el certificado llega.
- `tests/ses-certificado-config.test.ts` — comprueba que lo que se guarda está
  cifrado y que lo que sale hacia la interfaz son solo metadatos públicos.
- `tests/hospitality-certificado-ui.test.tsx` — la instalación desde la interfaz.
