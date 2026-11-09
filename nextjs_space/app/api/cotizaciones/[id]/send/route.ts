export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/db'
import { authOptions } from '@/lib/auth'
import { sendEmail } from '@/lib/ses-email'

export async function POST(
  req: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { tenant: true }
    })

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 403 })
    }

    const cotizacion = await prisma.cotizacion.findFirst({
      where: {
        id: params.id,
        tenantId: user.tenantId,
      },
      include: {
        items: { orderBy: { orden: 'asc' } },
        tenant: true,
        lead: true,
      },
    })

    if (!cotizacion) {
      return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 })
    }

    const body = await req.json()
    const { email, mensaje } = body

    if (!email) {
      return NextResponse.json({ error: 'Email es requerido' }, { status: 400 })
    }

    // Generar URL pública
    const baseUrl = process.env.NEXTAUTH_URL || 'https://volkern.app'
    const publicUrl = `${baseUrl}/cotizacion/${cotizacion.tokenPublico}`

    // Formatear moneda
    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: cotizacion.moneda || 'MXN'
      }).format(amount)
    }

    // Generar tabla de items
    const itemsHtml = cotizacion.items.map(item => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
          <strong>${item.concepto}</strong>
          ${item.descripcion ? `<br><span style="color: #6b7280; font-size: 12px;">${item.descripcion}</span>` : ''}
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${item.cantidad}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">${formatCurrency(item.precioUnitario)}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">${formatCurrency(item.total)}</td>
      </tr>
    `).join('')

    // Email HTML
    const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">${cotizacion.tenant.nombre || 'Cotización'}</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0;">Cotización ${cotizacion.numero}</p>
      </div>
      
      <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
        <h2 style="margin-top: 0; color: #1f2937;">${cotizacion.titulo}</h2>
        
        ${mensaje ? `
        <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
          <p style="margin: 0; color: #4b5563;">${mensaje}</p>
        </div>
        ` : ''}
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <thead>
            <tr style="background: #f9fafb;">
              <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Concepto</th>
              <th style="padding: 12px; text-align: center; border-bottom: 2px solid #e5e7eb;">Cant.</th>
              <th style="padding: 12px; text-align: right; border-bottom: 2px solid #e5e7eb;">Precio</th>
              <th style="padding: 12px; text-align: right; border-bottom: 2px solid #e5e7eb;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
        
        <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin-top: 20px;">
          <table style="width: 100%;">
            <tr>
              <td style="padding: 5px 0;">Subtotal:</td>
              <td style="text-align: right;">${formatCurrency(cotizacion.subtotal)}</td>
            </tr>
            ${cotizacion.descuentoPorcentaje > 0 ? `
            <tr style="color: #059669;">
              <td style="padding: 5px 0;">Descuento (${cotizacion.descuentoPorcentaje}%):</td>
              <td style="text-align: right;">-${formatCurrency(cotizacion.descuentoMonto)}</td>
            </tr>
            ` : ''}
            <tr>
              <td style="padding: 5px 0;">IVA:</td>
              <td style="text-align: right;">${formatCurrency(cotizacion.impuestos)}</td>
            </tr>
            <tr style="font-size: 18px; font-weight: bold;">
              <td style="padding: 10px 0; border-top: 2px solid #e5e7eb;">Total:</td>
              <td style="text-align: right; padding: 10px 0; border-top: 2px solid #e5e7eb;">${formatCurrency(cotizacion.total)}</td>
            </tr>
          </table>
        </div>
        
        ${cotizacion.terminosPago ? `
        <div style="margin-top: 20px;">
          <h4 style="margin-bottom: 8px; color: #374151;">Términos de Pago</h4>
          <p style="margin: 0; color: #6b7280;">${cotizacion.terminosPago}</p>
        </div>
        ` : ''}
        
        <div style="text-align: center; margin-top: 30px;">
          <a href="${publicUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">Ver Cotización Completa</a>
        </div>
        
        <p style="text-align: center; color: #9ca3af; font-size: 12px; margin-top: 20px;">
          Esta cotización es válida por ${cotizacion.validezDias} días
        </p>
      </div>
      
      <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
        <p style="margin: 0;">© ${new Date().getFullYear()} ${cotizacion.tenant.nombre || 'Volkern CRM'}</p>
      </div>
    </body>
    </html>
    `

    // Enviar email
    await sendEmail({
      to: email,
      subject: `Cotización ${cotizacion.numero} - ${cotizacion.titulo}`,
      html: emailHtml,
      tenantSubdomain: user.tenantId,
    })

    // Actualizar estado de la cotización
    await prisma.cotizacion.update({
      where: { id: cotizacion.id },
      data: {
        estado: 'enviada',
        fechaEnvio: new Date(),
        clienteEmail: email,
      },
    })

    // Crear actividad en el deal si existe
    if (cotizacion.dealId) {
      await prisma.dealActivity.create({
        data: {
          dealId: cotizacion.dealId,
          tenantId: user.tenantId,
          userId: user.id,
          tipo: 'cotizacion_enviada',
          titulo: 'Cotización enviada',
          descripcion: `Cotización ${cotizacion.numero} enviada a ${email}`,
          resultado: 'exitoso',
        },
      })
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        accion: 'enviar',
        entidad: 'cotizacion',
        entidadId: cotizacion.id,
        descripcion: `Usuario ${user.name} envió la cotización ${cotizacion.numero} a ${email}`,
      },
    })

    return NextResponse.json({ 
      success: true,
      message: 'Cotización enviada exitosamente'
    })
  } catch (error: any) {
    console.error('Error al enviar cotización:', error)
    return NextResponse.json(
      { error: 'Error al enviar cotización', details: error.message },
      { status: 500 }
    )
  }
}
