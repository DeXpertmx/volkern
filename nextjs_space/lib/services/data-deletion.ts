import { prisma } from '@/lib/db'

interface DeleteUserDataParams {
  userEmail?: string | null
  userPhone?: string | null
  userScopedId?: string | null
  platform: string
}

interface DeletionResult {
  success: boolean
  deletedRecords: {
    leads: number
    contacts: number
    messages: number
    chats: number
  }
  message: string
}

export async function deleteUserData(params: DeleteUserDataParams): Promise<DeletionResult> {
  const { userEmail, userPhone, userScopedId, platform } = params

  try {
    let deletedRecords = {
      leads: 0,
      contacts: 0,
      messages: 0,
      chats: 0
    }

    const whereClause: any = {}

    if (userEmail) {
      whereClause.OR = [
        { email: { equals: userEmail, mode: 'insensitive' } },
        { telefono: { equals: userPhone } }
      ]
    }

    if (userScopedId) {
      whereClause.OR = [
        ...(whereClause.OR || []),
        { metadata: { contains: userScopedId } },
        { metadatos: { contains: userScopedId } }
      ]
    }

    if (Object.keys(whereClause).length === 0) {
      return {
        success: false,
        deletedRecords,
        message: 'No se proporcionaron criterios de búsqueda'
      }
    }

    const leads = await prisma.lead.findMany({
      where: whereClause,
      select: { id: true }
    })

    if (leads.length > 0) {
      const leadIds = leads.map(l => l.id)

      const messagesDeleted = await prisma.mensaje.count({
        where: { leadId: { in: leadIds } }
      })
      deletedRecords.messages = messagesDeleted

      await prisma.mensaje.deleteMany({
        where: { leadId: { in: leadIds } }
      })

      const citasDeleted = await prisma.cita.count({
        where: { leadId: { in: leadIds } }
      })

      await prisma.cita.deleteMany({
        where: { leadId: { in: leadIds } }
      })

      await prisma.lead.deleteMany({
        where: { id: { in: leadIds } }
      })

      deletedRecords.leads = leadIds.length
    }

    if (userEmail) {
      const contactsDeleted = await prisma.contact.count({
        where: { 
          OR: [
            { email: { equals: userEmail, mode: 'insensitive' } },
            { telefono: { equals: userPhone || undefined } }
          ]
        }
      })

      if (contactsDeleted > 0) {
        await prisma.contact.deleteMany({
          where: {
            OR: [
              { email: { equals: userEmail, mode: 'insensitive' } },
              { telefono: userPhone ? { equals: userPhone } : undefined }
            ]
          }
        })
        deletedRecords.contacts = contactsDeleted
      }
    }

    const totalDeleted = deletedRecords.leads + deletedRecords.contacts + 
                        deletedRecords.messages + deletedRecords.chats

    if (totalDeleted === 0) {
      return {
        success: true,
        deletedRecords,
        message: 'No se encontraron datos asociados al usuario en la plataforma'
      }
    }

    return {
      success: true,
      deletedRecords,
      message: `Se eliminaron ${totalDeleted} registros asociados al usuario`
    }
  } catch (error: any) {
    console.error('[Data Deletion Service] Error:', error)
    return {
      success: false,
      deletedRecords: { leads: 0, contacts: 0, messages: 0, chats: 0 },
      message: `Error al eliminar datos: ${error.message}`
    }
  }
}

export async function processDataDeletionRequest(requestId: string): Promise<boolean> {
  try {
    const request = await prisma.dataDeletionRequest.findUnique({
      where: { id: requestId }
    })

    if (!request) {
      console.error('[Data Deletion] Request not found:', requestId)
      return false
    }

    if (request.status !== 'pending') {
      console.log('[Data Deletion] Request already processed:', requestId, request.status)
      return true
    }

    await prisma.dataDeletionRequest.update({
      where: { id: requestId },
      data: { status: 'processing' }
    })

    const result = await deleteUserData({
      userEmail: request.userEmail,
      userPhone: request.userPhone,
      userScopedId: request.userScopedId,
      platform: request.platform
    })

    const finalStatus = result.success ? 'completed' : 'rejected'

    await prisma.dataDeletionRequest.update({
      where: { id: requestId },
      data: {
        status: finalStatus,
        processedAt: new Date(),
        deletionDetails: {
          ...(request.deletionDetails as object || {}),
          processedAt: new Date().toISOString(),
          result
        }
      }
    })

    console.log('[Data Deletion] Request processed:', requestId, finalStatus)
    return result.success
  } catch (error: any) {
    console.error('[Data Deletion] Error processing request:', error)
    
    await prisma.dataDeletionRequest.update({
      where: { id: requestId },
      data: {
        status: 'rejected',
        processedAt: new Date()
      }
    })
    
    return false
  }
}