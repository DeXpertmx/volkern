# DNS for AI Discovery (DNS-AID)

Volkern publica sus agentes para descubrimiento vía DNS siguiendo
[draft-mozleywilliams-dnsop-dnsaid](https://datatracker.ietf.org/doc/draft-mozleywilliams-dnsop-dnsaid/)
(use cases 1 y 2: agente conocido e índice organizacional).

El scanner [isitagentready](https://isitagentready.com) valida el check
`discoverability.dnsAid` consultando (por DNS-over-HTTPS):

- `SVCB` / `HTTPS` de `_index._agents.volkern.app`
- `SVCB` / `HTTPS` de `_a2a._agents.volkern.app`
- `SVCB` / `HTTPS` de `_mcp._agents.volkern.app`
- `TXT` de `_index._agents.volkern.app`

## Estado

- ✅ **Registros SVCB + TXT publicados** (2026-08-21 vía API de Cloudflare) y
  propagados: el scan los encuentra (`serviceRecordCount: 3`, todos
  `validServiceMode: true`).
- ❌ Scan `dnsAid` en fail solo por **DNSSEC**: *"records found, but DNSSEC
  was not validated"*.
- ⏳ **DNSSEC pendiente** — ver «Activar DNSSEC» abajo.

## Activar DNSSEC

El dominio `volkern.app` está registrado en **IONOS (1&1 Internet SE)**, no en
Cloudflare Registrar, así que la DS record se añade manualmente en IONOS.

1. **Cloudflare** → volkern.app → **DNS → Settings → DNSSEC → Enable**
   (el token de API actual no tiene permiso `Zone:Settings:Edit`, así que se
   hace en el dashboard). Cloudflare muestra la DS record (key tag, algorithm,
   digest type y digest).
2. **IONOS** → Dominios → volkern.app → DNS/Configuración → añadir la
   **DS record** con los valores que muestra Cloudflare.
3. Esperar propagación (minutos a horas) y volver a correr el scan.

Nota: activar DNSSEC en Cloudflare sin la DS en el padre no rompe la
resolución (sin DS, los resolvers tratan la zona como insecure); Cloudflare da
~24 h para añadir la DS antes de revertir.

## Formato del API (lección aprendida)

El schema de Cloudflare exige `data.value` como **string** en formato wire,
no como objeto JSON:

```json
{"type":"SVCB","name":"_index._agents.volkern.app","data":{"priority":1,"target":"volkern.app","value":"alpn=\"h2,http/1.1\" port=443 ipv4hint=\"62.171.134.195\""},"ttl":300}
```

Si se manda un objeto `{"alpn":[...],"port":443}`, el API responde 9012
*"Value for SVCB record is invalid"*.

## Registros

| Nombre | Tipo | Valor |
|---|---|---|
| `_index._agents.volkern.app` | SVCB | `1 volkern.app alpn="h2,http/1.1" port=443 ipv4hint=62.171.134.195 mandatory=alpn,port` |
| `_a2a._agents.volkern.app` | SVCB | `1 volkern.app alpn="a2a,h2" port=443 ipv4hint=62.171.134.195 mandatory=alpn,port` |
| `_mcp._agents.volkern.app` | SVCB | `1 volkern.app alpn="mcp,h2" port=443 ipv4hint=62.171.134.195 mandatory=alpn,port` |
| `_index._agents.volkern.app` | TXT | `v=DNSAID1 index=/.well-known/agent-card.json` |

## Cómo publicar

### Opción A — API de Cloudflare (script)

```bash
cd nextjs_space
CLOUDFLARE_API_TOKEN=tu_token bash deploy-vps/dns-aid.sh
# (opcional: CLOUDFLARE_ZONE_ID=... si no quieres que la resuelva)
```

El script es idempotente: crea solo los registros que faltan. El token necesita
permiso `Zone:DNS:Edit` sobre `volkern.app`.

### Opción B — Dashboard de Cloudflare

1. Cloudflare → `volkern.app` → **DNS → Records** → **Add record**
2. Crea los 4 registros de la tabla de arriba:
   - Tipo `SVCB`: Priority `1`, Target `volkern.app`, Params (Service parameters):
     - `alpn`: `h2,http/1.1` (o `a2a,h2` / `mcp,h2` según fila)
     - `port`: `443`
     - `ipv4hint`: `62.171.134.195`
     - `mandatory`: `alpn,port`
   - Tipo `TXT`: content `v=DNSAID1 index=/.well-known/agent-card.json`
3. TTL automático (300 s).

## Verificación

```bash
dig +short SVCB _index._agents.volkern.app @1.1.1.1
dig +short SVCB _a2a._agents.volkern.app @1.1.1.1
dig +short SVCB _mcp._agents.volkern.app @1.1.1.1
dig +short TXT _index._agents.volkern.app @1.1.1.1

curl -s -X POST https://isitagentready.com/api/scan \
  -H "Content-Type: application/json" \
  -d '{"url": "https://volkern.app"}'
# → checks.discoverability.dnsAid.status == "pass"
```

## Notas

- `volkern.app` está en Cloudflare (nameservers `jaziel.ns.cloudflare.com` /
  `dns.cloudflare.com`), así que los registros se propagan en segundos.
- Si Cloudflare rechazara `alpn="a2a"` / `alpn="mcp"` como tokens no
  registrados, se puede quitar el token de protocolo y dejar solo el transporte
  (`alpn="h2"` + `port=443`) — el scanner cuenta el SVCB igualmente.
- El índice apunta al A2A Agent Card (`/.well-known/agent-card.json`), que ya
  está publicado y validado (`a2aAgentCard = pass`).
