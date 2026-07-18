export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth } from '@/lib/api-key-auth';
import nodemailer from 'nodemailer';

export const POST = withTenantAuth(async (request, auth) => {
  try {
    const body = await request.json();
    const { host, port, user, password, encryption, fromEmail, fromName } = body;

    if (!host || !user || !password || !fromEmail) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos: host, user, password, fromEmail' },
        { status: 400 }
      );
    }

    const secure = encryption === 'ssl';
    const portNum = parseInt(port) || (secure ? 465 : 587);

    const transporter = nodemailer.createTransport({
      host,
      port: portNum,
      secure,
      auth: { user, pass: password },
      tls: {
        rejectUnauthorized: false,
        ...(encryption === 'starttls' ? { ciphers: 'SSLv3' } : {}),
      },
    });

    await transporter.sendMail({
      from: fromName ? `"${fromName}" <${fromEmail}>` : fromEmail,
      to: auth.user?.email || fromEmail,
      subject: 'Prueba de configuración SMTP - Volkern',
      text: 'Este es un correo de prueba desde Volkern. Si recibes esto, tu configuración SMTP funciona correctamente.',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
          <h2 style="color:#10b981;">✅ Prueba SMTP exitosa</h2>
          <p>Tu configuración SMTP funciona correctamente.</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;" />
          <p style="font-size:12px;color:#6b7280;">
            Servidor: ${host}:${portNum} | Cifrado: ${encryption}<br/>
            Remitente: ${fromName ? `${fromName} <${fromEmail}>` : fromEmail}
          </p>
        </div>
      `,
    });

    return NextResponse.json({ success: true, message: 'Correo de prueba enviado correctamente' });
  } catch (error: any) {
    console.error('Error al probar SMTP:', error);
    return NextResponse.json(
      { error: 'Error al conectar con el servidor SMTP', message: error.message },
      { status: 500 }
    );
  }
}, ['config:write', 'settings:write']);
