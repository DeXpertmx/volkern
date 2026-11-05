import { NextRequest, NextResponse } from 'next/server'
import { withTenantAuth } from '@/lib/api-key-auth'
import {
  listMappings,
  getMapping,
  upsertMapping,
  deleteMapping,
  replaceAllMappings,
} from '@/lib/erp/gps-mapping-service'

// ═══════════════════════════════════════════════════════════════
// GET /api/erp/logistics/gps/device-mapping
// List all device mappings or get a single one by IMEI query param.
// ───────────────────────────────────────────────────────────────
// Query params:
//   ?imei=XXX   → get single mapping by IMEI
//   (none)       → list all mappings
// ───────────────────────────────────────────────────────────────

export const GET = withTenantAuth(async (request) => {
  try {
    const { searchParams } = new URL(request.url)
    const imei = searchParams.get('imei')

    if (imei) {
      const entry = await getMapping(imei)
      if (!entry) {
        return NextResponse.json(
          { error: `No mapping found for IMEI: ${imei}` },
          { status: 404 },
        )
      }
      return NextResponse.json({ mapping: entry })
    }

    const mappings = await listMappings()
    return NextResponse.json({ mappings, count: mappings.length })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}, ['erp:read'])

// ═══════════════════════════════════════════════════════════════
// POST /api/erp/logistics/gps/device-mapping
// Add or update a single device mapping.
// ───────────────────────────────────────────────────────────────
// Body: { imei: string, gpsDeviceId: string }
// ───────────────────────────────────────────────────────────────

export const POST = withTenantAuth(async (request) => {
  try {
    const body = await request.json()

    if (!body.imei || !body.gpsDeviceId) {
      return NextResponse.json(
        { error: 'Required fields: imei, gpsDeviceId' },
        { status: 400 },
      )
    }

    const entry = await upsertMapping({
      imei: String(body.imei).trim(),
      gpsDeviceId: String(body.gpsDeviceId).trim(),
    })

    return NextResponse.json({ mapping: entry }, { status: entry.created ? 201 : 200 })
  } catch (error: any) {
    if (error.message?.includes('must match format')) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}, ['erp:write'])

// ═══════════════════════════════════════════════════════════════
// PUT /api/erp/logistics/gps/device-mapping
// Bulk replace all mappings.
// ───────────────────────────────────────────────────────────────
// Body: { mappings: Array<{ imei: string, gpsDeviceId: string }> }
// ───────────────────────────────────────────────────────────────

export const PUT = withTenantAuth(async (request) => {
  try {
    const body = await request.json()

    if (!body.mappings || !Array.isArray(body.mappings)) {
      return NextResponse.json(
        { error: 'Required field: mappings (array of {imei, gpsDeviceId})' },
        { status: 400 },
      )
    }

    const result = await replaceAllMappings(body.mappings)

    return NextResponse.json({ ...result, message: `Replaced all mappings: ${result.count} device(s)` })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
}, ['erp:write'])

// ═══════════════════════════════════════════════════════════════
// DELETE /api/erp/logistics/gps/device-mapping
// Remove a device mapping by IMEI.
// ───────────────────────────────────────────────────────────────
// Query params:
//   ?imei=XXX   → delete the mapping with that IMEI
// ───────────────────────────────────────────────────────────────

export const DELETE = withTenantAuth(async (request) => {
  try {
    const { searchParams } = new URL(request.url)
    const imei = searchParams.get('imei')

    if (!imei) {
      return NextResponse.json(
        { error: 'Query parameter required: ?imei=DEVICE_IMEI' },
        { status: 400 },
      )
    }

    const removed = await deleteMapping(String(imei).trim())

    if (!removed) {
      return NextResponse.json(
        { error: `No mapping found for IMEI: ${imei}` },
        { status: 404 },
      )
    }

    return NextResponse.json({
      success: true,
      removed,
      message: `Mapping removed for IMEI ${imei}`,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}, ['erp:write'])
