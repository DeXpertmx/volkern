export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withTenantAuth } from '@/lib/api-key-auth'
import { parse } from 'csv-parse/sync'

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
        // Mapeo flexible de columnas
        const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()
        
        const getValue = (keys: string[]) => {
          for (const key of Object.keys(record)) {
            if (keys.includes(normalize(key))) return record[key] instanceof String ? record[key].trim() : record[key]
          }
          return null
        }

        const nombre = getValue(['nombre', 'name', 'empresa', 'company name', 'razon social'])
        const email = getValue(['email', 'correo', 'correo electronico'])
        const telefono = getValue(['telefono', 'phone', 'celular'])
        const cargo = getValue(['cargo', 'puesto', 'position', 'job title'])
        const ubicacion = getValue(['ubicacion', 'location'])
        const direccion = getValue(['direccion', 'address', 'calle'])
        const ciudad = getValue(['ciudad', 'city', 'poblacion'])
        const codigoPostal = getValue(['codigopostal', 'cp', 'codigo postal', 'zip', 'zipcode', 'postal code'])
        const pais = getValue(['pais', 'country'])
        const linkedin = getValue(['linkedin'])
        const notas = getValue(['notas', 'notes', 'descripcion'])
        const tags = getValue(['tags', 'etiquetas'])
        const tipoInput = getValue(['tipo', 'type'])?.toLowerCase()

        if (!nombre || !email) {
          errors++
          results.push({ email: email || 'N/A', status: 'error', message: 'Nombre y Email son obligatorios' })
          continue
        }

        // Determinar tipo (person vs company)
        let tipo = 'person'
        if (tipoInput === 'empresa' || tipoInput === 'company' || tipoInput === 'organizacion' || tipoInput === 'corp') {
          tipo = 'company'
        }

        // Upsert contact
        const existingContact = await prisma.contact.findFirst({
           where: { email, tenantId: auth.tenant!.id }
        })

        if (existingContact) {
          await prisma.contact.update({
            where: { id: existingContact.id },
            data: {
              nombre,
              telefono: telefono || undefined,
              cargo: cargo || undefined,
              ubicacion: ubicacion || undefined,
              direccion: direccion || undefined,
              ciudad: ciudad || undefined,
              codigoPostal: codigoPostal || undefined,
              pais: pais || undefined,
              linkedin: linkedin || undefined,
              notas: notas || undefined,
              tags: tags || undefined,
              tipo,
              fechaActualizacion: new Date()
            }
          })
        } else {
          await prisma.contact.create({
            data: {
              nombre,
              email,
              telefono,
              tipo,
              cargo,
              ubicacion,
              direccion,
              ciudad,
              codigoPostal,
              pais,
              linkedin,
              notas,
              tags,
              tenantId: auth.tenant!.id,
              fechaCreacion: new Date(),
              fechaActualizacion: new Date(),
            }
          })
        }

        imported++
        results.push({ email, status: 'success' })
      } catch (err: any) {
        console.error('Error procesando contact record:', record, err)
        errors++
        results.push({ email: record.email || 'unknown', status: 'error', message: err.message })
      }
    }

    return NextResponse.json({ 
      message: 'Proceso de importación de contactos finalizado',
      imported,
      errors,
      total: records.length,
      results 
    })

  } catch (error: any) {
    console.error('[POST /api/contacts/import] Error:', error)
    return NextResponse.json({ error: 'Error al procesar el archivo' }, { status: 500 })
  }
}, ['contacts:write'])
