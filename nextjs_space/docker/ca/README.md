# CA intermedia FNMT — AC Componentes Informáticos

`fnmt-ac-componentes-informaticos.pem` es la CA intermedia que firma los
certificados de los endpoints del servicio SES.HOSPEDAJES:

- Sandbox: `hospedajes.pre-ses.mir.es`
- Producción: `hospedajes.ses.mir.es`

Los servidores del Ministerio **no sirven el intermedio** en el handshake TLS,
y Node no lo incluye en su store raíz (sí incluye la raíz AC RAIZ FNMT-RCM),
por lo que el handshake falla con `unable to verify the first certificate`.
Este archivo se monta en la imagen y se activa con `NODE_EXTRA_CA_CERTS`
(ver `Dockerfile`), que añade este certificado al store de Node sin sustituirlo.

## Procedencia (fuente autoritativa)

Obtenido del campo **AIA del propio certificado hoja** de
`hospedajes.pre-ses.mir.es` — la URL de distribución que el certificado declara:

```
http://www.cert.fnmt.es/certs/ACCOMP.crt   (formato DER)
```

No proviene de ningún bundle de terceros.

## Verificación

```
subject  = C=ES, O=FNMT-RCM, OU=AC Componentes Informáticos
issuer   = C=ES, O=FNMT-RCM, OU=AC RAIZ FNMT-RCM
notAfter = Jun 24 10:52:59 2028 GMT
sha256   = F0:38:42:1F:07:F2:0D:63:A2:0D:36:91:E5:A1:78:AB:84:59:EB:E5:70:C1:64:7B:76:90:55:4E:F2:38:76:AB
```

La raíz `AC RAIZ FNMT-RCM` ya está en el store Mozilla que Node lleva
incorporado; si alguna vez la verificación vuelve a fallar por la raíz,
añádela aquí con el mismo mecanismo (fuente oficial:
`http://www.cert.fnmt.es/content/certs/ACRAIZFNMTRCM_SHA2.crt`).

## Renovación

El certificado expira en **junio de 2028**. Antes de esa fecha, volver a
descargar desde la URL AIA (o la que publique el nuevo certificado hoja),
verificar el issuer/huella y sustituir este archivo.
