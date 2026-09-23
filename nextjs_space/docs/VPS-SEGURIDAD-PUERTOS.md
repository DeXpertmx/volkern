# VPS — Puertos publicados y superficies expuestas

Última revisión: **2026-09-23**, sobre `root@62.171.134.195` (Docker 28.1.1, Swarm de un solo nodo).

Este documento existe por un hallazgo concreto: el stack heredado publicaba
PostgreSQL **en Internet**. Se cierra, se explica por qué el compose decía que no
y, sobre todo, se deja escrito cómo comprobarlo, porque el fallo no era del
módulo de Hospitality sino de la infraestructura que comparte el VPS.

## 1. El hallazgo

`volkern_postgres` (stack heredado `volkern`, base `volkern_table` — la del
Volkern Table clásico) publicaba el 5432 en **todas las interfaces**:

```
$ docker service inspect volkern_postgres --format '{{json .Endpoint.Ports}}'
[{"Protocol":"tcp","TargetPort":5432,"PublishedPort":5432,"PublishMode":"ingress"}]

$ ss -lntp | grep 5432
LISTEN  0  4096  *:5432  *:*  users:(("dockerd",pid=835,fd=158))

$ timeout 6 bash -c 'exec 3<>/dev/tcp/62.171.134.195/5432'   # desde fuera
   (conecta)
```

Lo que **no** estaba expuesto, y conviene dejarlo claro:

- `volkern-erp_postgres` (base `volkern_erp`, la del ERP) **nunca** publica: solo
  existe dentro de la red overlay. El ERP nunca estuvo alcanzable por 5432.
- Las demás bases del VPS (Chatwoot, n8n, libresign, pgvector, el `postgres`
  clásico) tampoco publican 5432.
- Ni un solo cliente externo se había conectado: `pg_stat_activity` solo mostraba
  la IP del overlay (`10.0.1.4`, la propia app heredada). El riesgo era real,
  el incidente no existió.

Los únicos consumidores reales de esa base son `volkern_app` y
`volkern_volkern-dispatch`, y entran por DNS de overlay
(`postgresql://volkern:***@volkern_postgres:5432/volkern_table`). Nadie la usa
por `localhost`, así que la publicación no servía para nada.

## 2. La trampa: en Swarm `127.0.0.1` no existe

Los compose desplegados en el VPS (`/opt/volkern-table/docker-compose.yml`,
`docker-compose-prod.yml` y `/opt/vt-build/docker-compose.yml`) declaraban, en
teoría, lo correcto:

```yaml
    ports:
      - "127.0.0.1:5432:5432"
```

Pero **Swarm no soporta `host_ip`**. El prefijo no ata nada: se ignora en
silencio. Comprobado en el propio nodo, con puertos de prueba y sin tocar el 5432:

```
$ docker service create --publish 127.0.0.1:19999:80 ...
invalid argument "127.0.0.1:19999:80" for "-p, --publish" flag: hostip is not supported

$ docker stack deploy -c compose-con-127.0.0.1:19997:80.yml zztest   # «funciona»
$ docker service inspect zztest_zz --format '{{json .Endpoint.Ports}}'
[{"Protocol":"tcp","TargetPort":80,"PublishedPort":19997,"PublishMode":"ingress"}]
$ ss -lntp | grep 19997
LISTEN  0  4096  *:19997  *:*  users:(("dockerd",pid=835,...))     # 0.0.0.0, no loopback
```

Conclusión operativa, y es la regla que hay que recordar:

> En Swarm, `ports:` sobre una base de datos **es** exponerla. No hay forma de
> atarla a loopback (ni con el prefijo, ni con `mode=host`, que también escucha
> en `0.0.0.0`). Si hace falta acceso, se entra por `docker exec` o por un túnel
> SSH; nunca se publica.

La fuente de verdad además estaba desviada: el compose decía una cosa y el
servicio en marcha hacía otra (`PublishMode: ingress`, sin IP), secuela de un
despliegue antiguo que nunca se reconcilió.

## 3. Lo que se hizo

1. **Servicio en marcha** — se quitó la publicación. `docker service update
   --publish-rm 5432` no la tocó (el CLI reportó «converged» sin cambios), así
   que se hizo por la API del daemon, que es la vía que sí aplica:

   ```bash
   SPEC=$(curl -s --unix-socket /var/run/docker.sock http://localhost/services/volkern_postgres)
   VER=$(echo "$SPEC" | jq -r '.Version.Index')
   echo "$SPEC" | jq '.Spec | .EndpointSpec.Ports = []' > /tmp/spec.json
   curl -s --unix-socket /var/run/docker.sock -X POST -H 'Content-Type: application/json' \
     --data-binary @/tmp/spec.json "http://localhost/services/volkern_postgres/update?version=$VER"
   rm -f /tmp/spec.json
   ```

2. **Fuente de verdad** — en los tres compose del VPS se sustituyó el bloque
   `ports:` por un comentario que explica la trampa (respaldos
   `*.bak-20260923-puerto5432` junto a cada archivo). Un futuro
   `docker stack deploy` ya no puede reabrir el puerto.

3. **Compose del ERP** — `nextjs_space/docker-compose.yml` publicaba la BD con
   un `"5432:5432"` pelado, correcto en `docker compose` (que sí respeta
   `127.0.0.1`) pero mal como costumbre heredable; ahora es
   `"127.0.0.1:5432:5432"`. Lo vigila
   `tests/infra-puertos-expuestos.test.ts`.

## 4. Verificación (antes y después)

Antes de tocar nada y después de cerrar, lo que el usuario pidió comprobar:

| Comprobación | Antes | Después |
| --- | --- | --- |
| `https://volkern.app` | 200 | 200 |
| `https://volkern.app/api/health` | 200 | 200 |
| Servicio `volkern-erp_app` | 1/1 | 1/1 |
| `Tenant` en `volkern_erp` | 9 | 9 |
| `hospitality_reservations` | 14 | 14 |
| Reserva real `BE-MUEA5FOF` | `confirmed`, 360 EUR | `confirmed`, 360 EUR |
| App heredada (`volkern_app`, por overlay) | 200 | 200 |
| `62.171.134.195:5432` desde Internet | **conecta** | **conexión rehusada** |

El reinicio del servicio heredado que provoca el cambio de puertos no afectó al
ERP: son stacks y bases distintos.

## 5. Cómo volver a auditarlo

```bash
# Todo lo que algún servicio publica hoy
for s in $(docker service ls --format '{{.Name}}'); do
  p=$(docker service inspect "$s" --format '{{json .Endpoint.Ports}}')
  [ "$p" != "null" ] && echo "$s => $p"
done

# Lo que escucha de verdad en el host
ss -lntp

# Un puerto de BD concreto, desde fuera del VPS
timeout 6 bash -c 'exec 3<>/dev/tcp/62.171.134.195/5432' && echo ABIERTO || echo cerrado
```

Estado al cerrar esta revisión: publican `traefik` (80 y 443, intencional) y
`minio` (9000, `PublishMode: host`, intencional mientras la S3 API se use desde
fuera). El 5432 ya no aparece en ninguna de las dos listas.

> Nota de alcance: **minio 9000** queda publicado a propósito y por decisión
> ajena a Hospitality. Si algún día el acceso externo a su API deja de ser
> necesario, se cierra con el mismo procedimiento de la §3.

## 6. Regla para lo que venga

- Una base de datos no se publica nunca, ni «solo en loopback»: en Swarm no
  existe la atadura, y en Compose se escribe `127.0.0.1:PUERTO:PUERTO` a
  conciencia.
- Antes de dar por bueno un compose, comparar lo declarado con
  `docker service inspect --format '{{json .Endpoint.Ports}}'`: el desvío entre
  lo que dice el archivo y lo que hace el servicio es exactamente lo que dejó
  este puerto abierto.
- El acceso de operador es `docker exec -it volkern_postgres psql -U volkern` o
  un túnel SSH. Los respaldos ya funcionan así
  (`scripts/backup_volkern.sh`, `scripts/restore_volkern.sh`): los dos usan
  `docker exec` sobre el contenedor, no el puerto del host.

## 7. Rotar la contrasena de `volkern-erp_postgres`

Aplicada el 2026-09-23. La env `POSTGRES_PASSWORD` del contenedor oficial
solo se usa al **inicializar el volumen** la primera vez: cambiarla no
cambia la contrasena real. La rotacion de verdad es `ALTER USER`.

1. **Antes**: verificar produccion (HTTP 200 en el ERP, servicios 1/1) y
   anotar recuentos (`"Tenant"`, `hospitality_reservations`).
2. **Snapshot**: `pg_dump -Fc` dentro del contenedor + `docker cp` a
   `/root/backups/`.
3. **Rotar**: `openssl rand -hex 24`, guardarlo con `umask 077` en
   `/root/.pg_rotacion` y ejecutar `ALTER USER volkern_erp WITH PASSWORD
   '...'` via `docker exec ... psql`.
4. **Probar por RED** (la app entra por la red overlay, `scram-sha-256`):
   `psql -h <IP_overlay> -U volkern_erp` con la nueva debe entrar y con la
   vieja debe fallar. No te fies de `127.0.0.1`: el `pg_hba` confia en
   loopback (trust) y ahi **cualquier** contrasena entra (falso positivo).
5. **Propagar** al mismo valor exacto: la `DATABASE_URL` de
   `volkern-erp_app` y la `POSTGRES_PASSWORD` de `volkern-erp_postgres`
   (`docker service update --env-rm X --env-add X=...`), los ficheros de
   `/root/volkern-erp/` (`.env`, `volkern-erp.yaml`, `postgres-only.yaml`,
   `.bak`) y en el repo `deploy-vps/.env.vps` + `deploy-vps/.db_pass`
   (checkout principal y worktree).
6. **Despues**: esperar convergencia, confirmar que el contenedor de la app
   lleva la nueva URL, recuentos identicos a los de antes y HTTP 200.

Notas: el volumen del servicio persiste la recreacion de la tarea de
postgres (los datos no se tocan). `generar-env-vps.sh` ya **no regenera**
la contrasena: reutiliza `deploy-vps/.db_pass` si existe, y solo crea una
nueva en el primer arranque o si se fuerza con `VOLKERN_DB_PASS` (cambiar
entonces a mano con `ALTER USER`). Copia de seguridad previa quedo en
`/root/backups/volkern_erp-pre-rotacion-20260923-184611.dump`.
