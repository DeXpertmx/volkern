export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withTenantAuth } from '@/lib/api-key-auth'
import { parse } from 'csv-parse/sync'
import crypto from 'crypto'

export const POST = withTenantAuth(async (request: Request, auth) => {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return NextResponse.json({ error: 'No se subió ningún archivo' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const records = parse(buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    })

    let imported = 0
    let errors = 0
    const results = []

    for (const record of records) {
      try {
        // Mapeo flexible de columnas (minúsculas y sin acentos)
        const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        
        const getValue = (keys: string[]) => {
          for (const key of Object.keys(record)) {
            if (keys.includes(normalize(key))) return record[key]
          }
          return null
        }

        const nombre = getValue(['nombre', 'name', 'nombre completo'])
        const email = getValue(['email', 'correo', 'correo electronico'])
        const telefono = getValue(['telefono', 'phone', 'celular'])
        const empresa = getValue(['empresa', 'company'])
        const cargo = getValue(['cargo', 'puesto', 'position', 'job title'])
        const ubicacion = getValue(['ubicacion', 'location', 'ciudad'])
        const linkedin = getValue(['linkedin'])
        const notas = getValue(['notas', 'notes', 'descripcion'])
        const estado = getValue(['estado', 'status', 'etapa']) || 'nuevo'

        if (!nombre || !email) {
          errors++
          results.push({ email: email || 'N/A', status: 'error', message: 'Nombre y Email son obligatorios' })
          continue
        }

        // Upsert lead
        await prisma.lead.upsert({
          where: { 
            // Como Lead no tiene @@unique([email, tenantId]) nativo en Postgres
            // (el esquema muestra @@unique en User pero no en Lead)
            // Usamos findFirst y update/create manualmente si es necesario
            id: (await prisma.lead.findFirst({ where: { email, tenantId: auth.tenant!.id } }))?.id || 'new-id'
          },
          update: {
            nombre,
            telefono: telefono || undefined,
            empresa: empresa || undefined,
            cargo: cargo || undefined,
            ubicacion: ubicacion || undefined,
            linkedin: linkedin || undefined,
            notas: notas || undefined,
            estado: estado.toLowerCase(),
            fechaUltimaActividad: new Date()
          },
          create: {
            nombre,
            email,
            telefono,
            empresa,
            cargo,
            ubicacion,
            linkedin,
            notas,
            estado: estado.toLowerCase(),
            tenantId: auth.tenant!.id,
            tokenPublico: crypto.randomUUID(),
            fechaCreacion: new Date(),
            fechaUltimaActividad: new Date(),
          }
        })

        imported++
        results.push({ email, status: 'success' })
      } catch (err: any) {
        console.error('Error procesando record:', record, err)
        errors++
        results.push({ email: record.email || 'unknown', status: 'error', message: err.message })
      }
    }

    return NextResponse.json({ 
      message: 'Proceso de importación finalizado',
      imported,
      errors,
      total: records.length,
      results 
    })

  } catch (error: any) {
    console.error('[POST /api/leads/import] Error:', error)
    return NextResponse.json({ error: 'Error al procesar el archivo' }, { status: 500 })
  }
})
