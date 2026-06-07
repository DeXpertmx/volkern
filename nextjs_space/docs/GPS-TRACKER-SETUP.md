# 📡 Conexión de Dispositivos GPS Comerciales a Volkern

Guía completa para conectar trackers GPS comerciales (Teltonika, Concox, Queclink, Ruptela, genéricos chinos) al sistema de flota de Volkern usando Traccar como gateway intermedio.

---

## 🏗️ Arquitectura

```
┌─────────────────┐     TCP/UDP binario      ┌──────────────┐     HTTP REST      ┌──────────────┐
│  Dispositivo GPS │ ────────────────────────→│   Traccar    │ ──────────────────→│   Volkern    │
│  (IMEI: 123...)  │     puerto 5001-5099     │  (gateway)   │   bridge polling   │  vehicle-poll│
└─────────────────┘                           └──────────────┘                    └──────────────┘
                                                     │
                                                     │ PostgreSQL (misma BD de Volkern)
                                                     ▼
                                              ┌──────────────┐
                                              │  Traccar DB  │
                                              │ (tablas tc_*) │
                                              └──────────────┘
```

**¿Por qué Traccar?** Next.js no puede escuchar conexiones TCP/UDP — los trackers GPS no hablan HTTP/JSON. Traccar es el estándar open-source que soporta **170+ protocolos** de fabricantes.

---

## 📦 Paso 1: Desplegar Traccar + Volkern

### Opción A: Docker Compose (recomendado)

El archivo `docker-compose.yml` ya incluye el servicio `traccar`. Solo necesitas:

```bash
# Asegúrate de que el servicio traccar NO esté comentado en docker-compose.yml
docker compose up -d traccar
```

Esto levanta Traccar en:
- **Dashboard web:** `http://vps-ip:8082` (login: `admin` / `admin`)
- **Puertos para dispositivos GPS:** 5001-5099 (ver tabla abajo)

**¡Cambia la contraseña de admin inmediatamente!**

### Opción B: VPS manual

```bash
# Descargar Traccar
wget https://github.com/traccar/traccar/releases/latest/download/traccar-linux-64.zip
unzip traccar-linux-*.zip
sudo ./traccar.run

# Configurar PostgreSQL (misma BD de Volkern)
sudo nano /opt/traccar/conf/traccar.xml
```

Configuración mínima en `traccar.xml`:

```xml
<entry key='database.driver'>org.postgresql.Driver</entry>
<entry key='database.url'>jdbc:postgresql://localhost:5432/volkern</entry>
<entry key='database.user'>volkern</entry>
<entry key='database.password'>volkern_secret</entry>
```

---

## 📡 Paso 2: Puertos para dispositivos GPS

Abre estos puertos en tu firewall y en Traccar:

| Puerto | Protocolo | Fabricantes soportados |
|--------|-----------|----------------------|
| **5001** | GT06 (TCP) | Concox, Jimi, genéricos GT06 |
| **5002** | H02 (TCP) | Genéricos chinos, Sinotrack |
| **5003** | Teltonika (TCP) | Teltonika FMB, FM, GH series |
| **5005** | Queclink (TCP) | Queclink GV, GL series |
| **5008** | Watch (TCP) | Relojes GPS |
| **5013** | Ruptela (TCP) | Ruptela FM-Eco, FM-Pro |
| **5023** | OsmAnd (HTTP) | App OsmAnd (Android/iOS) |
| **5055** | Traccar (HTTP) | Protocolo nativo Traccar |

```bash
# UFW
sudo ufw allow 5001:5099/tcp

# O solo los puertos que uses
sudo ufw allow 5001/tcp
sudo ufw allow 5003/tcp
```

---

## 🔧 Paso 3: Configurar cada dispositivo GPS

Cada tracker debe configurarse para apuntar a la IP de tu VPS y al puerto correcto según su protocolo.

### Teltonika (FMB920, FMB120, etc.)

```
1. Conectar vía USB + Teltonika Configurator
2. GPRS Settings:
   - APN: (el de tu operador móvil, ej: internet.movistar.es)
   - Domain: vps-ip
   - Port: 5003
   - Protocol: TCP
3. Save to device
```

### Concox (GT06, GV20, etc.)

```
Enviar SMS al dispositivo:
  adminip123456 vps-ip 5001
  admin123456 apn123456 internet.movistar.es
  reset123456
```

Donde `123456` es la contraseña del dispositivo (default: 000000 o 123456).

### Queclink (GV300, GL300, etc.)

```
Usar Queclink Manager Tool:
  - Server IP: vps-ip
  - Port: 5005
  - APN: internet.movistar.es
```

---

## 🔗 Paso 4: Mapear dispositivos (Traccar → Volkern)

### 4.1 Obtener el IMEI de cada dispositivo

En el dashboard de Traccar (`http://vps-ip:8082`), ve a **Devices** y anota el campo **Identifier** (es el IMEI del dispositivo, ej: `123456789012345`).

También puedes usar la API:

```bash
curl -u admin:admin http://vps-ip:8082/api/devices | jq '.[] | {id, name, uniqueId}'
```

### 4.2 Obtener el gpsDeviceId de cada vehículo en Volkern

En el dashboard de Volkern → **Logística → Flota**, cada vehículo tiene un `deviceKey` (ej: `VK-GPS-1234ABC-X7K2`). También puedes usar:

```bash
curl http://localhost:3000/api/erp/logistics/fleet/vehicles
```

### 4.3 Crear el archivo de mapeo

```bash
cp traccar-device-mapping.example.json traccar-device-mapping.json
```

Editar `traccar-device-mapping.json`:

```json
{
  "123456789012345": "VK-GPS-1234ABC-X7K2",
  "987654321098765": "VK-GPS-5678DEF-Y9K3",
  "567890123456789": "VK-GPS-9999XYZ-A1B2"
}
```

> ⚠️ Cada IMEI del tracker debe corresponder a un `gpsDeviceId` único de un vehículo en Volkern.

---

## 🚀 Paso 5: Activar el bridge

### Opción A: Docker (modo daemon)

Descomenta el servicio `traccar-bridge` en `docker-compose.yml`:

```yaml
traccar-bridge:
  build:
    context: .
    dockerfile: Dockerfile
  container_name: volkern-traccar-bridge
  restart: unless-stopped
  entrypoint: ["npx", "tsx", "scripts/traccar-bridge.ts", "--daemon", "--interval", "30"]
  environment:
    TRACCAR_URL: "http://traccar:8082"
    TRACCAR_USER: "admin"
    TRACCAR_PASS: "admin"
    VOLKERN_URL: "http://app:3000"
  volumes:
    - ./traccar-device-mapping.json:/app/traccar-device-mapping.json:ro
```

```bash
docker compose up -d traccar-bridge
docker compose logs -f traccar-bridge
```

### Opción B: Cron (cada 30 segundos, sin Docker)

```bash
# Instalar tsx si no está
npm install -g tsx

# Añadir a crontab
crontab -e
```

```cron
# Ejecutar el bridge cada 30 segundos (4 workers desfasados)
* * * * * sleep 0;  cd /home/dexpert/Volkern/nextjs_space && npx tsx scripts/traccar-bridge.ts --once --mapping /home/dexpert/Volkern/nextjs_space/traccar-device-mapping.json >> /var/log/traccar-bridge.log 2>&1
* * * * * sleep 15; cd /home/dexpert/Volkern/nextjs_space && npx tsx scripts/traccar-bridge.ts --once --mapping /home/dexpert/Volkern/nextjs_space/traccar-device-mapping.json >> /var/log/traccar-bridge.log 2>&1
* * * * * sleep 30; cd /home/dexpert/Volkern/nextjs_space && npx tsx scripts/traccar-bridge.ts --once --mapping /home/dexpert/Volkern/nextjs_space/traccar-device-mapping.json >> /var/log/traccar-bridge.log 2>&1
* * * * * sleep 45; cd /home/dexpert/Volkern/nextjs_space && npx tsx scripts/traccar-bridge.ts --once --mapping /home/dexpert/Volkern/nextjs_space/traccar-device-mapping.json >> /var/log/traccar-bridge.log 2>&1
```

### Opción C: Manual (prueba inicial)

```bash
# Ejecutar una sola vez para verificar que todo funciona
npx tsx scripts/traccar-bridge.ts --once

# Salida esperada:
# [bridge] Traccar Bridge → Volkern GPS
# [bridge] Traccar: http://localhost:8082  |  Volkern: http://localhost:3000
# [bridge] Mode: once  |  Interval: 30s  |  Mapping: ./traccar-device-mapping.json
# [bridge] Loaded 3 device mapping(s)
# [bridge] Device cache built: 3 device(s) from Traccar
# [bridge] Fetched 3 position(s) from Traccar
# [bridge]   ✅ VK-GPS-1234ABC-X7K2: forwarded (lat=36.72130, lng=-4.42140, speed=65 km/h)
# [bridge]   ✅ VK-GPS-5678DEF-Y9K3: forwarded (lat=40.41680, lng=-3.70380, speed=42 km/h)
# [bridge]   ✅ VK-GPS-9999XYZ-A1B2: forwarded (lat=41.38510, lng=2.17340, speed=0 km/h)
# [bridge] Summary: 3 forwarded, 0 failed (1 polls)
```

---

## ✅ Verificación

### 1. Verificar que Traccar recibe datos

```bash
# Ver últimos 60 segundos de actividad
curl -s -u admin:admin "http://vps-ip:8082/api/positions" | jq 'length'
# Debe devolver > 0 si hay dispositivos conectados
```

### 2. Verificar que Volkern recibe posiciones

```bash
# Verificar vehículo individual
curl http://localhost:3000/api/erp/logistics/fleet/vehicles | jq '.[] | {plate, currentLat, currentLng, lastGpsUpdate}'
```

O en el dashboard: **Logística → Flota** — los marcadores azules en el mapa indican vehículos con GPS en vivo.

### 3. Ver logs del bridge

```bash
# Docker
docker compose logs -f traccar-bridge

# Cron
tail -f /var/log/traccar-bridge.log
```

---

## 🔄 Flujo de datos completo

```
1. Dispositivo GPS en el vehículo obtiene posición vía GNSS
2. Envía datos por red móvil (GPRS/4G) a IP:puerto del VPS
3. Traccar decodifica el protocolo binario y almacena en PostgreSQL
4. El bridge consulta /api/positions cada 30s
5. Por cada posición, busca IMEI → gpsDeviceId en el mapping
6. POST a /api/erp/logistics/gps/vehicle-poll con deviceKey, lat, lng, speed...
7. Volkern actualiza erp_fleet_vehicles.currentLat/currentLng/lastGpsUpdate
8. El dashboard de flota muestra la posición en tiempo real en el mapa
```

---

## 🧪 Prueba rápida sin dispositivo físico

```bash
# Simular un dispositivo con curl (protocolo OsmAnd HTTP en Traccar)
curl "http://vps-ip:5055?id=123456789012345&lat=36.7213&lon=-4.4214&speed=65&bearing=180&timestamp=$(date +%s000)&batt=85"
```

Esto inyecta una posición directamente en Traccar, que luego el bridge reenviará a Volkern.

---

## 🛠️ Troubleshooting

| Problema | Causa probable | Solución |
|----------|---------------|----------|
| El tracker no aparece en Traccar | APN incorrecto o SIM sin datos | Verificar APN con el operador. Probar la SIM en un móvil. |
| Traccar muestra "offline" | Puerto incorrecto o firewall | `sudo ufw status`. Verificar que el puerto del protocolo correcto está abierto. |
| Bridge muestra "not found in mapping" | IMEI no mapeado | Editar `traccar-device-mapping.json` con el IMEI correcto |
| Bridge muestra "404" de Volkern | deviceKey no existe | Verificar que el gpsDeviceId existe en `erp_fleet_vehicles` |
| Posiciones duplicadas | Múltiples instancias del bridge | Asegurar una sola instancia del bridge corriendo |

---

## 📊 Monitoreo

- **Dashboard Traccar:** `http://vps-ip:8082` — estado de todos los dispositivos, últimas posiciones, alertas
- **Dashboard Volkern:** Logística → Flota — mapa en vivo, KPIs de flota, estado de vehículos
- **Skills de IA:** "¿cuál es el estado de la flota?", "¿dónde está la furgoneta 1234-ABC?", "optimiza las rutas de hoy"

---

## 🔐 Seguridad

1. **Cambia la contraseña de Traccar** inmediatamente después del primer login
2. **Usa firewall** para limitar acceso al dashboard (8082) solo a IPs autorizadas
3. **El mapping file** contiene datos sensibles (IMEI → vehículo). No lo commitees a git — añade `traccar-device-mapping.json` a `.gitignore`
4. **Los puertos GPS** (5001-5099) deben estar abiertos al mundo para que los trackers se conecten — considera usar una VPN si manejas datos sensibles de ubicación

---

## 📚 Referencias

- [Traccar Documentation](https://www.traccar.org/documentation/)
- [Traccar Protocol List](https://www.traccar.org/devices/)
- [Teltonika Codec Documentation](https://wiki.teltonika-gps.com/view/Codec)
- [Volkern Fleet Dashboard](http://localhost:3000/dashboard/logistica/flota)
