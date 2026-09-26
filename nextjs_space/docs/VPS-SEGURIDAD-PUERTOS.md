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

## 8. El root del VPS solo entra por clave (2026-09-23)

Antes: `PermitRootLogin yes` + `PasswordAuthentication yes` — la contrasena
de root era una puerta mas desde Internet. Y la capa que mandaba era sutil:

- `sshd_config.d/50-cloud-init.conf` ponia `PasswordAuthentication yes` y,
  por orden alfabetico (el primer fichero que declara una opcion gana),
  tapaba el `no` de `60-cloudimg-settings.conf`.
- cloud-init ademas tenia `ssh_pwauth: 1` en `/etc/cloud/cloud.cfg.d/99-ssh.cfg`:
  un reboot habria vuelto a abrir la contrasena.

Ahora: `PermitRootLogin prohibit-password`, `50-cloud-init.conf` con `no`, y
`ssh_pwauth: false` editado en el `99-ssh.cfg` que gana el merge. Verificado
con sesion nueva: un cliente sin clave recibe `Permission denied (publickey)`
(ya no se ofrece contrasena) y la clave sigue entrando. Queda backup en
`/etc/ssh/sshd_config.bak-hardening-*` y el cambio se ejecuto con un
temporizador de reversion armado 5 min, cancelado al pasar la prueba.

Inventario de `authorized_keys` de root en el momento del cambio:

1. `bruno.hess@dimensionexpert.com` — humana, legítima.
2. `github-cd-deploy@volkern-table` — CD heredado del proyecto viejo.
3. `github-cd-deploy@volkerntable` — igual, con otra grafia.
4. `buffy-deploy@volkern` (MkV3…) — origen desconocido; NO es la clave que
   usa el agente actual (la del agente es hFO4…).
5. `buffy-deploy@volkern` (hFO4…) — la del agente Freebuff actual.

**Revocacion (2026-09-23, autorizada por Bruno):** se retiraron las claves
2, 3 y 4 despues de verificar que nada activo las usaba (los workflows del
repo no despliegan por SSH, ninguna clave privada correspondiente existe
en la maquina de trabajo ni en el VPS, no hay runners de CI). `authorized_keys`
queda en 2 claves: bruno.hess y el agente actual. Backup de la lista
anterior: `/root/.ssh/authorized_keys.bak-revocacion-20260923-190310`.
Nadie mas deberia aparecer en la lista; si aparece una tercera clave, es
incidente.

Regla para lo que venga: cloud-init nunca con `ssh_pwauth: true`; y si
algun dia se toca `sshd_config.d`, recordar que el orden alfabetico decide
el ganador — el `60-cloudimg-settings.conf` de la imagen no te salva del
`50-cloud-init.conf`.

## 9. Auditoria completa de puertos y firewall (2026-09-23)

Superficie antes de la auditoria (nodo unico, ufw INACTIVO, iptables ACCEPT):

- **Abiertos desde Internet**: 22 (ssh), 80/443 (traefik), 9000 (minio S3,
  intencional) y —el hallazgo— **2377 y 7946 del plano de control Swarm**
  (raft y gossip, sin ninguna razon legitima en un nodo unico).
- **Bases de datos: ninguna expuesta.** 5432 ya cerrado (§1–§3); postgres
  14/16/17, redis, pgvector y mariadb solo escuchan en la red overlay.
- **Paneles tras traefik, todos con autenticacion verificada sin credenciales**:
  Portainer inicializado (login), consola MinIO (login), Evolution (401 sin
  api key), Apprise (basic auth), N8N/Chatwoot/Libresign (login propio),
  ss3/notify responden 401/403 a anonimos.

Lo hecho: **ufw activo y persistente** (default deny incoming / allow
outgoing) con solo seis permisos: lo, la IP del propio nodo (raft/gossip/
vxlan hablan por ahi), 22, 80, 443 y 9000. Verificado con conexion nueva:
2377/7946 cerrados desde fuera, nodo `Ready/Leader`, servicios `1/1` y las
11 apps de traefik con el mismo codigo HTTP que antes del cambio.

Advertencia structural: **ufw no filtra los puertos que Docker publica**
(los chains DOCKER de iptables bypassean INPUT). La primera linea de defensa
sigue siendo §6: un puerto se publica o no se publica, y la decision vive en
el stack. Para filtrar trafico publicado a posta, la cadena correcta es
`DOCKER-USER`. El firewall de host cubre lo que Docker no toca (2377/7946
incluidos), que es justo lo que faltaba.

Como re-auditarlo en 3 comandos:

```bash
for s in $(docker service ls --format '{{.Name}}'); do P=$(docker service inspect "$s" --format '{{json .Endpoint.Ports}}'); [ "$P" != "null" ] && [ "$P" != "[]" ] && echo "$s: $P"; done
ss -lntp | grep -v docker-proxy | grep LISTEN
ufw status
```

## 10. Auditoria recurrente automatica (2026-09-23)

La auditoria manual de §9 se automatizo en `deploy-vps/auditar-superficie.sh`
(bilingue: en el VPS audita todo; sin docker/volkern-erp_app, como en el
puesto de trabajo, hace el sondeo externo real desde otra red + apps +
comprobacion del `.env.vps` si se pasa `ENV_VPS=/ruta`). Compara contra el
baseline esperado que vive EN el script (espejo de §9): puertos publicados
por Swarm, escuchas del host, reglas ufw, sshd, huellas de las claves de
root, sondeo tcp desde el origen (con lista de puertos PROHIBIDOS:
cualquier BD, el plano Swarm, redis, etc.), HTTP de las 10 apps y
propagacion de la credencial de BD (5 ficheros en /root/volkern-erp/).
Exit 0 = conforme; exit 1 = DERIVA. No imprime secretos.

**Instalado en el VPS** (2026-09-23):

- `/root/auditar-superficie.sh` (700) — copia de `deploy-vps/`.
- `/etc/cron.d/auditoria-superficie` — cada hora en el minuto 17;
  conforme borra el marcador, deriva lo crea y lo anota en el log.
- `/var/log/auditoria-superficie.log` + logrotate semanal (8 rotaciones).
- `/root/DERIVA-AUDITORIA` — si este fichero existe, la ultima pasada
  detecto deriva: mirar el log y actuar.

**Aviso activo por Telegram (2026-09-24)**: el auditor ya no depende de
que alguien mire el log. En deriva empuja un resumen (hasta 4 lineas de
DERIVA + hora) por el apprise del VPS al chat de Bruno con
`@VolkernNotify_bot` (chat 646107192); al volver a CONFORME avisa de la
recuperacion y limpia el marcador; conforme en estado estable = silencio
(sin spam horario). Detalles de operacion: el canal del apprise es
`tgram://<token>/646107192` y se lee del `apprise.cfg` del volumen en
tiempo de ejecucion (el token no vive en el repo ni en el script); la
llamada es `docker exec` dentro del contenedor apprise porque las IPs
overlay NO son alcanzables desde el host; y un fallo de notificacion
NUNCA altera el exit code de la auditoria. Probado en vivo con una
deriva controlada (abrir 5432 en ufw): llego el aviso, se creo el
marcador; restaurado el firewall, llego el aviso de recuperacion y el
marcador se limpio. El centinela del §11 comparte la misma mecanica.

Uso desde el puesto (ruta real de Internet + secreto local):

```bash
ENV_VPS=~/Proyectos/Volkern/nextjs_space/deploy-vps/.env.vps \
  ssh -i ~/.ssh/CLAVE root@62.171.134.195 'bash -s' \
  < deploy-vps/auditar-superficie.sh
```

**Cazó una deriva real en su primera pasada**: tras activar ufw en §9, la
bomba de reversion de systemd se cancelo mal — se paro el *service*
transient pero no el *timer* de `systemd-run`, y a los 240s ejecuto
`ufw --force disable` igualmente. El auditor local detecto 2377/7946
reabiertos antes que nadie; ufw fue reactivado y el baseline volvio a ser
verde. Regla que queda: para cancelar una bomba de `systemd-run
--on-active`, parar **el timer** (`systemctl stop <unidad>.timer`), no el
service; y no crear la unidad si el plan es borrar su script.

Registro de la exposicion: journal marca `Firewall stopped and disabled on
system startup` a las **19:14:29** (240s tras armar la bomba) y reactivacion
en la madrugada del 24; ventana de ~5h con el plano de control Swarm
alcanzable. `docker node ls` sigue mostrando UN unico nodo, luego nadie
llego a unirse al cluster (unirse exige el token; no hay indicios de
exploracion interna).

**Cierre de la ventana (2026-09-24)**: rotados AMBOS tokens de ingreso
(worker y manager) con `docker swarm join-token --rotate`. Los tokens
antiguos —incluido cualquiera que pudiera haberse conocido durante la
ventana— quedaron invalidos. Los nuevos viven solo en el store raft del
VPS: no se imprimieron, no se guardaron en fichero ni en el repo; se
recuperan a demanda con `docker swarm join-token worker` cuando haya que
incorporar un nodo de verdad. Defensa en profundidad: aunque ufw volviera
a abrir 2377, sin el token nuevo nadie entra.

## 11. Desactivacion parcial del stack heredado volkern-table (2026-09-24)

Inventario del legado (`volkern_*`, sin contar el ERP): app congelada sin
una sola sesion activa (0 refresh tokens) y ultimo deploy el 25/08,
landing comercial, postgres de 15 MB **sin escrituras de usuario desde el
12/08** (solo escribe el monitor sobre su propio AuditLog), dispatch y
ws-service sin nadie detras (solo health-checks del monitor; 0 conexiones
ws en 48h), libretranslate SI usado por el app (`LIBRETRANSLATE_URL`).
Herramienta de operacion dormida: el backup diario estaba ROTO (buscaba
la BD `volkerntable`; la real es `volkern_table`) y llevaba dias
produciendo dumps de 20 bytes.

Lo ejecutado (autorizado por Bruno, "Fase 1+2"):

- **Crons heredados retirados**: los 4 del crontab de root (reminders,
  auto-release, backup-db roto, monitor) y los 3 de `/etc/cron.d/`
  (attendance-digest, birthday-promos, held-orders). Copia literal de
  antes/despues en `/root/backups/crons-heredados-20260923-194309/`:
  revertir es restaurar el crontab y devolver los ficheros.
- **Servicios sin uso a 0**: `docker service scale
  volkern_ws-service=0 volkern_volkern-dispatch=0` (~110 MB de RAM
  liberados). Revertir: `... =1`.
- **Se conservan vivos**: `volkern_app`, `volkern_landing`,
  `volkern_postgres` (volumen `volkern_pgdata` intacto) y
  `volkern_libretranslate`. `table.volkern.app` y `volkerntable.com`
  siguen respondiendo 200.
- **Snapshot previo del legacy** (el unico backup honesto que tiene):
  `/root/backups/volkern_table-pre-archivo-20260923-193949.dump` (436K).
- Verificado despues: ERP y apps 200, auditor CONFORME, `docker node ls`
  sin cambios.

Pendiente si el producto legacy no vuelve (NO ejecutado, fase 3):
`docker stack rm volkern` conservando el volumen, el snapshot y
**`/opt/vt-build/keystores/`** (firma de las apps Android: perderlo es
perder la firma), archivando `/opt/volkern-table` en tar, y decidir el
destino del dominio `volkerntable.com`.

**Centinela contra la reanimacion** (2026-09-24): el cron semanal
`43 4 * * 0` ejecuta `deploy-vps/vigilar-crons-heredados.sh` (copia en
`/root/`, sincronizada y verificada por sha256 desde el deploy igual que
el auditor). Alerta si el crontab de root vuelve a citar el legado o
aparece cualquier `/etc/cron.d/*volkern*` (los crons del ERP viven en el
crontab, NUNCA en `/etc/cron.d`): senal = marcador `/root/DERIVA-LEGADO`,
linea `[legado]` en el log compartido **y aviso Telegram por apprise**
(misma mecanica del §10); al volver al reposo avisa de la recuperacion y
limpia el marcador. Probado en las tres direcciones: reposo (exit 0),
deteccion por crontab y por fichero (exit 1 + marcador).

**Sincronizacion con el deploy**: `deploy-local.sh` sube la copia del repo
a `/root/auditar-superficie.sh` en cada despliegue y verifica la identidad
sha256 repo↔VPS; si difieren, el deploy FALLA antes de tocar nada. La
divergencia sin explicar se investiga (¿quien cambio la copia del VPS?),
no se absorbe.

Cuando cambie la superficie a posta (nuevo servicio publicado, nueva app,
rotacion con distinto numero de ficheros), actualizar §9/§10 y las listas
de `auditar-superficie.sh` **en el mismo commit** — el auditor compara
contra su propio baseline, no contra el git.

## 12. Definir `ENCRYPTION_KEY` y rotar los secretos cifrados (2026-09-25)

Aplicada el 2026-09-25. Hasta ese dia `lib/core/crypto.ts` (AES-256-CBC,
formato `iv_hex:ct_hex`) cifraba con la clave **por defecto incrustada** por
no estar definida la env `ENCRYPTION_KEY`: cualquiera con acceso al repo
podia descifrar los secretos de la BD (hallazgo del incidente del webhook
401). Ahora la clave existe y los datos ya no se cifran con la de fabrica.

Alcance real de la rotacion (inventario previo, no se toca lo vacio):
`connectivity_providers` (partnerId/username/password, 1 fila) y
`client_signature_settings` (apiToken/webhookSecret, 1 fila). El vault de
sueldos usa `MASTER_KEY`+`TENANT_PEPPER` (otro esquema, intacto) y los
tokens de telegram viven en claro (otros modelos).

1. **Inventario**: columnas `*Enc` de `information_schema` + recuento con
   formato cifrado `^[0-9a-f]{32}:[0-9a-f]+$`. pgcrypto NO es compatible con
   el IV prefijado en PG17 (`aes-256-cbc/iv:...` = "Unknown option"), asi que
   la rotacion se hace en Node dentro del contenedor de la app: mismas
   primitivas que la app, cero riesgo de formato.
2. **Respaldo previo**: volcado de los valores cifrados a
   `/root/respaldo-cifrados-encryption-key-*.txt` (600).
3. **Clave nueva**: 32 bytes aleatorios generados con node dentro del
   contenedor, guardados en `/root/.encryption_key` (600) y anadida a
   `/root/volkern-erp/.env` (600) para que sobreviva a `stack deploy`/rollback.
4. **Rotar ANTES de inyectar** la env: `node rotar.js` (puro, lee por stdin
   `tabla|columna|id|valor` desde psql, emite SQL transaccional con los
   re-cifrados; el plaintext nunca sale de los pipes) aplicado con
   `psql -v ON_ERROR_STOP=1`. Verificacion por HUELLAS sha256 truncadas
   (`verificar.js`): 5/5 OK con la nueva (mismas huellas que con la vieja:
   mismos plaintexts) y 0/5 con la vieja tras rotar.
5. **Inyectar**: `docker service update --env-add ENCRYPTION_KEY=...`
   (la spec del servicio la conserva; `--force` rollback incluido). El
   contenedor se recrea: si se necesita re-verificar, re-copiar los scripts.
6. **Probar E2E**: «Probar conexion» del panel (`getConnectivityCredentials`
   descifra con la clave nueva y autentica contra el proveedor) -> exito,
   `estado=conectado`, `contadorErrores=0`. Webhook entrante OK (401 con
   par distinto).
7. **Verificacion en la BD**: CREATE EXTENSION pgcrypto NO hace falta para
   el cifrado de la app (es Node); se dejo instalado al descartar la via SQL.

Nunca escribir la clave en ficheros versionados. **Correccion del inventario
(26 sep 2026)**: la advertencia original nombraba `.env.vps` y
`.env.production.local` como trackeados y **era falsa** — la auditoria de la
historia completa (ramas, tags y pickaxe) demostro que ninguno de los dos
estuvo jamas en git; el fichero de entorno SI trackeado era otro:
`.env.backup-20260511`, purgado de toda la historia ese mismo dia (ver
12.1). El endurecimiento del
codigo (aviso de arranque en produccion si falta la env, `Crypto.estaUsando-
ClavePorDefecto()` y guardia `tests/core-crypto-default-key.test.ts`) viajo
en el despliegue siguiente a la rotacion.

### 12.1 - Veredicto de exposicion del backup purgado (26 sep 2026)

Al purgar `.env.backup-20260511` de la historia se extraian sus secretos del
bundle de respaldo y se comparaban **por huella sha256** (nunca imprimiendo
valores) contra el entorno vivo de produccion (contenedor +
`/root/volkern-erp/.env`), el `.env` de desarrollo y un pull de Vercel local
(`.env.production.local`, nunca en git):

- **Ningun valor expuesto esta vivo en ninguno de nuestros entornos.**
  `NEXTAUTH_SECRET`, `STRIPE_SECRET_KEY` y `RESEND_API_KEY` del backup
  difieren de los actuales; `STRIPE_WEBHOOK_SECRET` y `FACEBOOK_APP_SECRET`
  ni siquiera existen en produccion; la `DATABASE_URL` del backup apuntaba a
  `localhost:5432/fluy_crm` (proyecto anterior, contrasena placeholder), no a
  la de produccion ni a la Neon.
- **Las claves de proveedor expuestas estan muertas**: probadas contra sus
  APIs en solo-lectura, la `STRIPE_SECRET_KEY` devuelve **401** y la
  `RESEND_API_KEY`, «API key is invalid» — ambas revocadas por el proveedor.
  Queda por comprobar manualmente en su dashboard la `FACEBOOK_APP_SECRET`
  (sin API publica de verificacion) si alguna vez hubo app de Facebook
  activa.
- Procedimiento reproducible: extraer el fichero del bundle con
  `git archive` (fuera del arbol del repo), hachear clave a clave y juntar
  contra el `env` del contenedor traido por SSH; despues `curl` de
  autenticacion por proveedor. Borrar los artefactos temporales con los
  secretos en claro al terminar.

El bundle pre-purga (`/tmp/volkern-pre-purga-*.bundle`) sigue siendo el unico
deposito de la historia vieja: borrarlo cuando se confirme que no hace falta,
y mientras tanto tratandolo como documento confidencial.
