# Seed — oficina franquiciada de demostración (VRE Norte)

Script: `scripts/seed-oficina-vre-norte.ts`

Crea una **oficina hija de `vre`** para demostrar que cada franquiciado tiene su
propia landing con el mismo motor del portal: misma plantilla, otra marca y otro
catálogo.

## Qué crea

| Elemento | Detalle |
| --- | --- |
| Tenant hijo | `VRE Norte`, slug **`vre-norte`**, `parentId` = `vre`, plan `agency-slot`, moneda EUR |
| Módulos | los mismos que la matriz (`enabledModules` se copia) |
| Marca | ámbar `#b45309`, nombre comercial «VRE Norte» y logo propio en `brandingConfig` |
| Inmuebles | 4 ejemplos con SKU `VN-001` … `VN-004` (2 destacados, 3 en venta y 1 en alquiler) |
| Portal | `http://localhost:3010/p/vre-norte` y `/p/vre-norte/propiedades` (con el servidor de desarrollo en el puerto 3010) |

Los inmuebles son propios de la oficina: la matriz no los ve en su catálogo y la
oficina no ve los de la matriz. Es el aislamiento normal por `tenantId`.

## Cómo ejecutarlo

Desde `nextjs_space/`:

```bash
npm run seed:oficina-norte
```

Equivalente, si prefieres el comando completo (es el patrón de los demás seeds):

```bash
npx tsx --require ./scripts/cargar-entorno.cjs scripts/seed-oficina-vre-norte.ts
```

El cargador `scripts/cargar-entorno.cjs` lee `.env.local` y después `.env`, así
que el script usa el `DATABASE_URL` de desarrollo (Neon) sin exportar nada a
mano. Si ya hay una variable `DATABASE_URL` en el entorno, esa manda.

Requisito: que exista la cuenta matriz con slug `vre`. Si no existe, el script
aborta con un mensaje claro y no escribe nada.

## Idempotencia

Se puede ejecutar tantas veces como quieras:

- El tenant se resuelve por `slug`: la segunda vez se actualiza en lugar de
  duplicarse.
- Los inmuebles se resuelven por la clave única `(tenantId, sku)` con `upsert`, así
  que se actualizan en su sitio y nunca se crean dos copias del mismo `VN-00x`.
- Todo va en una transacción: si falla un inmueble no queda una oficina a medias.
- Reejecutar **restaura** los valores del script: nombre, plan, moneda, módulos y
  marca vuelven a los de arriba, y los cuatro inmuebles recuperan sus datos. Si
  alguien los cambió desde el panel, el seed lo deshace.
- Si existiera un tenant `vre-norte` que **no** cuelga de `vre`, el script aborta:
  sería otra cuenta real con el mismo slug y no se toca.

## Cómo deshacerlo

```bash
npm run seed:oficina-norte:borrar
```

o

```bash
npx tsx --require ./scripts/cargar-entorno.cjs scripts/seed-oficina-vre-norte.ts --borrar
```

Borra los cuatro inmuebles sembrados (`VN-001` … `VN-004`) y el tenant
`vre-norte` en una sola transacción: o se van los dos, o no se toca nada. La
matriz `vre` y sus inmuebles no se tocan.

Se niega a borrar —y dice qué lo impide— si la oficina ya tiene datos que no ha
creado el seed:

- **usuarios**, **leads** o **contactos** (por ejemplo, si alguien llegó a enviar
  el formulario de contacto del portal), o
- **inmuebles** que no sean los cuatro de ejemplo.

Si aun así Prisma bloquea el borrado por otra relación (configuración, pipelines,
automatizaciones…), el script lo explica en lugar de soltar el error técnico:
esos registros hay que quitarlos desde el panel o con Prisma Studio.

Un tenant `vre-norte` que no sea hijo de `vre` tampoco se borra.

## Notas

- Pensado para bases de desarrollo o demostraciones. No lo ejecutes contra la
  base de producción: crearía una cuenta de ejemplo con su catálogo.
- Las fotos son URLs de Unsplash, así que la landing necesita salida a internet
  para verse completa.
- Si cambias los datos de ejemplo, actualiza también esta página y el script
  `scripts/seed-oficina-vre-norte.ts`: el seed actualiza por `sku`, no por
  nombre, así que un `sku` nuevo crea otro inmueble en vez de renombrar el que
  ya existe.
