# Simulador del proveedor y ensayo del día H (Conectividad)

Última ejecución verificada: **23 sep 2026** — `npm run test:e2e:dia-h` → **34/34 comprobaciones en verde**.

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
| Guardia del contrato | `tests/hospitality-simulador-conectividad.test.ts` | Congela lo que el simulador promete: 401 sin credenciales, 403 partner desconocido, 404 hotel desconocido, catálogo con la forma que el mapping necesita. |

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

## Qué comprueba el ensayo (34 comprobaciones)

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
   Contraprueba: el webhook con Basic Auth incorrecto se rechaza con 401.
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

El ensayo necesita un esquema al día. La BD de desarrollo compartida (Neon)
está **20 migraciones por detrás** (no tiene `sesHospedajes`, ni
`connectivity_providers`, etc.), así que `next dev` contra ella falla al primer
`property_details`. Para ensayarlo sin tocar nada compartido se levantó un
PostgreSQL temporal:

```bash
PGBIN=/usr/lib/postgresql/16/bin
export PGDATA=/tmp/e2e-dia-h-pg && rm -rf "$PGDATA" && mkdir -p "$PGDATA"
$PGBIN/initdb -D "$PGDATA" -U postgres --auth=trust -E UTF8
$PGBIN/pg_ctl -D "$PGDATA" -o "-p 5459 -c listen_addresses=127.0.0.1 -k /tmp" -l "$PGDATA/server.log" start
$PGBIN/createdb -h 127.0.0.1 -p 5459 -U postgres volkern_e2e

cd nextjs_space
DATABASE_URL="postgresql://postgres@127.0.0.1:5459/volkern_e2e" npx prisma db push --skip-generate --accept-data-loss
E2E_DIA_H=1 DATABASE_URL="postgresql://postgres@127.0.0.1:5459/volkern_e2e" npm run test:e2e:dia-h

# al terminar
$PGBIN/pg_ctl -D "$PGDATA" stop && rm -rf "$PGDATA"
```

Se usó `db push` y **no** `migrate deploy` por un defecto real encontrado en ese
momento: **la serie de migraciones no se podía reproducir desde cero** (el
baseline `0_init` tenía 10 carpetas duplicadas que morían con `42P07`). **Ya
está arreglado** (24 sep 2026): la serie completa se aplica con `migrate
deploy` desde cero y lo congela el job de CI `migrations.yml` + la guardia
`tests/migraciones-serie.test.ts`. Hoy el ensayo puede usar el camino real:

```bash
DATABASE_URL="postgresql://postgres@127.0.0.1:5459/volkern_e2e" npx prisma migrate deploy
```

Tras el ensayo, todas las tablas de Hospitality quedaron a cero (tenants,
propiedades, unidades, reservas, mappings, eventos y contactos): la limpieza se
verificó consultando la base antes de borrarla.
