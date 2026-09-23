#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# auditar-superficie.sh — auditoria recurrente de la superficie expuesta
# del VPS contra el estado esperado del runbook
# (docs/VPS-SEGURIDAD-PUERTOS.md, §9 y §10).
#
# Detecta el modo por donde corre:
#   * En el VPS (hay docker): audita puertos Swarm, escucha del host,
#     ufw, sshd, claves de root, sondeo por la ruta externa y apps.
#   * En el puesto de trabajo (sin docker): solo sondeo real desde otra
#     red + apps + comprobacion del .env.vps si se pasa ENV_VPS.
#
# Uso:
#   Cron interno del VPS:      bash auditar-superficie.sh
#   Desde el puesto (cron de Bruno):
#     ENV_VPS=/ruta/.env.vps ssh -i ~/.ssh/CLAVE root@62.171.134.195 'bash -s' \
#       < deploy-vps/auditar-superficie.sh
#     (ademas, el propio cron puede lanzar el sondeo local del puesto
#      ejecutando este mismo script SIN ssh en el puesto).
#
# Salida: informe por stdout; exit 0 conforme, 1 DERIVA.
# No imprime secretos: de las claves solo la huella publica.
#
# Cualquier linea nueva en los ficheros de estado = alerta, aunque nadie
# la haya declarado esperada: lo que no esta en el runbook no deberia
# existir. Si el cambio es a posta, actualizar runbook y listas en el
# mismo commit.
# ═══════════════════════════════════════════════════════════════════
set -uo pipefail

IP_PUBLICA=62.171.134.195
NODE_IP=62.171.134.195

# Estado esperado — docs/VPS-SEGURIDAD-PUERTOS.md §9 y §10.
SWARM_PUBLISH_ESPERADO='minio_minio:9000 traefik_traefik:80,443'
TCP_INTERNET_ESPERADO='22 80 443 9000'
TCP_INTERNET_PROHIBIDO='21 23 3306 5432 5433 6379 2377 7946 4789 8000 8080 8081 8888 9001 9090 9200 11211 27017 5672 15672'
UFW_ESPERADO='22/tcp 443/tcp 80/tcp 9000/tcp'
SSH_ESPERADO='passwordauthentication:no permitrootlogin:without-password'
CLAVES_ESPERADAS='LB4goaWp7nVbpj2jZNoJ+Zy3IpnUZXNJvcTn8H+QHjI:bruno.hess@dimensionexpert.com hFO4iQOGQ5Zfg54UaoaviIK1/FrwaPYUTXnHZohUzz0:buffy-deploy@volkern'
APPS_ESPERADAS='https://volkern.app:200 https://erp.dimension.expert:200 https://table.volkern.app:200 https://n8n.dimension.expert:200 https://firma.dimension.expert:302 https://api.dimension.expert:200 https://mnio.dimension.expert:200 https://ss3.dimension.expert:403 https://notify.dimension.expert:401 https://portainer.dimension.expert:200'
# Cuantos ficheros de /root/volkern-erp/ contienen la credencial de BD
# (baseline actual: .env + volkern-erp.yaml + postgres-only.yaml + 2 .bak).
FICHEROS_DB_PASS_ESPERADOS=5

DERIVA=0
FICHEROS=()

falla() { DERIVA=1; echo "  X DERIVA: $1"; }
ok()    { echo "  = $1"; }
titulo() { echo; echo "== $1 =="; }
fichero() { FICHEROS+=("$1"); printf '%s\n' "$2" > "/tmp/auditor-$1"; }

# En el puesto tambien puede haber docker (desktop): el modo VPS exige
# que exista el servicio volkern-erp_app, no solo docker.
if docker info >/dev/null 2>&1 && docker service ls --format '{{.Name}}' 2>/dev/null | grep -q '^volkern-erp_app$'; then MODO=vps; else MODO=puesto; fi
titulo "0. Contexto"
echo "  modo: $MODO | fecha: $(date -Is) | host: $(hostname)"

# ── 1. Puertos publicados por servicios Swarm (solo VPS) ───────────
if [ "$MODO" = vps ]; then
  titulo "1. Puertos publicados por Swarm (Endpoint.Ports)"
  ESTADO=''
  for s in $(docker service ls --format '{{.Name}}'); do
    P=$(docker service inspect "$s" --format '{{json .Endpoint.Ports}}' 2>/dev/null)
    [ "$P" = 'null' ] || [ -z "$P" ] || [ "$P" = '[]' ] && continue
    PUERTOS=$(echo "$P" | grep -oE '"PublishedPort":[0-9]+' | grep -oE '[0-9]+' | sort -un | tr '\n' ',' | sed 's/,$//')
    ESTADO="$ESTADO
$s:$PUERTOS"
  done
  ESTADO=$(echo "$ESTADO" | sed '/^$/d' | sort | tr '\n' ' ' | sed 's/ $//')
  echo "  observado: $ESTADO"
  fichero swarm-publish "$ESTADO"
  ESPERADO_ORD=$(echo "$SWARM_PUBLISH_ESPERADO" | tr ' ' '\n' | sort | tr '\n' ' ' | sed 's/ $//')
  [ "$ESTADO" = "$ESPERADO_ORD" ] && ok "coincide con el runbook" || falla "'$ESTADO' != esperado '$ESPERADO_ORD'"

  # ── 2. Escucha del host fuera de docker-proxy ────────────────────
  titulo "2. Escucha del host (fuera de docker-proxy)"
  ESTADO=$(ss -lntpH 2>/dev/null | grep -v docker-proxy | awk '{print $4}' | sed -E 's/.*:([0-9]+)$/\1/' | sort -un | tr '\n' ' ' | sed 's/ $//')
  echo "  observado: $ESTADO"
  fichero host-listen "$ESTADO"
  # 22 sshd; 53 systemd-resolve (solo loopback); 2377/7946 dockerd (swarm;
  # inalcanzables desde fuera por ufw, pero siguen en LISTEN).
  EXTRA=$(echo "$ESTADO" | tr ' ' '\n' | grep -vE '^(22|53|2377|7946)$' | tr '\n' ' ' | sed 's/ $//')
  [ -z "$EXTRA" ] && ok "solo ssh/systemd/dockerd" || falla "escuchas no catalogadas: $EXTRA"

  # ── 3. ufw ───────────────────────────────────────────────────────
  titulo "3. ufw"
  if ! ufw status 2>/dev/null | head -1 | grep -q 'Status: active'; then
    falla "ufw NO esta activo"
  else
    ok "activo"
    # Filas v4 con comentario: '<puerto/prot>  ALLOW  <from>  # comentario'
    # (el modo sin numbered dice ALLOW, no ALLOW IN; las v6 traen (v6) y se
    # omiten porque duplican las v4).
    ESTADO=$(ufw status 2>/dev/null | awk '$2=="ALLOW" && /#/ && $1 ~ /\/(tcp|udp)$/ && $0 !~ /\(v6\)/ {print $1}' | sort -u | tr '\n' ' ' | sed 's/ $//')
    echo "  reglas con puerto: $ESTADO"
    fichero ufw-reglas "$ESTADO"
    # Comparacion canonica: las dos listas ordenadas deben ser identicas.
    OBS_ORD=$(echo "$ESTADO" | tr ' ' '\n' | sed '/^$/d' | sort | tr '\n' ' ' | sed 's/ $//')
    ESP_ORD=$(echo "$UFW_ESPERADO" | tr ' ' '\n' | sort | tr '\n' ' ' | sed 's/ $//')
    [ "$OBS_ORD" = "$ESP_ORD" ] && ok "reglas = runbook" || falla "reglas ufw '$OBS_ORD' != esperado '$ESP_ORD'"
    ufw status 2>/dev/null | awk -v ip="$NODE_IP" '$1=="Anywhere" && $2=="ALLOW" && $3==ip {f=1} END{exit !f}' && ok "regla from-IP propia (raft/gossip/vxlan)" || falla "falta la regla from-IP propia"
    ufw status 2>/dev/null | grep -q 'on lo' && ok "loopback permitido" || falla "falta la regla de loopback"
  fi

  # ── 4. sshd ──────────────────────────────────────────────────────
  titulo "4. sshd"
  ESTADO=$(sshd -T 2>/dev/null | awk '/^(permitrootlogin|passwordauthentication) /{printf "%s:%s ", $1, $2}' | sed 's/ $//')
  echo "  observado: $ESTADO"
  fichero sshd "$ESTADO"
  # Comparacion insensible al orden (la emision de sshd no es canonica).
  OBS_ORD=$(echo "$ESTADO" | tr ' ' '\n' | sort | tr '\n' ' ' | sed 's/ $//')
  ESP_ORD=$(echo "$SSH_ESPERADO" | tr ' ' '\n' | sort | tr '\n' ' ' | sed 's/ $//')
  [ "$OBS_ORD" = "$ESP_ORD" ] && ok "coincide con el runbook" || falla "'$ESTADO' != '$SSH_ESPERADO'"

  # ── 5. Claves de root ────────────────────────────────────────────
  titulo "5. authorized_keys de root"
  ESTADO=''
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    FP=$(printf '%s\n' "$line" | ssh-keygen -lf /dev/stdin 2>/dev/null | awk '{print $2}' | sed 's/^SHA256://')
    COMENT=${line##* }
    ESTADO="$ESTADO
$FP:$COMENT"
  done < /root/.ssh/authorized_keys
  ESTADO=$(echo "$ESTADO" | sed '/^$/d' | sort | tr '\n' ' ' | sed 's/ $//')
  echo "  observado: $ESTADO"
  fichero claves "$ESTADO"
  N_OBS=$(echo "$ESTADO" | wc -w); N_ESP=$(echo "$CLAVES_ESPERADAS" | wc -w)
  [ "$N_OBS" -eq "$N_ESP" ] || falla "hay $N_OBS claves y el runbook espera $N_ESP (cualquier extra es incidente)"
  for K in $CLAVES_ESPERADAS; do
    echo "$ESTADO" | grep -qF "$K" || falla "falta la clave ${K##*:} (${K%%:*})"
  done

  # ── 8b. Credencial de BD dentro de /root/volkern-erp/ ────────────
  titulo "8b. Propagacion de la credencial de BD (VPS)"
  PASS=$(grep -oE 'postgresql://volkern_erp:[^@]+@' /root/volkern-erp/.env 2>/dev/null | head -1 | sed 's|postgresql://volkern_erp:||;s|@$||')
  if [ -n "$PASS" ]; then
    N=$(grep -rlF -- "$PASS" /root/volkern-erp/ 2>/dev/null | wc -l)
    echo "  ficheros con la credencial: $N (baseline $FICHEROS_DB_PASS_ESPERADOS)"
    [ "$N" -eq "$FICHEROS_DB_PASS_ESPERADOS" ] && ok "propagacion estable" || falla "la credencial aparece en $N ficheros (baseline $FICHEROS_DB_PASS_ESPERADOS): o se rotó sin propagar, o se está copiando de más"
  else
    falla "no se pudo leer la credencial de /root/volkern-erp/.env (¿rotada sin propagar?)"
  fi
fi

# ── 6. Sondeo desde ESTA maquina (ruta real en modo puesto) ────────
titulo "6. Sondeo tcp desde el origen de este chequeo"
[ "$MODO" = puesto ] && echo "  (puesto de trabajo: esta es la ruta REAL de Internet)"
ABIERTOS=''
for p in $(echo "$TCP_INTERNET_ESPERADO $TCP_INTERNET_PROHIBIDO" | tr ' ' '\n' | sort -un | tr '\n' ' '); do
  if timeout 3 bash -c "echo > /dev/tcp/$IP_PUBLICA/$p" 2>/dev/null; then
    ABIERTOS="$ABIERTOS$p "
    echo " $TCP_INTERNET_PROHIBIDO " | grep -qw " $p " && falla "$p/tcp alcanzable y PROHIBIDO por el runbook"
  fi
done
echo "  abiertos: ${ABIERTOS:-ninguno}"
echo "  esperados: $TCP_INTERNET_ESPERADO"
fichero tcp-internet "$ABIERTOS"
for p in $TCP_INTERNET_ESPERADO; do
  echo "$ABIERTOS" | grep -qw "$p" || falla "$p/tcp deberia estar abierto y no responde"
done

# ── 7. Apps tras traefik ───────────────────────────────────────────
titulo "7. Apps (HTTP esperado)"
for A in $APPS_ESPERADAS; do
  u="${A%:*}"; esp="${A##*:}"
  obs=$(curl -s -m 10 -o /dev/null -w '%{http_code}' "$u" 2>/dev/null || echo '000')
  [ "$obs" = "$esp" ] && ok "$u -> $obs" || falla "$u -> $obs (esperado $esp)"
done

# ── 8. Secreto local del puesto (solo si ENV_VPS apunta al fichero) ─
titulo "8. .env.vps del puesto (si ENV_VPS definida)"
if [ -n "${ENV_VPS:-}" ] && [ -f "$ENV_VPS" ]; then
  N=$(grep -oE 'volkern_erp:[^@]+@volkern-erp_postgres' "$ENV_VPS" | wc -l)
  L=$(grep -oE 'volkern_erp:[^@]+@volkern-erp_postgres' "$ENV_VPS" | head -1 | sed 's/volkern_erp://;s/@volkern-erp_postgres//' | wc -c)
  [ "$N" -eq 1 ] && [ "$L" -gt 32 ] && ok "una sola DATABASE_URL, contrasena de longitud $((L-1))" || falla "apariciones=$N longitud=$((L-1)) (esperado 1 y >32)"
  ls -l "$ENV_VPS" | grep -q '^-.w-------\|^-.rw-------' && ok "permisos 600" || falla "$ENV_VPS sin permisos 600"
else
  echo "  (omitido: ENV_VPS no definida o fichero ausente)"
fi

# ── Resultado ──────────────────────────────────────────────────────
titulo "RESULTADO"
if [ "$DERIVA" -eq 0 ]; then
  echo "  SUPERFICIE CONFORME: coincide con docs/VPS-SEGURIDAD-PUERTOS.md"
  exit 0
else
  echo "  *** DERIVA DETECTADA. Dos salidas posibles: ***"
  echo "    1) Revertir el cambio no autorizado en el VPS."
  echo "    2) Si el cambio es a posta: actualizar runbook §9/§10 y las"
  echo "       listas de este script EN EL MISMO COMMIT."
  echo "  Estado observado para diff: /tmp/auditor-{${FICHEROS[*]:-}}"
  exit 1
fi
