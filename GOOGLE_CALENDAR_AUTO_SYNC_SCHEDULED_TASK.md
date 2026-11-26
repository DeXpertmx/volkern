# Google Calendar Auto-Sync Scheduled Task

## Overview
Automatic Google Calendar synchronization for all active Volkern CRM tenants has been configured to run every hour.

## Implementation Details

### 1. New API Endpoint Created
**File:** `/app/api/integraciones/google-calendar/sync-all/route.ts`

This endpoint performs batch synchronization for all tenants with active Google Calendar integration:
- **POST** `/api/integraciones/google-calendar/sync-all` - Triggers bidirectional sync for all active tenants
- **GET** `/api/integraciones/google-calendar/sync-all` - Health check (returns active integration count)

**Authentication:** `Authorization: Bearer <GCAL_SYNC_SECRET>`. There is no default key.

### 2. Middleware Updated
**File:** `/middleware.ts`

Added the sync-all endpoint to public paths to allow unauthenticated access (controlled by secret key):
```typescript
'/api/integraciones/google-calendar/sync-all',  // Endpoint para sincronización automática programada
```

### 3. Scheduled Task Configuration
- **Name:** Volkern Google Calendar Auto-Sync
- **Frequency:** Every hour (3600 seconds)
- **Timezone:** Europe/Madrid

**VPS status (2026-11-26):** no cron entry or host script calls this endpoint; an external scheduler must send `Authorization` with the same `GCAL_SYNC_SECRET`.

### 4. Sync Process
For each active tenant (`GoogleCalendarIntegration.activo = true`):
1. **Volkern → Google:** Pushes all future Volkern appointments to Google Calendar
2. **Google → Volkern:** Imports Google Calendar events to Volkern (creates leads automatically)

### 5. Logs Location
Logs are written to: `/home/ubuntu/volkern_gcal_sync_logs/gcal_sync_YYYY-MM-DD.log`

## Testing the Endpoint

```bash
# Health check
curl -X GET "http://localhost:3000/api/integraciones/google-calendar/sync-all"

# Trigger sync
curl -X POST "http://localhost:3000/api/integraciones/google-calendar/sync-all" \
  -H "Authorization: Bearer <GCAL_SYNC_SECRET>" \
  -H "Content-Type: application/json"
```

## Expected Response

```json
{
  "success": true,
  "message": "Sincronización completada para 1 tenant(s)",
  "results": [
    {
      "tenantId": "xxx",
      "tenantName": "Volkern CRM",
      "success": true,
      "volkernToGoogle": 1
    }
  ],
  "summary": {
    "total": 1,
    "successful": 1,
    "failed": 0,
    "duration": 1397
  }
}
```

## Environment Variable (Required)
`GCAL_SYNC_SECRET` is required: without it the endpoint fails instead of falling back to a key from the repository. On the VPS it lives in `/root/volkern-erp/.env` and in the `volkern-erp_app` service spec.

## Date Created
January 15, 2026
