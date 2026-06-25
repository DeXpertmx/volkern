export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { createWorker } from 'tesseract.js'
import { uploadFile } from '@/lib/s3'

// Función para extraer información de texto OCR
function extractContactInfo(text: string) {
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0)
  
  const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi
  const phoneRegex = /(\+?\d{1,4}[\s\-]?\(?\d{1,4}\)?[\s\-]?\d{1,4}[\s\-]?\d{1,9})/g
  const urlRegex = /(https?:\/\/[^\s]+)|([www\.][\w\-\.]+\.[a-z]{2,})/gi
  
  const emails = text.match(emailRegex) || []
  const phones = text.match(phoneRegex) || []
  const urls = text.match(urlRegex) || []
  
  // Intentar extraer nombre (generalmente es la primera línea o las primeras líneas)
  let nombre = ''
  let empresa = ''
  let puesto = ''
  
  if (lines.length > 0) {
    // La primera línea suele ser el nombre
    nombre = lines[0]
    
    // La segunda línea suele ser el puesto o la empresa
    if (lines.length > 1) {
      puesto = lines[1]
    }
    
    // La tercera línea suele ser la empresa
    if (lines.length > 2) {
      empresa = lines[2]
    }
  }
  
  return {
    nombreExtraido: nombre,
    empresaExtraida: empresa,
    puestoExtraido: puesto,
    emailExtraido: emails[0] || null,
    telefonoExtraido: phones[0] || null,
    sitioWeb: urls[0] || null,
    textoCompleto: text,
    lineas: lines
  }
}

// POST - Escanear tarjeta física y crear lead
export async function POST(request: NextRequest) {
  const worker: any = null
  
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { digitalCard: true }
    })

    if (!user) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }

    if (!user.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 400 })
    }

    if (!user.digitalCard) {
      return NextResponse.json(
        { error: 'Necesitas tener una tarjeta digital creada para escanear tarjetas' },
        { status: 400 }
      )
    }

    // Obtener la imagen del FormData
    const formData = await request.formData()
    const file = formData.get('image') as File
    
    if (!file) {
      return NextResponse.json({ error: 'No se proporcionó imagen' }, { status: 400 })
    }

    // Convertir el archivo a buffer para S3
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Subir imagen a S3
    const fileName = `scanned-cards/${user.tenantId}/${Date.now()}-${file.name}`
    const imagenUrl = await uploadFile(buffer, fileName)

    // Crear registro de tarjeta escaneada en estado "procesando"
    const scannedCard = await prisma.scannedCard.create({
      data: {
        digitalCardId: user.digitalCard.id,
        tenantId: user.tenantId,
        imagenUrl,
        estado: 'procesando',
        datosExtraidos: {}
      }
    })

    // Iniciar el procesamiento OCR en segundo plano
    // (En producción, esto debería ser una cola de trabajos)
    processCardOCR(scannedCard.id, imagenUrl, user.tenantId, user.id).catch(err => {
      console.error('Error en procesamiento OCR:', err)
    })

    return NextResponse.json(
      {
        message: 'Tarjeta escaneada, procesando información...',
        scannedCard: {
          id: scannedCard.id,
          estado: 'procesando'
        }
      },
      { status: 202 } // 202 Accepted
    )
  } catch (error) {
    console.error('Error al escanear tarjeta:', error)
    return NextResponse.json(
      { error: 'Error al escanear tarjeta' },
      { status: 500 }
    )
  } finally {
    // Limpiar el worker de Tesseract si existe
    if (worker) {
      try {
        await worker.terminate()
      } catch (err) {
        console.error('Error al terminar worker:', err)
      }
    }
  }
}

// Función para procesar OCR de forma asíncrona
async function processCardOCR(
  scannedCardId: string,
  imagenUrl: string,
  tenantId: string,
  userId: string
) {
  let worker: any = null
  
  try {
    // Crear worker de Tesseract
    worker = await createWorker('spa') // Español
    
    // Procesar imagen (usar la URL de S3 directamente)
    const { data: { text } } = await worker.recognize(imagenUrl)
    
    // Extraer información del texto
    const extractedInfo = extractContactInfo(text)
    
    // Crear lead automáticamente si hay suficiente información
    let leadId: string | null = null
    
    if (extractedInfo.nombreExtraido && (extractedInfo.emailExtraido || extractedInfo.telefonoExtraido)) {
      try {
        // Verificar si ya existe un lead con ese email o teléfono
        const existingLead = await prisma.lead.findFirst({
          where: {
            tenantId,
            OR: [
              { email: extractedInfo.emailExtraido || '' },
              { telefono: extractedInfo.telefonoExtraido || '' }
            ]
          }
        })
        
        if (existingLead) {
          leadId = existingLead.id
          
          // Actualizar notas del lead con la información escaneada
          await prisma.lead.update({
            where: { id: existingLead.id },
            data: {
              notas: `${existingLead.notas || ''}\n\n[Tarjeta escaneada ${new Date().toLocaleString()}]\n${text}`
            }
          })
        } else {
          // Crear nuevo lead
          const newLead = await prisma.lead.create({
            data: {
              tenantId,
              nombre: extractedInfo.nombreExtraido,
              email: extractedInfo.emailExtraido || `lead-${Date.now()}@temp.volkern.com`,
              telefono: extractedInfo.telefonoExtraido,
              empresa: extractedInfo.empresaExtraida,
              cargo: extractedInfo.puestoExtraido,
              fuente: 'tarjeta_escaneada',
              estado: 'nuevo',
              asignadoA: userId,
              notas: `[Tarjeta escaneada ${new Date().toLocaleString()}]\n${text}`,
              scoreValue: 10, // Score inicial por ser escaneado personalmente
              tags: 'tarjeta-escaneada,networking'
            }
          })
          
          leadId = newLead.id
          
          // Registrar en audit log
          await prisma.auditLog.create({
            data: {
              userId,
              tenantId,
              accion: 'CREAR',
              entidad: 'Lead',
              entidadId: newLead.id,
              descripcion: `Lead creado desde tarjeta escaneada: ${newLead.nombre}`,
              cambiosDespues: JSON.stringify({ lead: newLead })
            }
          })
        }
      } catch (leadError) {
        console.error('Error al crear/actualizar lead:', leadError)
      }
    }
    
    // Actualizar tarjeta escaneada con información extraída
    await prisma.scannedCard.update({
      where: { id: scannedCardId },
      data: {
        estado: 'completado',
        leadId,
        datosExtraidos: extractedInfo,
        nombreExtraido: extractedInfo.nombreExtraido,
        empresaExtraida: extractedInfo.empresaExtraida,
        puestoExtraido: extractedInfo.puestoExtraido,
        telefonoExtraido: extractedInfo.telefonoExtraido,
        emailExtraido: extractedInfo.emailExtraido
      }
    })
    
    // Actualizar estadísticas de la tarjeta digital
    await prisma.digitalCard.update({
      where: { id: (await prisma.scannedCard.findUnique({ where: { id: scannedCardId } }))?.digitalCardId },
      data: {
        totalEscaneos: { increment: 1 }
      }
    })
    
    console.log('✅ OCR completado para tarjeta:', scannedCardId)
  } catch (error) {
    console.error('Error en procesamiento OCR:', error)
    
    // Actualizar tarjeta escaneada con error
    await prisma.scannedCard.update({
      where: { id: scannedCardId },
      data: {
        estado: 'error',
        errorMensaje: error instanceof Error ? error.message : 'Error desconocido en OCR'
      }
    })
  } finally {
    // Limpiar el worker
    if (worker) {
      try {
        await worker.terminate()
      } catch (err) {
        console.error('Error al terminar worker:', err)
      }
    }
  }
}

// GET - Obtener el estado de una tarjeta escaneada
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const scannedCardId = searchParams.get('id')

    if (!scannedCardId) {
      return NextResponse.json({ error: 'ID de tarjeta requerido' }, { status: 400 })
    }

    const scannedCard = await prisma.scannedCard.findUnique({
      where: { id: scannedCardId },
      include: {
        lead: true
      }
    })

    if (!scannedCard) {
      return NextResponse.json({ error: 'Tarjeta no encontrada' }, { status: 404 })
    }

    return NextResponse.json({ scannedCard }, { status: 200 })
  } catch (error) {
    console.error('Error al obtener estado de tarjeta:', error)
    return NextResponse.json(
      { error: 'Error al obtener estado' },
      { status: 500 }
    )
  }
}
