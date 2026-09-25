# Simulador del proveedor y ensayo del día H (Conectividad)

Última ejecución verificada: **25 sep 2026** — `npm run test:e2e:dia-h` → **38/38 comprobaciones en verde**.

El día H de la conectividad depende de un tercero: hasta que llegue su respuesta
(URL, partner id y Basic Auth) no hay contra qué probar. Este simulador responde
por él **en local**, con el mismo contrato que implementa el adapter, y el ensayo
recorre con el código real del producto todo lo que tiene que funcionar ese día.

## Qué hay

| Pieza | Fichero | Para qué |
| --- | --- | --- |
| Simulador del proveedor | `scripts/simulador-conectividad.mjs` | Responde `property_details`, acepta los push de inventario/tarifas y devuelve reservas por `data`. Exige Basic Auth de verdad. |
| Ensayo del día H | `scripts/e2e-dia-h-conectividad.ts` | Recorre el flujo completo con las funciones reales del producto. |
| Lanzador | `scripts/run-e2e-dia-h-conectividad.sh` | Levanta el producto en un puerto aislado y ejecuta el ensayo. |
| Guardia del contrato | `tests/hospitality-simulador-conectividad.test.ts` | Congela lo que el simulador promete: 401 sin credenciales, 403 partner desconocido, 404 hotel desconocido, catálogo con la forma que el mapping necesita, y que el empuje sabe mandar la cabecera Authorization EXACTA (cruda o ninguna) que piden las contrapruebas del 401. |

## Cómo se ejecuta

```bash
npm run test:e2e:dia-h                 # producto en 3097 + simulador en puerto libre
E2E_PORT=3098 npm run test:e2e:dia-h   # otro puerto
npm run test:e2e:dia-h -- --keep       # deja los datos del ensayo para mirarlos
```

**Apagador**: el ensayo escribe en la base de datos a la que apunte
`DATABASE_URL` (el `.env` del proyecto), así que exige `E2E_DIA_H=1` y el
lanzador lo pone. Nunca habla con el proveedor real ni con producción.

El simulador suelto, para desarrollar contra él sin ensayo:

```bash
node scripts/simulador-conectividad.mjs --port 4510 \
  --partner-id socio-1234 --usuario hotel.api --password Secreto1 --hotel-code mi-hotel
# imprime: SIMULADOR_LISTO puerto=4510 url=http://127.0.0.1:4510/api/v2/cm
# para apuntar el producto: CONNECTIVITY_BASE_URL=http://127.0.0.1:4510/api/v2/cm
```

## Qué comprueba el ensayo (38 comprobaciones)

1. **Preflight de la respuesta del proveedor** antes de guardar nada, con las
   contrapruebas que importan: la contraseña con un espacio de más se rechaza
   (sería un 401 indistinguible) y un `usuario:contraseña` pegado junto se
   separa solo y entra.
2. **Guardado real** de credenciales en la capa de conectividad.
3. **`property_details`**: el catálogo con habitaciones y planes de tarifa, más
   la comprobación en el registro del simulador de que la llamada llegó **con
   Basic Auth**.
4. **Mapping externo** (paso 5 del onboarding): `hotelCode` + `roomCode` +
   `rateplanCode` enlazados a la unidad real.
5. **Push de inventario y de tarifas** aceptados por el proveedor, con el
   `hotelCode` y el partner id correctos en el cuerpo recibido.
6. **Contraprueba de credenciales malas**: el push falla con 401 y el fallo se
   ve (no un silencio que parezca éxito).
7. **El proveedor empuja una reserva** (`book`) al webhook del producto con su
   Basic Auth: entra, queda confirmada, en la unidad del mapping, con el importe
   y la divisa que mandó el proveedor, y con enlace de check-in que responde 200.
   Contrapruebas del 401 del webhook entrante, todas contra el simulador real:
   con Basic Auth incorrecto se rechaza con 401 **y el cuerpo nombra el motivo
   con su diagnóstico** (`credenciales_no_coinciden`, longitudes y huellas);
   **sin cabecera** Authorization → 401 `sin_cabecera`; **`basic` en
   minúsculas** se ACEPTA (RFC 7235, no se castiga con 401); y **otro esquema**
   (`Bearer`) → 401 `esquema_no_basic` con el esquema visto. Es el mismo
   diagnóstico que pinta `/admin/conectividad`, cubierto de punta a punta.
8. **Idempotencia, `modify` y `cancel`** sobre la misma reserva, y la
   **reconciliación** (`data`) devolviendo lo que el proveedor dice tener.
9. **Estado final**: la conectividad queda `conectado` y el último evento
   registrado.
10. **Limpieza**: se borra todo lo que creó el ensayo y se **restaura la
    configuración de conectividad anterior tal cual estaba** (los valores
    cifrados, sin descifrar nada).

## Qué NO prueba

El simulador implementa el contrato **según lo entendemos nosotros**. Sigue
dependiendo del proveedor real, y por eso el runbook mantiene sus bloqueos:

- Los valores exactos que devolverá su `property_details` (nombres de campos,
  si `count` significa habitaciones o unidades), su `hotelCode` real y los
  `roomCode`/`rateplanCode` del catálogo: con eso hay que **copiar** lo que
  publique, no adaptarlo a lo que el simulador devuelve.
- Sus límites de tasa, ventana de push, si firma los payloads además del Basic
  Auth, y su URL byte a byte.
- Cualquier comportamiento ante errores distinto del documentado.

## Nota sobre la base de datos

El ensayo necesita un esquema al día. La BD de desarrollo compartida (Neon, la
`DATABASE_URL` del `.env`) **ya está al día** (25 sep 2026): 31 migraciones
aplicadas y `prisma migrate diff` contra `prisma/migrations` sin diferencias.
Hoy el ensayo corre directo contra ella, sin PostgreSQL efímero:

```bash
npm run test:e2e:dia-h
```

No siempre fue así, y el camino hasta aquí deja dos reglas para esta base
compartida:

- **Nunca `db push` contra la compartida.** Crea drift fuera del historial: la
  era `db push` dejó `User.contactId` y las columnas de `hospitality_review`
  creadas a mano, una migración marcada como fallida desde el 21-sep
  (`20260922090000_review_importada`) y `next dev` fallando con `P2022` en
  `sesHospedajes`. Se arregló el 25-sep verificando objeto por objeto (columna,
  índice, FK) que la base ya tenía el estado final de las migraciones afectadas,
  marcándolas con `prisma migrate resolve --applied` y aplicando el resto con
  `migrate deploy`. Las 12 pendientes eran todas aditivas (tablas y columnas
  nuevas): nada destructivo tocó datos compartidos.
- **Si `migrate status` anuncia pendientes, aplicarlas con `migrate deploy`**:
  solo aplica lo que falta y no toca datos. El estándar de migraciones
  idempotentes y el baseline viven en `docs/PRISMA-BASELINE.md`; la serie desde
  cero la congelan el CI (`migrations.yml`) y
  `tests/migraciones-serie.test.ts`.

Si la compartida vuelve a quedar corta y hace falta un ensayo urgente, el
PostgreSQL temporal sigue siendo la salida:

```bash
docker run -d --name pg-e2e-dia-h -e POSTGRES_PASSWORD=e2ediah \
  -e POSTGRES_DB=volkern_e2e -p 45432:5432 postgres:17-alpine

cd nextjs_space
DATABASE_URL="postgresql://postgres:e2ediah@127.0.0.1:45432/volkern_e2e" npx prisma migrate deploy
E2E_DIA_H=1 DATABASE_URL="postgresql://postgres:e2ediah@127.0.0.1:45432/volkern_e2e" npm run test:e2e:dia-h

docker rm -f pg-e2e-dia-h
```

El ensayo limpia sus propios datos al terminar (tenant `e2e-dia-h` y todo lo
que empieza por `E2E-DIA-H`; con `--keep` se dejan). En la corrida efímera del
23-sep la limpieza se verificó consultando la base antes de borrarla: todas las
tablas de Hospitality quedaron a cero.
